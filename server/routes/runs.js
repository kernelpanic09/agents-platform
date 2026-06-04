import { Router } from 'express';
import { subscribeRun, isRunLive } from '../run-stream.js';

function parseRun(row) {
  if (!row) return null;
  return {
    ...row,
    agent_ids: JSON.parse(row.agent_ids || '[]'),
    per_agent_output: row.per_agent_output ? JSON.parse(row.per_agent_output) : null,
  };
}

export default function runsRouter(db, scheduler) {
  const router = Router();

  const stmtList = db.prepare(`
    SELECT r.id, r.schedule_id, r.mode, r.status, r.verdict, r.started_at, r.finished_at,
           r.duration_ms, r.summary, r.error_message, r.created_at,
           s.name AS schedule_name
    FROM runs r
    LEFT JOIN schedules s ON s.id = r.schedule_id
    WHERE (@status IS NULL OR r.status = @status)
      AND (@schedule_id IS NULL OR r.schedule_id = @schedule_id)
    ORDER BY r.created_at DESC
    LIMIT @limit OFFSET @offset
  `);
  const stmtGet = db.prepare(`
    SELECT r.*, s.name AS schedule_name
    FROM runs r
    LEFT JOIN schedules s ON s.id = r.schedule_id
    WHERE r.id = ?
  `);
  const stmtCount = db.prepare(`
    SELECT COUNT(*) AS c FROM runs r
    WHERE (@status IS NULL OR r.status = @status)
      AND (@schedule_id IS NULL OR r.schedule_id = @schedule_id)
  `);

  // GET /api/runs?status=...&schedule_id=...&limit=50&offset=0
  router.get('/', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const offset = parseInt(req.query.offset || '0', 10);
    const params = {
      status: req.query.status || null,
      schedule_id: req.query.schedule_id ? parseInt(req.query.schedule_id, 10) : null,
      limit,
      offset,
    };
    const rows = stmtList.all(params);
    const total = stmtCount.get(params).c;
    res.json({ total, limit, offset, data: rows });
  });

  // GET /api/runs/:id
  router.get('/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid run ID' });
    const row = stmtGet.get(id);
    if (!row) return res.status(404).json({ error: 'Run not found' });

    // Resolve agent names for UI convenience
    const agentIds = JSON.parse(row.agent_ids || '[]');
    const agents = agentIds.length
      ? db.prepare(`SELECT id, name, title, color, icon_id FROM agents WHERE id IN (${agentIds.map(() => '?').join(',')})`).all(...agentIds)
      : [];

    res.json({ ...parseRun(row), agents });
  });

  // GET /api/runs/:id/stream — Server-Sent Events for the Live Run Theater.
  // Replays a finished run from the DB; streams agent lifecycle events for a live one.
  router.get('/:id/stream', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).end();
    const run = stmtGet.get(id);
    if (!run) return res.status(404).end();

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = (ev) => { res.write(`data: ${JSON.stringify(ev)}\n\n`); res.flush?.(); };

    const finished = ['success', 'failed', 'timeout'].includes(run.status);
    if (finished && !isRunLive(id)) {
      send({ type: 'replay', status: run.status, summary: run.summary,
             per_agent_output: run.per_agent_output ? JSON.parse(run.per_agent_output) : null });
      send({ type: 'done', status: run.status, summary: run.summary });
      return res.end();
    }

    send({ type: 'status', status: run.status });
    const keepalive = setInterval(() => { res.write(': ping\n\n'); res.flush?.(); }, 20000);
    const unsub = subscribeRun(id, (ev) => {
      send(ev);
      if (ev.type === 'done') { clearInterval(keepalive); unsub(); res.end(); }
    });
    req.on('close', () => { clearInterval(keepalive); unsub(); });
  });

  // POST /api/runs/:id/approve — release a supervised-tier run held for approval.
  router.post('/:id/approve', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid run ID' });
    const run = stmtGet.get(id);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    if (run.status !== 'pending_approval') return res.status(409).json({ error: `Run is ${run.status}, not pending_approval` });
    if (!scheduler || !scheduler.requeue(id)) return res.status(500).json({ error: 'Could not queue run' });
    res.json({ run_id: id, status: 'queued' });
  });

  // POST /api/runs/:id/reject — decline a held run; terminal state, no dispatch.
  router.post('/:id/reject', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid run ID' });
    const run = stmtGet.get(id);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    if (run.status !== 'pending_approval') return res.status(409).json({ error: `Run is ${run.status}, not pending_approval` });
    db.prepare(`UPDATE runs SET status='rejected', finished_at=datetime('now'), error_message='Rejected by operator' WHERE id=?`).run(id);
    res.json({ run_id: id, status: 'rejected' });
  });

  // POST /api/runs/:id/retry — re-queue a finished/dead-lettered run.
  router.post('/:id/retry', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid run ID' });
    const run = stmtGet.get(id);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    if (run.status === 'running' || run.status === 'queued') return res.status(409).json({ error: 'Run is already active' });
    if (!scheduler || !scheduler.requeue(id)) return res.status(500).json({ error: 'Could not re-queue run' });
    res.json({ run_id: id, status: 'queued' });
  });

  return router;
}
