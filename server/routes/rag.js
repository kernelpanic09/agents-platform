import { Router } from 'express';
import { resolve } from 'path';
import { ingestDocument, removeDocument } from '../rag/ingest.js';
import { ragSearch, ragChat } from '../rag/chat.js';
import { getSupportedTypes } from '../rag/loaders/index.js';
import { checkOllamaHealth } from '../rag/embeddings.js';

const ALLOWED_INGEST_DIRS = (process.env.ALLOWED_INGEST_DIRS || '/home/ubuntu/apps,/home/ubuntu/terraform,/home/ubuntu/kube').split(',');

function isPathAllowed(filePath) {
  const resolved = resolve(filePath);
  return ALLOWED_INGEST_DIRS.some(dir => resolved.startsWith(dir));
}

export default function ragRouter(db) {
  const router = Router();

  router.get('/health', async (req, res) => {
    try {
      const ollama = await checkOllamaHealth();
      res.json({ ollama, supportedTypes: getSupportedTypes() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/ingest', async (req, res) => {
    const { source_type, source_path, agent_id } = req.body;

    if (!source_type || !source_path) {
      return res.status(400).json({ error: 'source_type and source_path are required' });
    }

    if (!getSupportedTypes().includes(source_type)) {
      return res.status(400).json({ error: `Unsupported source_type. Valid: ${getSupportedTypes().join(', ')}` });
    }

    if (['markdown', 'yaml', 'terraform'].includes(source_type)) {
      if (!isPathAllowed(source_path)) {
        return res.status(403).json({ error: 'Path not in allowed directories' });
      }
    }

    try {
      const result = await ingestDocument(db, {
        sourceType: source_type,
        sourcePath: source_path,
        agentId: agent_id || null,
      });
      res.status(201).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/search', async (req, res) => {
    const { query, agent_id, limit } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }

    try {
      const results = await ragSearch(query, {
        agentId: agent_id || null,
        limit: limit || 5,
      });
      res.json({ results });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/chat', async (req, res) => {
    const { query, agent_id, limit, model } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }

    try {
      const result = await ragChat(query, {
        agentId: agent_id || null,
        limit: limit || 5,
        model: model || 'haiku',
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/sources', (req, res) => {
    const { agent_id, status } = req.query;
    let sql = 'SELECT * FROM documents';
    const params = [];
    const conditions = [];

    if (agent_id) {
      conditions.push('agent_id = ?');
      params.push(parseInt(agent_id, 10));
    }
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY ingested_at DESC';

    const docs = db.prepare(sql).all(...params);
    res.json(docs.map(d => ({ ...d, metadata: JSON.parse(d.metadata || '{}') })));
  });

  router.delete('/sources/:id', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid document ID' });

    try {
      await removeDocument(db, id);
      res.json({ deleted: true });
    } catch (err) {
      if (err.message.includes('not found')) {
        return res.status(404).json({ error: err.message });
      }
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
