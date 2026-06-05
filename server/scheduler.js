import cron from 'node-cron';
import parser from 'cron-parser';
import { executeRunViaGraph } from './workflows/runner.js';
import { executePipelineRun, validatePipelineGraph } from './workflows/pipeline.js';
import { resolveTier } from './safety-prompt.js';
import { sendDiscordNotify } from './executor.js';
import { getSetting } from './settings.js';
import { checkSloBreach } from './observability/slo.js';

const MAX_CONCURRENT_RUNS = parseInt(process.env.MAX_CONCURRENT_RUNS || '2', 10);
// Run retention: prune old run history so verbose transcripts don't fill the PVC.
const RETENTION_MAX_AGE_DAYS = parseInt(process.env.RETENTION_MAX_AGE_DAYS || '90', 10);
const RETENTION_MAX_RUNS_PER_SCHEDULE = parseInt(process.env.RETENTION_MAX_RUNS_PER_SCHEDULE || '200', 10);

/**
 * Compute the next execution time for a cron expression.
 * Returns ISO string or null if invalid.
 */
export function nextRunAt(cronExpression, fromDate = new Date()) {
  try {
    const interval = parser.parseExpression(cronExpression, { currentDate: fromDate });
    return interval.next().toISOString();
  } catch {
    return null;
  }
}

/**
 * Preview the next N execution times. For cron picker UI.
 */
export function previewNextRuns(cronExpression, count = 3, fromDate = new Date()) {
  try {
    const interval = parser.parseExpression(cronExpression, { currentDate: fromDate });
    const out = [];
    for (let i = 0; i < count; i++) out.push(interval.next().toISOString());
    return out;
  } catch {
    return [];
  }
}

export function isValidCron(cronExpression) {
  if (!cronExpression || typeof cronExpression !== 'string') return false;
  if (!cron.validate(cronExpression)) return false;
  try {
    parser.parseExpression(cronExpression);
    return true;
  } catch {
    return false;
  }
}

