import { getLoader } from './loaders/index.js';
import { splitWithMetadata } from './splitter.js';
import { embedBatch } from './embeddings.js';
import { ensureCollection, upsertVectors, deleteBySource } from './qdrant.js';
import crypto from 'crypto';

const GLOBAL_COLLECTION = 'agents_global';
const BATCH_SIZE = 50;

function agentCollection(agentId) {
  return agentId ? `agent_${agentId}` : GLOBAL_COLLECTION;
}

export async function ingestDocument(db, { sourceType, sourcePath, agentId = null, extraArgs = {} }) {
  const result = db.prepare(
    `INSERT INTO documents (source_type, source_path, agent_id, status) VALUES (?, ?, ?, 'processing')`
  ).run(sourceType, sourcePath, agentId);
  const docId = result.lastInsertRowid;

  try {
    const loader = getLoader(sourceType);
    const loadArgs = sourceType === 'transcript' ? [sourcePath, db] : [sourcePath];
    const { content, metadata } = await loader(...loadArgs);

    const chunks = splitWithMetadata(content, {
      ...metadata,
      source_id: docId,
      agent_id: agentId,
    });

    const collectionName = agentCollection(agentId);
    await ensureCollection(collectionName);
    if (agentId) await ensureCollection(GLOBAL_COLLECTION);

    let totalChunks = 0;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const texts = batch.map(c => c.text);
      const vectors = await embedBatch(texts);

      const points = batch.map((chunk, idx) => ({
        id: crypto.randomUUID(),
        vector: vectors[idx],
        payload: {
          text: chunk.text,
          source_id: docId,
          ...chunk.metadata,
        },
      }));

      await upsertVectors(collectionName, points);
      if (agentId) await upsertVectors(GLOBAL_COLLECTION, points);
      totalChunks += points.length;
    }

    db.prepare(
      `UPDATE documents SET status = 'ready', chunk_count = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(totalChunks, docId);

    return { docId, chunks: totalChunks, collection: collectionName };
  } catch (err) {
    db.prepare(
      `UPDATE documents SET status = 'failed', metadata = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(JSON.stringify({ error: err.message }), docId);
    throw err;
  }
}

export async function removeDocument(db, docId) {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(docId);
  if (!doc) throw new Error(`Document ${docId} not found`);

  const collectionName = agentCollection(doc.agent_id);

  try { await deleteBySource(collectionName, docId); } catch { /* collection may not exist */ }
  try { await deleteBySource(GLOBAL_COLLECTION, docId); } catch { /* ok */ }

  db.prepare('DELETE FROM documents WHERE id = ?').run(docId);
  return { deleted: true };
}
