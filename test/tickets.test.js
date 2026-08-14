// test/tickets.test.js — unit tests for the global ticket engine
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  ensureTicketTables, createTicket, getTicket, updateTicket, listTickets,
  boardTickets, ganttTickets, ticketSummary, openTicketFromFinding,
  addEvent, promoteFromActionItem, nextKey, STATUSES, PRIORITIES,
} from '../server/tickets.js';

function makeDb() {
  const db = new Database(':memory:');
  ensureTicketTables(db);
  return db;
}

describe('ensureTicketTables', () => {
  test('creates tables idempotently', () => {
    const db = makeDb();
    // Second call must not throw
    ensureTicketTables(db);
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map(r => r.name);
    assert.ok(tables.includes('tickets'));
    assert.ok(tables.includes('ticket_events'));
    assert.ok(tables.includes('ticket_sequences'));
  });

  test('no project_id column on tickets', () => {
    const db = makeDb();
    const cols = db.prepare('PRAGMA table_info(tickets)').all().map(c => c.name);
    assert.ok(!cols.includes('project_id'), 'tickets must NOT have project_id');
  });
});

describe('nextKey', () => {
  test('generates sequential TIX keys', () => {
    const db = makeDb();
    assert.equal(nextKey(db), 'TIX-1');
    assert.equal(nextKey(db), 'TIX-2');
    assert.equal(nextKey(db), 'TIX-3');
  });

  test('all keys use TIX prefix', () => {
    const db = makeDb();
    for (let i = 0; i < 5; i++) {
      const key = nextKey(db);
      assert.match(key, /^TIX-\d+$/);
    }
  });
});

describe('createTicket', () => {
  test('creates a ticket with defaults', () => {
    const db = makeDb();
    const t = createTicket(db, { title: 'Hello world' });
    assert.equal(t.title, 'Hello world');
    assert.equal(t.status, 'backlog');
    assert.equal(t.priority, 'medium');
    assert.equal(t.type, 'task');
    assert.match(t.key, /^TIX-\d+$/);
    assert.ok(Array.isArray(t.labels));
    assert.ok(Array.isArray(t.events));
    assert.equal(t.events.length, 1);
    assert.equal(t.events[0].event_type, 'created');
  });

  test('throws on missing title', () => {
    const db = makeDb();
    assert.throws(() => createTicket(db, {}), /title is required/);
  });

  test('throws on invalid status', () => {
    const db = makeDb();
    assert.throws(() => createTicket(db, { title: 'x', status: 'banana' }), /invalid status/);
  });

  test('throws on invalid priority', () => {
    const db = makeDb();
    assert.throws(() => createTicket(db, { title: 'x', priority: 'ultra' }), /invalid priority/);
  });

  test('throws on invalid type', () => {
    const db = makeDb();
    assert.throws(() => createTicket(db, { title: 'x', type: 'unknown' }), /invalid type/);
  });

  test('nullable size passes', () => {
    const db = makeDb();
    const t = createTicket(db, { title: 'x', size: null });
    assert.equal(t.size, null);
  });

  test('accepts all valid statuses', () => {
    const db = makeDb();
    for (const status of STATUSES) {
      const t = createTicket(db, { title: `status-${status}`, status });
      assert.equal(t.status, status);
    }
  });

  test('accepts all valid priorities', () => {
    const db = makeDb();
    for (const priority of PRIORITIES) {
      const t = createTicket(db, { title: `pri-${priority}`, priority });
      assert.equal(t.priority, priority);
    }
  });
});

describe('getTicket', () => {
  test('returns null for nonexistent id', () => {
    const db = makeDb();
    assert.equal(getTicket(db, 9999), null);
  });

  test('returns ticket with events', () => {
    const db = makeDb();
    const created = createTicket(db, { title: 'get me' });
    const t = getTicket(db, created.id);
    assert.equal(t.title, 'get me');
    assert.ok(t.events.length >= 1);
  });
});

