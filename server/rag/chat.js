import { embedText } from './embeddings.js';
import { searchVectors, collectionExists } from './qdrant.js';
import { recordTrace } from '../observability/telemetry.js';

const GLOBAL_COLLECTION = 'agents_global';

export async function ragSearch(query, { agentId = null, limit = 5 } = {}) {
  const queryVector = await embedText(query);
  const collectionName = agentId ? `agent_${agentId}` : GLOBAL_COLLECTION;

  const exists = await collectionExists(collectionName);
  if (!exists) return [];

  const results = await searchVectors(collectionName, queryVector, { limit });

  return results.map(r => ({
    text: r.payload.text,
    score: r.score,
    source_type: r.payload.source_type,
    source_path: r.payload.source_path,
    chunk_index: r.payload.chunk_index,
    source_id: r.payload.source_id,
  }));
}

export async function ragChat(query, { agentId = null, limit = 5, model = 'haiku' } = {}) {
  const context = await ragSearch(query, { agentId, limit });

  if (context.length === 0) {
    return {
      answer: 'No relevant documents found. Try ingesting some documents first.',
      context: [],
      model,
    };
  }

  const contextText = context
    .map((c, i) => `[${i + 1}] (${c.source_type}: ${c.source_path}, score: ${c.score.toFixed(3)})\n${c.text}`)
    .join('\n\n');

  const systemPrompt = `You are a helpful assistant that answers questions based on the provided context. Use the context to answer accurately. If the context doesn't contain enough information, say so. Cite sources by their number [1], [2], etc.`;

  const userPrompt = `Context:\n${contextText}\n\nQuestion: ${query}`;

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const anthropic = new Anthropic();

  const modelMap = {
    haiku: 'claude-haiku-4-5-20251001',
    sonnet: 'claude-sonnet-4-6-20250514',
    opus: 'claude-opus-4-7-20250219',
  };

  const startTime = Date.now();
  const response = await anthropic.messages.create({
    model: modelMap[model] || modelMap.haiku,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });
  recordTrace({
    agentId: agentId,
    stepName: 'rag_chat',
    model: modelMap[model] || modelMap.haiku,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    latencyMs: Date.now() - startTime,
    inputPreview: query,
    outputPreview: response.content[0].text,
  });

  return {
    answer: response.content[0].text,
    context,
    model,
    tokens: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    },
  };
}
