import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initDb } from '../server/db.js';
import { initSettings } from '../server/settings.js';
import { createScheduler } from '../server/scheduler.js';
import { tierCliFlags } from '../server/safety-prompt.js';
import { extractVerdict, worstVerdict, buildAgentPrompt } from '../server/executor.js';
import { evalEdgeCondition } from '../server/workflows/pipeline.js';

const dir = mkdtempSync(join(tmpdir(), 'gov-'));
process.env.DATA_DIR = dir;
const db = initDb();
initSettings(db);
after(() => { try { db.close(); } catch {} rmSync(dir, { recursive: true, force: true }); });

test('tierCliFlags: read_only disables file-mutation tools at the CLI layer', () => {
  assert.match(tierCliFlags('read_only'), /--disallowedTools .*Write.*Edit/);
  assert.equal(tierCliFlags('controlled_write'), '');
  assert.equal(tierCliFlags('supervised'), '');
  assert.equal(tierCliFlags(null), '');
});

test('prompt contract: agents are instructed to emit a structured STATUS line', () => {
  const p = buildAgentPrompt({ name: 'A', title: 'T', system_prompt: 'x' }, 'do a thing');
  assert.match(p, /STATUS: <ok\|attention\|critical>/);
  assert.match(p, /SUMMARY:/);
});

test('extractVerdict: parses the STATUS line in common shapes', () => {
  assert.equal(extractVerdict('...\nSTATUS: ok\nSUMMARY: fine'), 'ok');
  assert.equal(extractVerdict('**STATUS:** critical\nSUMMARY: bad'), 'critical');
  assert.equal(extractVerdict('status: Attention\nSUMMARY: hmm'), 'attention');
  assert.equal(extractVerdict('no structured line'), null);
  assert.equal(extractVerdict(''), null);
});

test('worstVerdict: worst-of aggregation, nulls ignored', () => {
  assert.equal(worstVerdict(['ok', 'attention', 'ok']), 'attention');
  assert.equal(worstVerdict(['ok', 'critical', 'attention']), 'critical');
  assert.equal(worstVerdict([null, undefined, 'ok']), 'ok');
  assert.equal(worstVerdict([]), null);
});

test('pipeline conditions can route on the structured verdict', () => {
  assert.equal(evalEdgeCondition("verdict === 'critical'", { verdict: 'critical' }), true);
  assert.equal(evalEdgeCondition("verdict === 'critical'", { verdict: 'ok' }), false);
  assert.equal(evalEdgeCondition("verdict !== 'ok'", { verdict: null }), true);
  // output/summary still available alongside verdict
  assert.equal(evalEdgeCondition("verdict === 'ok' && output.includes('x')", { verdict: 'ok', output: 'xyz' }), true);
});

test('approval gate: supervised-tier runs hold in pending_approval, never auto-claimed', () => {
  const agentId = db.prepare('SELECT id FROM agents LIMIT 1').get().id;
  const sid = db.prepare(`INSERT INTO schedules (name, agent_ids, mode, task_prompt, cron_expression, safety_tier, status)
    VALUES ('gated', ?, 'parallel', 'x', '0 0 * * *', 'supervised', 'active')`).run(JSON.stringify([agentId])).lastInsertRowid;
  const scheduler = createScheduler(db);
  const runId = scheduler.fireRun(sid);
  assert.ok(runId, 'run created');
  const run = db.prepare('SELECT status FROM runs WHERE id = ?').get(runId);
  assert.equal(run.status, 'pending_approval');
  // the queue must not see it
  assert.equal(scheduler.stats().queued, 0);
});