describe('updateTicket', () => {
  test('updates status and emits event', () => {
    const db = makeDb();
    const t = createTicket(db, { title: 'update me' });
    const updated = updateTicket(db, t.id, { status: 'triaged' });
    assert.equal(updated.status, 'triaged');
    const events = updated.events.map(e => e.event_type);
    assert.ok(events.includes('status_change'));
  });

  test('sets closed_at when marking done', () => {
    const db = makeDb();
    const t = createTicket(db, { title: 'done me' });
    const updated = updateTicket(db, t.id, { status: 'done' });
    assert.ok(updated.closed_at != null);
  });

  test('clears closed_at when reopening from done', () => {
    const db = makeDb();
    const t = createTicket(db, { title: 'reopen me' });
    updateTicket(db, t.id, { status: 'done' });
    const reopened = updateTicket(db, t.id, { status: 'in_progress' });
    assert.equal(reopened.closed_at, null);
  });

  test('throws on nonexistent ticket', () => {
    const db = makeDb();
    assert.throws(() => updateTicket(db, 9999, { status: 'triaged' }), /ticket not found/);
  });

  test('updates title without emitting status event', () => {
    const db = makeDb();
    const t = createTicket(db, { title: 'old title' });
    const updated = updateTicket(db, t.id, { title: 'new title' });
    assert.equal(updated.title, 'new title');
    const statusEvents = updated.events.filter(e => e.event_type === 'status_change');
    assert.equal(statusEvents.length, 0);
  });
});

describe('addEvent', () => {
  test('adds a comment event', () => {
    const db = makeDb();
    const t = createTicket(db, { title: 'comment target' });
    addEvent(db, t.id, { event_type: 'comment', actor: 'user', note: 'looks good' });
    const latest = getTicket(db, t.id);
    const comment = latest.events.find(e => e.event_type === 'comment');
    assert.ok(comment);
    assert.equal(comment.note, 'looks good');
  });
});

describe('openTicketFromFinding', () => {
  test('creates a new ticket when no dedup_key', () => {
    const db = makeDb();
    const t = openTicketFromFinding(db, { title: 'first finding' });
    assert.ok(t.id > 0);
    assert.match(t.key, /^TIX-\d+$/);
  });

  test('increments occurrence_count on duplicate open ticket', () => {
    const db = makeDb();
    const t1 = openTicketFromFinding(db, { title: 'recurring', dedup_key: 'sched:42' });
    assert.equal(t1.occurrence_count, 1);
    const t2 = openTicketFromFinding(db, { title: 'recurring', dedup_key: 'sched:42' });
    assert.equal(t2.id, t1.id); // same ticket
    assert.equal(t2.occurrence_count, 2);
  });

  test('creates a new ticket after the old one is done', () => {
    const db = makeDb();
    const t1 = openTicketFromFinding(db, { title: 'old', dedup_key: 'sched:99' });
    updateTicket(db, t1.id, { status: 'done' });
    const t2 = openTicketFromFinding(db, { title: 'new', dedup_key: 'sched:99' });
    assert.notEqual(t1.id, t2.id);
    assert.equal(t2.occurrence_count, 1);
  });

  test('occurrence event logged on recurrence', () => {
    const db = makeDb();
    openTicketFromFinding(db, { title: 'x', dedup_key: 'key:1' });
    const t2 = openTicketFromFinding(db, { title: 'x', dedup_key: 'key:1' });
    const occurrenceEvt = t2.events.find(e => e.event_type === 'occurrence');
    assert.ok(occurrenceEvt);
  });
});

describe('listTickets', () => {
  test('returns all tickets with no filter', () => {
    const db = makeDb();
    createTicket(db, { title: 'A' });
    createTicket(db, { title: 'B' });
    createTicket(db, { title: 'C' });
    const list = listTickets(db);
    assert.equal(list.length, 3);
  });

  test('filters by status', () => {
    const db = makeDb();
    createTicket(db, { title: 'backlog', status: 'backlog' });
    createTicket(db, { title: 'done', status: 'done' });
    const done = listTickets(db, { status: 'done' });
    assert.equal(done.length, 1);
    assert.equal(done[0].title, 'done');
  });

  test('filters by priority', () => {
    const db = makeDb();
    createTicket(db, { title: 'critical', priority: 'critical' });
    createTicket(db, { title: 'low', priority: 'low' });
    const crits = listTickets(db, { priority: 'critical' });
    assert.equal(crits.length, 1);
  });

  test('searches by title', () => {
    const db = makeDb();
    createTicket(db, { title: 'foo bar baz' });
    createTicket(db, { title: 'something else' });
    const found = listTickets(db, { q: 'bar' });
    assert.equal(found.length, 1);
  });

  test('labels are parsed as arrays', () => {
    const db = makeDb();
    createTicket(db, { title: 'labeled', labels: ['infra', 'urgent'] });
    const list = listTickets(db);
    assert.deepEqual(list[0].labels, ['infra', 'urgent']);
  });
});

