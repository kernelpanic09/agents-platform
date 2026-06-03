import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initDb } from '../server/db.js';
import { buildPack, importPack, adoptAgencyAgent } from '../server/packs.js';

const dir = mkdtempSync(join(tmpdir(), 'packs-'));
process.env.DATA_DIR = dir;
const database = initDb();
after(() => { try { database.close(); } catch {} rmSync(dir, { recursive: true, force: true }); });

test('buildPack: exports a versioned pack with all sections', () => {
  const pack = buildPack(database, ['agents', 'crews', 'schedules', 'pipelines']);
  assert.equal(pack.kind, 'AgentPack');
  assert.ok(pack.apiVersion.startsWith('agents-platform/'));
  assert.ok(pack.agents.length >= 20, 'seeded agents exported');
  assert.ok(pack.schedules.length >= 10, 'seeded schedules exported');
  // schedule agents are referenced by NAME, not id
  assert.ok(pack.schedules[0].agents.every(a => typeof a === 'string'));
});

test('importPack: creates new artifacts, skips name clashes, resolves names→ids', () => {
  const existing = database.prepare('SELECT name FROM agents LIMIT 2').all().map(a => a.name);
  const pack = {
    apiVersion: 'agents-platform/v1', kind: 'AgentPack', metadata: { name: 'unit' },
    agents: [
      { name: existing[0], title: 'dup' },                       // clash -> skipped
      { name: 'Zephyr', title: 'New One', system_prompt: 'multi\nline\nprompt' },
    ],
    crews: [{ name: 'Pair', topology: 'chain', members: [existing[0], existing[1]] }],
    schedules: [{ name: 'Imported Sweep', mode: 'parallel', agents: [existing[0]], task_prompt: 'go', cron_expression: '0 9 * * *' }],
    pipelines: [{ name: 'Imp Pipe', graph: { nodes: [{ id: 'n1', agent: 'Zephyr' }, { id: 'n2', agent: 'ghost' }], edges: [{ from: 'n1', to: 'n2', condition: '' }] } }],
  };
  const sum = importPack(database, pack);
  assert.equal(sum.created.agents, 1);     // Zephyr only
  assert.equal(sum.skipped.agents, 1);     // the clash
  assert.equal(sum.created.crews, 1);
  assert.equal(sum.created.schedules, 1);
  assert.equal(sum.created.pipelines, 1);
  assert.ok(sum.warnings.some(w => /unknown agents/.test(w)), 'ghost node warned');

  // Zephyr persisted with multi-line prompt + source tag
  const z = database.prepare('SELECT * FROM agents WHERE name = ?').get('Zephyr');
  assert.match(z.system_prompt, /multi\nline/);
  assert.equal(z.source_pack, 'pack:unit');

  // Crew resolved member names to ids
  const crew = database.prepare("SELECT * FROM crews WHERE name = 'Pair'").get();
  assert.equal(JSON.parse(crew.agent_ids).length, 2);
});

test('adoptAgencyAgent: copies a catalog agent into the runnable roster', () => {
  database.prepare(`INSERT INTO agency_agents (name, description, color, category, source_file, system_prompt)
    VALUES ('Catalog Bot', 'a catalog agent', 'teal', 'engineering', 'engineering/catalog-bot.md', 'be helpful')`).run();
  const aid = database.prepare("SELECT id FROM agency_agents WHERE name = 'Catalog Bot'").get().id;
  const res = adoptAgencyAgent(database, aid);
  assert.ok(res.id, 'adopted agent created');
  const a = database.prepare('SELECT * FROM agents WHERE id = ?').get(res.id);
  assert.equal(a.name, 'Catalog Bot');
  assert.equal(a.source_pack, 'agency:engineering/catalog-bot.md');
  assert.equal(a.system_prompt, 'be helpful');

  // adopting again clashes
  const again = adoptAgencyAgent(database, aid);
  assert.equal(again.status, 409);
});
