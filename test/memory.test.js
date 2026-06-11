import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initDb } from '../server/db.js';
import { initSettings, setSetting } from '../server/settings.js';
import {
  addMemory, listMemories, updateMemory, deleteMemory,
  memoriesForPrompt, parseDistilledItems, distillRunMemories,
} from '../server/memory.js';
import { buildAgentPrompt } from '../server/executor.js';

const dir = mkdtempSync(join(tmpdir(), 'mem-'));
process.env.DATA_DIR = dir;
const db = initDb();
initSettings(db);
after(() => { try { db.close(); } catch {} rmSync(dir, { recursive: true, force: true }); });

test('addMemory: stores, trims, dedupes exact content', () => {
  const a = addMemory(db, 1, '  worker-2 has the smallest disk; watch Longhorn replicas there  ');
  assert.equal(a.duplicate, false);
  const b = addMemory(db, 1, 'worker-2 has the smallest disk; watch Longhorn replicas there');
  assert.equal(b.duplicate, true);
  assert.equal(b.id, a.id);
  assert.equal(addMemory(db, 1, '   '), null);
});

test('pruning: cap keeps newest non-pinned, pinned survive', () => {
  const pin = addMemory(db, 2, 'PINNED: cluster is k3s v1.33', { pinned: true });
  for (let i = 0; i < 35; i++) addMemory(db, 2, `filler memory number ${i}`);
  const all = listMemories(db, 2);
  const nonPinned = all.filter(m => !m.pinned);
  assert.ok(nonPinned.length <= 30, `non-pinned capped (got ${nonPinned.length})`);
  assert.ok(all.find(m => m.id === pin.id), 'pinned memory survived pruning');
  assert.ok(!all.find(m => m.content === 'filler memory number 0'), 'oldest filler pruned');
});

test('memoriesForPrompt: pinned first, then newest, limited; off-toggle empties', () => {
  const out = memoriesForPrompt(db, 2, 5);
  assert.equal(out.length, 5);
  assert.match(out[0].content, /^PINNED/);
  assert.match(out[1].content, /filler memory number 34/);

  setSetting('memory_injection', 'off');
  assert.equal(memoriesForPrompt(db, 2).length, 0);
  setSetting('memory_injection', 'on');
});

test('update/delete: pin toggle and forget', () => {
  const m = addMemory(db, 3, 'temp memory');
  const upd = updateMemory(db, m.id, { pinned: true, content: 'edited memory' });
  assert.equal(upd.pinned, true);
  assert.equal(upd.content, 'edited memory');
  assert.equal(deleteMemory(db, m.id), true);
  assert.equal(deleteMemory(db, m.id), false);
});

test('parseDistilledItems: strict array, tolerates prose, caps at 3', () => {
  assert.deepEqual(parseDistilledItems('Here you go: ["a", "b"] thanks'), ['a', 'b']);
  assert.deepEqual(parseDistilledItems('[]'), []);
  assert.deepEqual(parseDistilledItems('no json at all'), []);
  assert.deepEqual(parseDistilledItems('[1, "ok", null, "x", "y", "z"]'), ['ok', 'x', 'y']);
});

test('distillRunMemories: stores parsed items via stubbed chat', async () => {
  const agents = [{ id: 4, name: 'Atlas' }];
  const outputs = { Atlas: 'Checked the cluster.\nSTATUS: ok\nSUMMARY: all good' };
  const _chat = async () => ({ content: '["The agents namespace runs three pods: agents, ollama, qdrant"]' });
  const res = await distillRunMemories({ db, runId: 42, agents, outputs, _chat });
  assert.equal(res.stored, 1);
  const mems = listMemories(db, 4);
  assert.equal(mems.length, 1);
  assert.match(mems[0].content, /three pods/);
  assert.equal(mems[0].source_run_id, 42);
  assert.equal(mems[0].kind, 'learning');
});

test('distillRunMemories: skips failed outputs and respects off-toggle', async () => {
  const agents = [{ id: 5, name: 'Vault' }];
  const _chat = async () => ({ content: '["should not be stored"]' });

  const failed = await distillRunMemories({ db, runId: 1, agents, outputs: { Vault: '[timed out]' }, _chat });
  assert.equal(failed.stored, 0);

  setSetting('memory_distillation', 'off');
  const off = await distillRunMemories({ db, runId: 1, agents, outputs: { Vault: 'fine output' }, _chat });
  assert.equal(off.skipped, 'distillation off');
  setSetting('memory_distillation', 'on');
  assert.equal(listMemories(db, 5).length, 0);
});

test('distillRunMemories: no-backend fallback remembers attention/critical summaries only', async () => {
  const savedKey = process.env.ANTHROPIC_API_KEY;
  const savedBase = process.env.OPENAI_BASE_URL;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_BASE_URL;
  try {
    const agents = [{ id: 6, name: 'Bastion' }];
    const ok = await distillRunMemories({ db, runId: 7, agents, outputs: { Bastion: 'All fine.\nSTATUS: ok\nSUMMARY: healthy' } });
    assert.equal(ok.stored, 0);
    const crit = await distillRunMemories({ db, runId: 8, agents, outputs: { Bastion: 'Disk almost full.\nSTATUS: critical\nSUMMARY: worker-2 disk at 97%' } });
    assert.equal(crit.stored, 1);
    const mems = listMemories(db, 6);
    assert.equal(mems[0].kind, 'incident');
    assert.match(mems[0].content, /^\[critical\] worker-2 disk at 97%/);
  } finally {
    if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
    if (savedBase !== undefined) process.env.OPENAI_BASE_URL = savedBase;
  }
});

test('buildAgentPrompt: memories section injected from ctx', () => {
  const agent = { name: 'Atlas', title: 'Infra', system_prompt: 'You are Atlas.' };
  const ctx = { memories: [{ content: 'worker-2 disk is the smallest', created_at: '2026-06-11 00:00:00' }] };
  const p = buildAgentPrompt(agent, 'check disks', null, 'read_only', ctx);
  assert.match(p, /# What you remember from previous runs/);
  assert.match(p, /worker-2 disk is the smallest/);
  assert.match(p, /noted 2026-06-11/);
  const without = buildAgentPrompt(agent, 'check disks', null, 'read_only', {});
  assert.ok(!without.includes('What you remember'));
});
