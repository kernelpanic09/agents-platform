import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initDb } from '../server/db.js';
import { initSettings } from '../server/settings.js';
import { initMcpRegistry, listMcp, getMcp, createMcp, updateMcp, deleteMcp, checkMcpEnv, generateMcpConfig } from '../server/mcp-registry.js';

const dir = mkdtempSync(join(tmpdir(), 'mcp-'));
process.env.DATA_DIR = dir;
const db = initDb();
initSettings(db);
initMcpRegistry(db);
after(() => { try { db.close(); } catch {} rmSync(dir, { recursive: true, force: true }); });

test('initMcpRegistry: seeds the catalog into the table', () => {
  const list = listMcp(db);
  assert.ok(list.length >= 11, 'seeded servers present');
  const k8s = getMcp(db, 'kubernetes');
  assert.equal(k8s.name, 'Kubernetes');
  assert.equal(typeof k8s.config, 'object'); // config parsed from JSON
});

test('checkMcpEnv: reports required vs missing env vars', () => {
  const github = getMcp(db, 'github'); // declares GITHUB_PERSONAL_ACCESS_TOKEN
  const before = checkMcpEnv(github);
  assert.deepEqual(before.required, ['GITHUB_PERSONAL_ACCESS_TOKEN']);
  assert.equal(before.ok, false);
  assert.deepEqual(before.missing, ['GITHUB_PERSONAL_ACCESS_TOKEN']);

  process.env.GITHUB_PERSONAL_ACCESS_TOKEN = 'x';
  const after2 = checkMcpEnv(getMcp(db, 'github'));
  assert.equal(after2.ok, true);
  delete process.env.GITHUB_PERSONAL_ACCESS_TOKEN;

  // a server with no env requirements
  assert.equal(checkMcpEnv(getMcp(db, 'memory')).required.length, 0);
});

test('CRUD: create / update / delete a server at runtime', () => {
  const created = createMcp(db, { id: 'My Custom!', name: 'Custom', config: { command: 'npx', args: ['-y', 'x'] } });
  assert.equal(created.id, 'my-custom'); // slugified
  assert.throws(() => createMcp(db, { id: 'my-custom', name: 'dup' }), /already exists/);

  const upd = updateMcp(db, 'my-custom', { description: 'edited', enabled: false });
  assert.equal(upd.description, 'edited');
  assert.equal(upd.enabled, false);

  assert.equal(deleteMcp(db, 'my-custom'), true);
  assert.equal(getMcp(db, 'my-custom'), null);
});

test('generateMcpConfig: settings.json block for selected ids', () => {
  const cfg = generateMcpConfig(db, ['kubernetes', 'github']);
  assert.ok(cfg.kubernetes.command);
  assert.ok(cfg.github);
});
