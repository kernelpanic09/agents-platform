import { QdrantClient } from '@qdrant/js-client-rest';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const EMBEDDING_DIM = 768; // nomic-embed-text

let client = null;

export function getQdrantClient() {
  if (!client) {
    client = new QdrantClient({ url: QDRANT_URL });
  }
  return client;
}

export async function ensureCollection(name) {
  const qd = getQdrantClient();
  const collections = await qd.getCollections();
  const exists = collections.collections.some(c => c.name === name);
  if (!exists) {
    await qd.createCollection(name, {
      vectors: { size: EMBEDDING_DIM, distance: 'Cosine' },
    });
  }
  return name;
}

export async function upsertVectors(collectionName, points) {
  const qd = getQdrantClient();
  await qd.upsert(collectionName, { points });
}

export async function searchVectors(collectionName, vector, { limit = 5, filter = null } = {}) {
  const qd = getQdrantClient();
  const results = await qd.search(collectionName, {
    vector,
    limit,
    with_payload: true,
    ...(filter && { filter }),
  });
  return results;
}

export async function deleteBySource(collectionName, sourceId) {
  const qd = getQdrantClient();
  await qd.delete(collectionName, {
    filter: {
      must: [{ key: 'source_id', match: { value: sourceId } }],
    },
  });
}

export async function collectionExists(name) {
  const qd = getQdrantClient();
  try {
    await qd.getCollection(name);
    return true;
  } catch {
    return false;
  }
}
