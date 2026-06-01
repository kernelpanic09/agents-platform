import { Router } from 'express';
import { isValidCron, nextRunAt, previewNextRuns } from '../scheduler.js';

const VALID_MODES = ['parallel', 'sequential', 'meeting'];
const VALID_STATUSES = ['active', 'paused', 'completed'];
const VALID_MODELS = ['haiku', 'sonnet', 'opus'];
const VALID_BACKENDS = ['subscription', 'api'];
// App directories must live under this prefix — no traversal, no absolute paths
// outside the homelab apps tree.
const APPS_ROOT = process.env.APPS_ROOT || '/home/ubuntu/apps';

function parseSchedule(row) {
  if (!row) return null;
  return {
    ...row,
    agent_ids: JSON.parse(row.agent_ids || '[]'),
    recurring: !!row.recurring,
    allow_writes: !!row.allow_writes,
  };
}

function serializeInput(body) {
  return {
    name: body.name,
    description: body.description || '',
    agent_ids: JSON.stringify(body.agent_ids || []),
    mode: body.mode,
    task_prompt: body.task_prompt,
    cron_expression: body.cron_expression,
    recurring: body.recurring === false ? 0 : 1,
    allow_writes: body.allow_writes ? 1 : 0,
    app_directory: body.app_directory || null,
    model: body.model || null,
    execution_backend: body.execution_backend || null,
  };
}

function validateInput(body, { partial = false } = {}) {
  const errors = [];
  if (!partial || body.name !== undefined) {
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) errors.push('name is required');
  }
  if (!partial || body.mode !== undefined) {
    if (!VALID_MODES.includes(body.mode)) errors.push(`mode must be one of: ${VALID_MODES.join(', ')}`);
  }
  if (!partial || body.task_prompt !== undefined) {
    if (!body.task_prompt || typeof body.task_prompt !== 'string' || !body.task_prompt.trim()) errors.push('task_prompt is required');
  }
  if (!partial || body.agent_ids !== undefined) {
    if (!Array.isArray(body.agent_ids) || body.agent_ids.length === 0) errors.push('agent_ids must be a non-empty array');
    else if (body.agent_ids.some(x => !Number.isInteger(x))) errors.push('agent_ids must contain integer IDs');
  }
  if (!partial || body.cron_expression !== undefined) {
    if (!isValidCron(body.cron_expression)) errors.push('cron_expression is invalid');
  }
  if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
    errors.push(`status must be one of: ${VALID_STATUSES.join(', ')}`);
  }
  if (body.model !== undefined && body.model !== null && body.model !== '' && !VALID_MODELS.includes(body.model)) {
    errors.push(`model must be one of: ${VALID_MODELS.join(', ')}`);
  }
  if (body.execution_backend !== undefined && body.execution_backend !== null && body.execution_backend !== '' && !VALID_BACKENDS.includes(body.execution_backend)) {
    errors.push(`execution_backend must be one of: ${VALID_BACKENDS.join(', ')}`);
  }
  if (body.app_directory !== undefined && body.app_directory !== null && body.app_directory !== '') {
    const appDirRe = new RegExp(`^${APPS_ROOT.replace(/[/]/g, '\\/')}/[a-zA-Z0-9_-]+$`);
    if (!appDirRe.test(body.app_directory)) {
      errors.push(`app_directory must match ${APPS_ROOT}/<name>`);
    }
  }
  return errors;
}

// Verify every id in `ids` corresponds to a real agent. Returns error string or null.
function validateAgentIdsExist(db, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return null;
  const placeholders = ids.map(() => '?').join(',');
  const found = db.prepare(`SELECT id FROM agents WHERE id IN (${placeholders})`).all(...ids);
  if (found.length !== ids.length) {
    const foundIds = new Set(found.map(r => r.id));
    const missing = ids.filter(i => !foundIds.has(i));
    return `agent_ids not found: ${missing.join(', ')}`;
  }
  return null;
}

