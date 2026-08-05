import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidCron, nextRunAt, previewNextRuns } from '../server/scheduler.js';

// Fixed anchor so every assertion is deterministic regardless of wall time.
const FROM = new Date('2025-01-15T12:00:00.000Z'); // Wednesday

// ── isValidCron ────────────────────────────────────────────────────────────

test('isValidCron: accepts common 5-field expressions', () => {
  for (const expr of ['* * * * *', '0 9 * * 1-5', '*/5 * * * *', '0 0 1 * *', '30 6 * * 0']) {
    assert.equal(isValidCron(expr), true, expr);
  }
});

test('isValidCron: rejects wrong field count', () => {
  assert.equal(isValidCron('0 0 * *'), false);       // 4 fields
  assert.equal(isValidCron('0 0 * * * * *'), false); // 7 fields
});

test('isValidCron: rejects non-string and empty inputs', () => {
  assert.equal(isValidCron(null), false);
  assert.equal(isValidCron(''), false);
  assert.equal(isValidCron(42), false);
});

test('isValidCron: rejects garbage strings', () => {
  assert.equal(isValidCron('not-a-cron'), false);
  assert.equal(isValidCron('every day at 9'), false);
});

// ── nextRunAt ──────────────────────────────────────────────────────────────

test('nextRunAt: returns an ISO string for a valid expression', () => {
  const result = nextRunAt('0 13 * * *', FROM);
  assert.ok(typeof result === 'string', 'should return a string');
  assert.ok(result.endsWith('Z'), 'should be a UTC ISO string');
});

test('nextRunAt: returned time is strictly after fromDate', () => {
  const result = nextRunAt('*/30 * * * *', FROM);
  assert.ok(result > FROM.toISOString(), 'next run must be in the future');
});

test('nextRunAt: returns null for unparseable expressions', () => {
  // cron-parser throws on clearly invalid tokens; null is the documented sentinel.
  assert.equal(nextRunAt('not-a-cron', FROM), null);
  assert.equal(nextRunAt('every day at 9', FROM), null);
});

// ── previewNextRuns ────────────────────────────────────────────────────────

test('previewNextRuns: default count is 3', () => {
  const runs = previewNextRuns('*/15 * * * *', undefined, FROM);
  assert.equal(runs.length, 3);
});

test('previewNextRuns: respects explicit count', () => {
  assert.equal(previewNextRuns('*/15 * * * *', 5, FROM).length, 5);
  assert.equal(previewNextRuns('*/15 * * * *', 1, FROM).length, 1);
});

test('previewNextRuns: all times are after fromDate and strictly ascending', () => {
  const runs = previewNextRuns('0 9 * * 1-5', 4, FROM); // weekdays at 09:00
  assert.ok(runs.every(r => r > FROM.toISOString()), 'all runs must be after fromDate');
  for (let i = 1; i < runs.length; i++) {
    assert.ok(runs[i] > runs[i - 1], `run[${i}] should come after run[${i - 1}]`);
  }
});

test('previewNextRuns: returns [] for unparseable expressions', () => {
  assert.deepEqual(previewNextRuns('bad-cron', 3, FROM), []);
  assert.deepEqual(previewNextRuns('every day at 9', 3, FROM), []);
});
