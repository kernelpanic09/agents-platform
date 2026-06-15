import { Router } from 'express';
import { ensureReportTables, uniqueSlug, startBuild, buildTimeline } from '../reports.js';
import { queryMetricSeries, backfill, recordCollectorPoints } from '../metrics.js';

const VALID_MODELS = ['haiku', 'sonnet', 'opus'];

// Combined Reports API: report groups (a named set of schedules) + their builds.
export default function reportsRouter(db) {
  ensureReportTables(db);
  const router = Router();

  const parseGroup = (row) => row && ({
    ...row,
    schedule_ids: JSON.parse(row.schedule_ids || '[]'),
    enabled: !!row.enabled,
  });

  const resolve = (idOrSlug) => {
    if (/^\d+$/.test(String(idOrSlug))) {
      return db.prepare('SELECT * FROM report_groups WHERE id = ?').get(parseInt(idOrSlug, 10));
    }
    return db.prepare('SELECT * FROM report_groups WHERE slug = ?').get(String(idOrSlug));
  };

  const latestBuild = (gid, status = null) => (status
    ? db.prepare('SELECT * FROM report_builds WHERE report_id = ? AND status = ? ORDER BY id DESC LIMIT 1').get(gid, status)
    : db.prepare('SELECT * FROM report_builds WHERE report_id = ? ORDER BY id DESC LIMIT 1').get(gid));

  const membersOf = (group) => JSON.parse(group.schedule_ids || '[]').map((sid) => {
    const s = db.prepare('SELECT id, name, agent_ids, status FROM schedules WHERE id = ?').get(sid);
    return s
      ? { schedule_id: s.id, name: s.name, agent_ids: JSON.parse(s.agent_ids || '[]'), status: s.status }
      : { schedule_id: sid, name: `schedule #${sid}`, agent_ids: [], status: 'missing' };
  });

  function validateMembers(scheduleIds) {
    const ids = [...new Set((Array.isArray(scheduleIds) ? scheduleIds : []).map(Number).filter(Number.isInteger))];
    if (!ids.length) return { error: 'schedule_ids must be a non-empty array of schedule IDs' };
    const ph = ids.map(() => '?').join(',');
    const found = new Set(db.prepare(`SELECT id FROM schedules WHERE id IN (${ph})`).all(...ids).map(r => r.id));
    const missing = ids.filter(i => !found.has(i));
    if (missing.length) return { error: `schedule_ids not found: ${missing.join(', ')}` };
    return { ids };
  }

  // POST /api/reports — create a report group ("Combine")
  router.post('/', (req, res) => {
    const { name, schedule_ids, model, description } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name is required' });
    const v = validateMembers(schedule_ids);
    if (v.error) return res.status(400).json({ error: v.error });
    if (model && !VALID_MODELS.includes(model)) return res.status(400).json({ error: `model must be one of: ${VALID_MODELS.join(', ')}` });
    const slug = uniqueSlug(db, name.trim());
    const info = db.prepare(`
      INSERT INTO report_groups (name, slug, description, schedule_ids, model) VALUES (?, ?, ?, ?, ?)
    `).run(name.trim(), slug, description || '', JSON.stringify(v.ids), model || null);
    res.status(201).json(parseGroup(db.prepare('SELECT * FROM report_groups WHERE id = ?').get(info.lastInsertRowid)));
  });

  // GET /api/reports — list with latest build meta
  router.get('/', (req, res) => {
    const rows = db.prepare('SELECT * FROM report_groups ORDER BY created_at DESC').all();
    res.json(rows.map((g) => {
      const success = latestBuild(g.id, 'success');
      const last = latestBuild(g.id);
      let meta = null;
      if (success) {
        try {
          const c = JSON.parse(success.content);
          meta = { overall_verdict: c.overall_verdict, headline: c.headline, built_at: success.created_at };
        } catch { meta = { built_at: success.created_at }; }
      }
      return {
        ...parseGroup(g),
        members: membersOf(g),
        latest: meta,
        last_build_status: last?.status || null,
        building: last?.status === 'building',
      };
    }));
  });

  // GET /api/reports/:idOrSlug — full report (latest successful build + live timeline)
  router.get('/:idOrSlug', (req, res) => {
    const g = resolve(req.params.idOrSlug);
    if (!g) return res.status(404).json({ error: 'report not found' });
    const success = latestBuild(g.id, 'success');
    const last = latestBuild(g.id);
    let latest = null;
    if (success) {
      try {
        latest = {
          id: success.id,
          content: JSON.parse(success.content),
          source_runs: JSON.parse(success.source_runs || '[]'),
          created_at: success.created_at,
          duration_ms: success.duration_ms,
        };
      } catch { latest = null; }
    }
    res.json({
      ...parseGroup(g),
      members: membersOf(g),
      latest,
      last_build: last ? { id: last.id, status: last.status, error_message: last.error_message, created_at: last.created_at } : null,
      building: last?.status === 'building',
      timeline: buildTimeline(db, g, 14),
    });
  });

  // POST /api/reports/:idOrSlug/build — rebuild now (202; 409 if already building)
  router.post('/:idOrSlug/build', (req, res) => {
    const g = resolve(req.params.idOrSlug);
    if (!g) return res.status(404).json({ error: 'report not found' });
    const r = startBuild(db, g);
    if (r.skipped) return res.status(409).json({ error: 'a build is already in progress', build_id: r.buildId });
    r.promise.catch(() => {});
    res.status(202).json({ build_id: r.buildId });
  });

  // PUT /api/reports/:idOrSlug — partial update
  router.put('/:idOrSlug', (req, res) => {
    const g = resolve(req.params.idOrSlug);
    if (!g) return res.status(404).json({ error: 'report not found' });
    const b = req.body || {};
    if (b.name !== undefined && (!b.name || !String(b.name).trim())) return res.status(400).json({ error: 'name cannot be empty' });
    if (b.model !== undefined && b.model !== null && b.model !== '' && !VALID_MODELS.includes(b.model)) {
      return res.status(400).json({ error: `model must be one of: ${VALID_MODELS.join(', ')}` });
    }
    let ids = null;
    if (b.schedule_ids !== undefined) {
      const v = validateMembers(b.schedule_ids);
      if (v.error) return res.status(400).json({ error: v.error });
      ids = v.ids;
    }
    db.prepare(`
      UPDATE report_groups SET
        name = ?, description = ?, schedule_ids = ?, model = ?, enabled = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      b.name !== undefined ? String(b.name).trim() : g.name,
      b.description !== undefined ? String(b.description) : g.description,
      ids ? JSON.stringify(ids) : g.schedule_ids,
      b.model !== undefined ? (b.model || null) : g.model,
      b.enabled !== undefined ? (b.enabled ? 1 : 0) : g.enabled,
      g.id,
    );
    res.json(parseGroup(db.prepare('SELECT * FROM report_groups WHERE id = ?').get(g.id)));
  });

  // DELETE /api/reports/:idOrSlug — builds cascade via FK
  router.delete('/:idOrSlug', (req, res) => {
    const g = resolve(req.params.idOrSlug);
    if (!g) return res.status(404).json({ error: 'report not found' });
    db.prepare('DELETE FROM report_groups WHERE id = ?').run(g.id);
    res.json({ success: true });
  });

  // GET /api/reports/:idOrSlug/metrics?days=90 — time-series for the Trends tab + drill-in
  router.get('/:idOrSlug/metrics', (req, res) => {
    const g = resolve(req.params.idOrSlug);
    if (!g) return res.status(404).json({ error: 'report not found' });
    const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 90));
    try { backfill(db, g); } catch (e) { console.error(`[reports] backfill failed: ${e.message}`); }
    const series = queryMetricSeries(db, g, days);
    res.json({ ...series, timeline: buildTimeline(db, g, days) });
  });

  // POST /api/reports/:idOrSlug/metrics — ingest deterministic collector points (no auth, internal LAN)
  router.post('/:idOrSlug/metrics', (req, res) => {
    const g = resolve(req.params.idOrSlug);
    if (!g) return res.status(404).json({ error: 'report not found' });
    const points = req.body?.points;
    if (!Array.isArray(points) || points.length === 0) return res.status(400).json({ error: 'points must be a non-empty array' });
    if (points.length > 500) return res.status(400).json({ error: 'too many points (max 500)' });
    try {
      const r = recordCollectorPoints(db, g, points, req.body?.collected_at);
      res.status(201).json(r);
    } catch (e) {
      console.error(`[reports] collector ingest failed: ${e.message}`);
      res.status(500).json({ error: 'ingest failed' });
    }
  });

  // GET /api/reports/:idOrSlug/history — recent builds meta
  router.get('/:idOrSlug/history', (req, res) => {
    const g = resolve(req.params.idOrSlug);
    if (!g) return res.status(404).json({ error: 'report not found' });
    const rows = db.prepare(`
      SELECT id, status, error_message, duration_ms, created_at, content FROM report_builds
      WHERE report_id = ? ORDER BY id DESC LIMIT 30
    `).all(g.id);
    res.json(rows.map((r) => {
      let overall = null;
      if (r.content) { try { overall = JSON.parse(r.content).overall_verdict || null; } catch { /* meta only */ } }
      return { id: r.id, status: r.status, overall_verdict: overall, error_message: r.error_message, duration_ms: r.duration_ms, created_at: r.created_at };
    }));
  });

  return router;
}
