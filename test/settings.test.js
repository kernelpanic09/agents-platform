import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initDb } from '../server/db.js';
import { initSettings, getSetting, setSetting, resetSetting, allSettings } from '../server/settings.js';

const dir = mkdtempSync(join(tmpdir(), 'settings-'));
process.env.DATA_DIR = dir;
const db = initDb();
initSettings(db);
after(() => { try { db.close(); } catch {} rmSync(dir, { recursive: true, force: true }); });

test('getSetting: precedence is db override > env seed > code default', () => {
  assert.equal(getSetting('max_concurrent_runs'), 2); // code default

  process.env.MAX_CONCURRENT_RUNS = '7';
  assert.equal(getSetting('max_concurrent_runs'), 7); // env seed wins over default

  setSetting('max_concurrent_runs', 9);
  assert.equal(getSetting('max_concurrent_runs'), 9); // db override wins over env

  delete process.env.MAX_CONCURRENT_RUNS;
  resetSetting('max_concurrent_runs');
  assert.equal(getSetting('max_concurrent_runs'), 2); // back to default
});

test('getSetting: unknown key is undefined', () => {
  assert.equal(getSetting('not_a_real_setting'), undefined);
});

test('setSetting: rejects unknown keys, invalid numbers, and out-of-range enums', () => {
  assert.throws(() => setSetting('not_a_real_setting', 1), /unknown setting/);
  assert.throws(() => setSetting('max_concurrent_runs', 'not-a-number'), /invalid value/);
  assert.throws(() => setSetting('execution_backend', 'bogus'), /must be one of/);

  setSetting('execution_backend', 'api');
  assert.equal(getSetting('execution_backend'), 'api');
  resetSetting('execution_backend');
});

test('allSettings: reports source as db/env/default per key', () => {
  resetSetting('max_parallel_per_run');
  delete process.env.MAX_PARALLEL_PER_RUN;
  let entry = allSettings().find(s => s.key === 'max_parallel_per_run');
  assert.equal(entry.source, 'default');

  process.env.MAX_PARALLEL_PER_RUN = '5';
  entry = allSettings().find(s => s.key === 'max_parallel_per_run');
  assert.equal(entry.source, 'env');
  assert.equal(entry.value, 5);

  setSetting('max_parallel_per_run', 8);
  entry = allSettings().find(s => s.key === 'max_parallel_per_run');
  assert.equal(entry.source, 'db');
  assert.equal(entry.value, 8);

  delete process.env.MAX_PARALLEL_PER_RUN;
  resetSetting('max_parallel_per_run');
});
