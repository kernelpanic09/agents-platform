import { Router } from 'express';
import { listMcp, getMcp, createMcp, updateMcp, deleteMcp, generateMcpConfig, checkMcpEnv, testMcpConnection } from '../mcp-registry.js';

export default function mcpRouter(db) {
  const router = Router();

  router.get('/', (req, res) => res.json(listMcp(db)));

  // settings.json-compatible config block for a set of ids (kept from the static API)
  router.post('/config', (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids must be an array' });
    res.json({ mcpServers: generateMcpConfig(db, ids) });
  });

  router.post('/', (req, res) => {
    try { res.status(201).json(createMcp(db, req.body)); }
    catch (err) { res.status(400).json({ error: err.message }); }
  });

  router.get('/:id', (req, res) => {
    const m = getMcp(db, req.params.id);
    if (!m) return res.status(404).json({ error: 'MCP server not found' });
    res.json(m);
  });

  router.put('/:id', (req, res) => {
    const updated = updateMcp(db, req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'MCP server not found' });
    res.json(updated);
  });

  router.delete('/:id', (req, res) => {
    res.json({ deleted: deleteMcp(db, req.params.id) });
  });

  // Env-var validation badge data.
  router.get('/:id/check', (req, res) => {
    const m = getMcp(db, req.params.id);
    if (!m) return res.status(404).json({ error: 'MCP server not found' });
    res.json(checkMcpEnv(m));
  });

  // Remote connection test (SSH command-availability probe).
  router.post('/:id/test', async (req, res) => {
    const m = getMcp(db, req.params.id);
    if (!m) return res.status(404).json({ error: 'MCP server not found' });
    res.json(await testMcpConnection(m));
  });

  return router;
}