export default function schedulesRouter(db, scheduler) {
  const router = Router();

  const stmtList = db.prepare(`
    SELECT s.*,
      (SELECT status FROM runs WHERE schedule_id = s.id ORDER BY created_at DESC LIMIT 1) AS last_run_status,
      (SELECT id FROM runs WHERE schedule_id = s.id ORDER BY created_at DESC LIMIT 1) AS last_run_id
    FROM schedules s
    ORDER BY s.created_at DESC
  `);
  const stmtGet = db.prepare('SELECT * FROM schedules WHERE id = ?');
  const stmtLatestRuns = db.prepare(`
    SELECT id, status, started_at, finished_at, duration_ms, summary, created_at
    FROM runs WHERE schedule_id = ? ORDER BY created_at DESC LIMIT 10
  `);
  const stmtInsert = db.prepare(`
    INSERT INTO schedules (name, description, agent_ids, mode, task_prompt, cron_expression, recurring, allow_writes, app_directory, model, execution_backend, status, next_run_at)
    VALUES (@name, @description, @agent_ids, @mode, @task_prompt, @cron_expression, @recurring, @allow_writes, @app_directory, @model, @execution_backend, 'active', @next_run_at)
  `);
  const stmtUpdate = db.prepare(`
    UPDATE schedules SET
      name = ?, description = ?, agent_ids = ?, mode = ?, task_prompt = ?,
      cron_expression = ?, recurring = ?, allow_writes = ?,
      app_directory = ?, model = ?, execution_backend = ?,
      status = ?, next_run_at = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `);
  const stmtSetStatus = db.prepare(`UPDATE schedules SET status = ?, updated_at = datetime('now'), next_run_at = NULL WHERE id = ?`);
  const stmtHardDelete = db.prepare('DELETE FROM schedules WHERE id = ?');
  const stmtCountRuns = db.prepare('SELECT COUNT(*) AS c FROM runs WHERE schedule_id = ?');

  // GET /api/schedules — list all
  router.get('/', (req, res) => {
    const rows = stmtList.all();
    res.json(rows.map(parseSchedule));
  });

  // GET /api/schedules/preview?cron=...&count=3 — preview next runs
  router.get('/preview', (req, res) => {
    const cronExpr = req.query.cron;
    if (!cronExpr) return res.status(400).json({ error: 'cron query param required' });
    if (!isValidCron(cronExpr)) return res.status(400).json({ error: 'invalid cron expression' });
    const count = Math.min(parseInt(req.query.count || '3', 10), 10);
    res.json({ next: previewNextRuns(cronExpr, count) });
  });

  // GET /api/schedules/:id — one schedule + recent runs
  router.get('/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid schedule ID' });
    const row = stmtGet.get(id);
    if (!row) return res.status(404).json({ error: 'Schedule not found' });
    const recent = stmtLatestRuns.all(id);
    res.json({ ...parseSchedule(row), recent_runs: recent });
  });

  // POST /api/schedules — create
  router.post('/', (req, res) => {
    const errors = validateInput(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    const agentErr = validateAgentIdsExist(db, req.body.agent_ids);
    if (agentErr) return res.status(400).json({ error: agentErr });

    const input = serializeInput(req.body);
    input.next_run_at = nextRunAt(input.cron_expression);

    const result = stmtInsert.run(input);
    const row = stmtGet.get(result.lastInsertRowid);
    scheduler.register(row);
    res.status(201).json(parseSchedule(row));
  });

  // PUT /api/schedules/:id — update (partial)
  router.put('/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid schedule ID' });
    const existing = stmtGet.get(id);
    if (!existing) return res.status(404).json({ error: 'Schedule not found' });

    const errors = validateInput(req.body, { partial: true });
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    if (req.body.agent_ids !== undefined) {
      const agentErr = validateAgentIdsExist(db, req.body.agent_ids);
      if (agentErr) return res.status(400).json({ error: agentErr });
    }

    const merged = {
      name: req.body.name ?? existing.name,
      description: req.body.description ?? existing.description,
      agent_ids: req.body.agent_ids !== undefined ? JSON.stringify(req.body.agent_ids) : existing.agent_ids,
      mode: req.body.mode ?? existing.mode,
      task_prompt: req.body.task_prompt ?? existing.task_prompt,
      cron_expression: req.body.cron_expression ?? existing.cron_expression,
      recurring: req.body.recurring !== undefined ? (req.body.recurring ? 1 : 0) : existing.recurring,
      allow_writes: req.body.allow_writes !== undefined ? (req.body.allow_writes ? 1 : 0) : existing.allow_writes,
      app_directory: req.body.app_directory !== undefined ? (req.body.app_directory || null) : existing.app_directory,
      model: req.body.model !== undefined ? (req.body.model || null) : existing.model,
      execution_backend: req.body.execution_backend !== undefined ? (req.body.execution_backend || null) : existing.execution_backend,
      status: req.body.status ?? existing.status,
    };
    const next = nextRunAt(merged.cron_expression);

    stmtUpdate.run(
      merged.name, merged.description, merged.agent_ids, merged.mode, merged.task_prompt,
      merged.cron_expression, merged.recurring, merged.allow_writes,
      merged.app_directory, merged.model, merged.execution_backend,
      merged.status, next,
      id,
    );

    const updated = stmtGet.get(id);
    scheduler.register(updated); // re-register picks up any changes and respects new status
    res.json(parseSchedule(updated));
  });

  // DELETE /api/schedules/:id
  // - Active schedule with runs: soft-delete (status='completed', preserves runs)
  // - Already-completed schedule: hard-delete (and its runs via ON DELETE CASCADE)
  // - No runs: hard-delete
  // - ?force=true: always hard-delete
  router.delete('/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid schedule ID' });
    const existing = stmtGet.get(id);
    if (!existing) return res.status(404).json({ error: 'Schedule not found' });

    const force = req.query.force === 'true';
    const runCount = stmtCountRuns.get(id).c;

    scheduler.unregister(id);

    // Hard-delete when: forced, no runs, or the schedule is already completed.
    if (force || runCount === 0 || existing.status === 'completed') {
      stmtHardDelete.run(id);
      return res.json({ success: true, mode: 'hard', deleted_runs: runCount });
    }

    stmtSetStatus.run('completed', id);
    res.json({ success: true, mode: 'soft', preserved_runs: runCount });
  });

  // POST /api/schedules/:id/run — fire now
  router.post('/:id/run', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid schedule ID' });
    const existing = stmtGet.get(id);
    if (!existing) return res.status(404).json({ error: 'Schedule not found' });
    if (process.env.ENABLE_SCHEDULER !== 'true') {
      return res.status(503).json({ error: 'Scheduler disabled (set ENABLE_SCHEDULER=true)' });
    }
    const runId = scheduler.fireRun(id);
    if (!runId) return res.status(400).json({ error: 'Could not enqueue run (paused/completed/no-agents?)' });
    res.status(202).json({ success: true, run_id: runId });
  });

  // POST /api/schedules/:id/pause
  router.post('/:id/pause', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid schedule ID' });
    const existing = stmtGet.get(id);
    if (!existing) return res.status(404).json({ error: 'Schedule not found' });
    stmtSetStatus.run('paused', id);
    scheduler.unregister(id);
    res.json(parseSchedule(stmtGet.get(id)));
  });

  // POST /api/schedules/:id/resume
  router.post('/:id/resume', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid schedule ID' });
    const existing = stmtGet.get(id);
    if (!existing) return res.status(404).json({ error: 'Schedule not found' });
    stmtSetStatus.run('active', id);
    const updated = stmtGet.get(id);
    scheduler.register(updated);
    res.json(parseSchedule(updated));
  });

  // GET /api/schedules/_/stats — scheduler introspection
  router.get('/_/stats', (req, res) => {
    res.json({ ...scheduler.stats(), enabled: process.env.ENABLE_SCHEDULER === 'true' });
  });

  return router;
}
