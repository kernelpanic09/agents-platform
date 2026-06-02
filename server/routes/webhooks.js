import { Router } from 'express';
import crypto from 'crypto';

// Inbound webhook triggers: turn the cron-only scheduler into an event-driven runtime.
// External systems (Prometheus Alertmanager, GitHub Actions, n8n) POST to a tokenized
// URL to fire a schedule. The per-webhook token IS the credential (no API key needed).
export default function webhooksRouter(db, scheduler) {
  const router = Router();

  db.exec(`CREATE TABLE IF NOT EXISTS webhooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    label TEXT DEFAULT '',
    last_triggered_at TEXT,
    trigger_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // POST /api/webhooks — create a webhook for a schedule.
  router.post('/', (req, res) => {
    const { schedule_id, label } = req.body || {};
    if (!db.prepare('SELECT id FROM schedules WHERE id = ?').get(schedule_id)) {
      return res.status(400).json({ error: 'schedule_id not found' });
    }
    const token = 'whk_' + crypto.randomBytes(18).toString('base64url');
    const info = db.prepare('INSERT INTO webhooks (schedule_id, token, label) VALUES (?, ?, ?)')
      .run(schedule_id, token, label || '');
    res.status(201).json({ id: info.lastInsertRowid, schedule_id, token, label: label || '', trigger_count: 0 });
  });

  // GET /api/webhooks?schedule_id=N — list (token shown so the URL can be copied; it's the credential).
  router.get('/', (req, res) => {
    const sid = req.query.schedule_id ? parseInt(req.query.schedule_id, 10) : null;
    const rows = sid
      ? db.prepare('SELECT * FROM webhooks WHERE schedule_id = ? ORDER BY id DESC').all(sid)
      : db.prepare('SELECT * FROM webhooks ORDER BY id DESC').all();
    res.json(rows);
  });

  // DELETE /api/webhooks/:id
  router.delete('/:id', (req, res) => {
    if (!db.prepare('DELETE FROM webhooks WHERE id = ?').run(parseInt(req.params.id, 10)).changes) {
      return res.status(404).json({ error: 'webhook not found' });
    }
    res.json({ success: true });
  });

  // POST /api/webhooks/:token — fire the schedule. Public; the token authenticates.
  // {{payload.field}} in the task prompt is replaced from the JSON body; or send
  // { "override_prompt": "..." } to replace the prompt outright.
  router.post('/:token', (req, res) => {
    const wh = db.prepare('SELECT * FROM webhooks WHERE token = ?').get(req.params.token);
    if (!wh) return res.status(404).json({ error: 'unknown webhook token' });

    const sched = db.prepare('SELECT task_prompt FROM schedules WHERE id = ?').get(wh.schedule_id);
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    let taskPrompt = null;
    if (sched && /\{\{payload\./.test(sched.task_prompt || '')) {
      taskPrompt = sched.task_prompt.replace(/\{\{payload\.([\w.]+)\}\}/g, (_, path) => {
        const v = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), payload);
        return v == null ? '' : String(v);
      });
    } else if (payload.override_prompt) {
      taskPrompt = String(payload.override_prompt);
    }

    const runId = scheduler.fireRun(wh.schedule_id, { taskPrompt, force: true });
    if (!runId) return res.status(409).json({ error: 'could not start run (schedule has no valid agents?)' });

    db.prepare("UPDATE webhooks SET last_triggered_at = datetime('now'), trigger_count = trigger_count + 1 WHERE id = ?").run(wh.id);
    res.status(202).json({ run_id: runId, schedule_id: wh.schedule_id });
  });

  return router;
}