describe('boardTickets', () => {
  test('returns an object keyed by all statuses', () => {
    const db = makeDb();
    const board = boardTickets(db);
    for (const s of STATUSES) {
      assert.ok(s in board, `missing column: ${s}`);
      assert.ok(Array.isArray(board[s]));
    }
  });

  test('places tickets into correct columns', () => {
    const db = makeDb();
    createTicket(db, { title: 'backlog thing', status: 'backlog' });
    createTicket(db, { title: 'in_progress thing', status: 'in_progress' });
    const board = boardTickets(db);
    assert.equal(board.backlog.length, 1);
    assert.equal(board.in_progress.length, 1);
    assert.equal(board.done.length, 0);
  });
});

describe('ganttTickets', () => {
  test('separates scheduled and unscheduled', () => {
    const db = makeDb();
    createTicket(db, { title: 'with-dates', start_date: '2026-01-01', due_date: '2026-01-31' });
    createTicket(db, { title: 'no-dates' });
    const { scheduled, unscheduled } = ganttTickets(db);
    assert.equal(scheduled.length, 1);
    assert.equal(unscheduled.length, 1);
    assert.ok('start' in scheduled[0]);
    assert.ok('end' in scheduled[0]);
  });
});

describe('ticketSummary', () => {
  test('counts correctly', () => {
    const db = makeDb();
    createTicket(db, { title: 'a', status: 'backlog', priority: 'high' });
    createTicket(db, { title: 'b', status: 'done', priority: 'low' });
    const s = ticketSummary(db);
    assert.equal(s.total, 2);
    assert.equal(s.open, 1); // done is not open
    assert.equal(s.byStatus.backlog, 1);
    assert.equal(s.byStatus.done, 1);
    assert.equal(s.byPriority.high, 1);
    assert.equal(s.byPriority.low, 1);
  });

  test('returns zero counts for empty db', () => {
    const db = makeDb();
    const s = ticketSummary(db);
    assert.equal(s.total, 0);
    assert.equal(s.open, 0);
  });
});

describe('promoteFromActionItem', () => {
  test('creates a ticket from a report action item', () => {
    const db = makeDb();
    // Need a minimal report_groups + report_builds setup isn't required by the engine
    // function itself — it only needs {reportId, reportSlug, item}
    const t = promoteFromActionItem(db, {
      reportId: 1,
      reportSlug: 'daily-brief',
      item: { key: 'AI-1', title: 'Fix the widget', owner: 'Atlas', priority: 'high' },
    });
    assert.equal(t.title, 'Fix the widget');
    assert.equal(t.priority, 'high');
    assert.equal(t.source_type, 'report_action_item');
    assert.equal(t.dedup_key, 'report:1:AI-1');
    assert.deepEqual(t.source_ref, { report_id: 1, item_key: 'AI-1' });
  });

  test('is idempotent (dedup_key collision returns same ticket)', () => {
    const db = makeDb();
    const item = { key: 'AI-2', title: 'Fix it', priority: 'medium' };
    const t1 = promoteFromActionItem(db, { reportId: 2, reportSlug: 'r', item });
    const t2 = promoteFromActionItem(db, { reportId: 2, reportSlug: 'r', item });
    assert.equal(t1.id, t2.id);
    assert.equal(t2.occurrence_count, 2);
  });

  test('defaults unknown priority to medium', () => {
    const db = makeDb();
    const t = promoteFromActionItem(db, {
      reportId: 3,
      reportSlug: 'x',
      item: { key: 'AI-3', title: 'title', priority: 'weird' },
    });
    assert.equal(t.priority, 'medium');
  });
});
