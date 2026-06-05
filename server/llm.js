// Unified chat-completion layer for the auxiliary LLM features (eval runner,
// LLM-as-judge, task router, RAG generation). Backend resolution:
//
//   1. ANTHROPIC_API_KEY set      -> Anthropic API (pay-per-token)
//   2. else OPENAI_BASE_URL set   -> any OpenAI-compatible endpoint - point it
//                                    at the in-cluster Ollama for $0 local models
//   3. else                       -> clear error telling the operator which to set
//
// This is what makes the platform fully self-contained: with no API key at all,
// evals, prompt A/B testing, the judge, the router, and RAG chat run on local
// models. Agent dispatch is unaffected (it has its own execution backends).
import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';

const ANTHROPIC_MODEL_MAP = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6-20250514',
  opus: 'claude-opus-4-7-20250219',
};

const openaiBase = () => (process.env.OPENAI_BASE_URL || '').replace(/\/+$/, '');

/** Which backend the auxiliary features will use right now. */
export function auxBackend() {
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (openaiBase()) return 'openai';
  return 'none';
}

/** Concrete model id the aux backend will run for a haiku/sonnet/opus alias. */
export function auxModelId(alias) {
  if (auxBackend() === 'anthropic') return ANTHROPIC_MODEL_MAP[alias] || ANTHROPIC_MODEL_MAP.haiku;
  if (alias && !ANTHROPIC_MODEL_MAP[alias]) return alias; // concrete id passes through
  return process.env.OPENAI_MODEL || 'qwen2.5:3b';
}

/**
 * One chat completion. `messages` are plain {role: 'system'|'user'|'assistant',
 * content} objects. Returns { content, inputTokens, outputTokens, model, backend }.
 * Local CPU models can be slow; timeoutMs bounds the call (default 3 min).
 */
export async function chatComplete(messages, { model = 'haiku', maxTokens = 1024, temperature, timeoutMs = 180000, _fetch = null } = {}) {
  const backend = auxBackend();
  const resolved = auxModelId(model);

  if (backend === 'anthropic') {
    const llm = new ChatAnthropic({ model: resolved, maxTokens, ...(temperature != null ? { temperature } : {}) });
    const lc = messages.map(m =>
      m.role === 'system' ? new SystemMessage(m.content)
        : m.role === 'assistant' ? new AIMessage(m.content)
        : new HumanMessage(m.content));
    const resp = await llm.invoke(lc);
    const content = typeof resp.content === 'string' ? resp.content : JSON.stringify(resp.content);
    return {
      content,
      inputTokens: resp.usage_metadata?.input_tokens || 0,
      outputTokens: resp.usage_metadata?.output_tokens || 0,
      model: resolved,
      backend,
    };
  }

  if (backend === 'openai') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await (_fetch || fetch)(`${openaiBase()}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY || 'none'}` },
        body: JSON.stringify({
          model: resolved,
          max_tokens: maxTokens,
          ...(temperature != null ? { temperature } : {}),
          messages,
        }),
        signal: controller.signal,
      });
      if (!resp.ok) {
        const detail = (await resp.text().catch(() => '')).slice(0, 300);
        throw new Error(`openai-compatible backend HTTP ${resp.status}: ${detail}`);
      }
      const data = await resp.json();
      return {
        content: data.choices?.[0]?.message?.content || '',
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
        model: resolved,
        backend,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error('No LLM backend available for this feature: set ANTHROPIC_API_KEY, or OPENAI_BASE_URL (e.g. a local Ollama at http://ollama:11434/v1) for $0 local models.');
}

/** Trace source tag for the aux backend ('api' for Anthropic, 'openai' for local/compat). */
export function auxTraceSource() {
  return auxBackend() === 'anthropic' ? 'api' : 'openai';
}
