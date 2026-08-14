import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { ensureSloHistory, recordSloSample, getSloHistory } from '../server/observability/slo.js';

test('ensureSloHistory + recordSloSample + getSloHistory round-trip', () => {
  const db = new Database(':memory:');
  ensureSloHistory(db);
  recordSloSample(db, { metrics: { successRate: 0.9, p95LatencyMs: 12000, dailyCostUsd: 1.2 }, overall: 'ok' });
  const rows = getSloHistory(db, 30);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].overall, 'ok');
  assert.equal(rows[0].success_rate, 0.9);
});

test('ensureSloHistory is idempotent', () => {
  const db = new Database(':memory:');
  ensureSloHistory(db);
  ensureSloHistory(db); // second call must not throw
  assert.ok(true);
});

test('recordSloSample stores all metric fields', () => {
  const db = new Database(':memory:');
  ensureSloHistory(db);
  recordSloSample(db, {
    metrics: { successRate: 0.75, p95LatencyMs: 45000, dailyCostUsd: 0.5 },
    overall: 'breach',
  });
  const rows = getSloHistory(db, 30);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].p95_latency_ms, 45000);
  assert.equal(rows[0].daily_cost_usd, 0.5);
  assert.equal(rows[0].overall, 'breach');
});

test('getSloHistory returns rows ordered by checked_at ascending', () => {
  const db = new Database(':memory:');
  ensureSloHistory(db);
  // Insert two rows; the second should come after the first
  recordSloSample(db, { metrics: { successRate: 0.8 }, overall: 'warn' });
  recordSloSample(db, { metrics: { successRate: 0.95 }, overall: 'ok' });
  const rows = getSloHistory(db, 30);
  assert.equal(rows.length, 2);
  // Rows are ordered by checked_at; ids should be ascending
  assert.ok(rows[0].id < rows[1].id);
});

test('getSloHistory respects the days window', () => {
  const db = new Database(':memory:');
  ensureSloHistory(db);
  // Insert a row with a very old timestamp
  db.prepare(`INSERT INTO slo_history (checked_at, success_rate, overall) VALUES (datetime('now','-91 days'), 0.5, 'breach')`).run();
  recordSloSample(db, { metrics: { successRate: 0.99 }, overall: 'ok' });
  const rows = getSloHistory(db, 30);
  // The old row is outside the 30-day window; only the recent one should appear
  assert.equal(rows.length, 1);
  assert.equal(rows[0].overall, 'ok');
});
