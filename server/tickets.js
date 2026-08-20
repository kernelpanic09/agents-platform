// server/tickets.js — global single-board ticket engine (no project concept)
// Ticket keys use a fixed "TIX" prefix: TIX-1, TIX-2, ...

export const STATUSES   = ['backlog', 'triaged', 'in_progress', 'in_review', 'done'];
export const PRIORITIES = ['critical', 'high', 'medium', 'low'];
export const SIZES      = ['S', 'M', 'L', 'XL'];
export const TYPES      = ['finding', 'bug', 'feature', 'task'];

export function ensureTicketTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'backlog',
      priority TEXT NOT NULL DEFAULT 'medium',
      size TEXT,
      type TEXT NOT NULL DEFAULT 'task',
      labels TEXT NOT NULL DEFAULT '[]',
      assignee TEXT,
      source_type TEXT NOT NULL DEFAULT 'manual',
      source_ref TEXT,
      dedup_key TEXT,
      start_date TEXT,
      due_date TEXT,
      order_index REAL NOT NULL DEFAULT 0,
      occurrence_count INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_dedup ON tickets(dedup_key) WHERE dedup_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_tickets_board ON tickets(status, order_index);
    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
    CREATE INDEX IF NOT EXISTS idx_tickets_assignee ON tickets(assignee);
    CREATE TABLE IF NOT EXISTS ticket_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      actor TEXT NOT NULL DEFAULT 'user',
      from_value TEXT,
      to_value TEXT,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket ON ticket_events(ticket_id, created_at);
    CREATE TABLE IF NOT EXISTS ticket_sequences (
      scope TEXT PRIMARY KEY,
      next_val INTEGER NOT NULL
    );
  `);
}

function assertEnum(name, val, allowed, { nullable = false } = {}) {
  if (val == null && nullable) return;
  if (!allowed.includes(val)) throw new Error(`invalid ${name}: ${val}`);
}

// Atomic: increments the global "TIX" sequence and returns "TIX-<n>"
export const nextKey = (db) => db.transaction(() => {
  db.prepare(`INSERT INTO ticket_sequences (scope, next_val) VALUES ('global', 1)
              ON CONFLICT(scope) DO UPDATE SET next_val = next_val + 1`).run();
  const { next_val } = db.prepare(`SELECT next_val FROM ticket_sequences WHERE scope = 'global'`).get();
  return `TIX-${next_val}`;
})();

function rowToTicket(row) {
  if (!row) return null;
  return {
    ...row,
    labels: JSON.parse(row.labels || '[]'),
    source_ref: row.source_ref ? JSON.parse(row.source_ref) : null,
  };
}

export function addEvent(db, ticketId, { event_type, actor = 'user', from_value = null, to_value = null, note = null }) {
  db.prepare(`INSERT INTO ticket_events (ticket_id, event_type, actor, from_value, to_value, note)
              VALUES (?,?,?,?,?,?)`).run(ticketId, event_type, actor, from_value, to_value, note);
}

export function getTicket(db, id) {
  const row = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  if (!row) return null;
  const events = db.prepare('SELECT * FROM ticket_events WHERE ticket_id = ? ORDER BY id').all(id);
  return { ...rowToTicket(row), events };
}

export function createTicket(db, input = {}) {
  const {
    title, description = '', priority = 'medium', size = null,
    type = 'task', labels = [], assignee = null, status = 'backlog',
    source_type = 'manual', source_ref = null, dedup_key = null,
    start_date = null, due_date = null, actor = 'user',
  } = input;
  if (!title || !String(title).trim()) throw new Error('title is required');
  assertEnum('status', status, STATUSES);
  assertEnum('priority', priority, PRIORITIES);
  assertEnum('size', size, SIZES, { nullable: true });
  assertEnum('type', type, TYPES);
  const key = nextKey(db);
  const maxOrder = db.prepare('SELECT COALESCE(MAX(order_index),0) AS m FROM tickets WHERE status = ?').get(status).m;
  const info = db.prepare(`INSERT INTO tickets
    (key,title,description,status,priority,size,type,labels,assignee,source_type,source_ref,dedup_key,start_date,due_date,order_index)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      key, String(title).trim(), description, status, priority, size, type,
      JSON.stringify(labels || []), assignee, source_type,
      source_ref ? JSON.stringify(source_ref) : null,
      dedup_key, start_date, due_date, maxOrder + 1);
  addEvent(db, info.lastInsertRowid, { event_type: 'created', actor });
  return getTicket(db, info.lastInsertRowid);
}

