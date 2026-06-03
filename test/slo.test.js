import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initDb } from '../server/db.js';
import { initSettings, setSetting } from '../server/settings.js';
import { computeSlo } from '../server/observability/slo.js';

const dir = mkdtempSync(join(tmpdir(), 'slo-'));
process.env.DATA_DIR = dir;
const db = initDb();
initSettings(db);
after(() => { try { db.close(); } catch {} rmSync(dir, { recursive: true, force: true }); });

// A schedule to hang runs off of (runs.schedule_id is NOT NULL).
const schedId = db.prepare(`INSERT INTO schedules (name, agent_ids, mode, task_prompt, cron_expression) VALUES ('t','[]','parallel','x','0 0 * * *')`).run().lastInsertRowid;
function addRun(status, durationMs) {
  db.prepare(`INSERT INTO runs (schedule_id, agent_ids, mode, task_prompt, status, duration_ms, created_at) VALUES (?, '[]','parallel','x', ?, ?, datetime('now'))`).run(schedId, status, durationMs);
}

test('computeSlo: no data → nodata status, overall ok', () => {
  const slo = computeSlo(db);
  assert.equal(slo.metrics.successRate, null);
  assert.equal(slo.status.successRate, 'nodata');
  assert.equal(slo.metrics.dailyCostUsd, 0);
});

test('computeSlo: success rate + p95 against targets', () => {
  setSetting('slo_success_rate', 0.95);
  setSetting('slo_p95_latency_ms', 10000);
  // 9 success, 1 failed → 90% (below 95% target, within 5% warn band → warn)
  for (let i = 0; i < 9; i++) addRun('success', 1000);
  addRun('failed', 1000);
  const slo = computeSlo(db);
  assert.equal(slo.sample_size, 10);
  assert.ok(Math.abs(slo.metrics.successRate - 0.9) < 1e-9);
  assert.equal(slo.status.successRate, 'warn');

  // p95 of mostly-1000ms durations is well under 10s → ok
  assert.equal(slo.status.p95LatencyMs, 'ok');
});

test('computeSlo: p95 breach when durations exceed target', () => {
  setSetting('slo_p95_latency_ms', 500); // 0.5s target; our runs are 1000ms+
  const slo = computeSlo(db);
  assert.equal(slo.status.p95LatencyMs, 'breach');
  assert.equal(slo.overall, 'breach'); // worst-of rolls up
});
