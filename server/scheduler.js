import cron from 'node-cron';
import parser from 'cron-parser';
import { executeRunViaGraph } from './workflows/runner.js';
import { getSetting } from './settings.js';

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
  const queue = [];
  let running = 0;

  function drainQueue() {
    while (running < getSetting('max_concurrent_runs') && queue.length > 0) {
      const job = queue.shift();
      running++;
      job().finally(() => {
        running--;
        drainQueue();
      });
    }
  }

  function enqueue(jobFn) {
    queue.push(jobFn);
    drainQueue();
  }

  /**
   * Fire a run for the given scheduleId — creates a runs row, queues execution.
   * Returns the new runId.
   */
  function fireRun(scheduleId, { taskPrompt = null, force = false } = {}) {
    const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(scheduleId);
    if (!schedule) return null;
    if (!force && (schedule.status === 'paused' || schedule.status === 'completed')) return null;
    if (taskPrompt) schedule.task_prompt = taskPrompt; // webhook payload override

    const agentIds = JSON.parse(schedule.agent_ids || '[]');
    const placeholders = agentIds.map(() => '?').join(',') || 'NULL';
    const agentRows = agentIds.length
      ? db.prepare(`SELECT * FROM agents WHERE id IN (${placeholders})`).all(...agentIds)
      : [];
    if (agentRows.length === 0) {
      console.error(`[scheduler] schedule ${scheduleId} has no valid agents; skipping`);
      return null;
    }

    // Preserve the user's requested agent order
    const byId = new Map(agentRows.map(a => [a.id, a]));
    const orderedAgents = agentIds.map(id => byId.get(id)).filter(Boolean);

    const runResult = db.prepare(`
      INSERT INTO runs (schedule_id, agent_ids, mode, task_prompt, status)
      VALUES (?, ?, ?, ?, 'queued')
    `).run(scheduleId, schedule.agent_ids, schedule.mode, schedule.task_prompt);
    const runId = runResult.lastInsertRowid;

    enqueue(async () => {
      try {
        await executeRunViaGraph({ db, runId, schedule, agents: orderedAgents });
      } catch (err) {
        console.error(`[scheduler] run ${runId} execution crashed:`, err);
        db.prepare(`UPDATE runs SET status = 'failed', error_message = ?, finished_at = ? WHERE id = ?`)
          .run(err.message, new Date().toISOString(), runId);
      }

      // One-shot schedules auto-complete
      const s = db.prepare('SELECT recurring, status FROM schedules WHERE id = ?').get(scheduleId);
      if (s && !s.recurring && s.status === 'active') {
        db.prepare(`UPDATE schedules SET status = 'completed', next_run_at = NULL WHERE id = ?`).run(scheduleId);
        unregister(scheduleId);
      } else if (s && s.status === 'active') {
        db.prepare(`UPDATE schedules SET next_run_at = ? WHERE id = ?`).run(nextRunAt(schedule.cron_expression), scheduleId);
      }
    });

    return runId;
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
        `DELETE FROM runs WHERE status NOT IN ('running','queued') AND created_at < datetime('now', ?)`
      ).run(`-${getSetting('retention_max_age_days')} days`);
      const byCount = db.prepare(`
        DELETE FROM runs WHERE id IN (
          SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY schedule_id ORDER BY created_at DESC) AS rn FROM runs
          ) WHERE rn > ?
        )
      `).run(getSetting('retention_max_runs_per_schedule'));
      const removed = (byAge.changes || 0) + (byCount.changes || 0);
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
    console.log(`[scheduler] hydrated ${rows.length} active schedule(s), concurrency=${MAX_CONCURRENT_RUNS}`);
    // Prune once on boot, then nightly at 03:00 (separate from user schedules).
    pruneRuns();
    cron.schedule('0 3 * * *', pruneRuns);
    console.log(`[scheduler] retention: keep ${getSetting('retention_max_runs_per_schedule')}/schedule, max age ${getSetting('retention_max_age_days')}d`);
  }

  function stats() {
    return {
      registered: tasks.size,
      queued: queue.length,
      running,
      maxConcurrent: MAX_CONCURRENT_RUNS,
    };
  }

  return { hydrate, register, unregister, fireRun, stats, pruneRuns };
}