// Idempotent entry point for all auto-sources. If an open (not done) ticket with
// this dedup_key exists, bump occurrence + log; else create a fresh one.
export function openTicketFromFinding(db, input = {}) {
  const { dedup_key = null } = input;
  if (dedup_key) {
    const existing = db.prepare(
      `SELECT * FROM tickets WHERE dedup_key = ? AND status != 'done' ORDER BY id DESC LIMIT 1`
    ).get(dedup_key);
    if (existing) {
      db.prepare(
        `UPDATE tickets SET occurrence_count = occurrence_count + 1, updated_at = datetime('now') WHERE id = ?`
      ).run(existing.id);
      addEvent(db, existing.id, { event_type: 'occurrence', actor: 'system', note: 'finding recurred' });
      return getTicket(db, existing.id);
    }
    // A prior closed ticket may hold the dedup_key — free the unique index so a
    // fresh ticket can carry the same logical key.
    db.prepare(`UPDATE tickets SET dedup_key = NULL WHERE dedup_key = ?`).run(dedup_key);
  }
  return createTicket(db, { ...input, actor: input.actor || 'system' });
}

// Promote a report action item into a ticket (idempotent via dedup_key).
// dedup_key pattern: "report:<report_id>:<item_key>"
export function promoteFromActionItem(db, { reportId, reportSlug, item, actor = 'user' }) {
  const pri = PRIORITIES.includes(String(item.priority)) ? item.priority : 'medium';
  return openTicketFromFinding(db, {
    title: item.title,
    priority: pri,
    type: 'finding',
    assignee: item.owner || null,
    source_type: 'report_action_item',
    source_ref: { report_id: reportId, item_key: item.key },
    dedup_key: `report:${reportId}:${item.key}`,
    actor,
  });
}

const EVENT_FOR_FIELD = { status: 'status_change', priority: 'priority_change', assignee: 'assigned' };

export function updateTicket(db, id, patch = {}, actor = 'user') {
  const cur = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  if (!cur) throw new Error('ticket not found');
  const allowed = ['title', 'description', 'status', 'priority', 'size', 'type', 'labels', 'assignee', 'start_date', 'due_date', 'order_index'];
  const sets = [], vals = [], events = [];
  for (const field of allowed) {
    if (!(field in patch)) continue;
    let val = patch[field];
    if (field === 'status') assertEnum('status', val, STATUSES);
    if (field === 'priority') assertEnum('priority', val, PRIORITIES);
    if (field === 'size') assertEnum('size', val, SIZES, { nullable: true });
    if (field === 'type') assertEnum('type', val, TYPES);
    if (field === 'labels') val = JSON.stringify(val || []);
    if (EVENT_FOR_FIELD[field] && String(cur[field]) !== String(val)) {
      events.push({ event_type: EVENT_FOR_FIELD[field], from_value: String(cur[field] ?? ''), to_value: String(val ?? '') });
    }
    sets.push(`${field} = ?`); vals.push(val);
  }
  if ('status' in patch) {
    if (patch.status === 'done' && cur.status !== 'done') sets.push(`closed_at = datetime('now')`);
    else if (patch.status !== 'done' && cur.status === 'done') sets.push(`closed_at = NULL`);
  }
  if (sets.length) {
    sets.push(`updated_at = datetime('now')`);
    db.prepare(`UPDATE tickets SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
  }
  for (const e of events) addEvent(db, id, { ...e, actor });
  return getTicket(db, id);
}

export function listTickets(db, { status, priority, assignee, type, q, limit = 200, offset = 0 } = {}) {
  const params = [];
  let sql = 'SELECT * FROM tickets WHERE 1=1';
  if (status)   { sql += ' AND status = ?';   params.push(status); }
  if (priority) { sql += ' AND priority = ?';  params.push(priority); }
  if (assignee) { sql += ' AND assignee = ?';  params.push(assignee); }
  if (type)     { sql += ' AND type = ?';      params.push(type); }
  if (q)        { sql += ' AND (title LIKE ? OR key LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY order_index DESC, id DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  return db.prepare(sql).all(...params).map(rowToTicket);
}

export function boardTickets(db) {
  const cols = Object.fromEntries(STATUSES.map(s => [s, []]));
  for (const t of listTickets(db, { limit: 1000 })) (cols[t.status] ||= []).push(t);
  for (const s of STATUSES) cols[s].sort((a, b) => a.order_index - b.order_index);
  return cols;
}

export function ganttTickets(db) {
  const all = listTickets(db, { limit: 1000 });
  const scheduled = all
    .filter(t => t.start_date || t.due_date)
    .map(t => ({ ...t, start: t.start_date || t.created_at, end: t.due_date || t.start_date || t.created_at }));
  const unscheduled = all.filter(t => !t.start_date && !t.due_date);
  return { scheduled, unscheduled };
}

export function ticketSummary(db) {
  const rows = listTickets(db, { limit: 5000 });
  const byStatus   = Object.fromEntries(STATUSES.map(s => [s, 0]));
  const byPriority = Object.fromEntries(PRIORITIES.map(p => [p, 0]));
  for (const t of rows) { byStatus[t.status]++; byPriority[t.priority]++; }
  const open = rows.filter(t => t.status !== 'done').length;
  return { total: rows.length, open, byStatus, byPriority };
}
