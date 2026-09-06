import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { ensureTicketTables, autoPromoteActionItems, listTickets, getTicket } from '../server/tickets.js';

function makeDb() {
  const db = new Database(':memory:');
  ensureTicketTables(db);
  return db;
}
const group = { id: 7, slug: 'daily-brief', name: 'Daily Brief' };

describe('autoPromoteActionItems', () => {
  test('promotes keyless action items with a slugified dedup key', () => {
    const db = makeDb();
    const doc = { action_items: [{ title: 'Fix the Backup Job', priority: 'high', owner: 'Bastion' }] };
    autoPromoteActionItems(db, group, doc, 100);
    const rows = listTickets(db, {});
    assert.equal(rows.length, 1);
    assert.equal(rows[0].dedup_key, 'report:7:fix-the-backup-job');
    assert.equal(rows[0].occurrence_count, 1);
    assert.equal(rows[0].assignee, 'Bastion');
    assert.equal(rows[0].source_type, 'report_action_item');
  });

  test('is idempotent — re-promoting the same title bumps occurrence, no duplicate', () => {
    const db = makeDb();
    const doc = { action_items: [{ title: 'Fix the Backup Job', priority: 'high' }] };
    autoPromoteActionItems(db, group, doc, 100);
    autoPromoteActionItems(db, group, doc, 101);
    const rows = listTickets(db, {});
    assert.equal(rows.length, 1);
    assert.equal(rows[0].occurrence_count, 2);
  });

  test('different titles create separate tickets; empty/invalid items skipped', () => {
    const db = makeDb();
    const doc = { action_items: [
      { title: 'Alpha task', priority: 'medium' },
      { title: 'Beta task', priority: 'low' },
      { title: '', priority: 'high' },
      { priority: 'high' },
    ] };
    autoPromoteActionItems(db, group, doc, 100);
    assert.equal(listTickets(db, {}).length, 2);
  });

  test('tolerates missing/empty action_items array', () => {
    const db = makeDb();
    autoPromoteActionItems(db, { id: 1, slug: 'x', name: 'X' }, {}, 1);
    assert.equal(listTickets(db, {}).length, 0);
  });
});
