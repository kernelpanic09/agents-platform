import { Router } from 'express';
import { syncAgencyAgents } from '../agency-sync.js';

function parseAgent(a) {
  const parsed = { ...a };
  if (parsed.services) parsed.services = JSON.parse(parsed.services);
  return parsed;
}

export default function agencyRouter(db) {
  const router = Router();

  const stmtListAgency = db.prepare(`
    SELECT id, name, description, color, emoji, vibe, category, source_file, services, synced_at
    FROM agency_agents ORDER BY category, name
  `);
  const stmtGetAgency = db.prepare('SELECT * FROM agency_agents WHERE id = ?');

  // GET /api/agency - list all agency agents (without system_prompt for lighter payload)
  router.get('/', (req, res) => {
    res.json(stmtListAgency.all().map(parseAgent));
  });

  // GET /api/agency/:id - full agent detail
  router.get('/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid agent ID' });

    const agent = stmtGetAgency.get(id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    res.json(parseAgent(agent));
  });

  // POST /api/agency/sync - trigger re-sync from GitHub
  router.post('/sync', async (req, res) => {
    try {
      const result = await syncAgencyAgents(db);
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
