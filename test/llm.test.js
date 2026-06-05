import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auxBackend, auxModelId, chatComplete } from '../server/llm.js';

test('auxBackend resolution: anthropic > openai-compat > none', () => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_BASE_URL;
  assert.equal(auxBackend(), 'none');
  process.env.OPENAI_BASE_URL = 'http://ollama:11434/v1';
  assert.equal(auxBackend(), 'openai');
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  assert.equal(auxBackend(), 'anthropic');
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_BASE_URL;
});

test('auxModelId: aliases map per backend; concrete ids pass through on openai', () => {
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  assert.match(auxModelId('haiku'), /^claude-haiku/);
  delete process.env.ANTHROPIC_API_KEY;
  process.env.OPENAI_BASE_URL = 'http://x/v1';
  process.env.OPENAI_MODEL = 'qwen2.5:3b';
  assert.equal(auxModelId('haiku'), 'qwen2.5:3b');   // alias -> local default
  assert.equal(auxModelId('mistral:7b'), 'mistral:7b'); // concrete passthrough
  delete process.env.OPENAI_BASE_URL; delete process.env.OPENAI_MODEL;
});

test('chatComplete: clear error when no backend is configured', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_BASE_URL;
  await assert.rejects(() => chatComplete([{ role: 'user', content: 'x' }]), /ANTHROPIC_API_KEY|OPENAI_BASE_URL/);
});

test('chatComplete: openai-compat path maps roles, tokens, and model', async () => {
  process.env.OPENAI_BASE_URL = 'http://ollama:11434/v1/';
  process.env.OPENAI_MODEL = 'llama3.2:3b';
  let captured = null;
  const _fetch = async (url, opts) => {
    captured = { url, body: JSON.parse(opts.body) };
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'judged: 0.9' } }], usage: { prompt_tokens: 50, completion_tokens: 9 } }) };
  };
  const r = await chatComplete(
    [{ role: 'system', content: 'be a judge' }, { role: 'user', content: 'score this' }],
    { model: 'haiku', maxTokens: 512, temperature: 0, _fetch },
  );
  assert.equal(captured.url, 'http://ollama:11434/v1/chat/completions');
  assert.equal(captured.body.model, 'llama3.2:3b');
  assert.equal(captured.body.messages.length, 2);
  assert.equal(captured.body.temperature, 0);
  assert.equal(r.content, 'judged: 0.9');
  assert.equal(r.inputTokens, 50);
  assert.equal(r.backend, 'openai');
  delete process.env.OPENAI_BASE_URL; delete process.env.OPENAI_MODEL;
});
