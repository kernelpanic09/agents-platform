// server/routes/tickets.js — REST API for global single-board tickets
import express from 'express';
import { requireScope } from '../api-keys.js';
import {
  createTicket, updateTicket, getTicket, listTickets, boardTickets, ganttTickets,
  ticketSummary, addEvent, openTicketFromFinding, promoteFromActionItem,
} from '../tickets.js';

export default function ticketsRouter(db) {
  const router = express.Router();

  // List — all global, filter-able by status/priority/assignee/type/q
  router.get('/', (req, res) => {
    res.json(listTickets(db, {
      status:   req.query.status,
      priority: req.query.priority,
      assignee: req.query.assignee,
      type:     req.query.type,
      q:        req.query.q,
      limit:    Math.min(parseInt(req.query.limit || '200', 10), 1000),
      offset:   parseInt(req.query.offset || '0', 10),
    }));
  });

  // Board (kanban columns)
  router.get('/board', (req, res) => res.json(boardTickets(db)));

  // Gantt (scheduled + unscheduled)
  router.get('/gantt', (req, res) => res.json(ganttTickets(db)));

  // Summary counts
  router.get('/summary', (req, res) => res.json(ticketSummary(db)));

  // Create ticket — manual UI calls without auth; agents with an API key use
  // requireScope('write') and the source_type is set to 'agent' automatically.
  router.post('/', (req, res) => {
    const agentFiled = !!(req.headers.authorization || req.headers['x-api-key']);
    const doCreate = () => {
      try {
        const body = req.body || {};
        const source_type = agentFiled ? 'agent' : (body.source_type || 'manual');
        const t = body.dedup_key
          ? openTicketFromFinding(db, { ...body, source_type })
          : createTicket(db, { ...body, source_type, actor: agentFiled ? 'agent' : 'user' });
        res.status(201).json(t);
      } catch (e) {
        res.status(400).json({ error: e.message });
      }
    };
    if (agentFiled) return requireScope('write')(req, res, doCreate);
    doCreate();
  });

  // Promote a report action item into a ticket (idempotent)
  router.post('/from-action-item', (req, res) => {
    const { slug, item_key } = req.body || {};
    if (!slug || !item_key) return res.status(400).json({ error: 'slug and item_key are required' });
    const g = db.prepare('SELECT id, slug FROM report_groups WHERE slug = ?').get(slug);
    if (!g) return res.status(404).json({ error: 'report not found' });
    const build = db.prepare(
      `SELECT content FROM report_builds WHERE report_id = ? AND status='success' ORDER BY id DESC LIMIT 1`
    ).get(g.id);
    let raw = [];
    try {
      const c = JSON.parse(build?.content || '{}');
      raw = c.action_items_raw || c.action_items || [];
    } catch { /* no content */ }
    const item = raw.find(i => (i.key || '') === item_key);
    if (!item) return res.status(404).json({ error: 'action item not found in latest build' });
    const norm = {
      key:      item.key,
      title:    item.title,
      owner:    item.owner,
      priority: item.priority || item.gen_priority || 'medium',
    };
    res.status(201).json(promoteFromActionItem(db, { reportId: g.id, reportSlug: g.slug, item: norm }));
  });

  // Get single ticket (with events)
  router.get('/:id', (req, res) => {
    const t = getTicket(db, parseInt(req.params.id, 10));
    if (!t) return res.status(404).json({ error: 'ticket not found' });
    res.json(t);
  });

  // Update ticket fields
  router.patch('/:id', (req, res) => {
    try {
      res.json(updateTicket(db, parseInt(req.params.id, 10), req.body || {}, 'user'));
    } catch (e) {
      res.status(e.message === 'ticket not found' ? 404 : 400).json({ error: e.message });
    }
  });

  // Add a comment event
  router.post('/:id/comment', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!getTicket(db, id)) return res.status(404).json({ error: 'ticket not found' });
    addEvent(db, id, {
      event_type: 'comment',
      actor: req.body?.actor || 'user',
      note: String(req.body?.note || ''),
    });
    res.json(getTicket(db, id));
  });

  // Reopen a done ticket → triaged
  router.post('/:id/reopen', (req, res) => {
    try {
      res.json(updateTicket(db, parseInt(req.params.id, 10), { status: 'triaged' }, 'user'));
    } catch (e) {
      res.status(404).json({ error: e.message });
    }
  });

  // Delete a ticket
  router.delete('/:id', (req, res) => {
    db.prepare('DELETE FROM tickets WHERE id = ?').run(parseInt(req.params.id, 10));
    res.json({ success: true });
  });

  return router;
}
