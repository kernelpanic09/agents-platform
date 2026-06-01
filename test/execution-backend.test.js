import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveBackend,
  apiModelId,
  buildApiResultJson,
  runClaudeApi,
  runClaude,
  parseClaudeJson,
} from '../server/executor.js';

test('resolveBackend defaults to subscription', () => {
  assert.equal(resolveBackend(), 'subscription');
  assert.equal(resolveBackend({}), 'subscription');
  assert.equal(resolveBackend({ execution_backend: null }), 'subscription');
});

test('resolveBackend honors per-schedule override (case-insensitive)', () => {
  assert.equal(resolveBackend({ execution_backend: 'api' }), 'api');
  assert.equal(resolveBackend({ execution_backend: 'API' }), 'api');
  assert.equal(resolveBackend({ execution_backend: 'subscription' }), 'subscription');
  // Unknown values fall back to the safe default rather than erroring.
  assert.equal(resolveBackend({ execution_backend: 'nonsense' }), 'subscription');
});

test('apiModelId maps aliases and falls back to a real id', () => {
  assert.equal(apiModelId('haiku'), 'claude-haiku-4-5-20251001');
  assert.equal(apiModelId('sonnet'), 'claude-sonnet-4-6-20250514');
  assert.equal(apiModelId('opus'), 'claude-opus-4-7-20250219');
  assert.match(apiModelId('bogus'), /^claude-/); // never undefined
});

test('buildApiResultJson is parseable by parseClaudeJson', () => {
  const stdout = buildApiResultJson({
    text: 'hello world',
    usage: { input_tokens: 3, output_tokens: 2 },
    model: 'claude-haiku-4-5-20251001',
  });
  const parsed = parseClaudeJson(stdout);
  assert.equal(parsed.result, 'hello world');
  assert.equal(parsed.parsed.backend, 'api');
  assert.equal(parsed.parsed.usage.input_tokens, 3);
});

test('runClaudeApi returns claude-shaped stdout via an injected client', async () => {
  const stub = {
    messages: {
      create: async ({ model, messages, max_tokens }) => {
        assert.match(model, /^claude-/);
        assert.equal(messages[0].role, 'user');
        assert.ok(max_tokens > 0);
        return { content: [{ type: 'text', text: 'API says hi' }], usage: { input_tokens: 11, output_tokens: 7 } };
      },
    },
  };
  const res = await runClaudeApi('do a thing', { model: 'haiku', _client: stub });
  assert.equal(res.exitCode, 0);
  assert.equal(res.timedOut, false);
  assert.equal(parseClaudeJson(res.stdout).result, 'API says hi');
});

test('runClaudeApi surfaces errors as a non-zero exit (never throws)', async () => {
  const stub = { messages: { create: async () => { throw new Error('boom'); } } };
  const res = await runClaudeApi('x', { _client: stub });
  assert.equal(res.exitCode, 1);
  assert.match(res.stderr, /api backend error: boom/);
});

test('runClaude routes to the api backend when selected', async () => {
  const stub = { messages: { create: async () => ({ content: [{ type: 'text', text: 'dispatched' }], usage: {} }) } };
  const res = await runClaude('hi', { backend: 'api', _client: stub });
  assert.equal(parseClaudeJson(res.stdout).result, 'dispatched');
});
