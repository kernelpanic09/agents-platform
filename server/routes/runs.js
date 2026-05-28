import { Router } from 'express';

function parseRun(row) {
  if (!row) return null;
  return {
    ...row,
    agent_ids: JSON.parse(row.agent_ids || '[]'),
    per_agent_output: row.per_agent_output ? JSON.parse(row.per_agent_output) : null,
  };
}

export default function runsRouter(db) {
  const router = Router();

  const stmtList = db.prepare(`
    SELECT r.id, r.schedule_id, r.mode, r.status, r.started_at, r.finished_at,
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

  return router;
}
