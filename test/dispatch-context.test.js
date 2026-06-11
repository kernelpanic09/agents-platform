import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initDb } from '../server/db.js';
import { initSettings, setSetting } from '../server/settings.js';
import { initMcpRegistry, updateMcp } from '../server/mcp-registry.js';
import { sanitizeMcpEnv, buildAgentMcp, agentDispatchContext, meetingDispatchContext } from '../server/dispatch-context.js';
import { buildRemoteCommand } from '../server/executor.js';

const dir = mkdtempSync(join(tmpdir(), 'dctx-'));
process.env.DATA_DIR = dir;
const db = initDb();
initSettings(db);
initMcpRegistry(db);
after(() => { try { db.close(); } catch {} rmSync(dir, { recursive: true, force: true }); });

const agentWith = (ids) => ({ name: 'T', mcp_servers: JSON.stringify(ids) });

test('sanitizeMcpEnv: drops placeholder values, keeps real ones', () => {
  const out = sanitizeMcpEnv({
    GITHUB_PERSONAL_ACCESS_TOKEN: '<your-github-token>',
    KUBECONFIG: '/path/to/.kube/config',
    REAL: '/home/me/.kube/config',
  });
  assert.deepEqual(out, { REAL: '/home/me/.kube/config' });
});

test('buildAgentMcp: resolves declared ids to launchable config, skips unknown', () => {
  const mcp = buildAgentMcp(db, agentWith(['kubernetes', 'does-not-exist']));
  assert.deepEqual(mcp.ids, ['kubernetes']);
  const entry = mcp.config.mcpServers.kubernetes;
  assert.equal(entry.command, 'npx');
  assert.deepEqual(entry.args, ['-y', 'mcp-server-kubernetes']);
  // seed KUBECONFIG is a /path/to placeholder -> dropped, host env supplies it
  assert.equal(entry.env, undefined);
});

test('buildAgentMcp: null when nothing declared or entries disabled', () => {
  assert.equal(buildAgentMcp(db, agentWith([])), null);
  assert.equal(buildAgentMcp(db, { mcp_servers: 'not-json' }), null);

  updateMcp(db, 'memory', { enabled: false });
  assert.equal(buildAgentMcp(db, agentWith(['memory'])), null);
  updateMcp(db, 'memory', { enabled: true });
});

test('agentDispatchContext: provisions on subscription backend only', () => {
  const ssh = agentDispatchContext(db, agentWith(['kubernetes']), { backend: 'subscription' });
  assert.deepEqual(ssh.provisioned.mcp, ['kubernetes']);
  assert.ok(ssh.mcpConfig.mcpServers.kubernetes);

  for (const backend of ['api', 'openai']) {
    const ctx = agentDispatchContext(db, agentWith(['kubernetes']), { backend });
    assert.equal(ctx.mcpConfig, null);
    assert.deepEqual(ctx.provisioned.mcp, []);
  }
});

test('agentDispatchContext: mcp_provisioning=off disables injection', () => {
  setSetting('mcp_provisioning', 'off');
  const ctx = agentDispatchContext(db, agentWith(['kubernetes']), { backend: 'subscription' });
  assert.equal(ctx.mcpConfig, null);
  setSetting('mcp_provisioning', 'on');
});

test('meetingDispatchContext: unions and dedupes across agents', () => {
  const ctx = meetingDispatchContext(db, [
    agentWith(['kubernetes', 'context7']),
    agentWith(['context7', 'filesystem']),
  ], { backend: 'subscription' });
  assert.deepEqual(ctx.provisioned.mcp.sort(), ['context7', 'filesystem', 'kubernetes']);
  assert.equal(Object.keys(ctx.mcpConfig.mcpServers).length, 3);
});

test('buildRemoteCommand: unchanged shape without MCP', () => {
  const cmd = buildRemoteCommand({ b64Prompt: 'UFJPTVBU', cwd: '/tmp', model: 'sonnet', turnsFlag: ' --max-turns 5', tierFlags: ' --disallowedTools Write' });
  assert.ok(cmd.includes("echo 'UFJPTVBU' | base64 -d | claude -p --output-format json --model sonnet --max-turns 5 --disallowedTools Write"));
  assert.ok(cmd.includes('--dangerously-skip-permissions'));
  assert.ok(!cmd.includes('--mcp-config'));
});

test('buildRemoteCommand: provisions MCP via temp file, strict mode, trap cleanup', () => {
  const cmd = buildRemoteCommand({ b64Prompt: 'UFJPTVBU', cwd: '/tmp', model: 'sonnet', mcpB64: 'TUNQQ0ZH', mcpPath: '/tmp/agents-mcp-abc123.json' });
  assert.ok(cmd.includes("trap 'rm -f /tmp/agents-mcp-abc123.json' EXIT;"));
  assert.ok(cmd.includes("echo 'TUNQQ0ZH' | base64 -d > /tmp/agents-mcp-abc123.json &&"));
  assert.ok(cmd.includes('--mcp-config /tmp/agents-mcp-abc123.json --strict-mcp-config'));
  // The command crosses two shell evaluations (sshd login shell, then bash -l -c):
  // it must contain no $ at all or the outer pass mangles it.
  assert.ok(!cmd.includes('$'), 'remote command must be free of shell variables/substitutions');
});

test('buildRemoteCommand: no-MCP shape is also free of shell variables', () => {
  const cmd = buildRemoteCommand({ b64Prompt: 'UFJPTVBU', cwd: '/tmp', model: 'sonnet' });
  assert.ok(!cmd.includes('$'));
});

test('mcpTempPath: unique /tmp json paths', async () => {
  const { mcpTempPath } = await import('../server/executor.js');
  const a = mcpTempPath(); const b = mcpTempPath();
  assert.match(a, /^\/tmp\/agents-mcp-[0-9a-f]{12}\.json$/);
  assert.notEqual(a, b);
});
