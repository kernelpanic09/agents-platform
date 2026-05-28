import { Ollama } from 'ollama';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const EMBED_MODEL = process.env.EMBED_MODEL || 'nomic-embed-text';

let ollamaClient = null;

function getOllama() {
  if (!ollamaClient) {
    ollamaClient = new Ollama({ host: OLLAMA_URL });
  }
  return ollamaClient;
}

export async function embedText(text) {
  const ollama = getOllama();
  const response = await ollama.embed({ model: EMBED_MODEL, input: text });
  return response.embeddings[0];
}

export async function embedBatch(texts) {
  const ollama = getOllama();
  const response = await ollama.embed({ model: EMBED_MODEL, input: texts });
  return response.embeddings;
}

export async function checkOllamaHealth() {
  try {
    const ollama = getOllama();
    const models = await ollama.list();
    const hasEmbed = models.models.some(m => m.name.startsWith(EMBED_MODEL));
    return { healthy: true, hasEmbedModel: hasEmbed, models: models.models.map(m => m.name) };
  } catch (err) {
    return { healthy: false, error: err.message };
  }
}
