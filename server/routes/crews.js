import { Router } from 'express';

// Crew topology → schedule execution mode.
const TOPOLOGY_MODE = { fan: 'parallel', chain: 'sequential', roundtable: 'meeting' };
const VALID_TOPOLOGY = new Set(Object.keys(TOPOLOGY_MODE));

const MINI = 'id, name, color, icon_id, title';

function resolveMembers(db, agentIds) {
  if (!agentIds.length) return [];
  const ph = agentIds.map(() => '?').join(',');
  const rows = db.prepare(`SELECT ${MINI} FROM agents WHERE id IN (${ph})`).all(...agentIds);
  const byId = new Map(rows.map(r => [r.id, r]));
  return agentIds.map(id => byId.get(id)).filter(Boolean); // preserve order
}

function parseCrew(db, row) {
  if (!row) return null;
  let ids = []; try { ids = JSON.parse(row.agent_ids || '[]'); } catch { ids = []; }
  return { ...row, agent_ids: ids, members: resolveMembers(db, ids) };
}

// Derive candidate crews from the agents' related_agents graph (names → ids).
function suggestCrews(db) {
  const agents = db.prepare(`SELECT id, name, color, icon_id, title, related_agents FROM agents`).all();
  const byName = new Map(agents.map(a => [a.name, a]));
  const seen = new Set();
  const out = [];
  for (const a of agents) {
    let related = []; try { related = JSON.parse(a.related_agents || '[]'); } catch { related = []; }
    const members = [a, ...related.map(n => byName.get(n)).filter(Boolean)];
    if (members.length < 2) continue;
    const ids = [...new Set(members.map(m => m.id))].sort((x, y) => x - y);
    const key = ids.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name: `${a.name} Crew`,
      description: `${a.name} with related specialists: ${members.slice(1).map(m => m.name).join(', ')}`,
      agent_ids: ids,
      topology: 'fan',
      members: members.map(m => ({ id: m.id, name: m.name, color: m.color, icon_id: m.icon_id, title: m.title })),
    });
    if (out.length >= 8) break;
  }
  return out;
}

export default function crewsRouter(db, scheduler) {
  const router = Router();

  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT * FROM crews ORDER BY updated_at DESC`).all();
    res.json(rows.map(r => parseCrew(db, r)));
  });

  router.get('/suggested', (req, res) => {
    res.json(suggestCrews(db));
  });

  router.get('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM crews WHERE id = ?`).get(parseInt(req.params.id, 10));
    if (!row) return res.status(404).json({ error: 'Crew not found' });
    res.json(parseCrew(db, row));
  });

  router.post('/', (req, res) => {
    const { name, description, agent_ids, topology, task, source } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
    const ids = Array.isArray(agent_ids) ? agent_ids.map(Number).filter(Boolean) : [];
    if (ids.length < 2) return res.status(400).json({ error: 'a crew needs at least 2 agents' });
    const topo = VALID_TOPOLOGY.has(topology) ? topology : 'fan';
    const result = db.prepare(`INSERT INTO crews (name, description, agent_ids, topology, task, source) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(name.trim(), description || '', JSON.stringify(ids), topo, task || '', source === 'suggested' ? 'suggested' : 'manual');
    res.status(201).json(parseCrew(db, db.prepare(`SELECT * FROM crews WHERE id = ?`).get(result.lastInsertRowid)));
  });

  router.put('/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = db.prepare(`SELECT * FROM crews WHERE id = ?`).get(id);
    if (!existing) return res.status(404).json({ error: 'Crew not found' });
    const { name, description, agent_ids, topology, task } = req.body;
    const ids = agent_ids !== undefined ? JSON.stringify(agent_ids.map(Number).filter(Boolean)) : existing.agent_ids;
    const topo = topology !== undefined ? (VALID_TOPOLOGY.has(topology) ? topology : existing.topology) : existing.topology;
    db.prepare(`UPDATE crews SET name = ?, description = ?, agent_ids = ?, topology = ?, task = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(name ?? existing.name, description ?? existing.description, ids, topo, task ?? existing.task, id);
    res.json(parseCrew(db, db.prepare(`SELECT * FROM crews WHERE id = ?`).get(id)));
  });

  router.delete('/:id', (req, res) => {
    db.prepare(`DELETE FROM crews WHERE id = ?`).run(parseInt(req.params.id, 10));
    res.json({ deleted: true });
  });

  // Run a crew now: spin up a one-shot schedule from the crew and fire it through
  // the durable queue, so the crew run gets the full Live Run Theater + history.
  router.post('/:id/run', (req, res) => {
    const crew = parseCrew(db, db.prepare(`SELECT * FROM crews WHERE id = ?`).get(parseInt(req.params.id, 10)));
    if (!crew) return res.status(404).json({ error: 'Crew not found' });
    if (!scheduler) return res.status(503).json({ error: 'scheduler unavailable' });
    const mode = TOPOLOGY_MODE[crew.topology] || 'parallel';
    const task = (req.body.task && req.body.task.trim()) || crew.task || crew.description || crew.name;

    const sched = db.prepare(`
      INSERT INTO schedules (name, description, agent_ids, mode, task_prompt, cron_expression, recurring, allow_writes, status, next_run_at)
      VALUES (?, ?, ?, ?, ?, '0 0 * * *', 0, 0, 'active', NULL)
    `).run(`${crew.name} (crew run)`, crew.description || '', JSON.stringify(crew.agent_ids), mode, task);
    const scheduleId = sched.lastInsertRowid;

    const runId = scheduler.fireRun(scheduleId, { force: true, taskPrompt: task });
    if (!runId) {
      db.prepare(`DELETE FROM schedules WHERE id = ?`).run(scheduleId);
      return res.status(400).json({ error: 'Could not start crew run (no valid agents?)' });
    }
    res.status(201).json({ run_id: runId, schedule_id: scheduleId });
  });

  return router;
}
