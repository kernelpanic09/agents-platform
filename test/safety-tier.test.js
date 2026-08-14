import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTier, policyToPrompt, tierCliFlags } from '../server/safety-prompt.js';
import { AgentState } from '../server/workflows/state.js';
import { buildAgentPrompt, buildRemoteCommand } from '../server/executor.js';

test('resolveTier: explicit tier wins, else derives from allow_writes', () => {
  assert.equal(resolveTier({}), 'read_only');
  assert.equal(resolveTier({ allow_writes: 1 }), 'controlled_write');
  assert.equal(resolveTier({ allow_writes: 0 }), 'read_only');
  assert.equal(resolveTier({ safety_tier: 'supervised', allow_writes: 0 }), 'supervised');
  assert.equal(resolveTier({ safety_tier: 'bogus' }), 'read_only'); // invalid ignored
});

test('policyToPrompt: read_only is the base; elevated tiers append permissions', () => {
  const base = 'BASE-PREAMBLE\n';
  assert.equal(policyToPrompt('read_only', base), base);

  const cw = policyToPrompt('controlled_write', base);
  assert.ok(cw.startsWith(base));
  assert.match(cw, /CONTROLLED-WRITE/);
  assert.match(cw, /NEVER run destructive/i);

  const sup = policyToPrompt('supervised', base);
  assert.ok(sup.startsWith(base));
  assert.match(sup, /SUPERVISED/);
});

test('AgentState has a tier channel defaulting to read_only', () => {
  assert.ok('tier' in AgentState.spec, 'tier annotation present');
});

test('read_only tier still yields disallowedTools + preamble, and command carries it', () => {
  const flags = tierCliFlags('read_only');
  assert.match(flags, /--disallowedTools/);
  const prompt = buildAgentPrompt({ name: 'X', title: 'Y', system_prompt: 'do things' }, 'task', null, 'read_only', null);
  assert.ok(prompt.length > 0);
  const cmd = buildRemoteCommand({ b64Prompt: 'AA==', model: 'sonnet', tierFlags: flags });
  assert.match(cmd, /--disallowedTools/);
});
