import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initDb } from '../server/db.js';
import { initSettings } from '../server/settings.js';
import { initTelemetry, recordTrace, getTraces } from '../server/observability/telemetry.js';
import { parseStreamJson, parseClaudeJson, stepFromEvent, buildRemoteCommand } from '../server/executor.js';

const dir = mkdtempSync(join(tmpdir(), 'stream-'));
process.env.DATA_DIR = dir;
const db = initDb();
initSettings(db);
initTelemetry(db);
after(() => { try { db.close(); } catch {} rmSync(dir, { recursive: true, force: true }); });

const STREAM_FIXTURE = [
  JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-haiku-4-5', tools: ['Bash', 'Read'], mcp_servers: [{ name: 'kubernetes', status: 'connected' }] }),
  JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Let me check the cluster.' }] } }),
  JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'mcp__kubernetes__kubectl_get', input: { resourceType: 'pods', namespace: 'agents' } }] } }),
  JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: '3 pods' }] } }),
  JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'kubectl get nodes' } }] } }),
  'this line is not json and must be skipped',
  JSON.stringify({ type: 'result', subtype: 'success', result: 'All healthy.\nSTATUS: ok\nSUMMARY: fine', usage: { input_tokens: 100, output_tokens: 50 }, num_turns: 3, duration_ms: 12000 }),
].join('\n');

test('parseStreamJson: extracts result, usage, and a step timeline', () => {
  const p = parseStreamJson(STREAM_FIXTURE);
  assert.equal(p.parseError, undefined);
  assert.match(p.result, /^All healthy/);
  assert.equal(p.parsed.usage.input_tokens, 100);
  const kinds = p.steps.map(s => s.kind);
  assert.deepEqual(kinds, ['init', 'text', 'tool', 'tool', 'result']);
  const mcpStep = p.steps.find(s => s.name === 'mcp__kubernetes__kubectl_get');
  assert.match(mcpStep.detail, /pods/);
  const bash = p.steps.find(s => s.name === 'Bash');
  assert.equal(bash.detail, 'kubectl get nodes');
});

test('parseStreamJson: missing result event reported', () => {
  const p = parseStreamJson('{"type":"assistant","message":{"content":[{"type":"text","text":"hi"}]}}');
  assert.match(p.parseError, /no result event/);
});

test('parseClaudeJson: handles both formats transparently', () => {
  // Legacy single-blob
  const legacy = parseClaudeJson(JSON.stringify({ result: 'legacy result', usage: { input_tokens: 1 } }));
  assert.equal(legacy.result, 'legacy result');
  // NDJSON stream
  const stream = parseClaudeJson(STREAM_FIXTURE);
  assert.match(stream.result, /^All healthy/);
  assert.equal(stream.parsed.usage.output_tokens, 50);
  assert.equal(stream.steps.length, 5);
});

test('stepFromEvent: init summarises model/tools/mcp; tool_result and unknown events skipped', () => {
  const init = stepFromEvent({ type: 'system', subtype: 'init', model: 'm', tools: ['a', 'b', 'c'], mcp_servers: [{ name: 'k8s' }] });
  assert.equal(init.kind, 'init');
  assert.match(init.detail, /3 tools/);
  assert.match(init.detail, /mcp: k8s/);
  assert.equal(stepFromEvent({ type: 'user', message: { content: [{ type: 'tool_result' }] } }), null);
  assert.equal(stepFromEvent({ type: 'whatever' }), null);
  const ts = stepFromEvent({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/etc/hosts' } }] } }, 1234);
  assert.equal(ts.atMs, 1234);
  assert.equal(ts.detail, '/etc/hosts');
});

test('buildRemoteCommand: streamJson flag switches output format (with --verbose)', () => {
  const stream = buildRemoteCommand({ b64Prompt: 'QQ==', cwd: '/tmp', model: 'sonnet', streamJson: true });
  assert.ok(stream.includes('--output-format stream-json --verbose'));
  assert.ok(!stream.includes('$'));
  const blob = buildRemoteCommand({ b64Prompt: 'QQ==', cwd: '/tmp', model: 'sonnet' });
  assert.ok(blob.includes('--output-format json'));
  assert.ok(!blob.includes('stream-json'));
});

test('recordTrace: persists the step timeline as JSON', () => {
  // traces.run_id is a real FK - create run rows (fresh test DB seeds schedules 1-10)
  const mkRun = db.prepare(`INSERT INTO runs (id, schedule_id, agent_ids, mode, task_prompt, status) VALUES (?, 1, '[1]', 'parallel', 'test', 'success')`);
  mkRun.run(901);
  mkRun.run(902);
  const steps = [{ kind: 'tool', name: 'Bash', detail: 'ls', atMs: 1500 }];
  recordTrace({ runId: 901, agentId: 1, stepName: 'ssh_dispatch', model: 'sonnet', latencyMs: 2000, source: 'ssh', steps });
  const rows = getTraces({ runId: 901 });
  assert.equal(rows.length, 1);
  assert.deepEqual(JSON.parse(rows[0].steps), steps);
  // No steps -> column stays NULL
  recordTrace({ runId: 902, agentId: 1, stepName: 'ssh_dispatch', model: 'sonnet', latencyMs: 1, source: 'ssh', steps: [] });
  assert.equal(getTraces({ runId: 902 })[0].steps, null);
});