export function createScheduler(db) {
  const tasks = new Map(); // scheduleId -> cron.ScheduledTask
  const pipelineTasks = new Map(); // pipelineId -> cron.ScheduledTask
  let active = 0; // runs executing in THIS process right now

  // The durable queue IS the runs table: status 'queued' = waiting, 'running' = claimed.
  // Atomically claim the oldest eligible queued run; returns its id or null.
  function claimNext() {
    const row = db.prepare(`
      SELECT id FROM runs
      WHERE status = 'queued' AND (next_attempt_at IS NULL OR next_attempt_at <= datetime('now'))
      ORDER BY created_at ASC, id ASC LIMIT 1
    `).get();
    if (!row) return null;
    const claimed = db.prepare(
      `UPDATE runs SET status = 'running', started_at = COALESCE(started_at, datetime('now')) WHERE id = ? AND status = 'queued'`
    ).run(row.id);
    return claimed.changes === 1 ? row.id : null;
  }

  // Execute one claimed run, then handle retry/backoff and one-shot completion.
  async function executeRunId(runId) {
    const run = db.prepare('SELECT * FROM runs WHERE id = ?').get(runId);
    if (!run) return;
    const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(run.schedule_id);
    const agentIds = JSON.parse(run.agent_ids || '[]');
    const placeholders = agentIds.map(() => '?').join(',') || 'NULL';
    const agentRows = agentIds.length ? db.prepare(`SELECT * FROM agents WHERE id IN (${placeholders})`).all(...agentIds) : [];
    const byId = new Map(agentRows.map(a => [a.id, a]));
    const orderedAgents = agentIds.map(id => byId.get(id)).filter(Boolean);
    // The run row is the source of truth for what executes (snapshots mode/prompt,
    // including any webhook payload override), composed with the live schedule config.
    const runSchedule = {
      ...(schedule || { id: run.schedule_id, name: 'run', cron_expression: '0 0 * * *', recurring: 1 }),
      mode: run.mode, task_prompt: run.task_prompt, agent_ids: run.agent_ids,
    };

    try {
      await executeRunViaGraph({ db, runId, schedule: runSchedule, agents: orderedAgents });
    } catch (err) {
      console.error(`[scheduler] run ${runId} crashed:`, err.message);
      db.prepare(`UPDATE runs SET status='failed', error_message=?, finished_at=datetime('now') WHERE id=?`).run(err.message, runId);
    }

    // Retry-with-backoff: re-queue a failed/timed-out run until attempts are exhausted
    // (after which it stays failed = the dead-letter lane).
    const after = db.prepare('SELECT status, attempt, max_attempts FROM runs WHERE id = ?').get(runId);
    if (after && (after.status === 'failed' || after.status === 'timeout') && (after.attempt + 1) < after.max_attempts) {
      const attempt = after.attempt + 1;
      const backoff = Math.min(300, 15 * Math.pow(2, attempt - 1)); // 15s, 30s, 60s, … capped 5m
      db.prepare(`UPDATE runs SET status='queued', attempt=?, next_attempt_at=datetime('now', ?), finished_at=NULL, error_message=NULL WHERE id=?`)
        .run(attempt, `+${backoff} seconds`, runId);
      console.log(`[scheduler] run ${runId} failed — retry ${attempt}/${after.max_attempts - 1} in ${backoff}s`);
      return;
    }

    // One-shot schedules auto-complete; recurring ones get next_run_at refreshed.
    if (schedule) {
      const s = db.prepare('SELECT recurring, status FROM schedules WHERE id = ?').get(run.schedule_id);
      if (s && !s.recurring && s.status === 'active') {
        db.prepare(`UPDATE schedules SET status='completed', next_run_at=NULL WHERE id=?`).run(run.schedule_id);
        unregister(run.schedule_id);
      } else if (s && s.status === 'active') {
        db.prepare(`UPDATE schedules SET next_run_at=? WHERE id=?`).run(nextRunAt(schedule.cron_expression), run.schedule_id);
      }
    }
  }

  // Pump the queue up to the concurrency limit. Idempotent; safe to call repeatedly.
  function drain() {
    while (active < getSetting('max_concurrent_runs')) {
      const runId = claimNext();
      if (runId == null) break;
      active++;
      executeRunId(runId).finally(() => { active--; drain(); });
    }
  }

  // Re-queue runs left 'running' by a crash so they don't hang forever (at-least-once).
  function recoverOrphans() {
    const r = db.prepare(`UPDATE runs SET status='queued' WHERE status='running'`).run();
    if (r.changes) console.log(`[scheduler] re-queued ${r.changes} orphaned run(s) after restart`);
    drain();
    return r.changes;
  }

  // Re-queue a specific (e.g. dead-lettered) run for another attempt.
  function requeue(runId) {
    if (!db.prepare('SELECT id FROM runs WHERE id = ?').get(runId)) return false;
    db.prepare(`UPDATE runs SET status='queued', next_attempt_at=NULL, finished_at=NULL, error_message=NULL WHERE id=?`).run(runId);
    drain();
    return true;
  }

  /**
   * Fire a run for the given scheduleId — creates a runs row, queues execution.
   * Returns the new runId.
   */
  function fireRun(scheduleId, { taskPrompt = null, force = false } = {}) {
    const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(scheduleId);
    if (!schedule) return null;
    if (!force && (schedule.status === 'paused' || schedule.status === 'completed')) return null;
    const prompt = taskPrompt || schedule.task_prompt; // webhook payload override

    const agentIds = JSON.parse(schedule.agent_ids || '[]');
    const placeholders = agentIds.map(() => '?').join(',') || 'NULL';
    const found = agentIds.length ? db.prepare(`SELECT id FROM agents WHERE id IN (${placeholders})`).all(...agentIds) : [];
    if (found.length === 0) {
      console.error(`[scheduler] schedule ${scheduleId} has no valid agents; skipping`);
      return null;
    }

    const maxAttempts = 1 + Math.max(0, getSetting('run_max_retries') || 0);
    // Supervised tier = human-in-the-loop: the run is created but holds in
    // 'pending_approval' until an operator approves it (claimNext only takes
    // 'queued'). Approval comes via POST /api/runs/:id/approve.
    const gated = resolveTier(schedule) === 'supervised';
    const initialStatus = gated ? 'pending_approval' : 'queued';
    const runResult = db.prepare(`
      INSERT INTO runs (schedule_id, agent_ids, mode, task_prompt, status, max_attempts)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(scheduleId, schedule.agent_ids, schedule.mode, prompt, initialStatus, maxAttempts);
    const runId = runResult.lastInsertRowid;
    if (gated) {
      sendDiscordNotify(
        `Run #${runId} awaiting approval`,
        `${schedule.name} (supervised tier) requires operator approval before dispatch.`,
        15105570,
      ).catch(() => {});
      console.log(`[scheduler] run ${runId} held for approval (supervised tier)`);
    } else {
      drain();
    }
    return runId;
  }

  // Fire a pipeline (cron or webhook). Pipelines bypass the run queue: they are
  // fire-and-forget with their own pipeline_runs lifecycle.
  function firePipeline(pipelineId, { task = null, force = false } = {}) {
    const p = db.prepare('SELECT * FROM pipelines WHERE id = ?').get(pipelineId);
    if (!p) return null;
    if (!force && p.schedule_status !== 'active') return null;
    let graphDef; try { graphDef = JSON.parse(p.graph || '{"nodes":[],"edges":[]}'); } catch { return null; }
    if (!validatePipelineGraph(graphDef).ok) {
      console.error(`[scheduler] pipeline ${pipelineId} graph invalid; skipping fire`);
      return null;
    }
    const t = task || p.description || p.name;
    const r = db.prepare(`INSERT INTO pipeline_runs (pipeline_id, task, status) VALUES (?, ?, 'queued')`).run(pipelineId, t);
    const runId = r.lastInsertRowid;
    executePipelineRun({ db, pipeline: p, task: t, pipelineRunId: runId }).catch(err => {
      console.error(`[scheduler] pipeline run ${runId} crashed:`, err.message);
      db.prepare(`UPDATE pipeline_runs SET status='failed', error_message=?, finished_at=datetime('now') WHERE id=?`).run(err.message, runId);
    });
    if (p.cron_expression) {
      db.prepare(`UPDATE pipelines SET next_run_at = ? WHERE id = ?`).run(nextRunAt(p.cron_expression), pipelineId);
    }
    return runId;
  }

  function registerPipeline(pipeline) {
    if (pipelineTasks.has(pipeline.id)) {
      pipelineTasks.get(pipeline.id).stop();
      pipelineTasks.delete(pipeline.id);
    }
    if (pipeline.schedule_status !== 'active') {
      db.prepare(`UPDATE pipelines SET next_run_at = NULL WHERE id = ?`).run(pipeline.id);
      return;
    }
    if (!isValidCron(pipeline.cron_expression)) {
      console.error(`[scheduler] invalid cron for pipeline ${pipeline.id}: ${pipeline.cron_expression}`);
      return;
    }
    const task = cron.schedule(pipeline.cron_expression, () => { firePipeline(pipeline.id); });
    pipelineTasks.set(pipeline.id, task);
    db.prepare(`UPDATE pipelines SET next_run_at = ? WHERE id = ?`).run(nextRunAt(pipeline.cron_expression), pipeline.id);
  }

  function register(schedule) {
    if (tasks.has(schedule.id)) {
      tasks.get(schedule.id).stop();
      tasks.delete(schedule.id);
    }
    if (schedule.status !== 'active') return;
    if (!isValidCron(schedule.cron_expression)) {
      console.error(`[scheduler] invalid cron for schedule ${schedule.id}: ${schedule.cron_expression}`);
      return;
    }
    const task = cron.schedule(schedule.cron_expression, () => {
      fireRun(schedule.id);
    });
    tasks.set(schedule.id, task);
    db.prepare(`UPDATE schedules SET next_run_at = ? WHERE id = ?`)
      .run(nextRunAt(schedule.cron_expression), schedule.id);
  }

  function unregister(scheduleId) {
    const task = tasks.get(scheduleId);
    if (task) {
      task.stop();
      tasks.delete(scheduleId);
    }
  }

  // Prune run history: drop finished runs older than the age limit, and cap each
  // schedule to the latest N runs. Never touches running/queued rows.
  function pruneRuns() {
    try {
      const byAge = db.prepare(
        `DELETE FROM runs WHERE status NOT IN ('running','queued','pending_approval') AND created_at < datetime('now', ?)`
      ).run(`-${getSetting('retention_max_age_days')} days`);
      const byCount = db.prepare(`
        DELETE FROM runs WHERE id IN (
          SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY schedule_id ORDER BY created_at DESC) AS rn FROM runs
          ) WHERE rn > ?
        )
      `).run(getSetting('retention_max_runs_per_schedule'));
      const pipeByAge = db.prepare(
        `DELETE FROM pipeline_runs WHERE status NOT IN ('running','queued') AND created_at < datetime('now', ?)`
      ).run(`-${getSetting('retention_max_age_days')} days`);
      const pipeByCount = db.prepare(`
        DELETE FROM pipeline_runs WHERE id IN (
          SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY pipeline_id ORDER BY created_at DESC) AS rn FROM pipeline_runs
          ) WHERE rn > ?
        )
      `).run(getSetting('retention_max_runs_per_schedule'));
      const removed = (byAge.changes || 0) + (byCount.changes || 0) + (pipeByAge.changes || 0) + (pipeByCount.changes || 0);
      if (removed > 0) console.log(`[scheduler] retention pruned ${removed} old run(s)`);
      return removed;
    } catch (err) {
      console.error('[scheduler] retention prune failed:', err.message);
      return 0;
    }
  }

  function hydrate() {
    const rows = db.prepare(`SELECT * FROM schedules WHERE status = 'active'`).all();
    for (const row of rows) register(row);
    const pipeRows = db.prepare(`SELECT * FROM pipelines WHERE schedule_status = 'active'`).all();
    for (const row of pipeRows) registerPipeline(row);
    if (pipeRows.length) console.log(`[scheduler] hydrated ${pipeRows.length} scheduled pipeline(s)`);
    console.log(`[scheduler] hydrated ${rows.length} active schedule(s), concurrency=${getSetting('max_concurrent_runs')}`);
    // Prune once on boot, then nightly at 03:00 (separate from user schedules).
    pruneRuns();
    cron.schedule('0 3 * * *', pruneRuns);
    console.log(`[scheduler] retention: keep ${getSetting('retention_max_runs_per_schedule')}/schedule, max age ${getSetting('retention_max_age_days')}d`);
    // SLO breach monitor: evaluate now, then every 15 minutes (alerts on transition to breach).
    checkSloBreach(db);
    cron.schedule('*/15 * * * *', () => checkSloBreach(db));
    drain(); // pick up any runs queued while the scheduler was off
  }

  function stats() {
    const queued = db.prepare(`SELECT COUNT(*) AS c FROM runs WHERE status='queued'`).get().c;
    return { registered: tasks.size, queued, running: active, maxConcurrent: getSetting('max_concurrent_runs') };
  }

  return { hydrate, register, unregister, fireRun, firePipeline, registerPipeline, requeue, recoverOrphans, stats, pruneRuns };
}
