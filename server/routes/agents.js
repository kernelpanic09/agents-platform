import { Router } from 'express';
import { readFile } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { getSetting } from '../settings.js';
import { skillsForAgent, agentSkillIds, setAgentSkills } from '../skills.js';
import { listMemories, addMemory, updateMemory, deleteMemory } from '../memory.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = resolve(__dirname, '../../prompts');

const JSON_FIELDS = ['skills', 'tools', 'mcp_servers', 'knowledge_sources', 'example_tasks', 'related_agents', 'model_config'];
const VALID_CATEGORIES = ['infrastructure', 'development', 'security', 'media', 'automation'];
const VALID_STATUSES = ['active', 'draft', 'deprecated'];
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

function parseAgent(a) {
  const parsed = { ...a };
  for (const field of JSON_FIELDS) {
    if (parsed[field]) parsed[field] = JSON.parse(parsed[field]);
  }
  return parsed;
}

function validateArrayField(value, name) {
  if (value !== undefined && value !== null && !Array.isArray(value)) {
    return `${name} must be an array`;
  }
  return null;
}

export default function agentsRouter(db) {
  const router = Router();

  // Prepared statements (cached once, reused per request)
  const stmtListAgents = db.prepare(`
    SELECT id, name, title, tagline, color, icon_id, category, status, source_pack,
           skills, tools, mcp_servers, knowledge_sources, example_tasks, related_agents, created_at
    FROM agents ORDER BY id
  `);
  const stmtGetAgent = db.prepare('SELECT * FROM agents WHERE id = ?');
  const stmtGetPromptFile = db.prepare('SELECT prompt_file FROM agents WHERE id = ?');
  const stmtInsertAgent = db.prepare(`
    INSERT INTO agents (name, title, tagline, color, icon_id, category, status, skills, tools, mcp_servers, knowledge_sources, example_tasks, related_agents, system_prompt, prompt_file)
    VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const stmtUpdateAgent = db.prepare(`
    UPDATE agents SET
      name = ?, title = ?, tagline = ?, color = ?, icon_id = ?,
      category = ?, status = ?,
      skills = ?, tools = ?, mcp_servers = ?,
      knowledge_sources = ?, example_tasks = ?, related_agents = ?,
      system_prompt = ?, prompt_file = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `);
  const stmtDeleteAgent = db.prepare('DELETE FROM agents WHERE id = ?');
  const stmtSetModelConfig = db.prepare(`UPDATE agents SET model_config = ?, updated_at = datetime('now') WHERE id = ?`);
  const stmtInsertVersion = db.prepare(`INSERT INTO prompt_versions (agent_id, system_prompt, note) VALUES (?, ?, ?)`);
  const stmtListVersions = db.prepare(`SELECT id, note, created_at, system_prompt FROM prompt_versions WHERE agent_id = ? ORDER BY id DESC`);
  const stmtGetVersion = db.prepare(`SELECT * FROM prompt_versions WHERE id = ? AND agent_id = ?`);
  const stmtSetPrompt = db.prepare(`UPDATE agents SET system_prompt = ?, updated_at = datetime('now') WHERE id = ?`);

  // PUT /api/agents/:id/model-config — set the per-agent inference profile.
  // model applies to both backends; temperature/max_tokens apply to the API backend.
  router.put('/:id/model-config', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid agent ID' });
    const existing = stmtGetAgent.get(id);
    if (!existing) return res.status(404).json({ error: 'Agent not found' });

    const { model, temperature, max_tokens } = req.body || {};
    const cfg = {};
    if (model) {
      const allow = String(getSetting('model_allowlist') || 'haiku,sonnet,opus').split(',').map(s => s.trim()).filter(Boolean);
      if (!allow.includes(model)) return res.status(400).json({ error: `model must be one of: ${allow.join(', ')}` });
      cfg.model = model;
    }
    if (temperature !== undefined && temperature !== null && temperature !== '') {
      const t = Number(temperature);
      if (!Number.isFinite(t) || t < 0 || t > 1) return res.status(400).json({ error: 'temperature must be between 0 and 1' });
      cfg.temperature = t;
    }
    if (max_tokens !== undefined && max_tokens !== null && max_tokens !== '') {
      const m = parseInt(max_tokens, 10);
      if (!Number.isFinite(m) || m < 1 || m > 64000) return res.status(400).json({ error: 'max_tokens must be 1–64000' });
      cfg.max_tokens = m;
    }
    stmtSetModelConfig.run(Object.keys(cfg).length ? JSON.stringify(cfg) : null, id);
    res.json(parseAgent(stmtGetAgent.get(id)));
  });

  // GET /api/agents/:id/skills — skills attached to this agent (full rows for
  // the profile UI), plus the raw id list for editing.
  router.get('/:id/skills', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid agent ID' });
    res.json({ skills: skillsForAgent(db, id), skill_ids: agentSkillIds(db, id) });
  });

  // PUT /api/agents/:id/skills — replace the attached skill set.
  router.put('/:id/skills', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid agent ID' });
    if (!stmtGetAgent.get(id)) return res.status(404).json({ error: 'Agent not found' });
    const ids = req.body?.skill_ids;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'skill_ids must be an array' });
    setAgentSkills(db, id, ids.map(Number).filter(Number.isFinite));
    res.json({ skills: skillsForAgent(db, id), skill_ids: agentSkillIds(db, id) });
  });

  // Episodic memory: list / add / edit / delete an agent's memories.
  router.get('/:id/memories', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid agent ID' });
    res.json(listMemories(db, id));
  });

  router.post('/:id/memories', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid agent ID' });
    if (!stmtGetAgent.get(id)) return res.status(404).json({ error: 'Agent not found' });
    const r = addMemory(db, id, req.body?.content, { kind: req.body?.kind || 'manual', pinned: !!req.body?.pinned });
    if (!r) return res.status(400).json({ error: 'content is required' });
    res.status(201).json(listMemories(db, id));
  });

  router.patch('/:id/memories/:mid', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const mid = parseInt(req.params.mid, 10);
    if (isNaN(id) || isNaN(mid)) return res.status(400).json({ error: 'Invalid ID' });
    const m = updateMemory(db, mid, req.body || {});
    if (!m) return res.status(404).json({ error: 'Memory not found' });
    res.json(m);
  });

  router.delete('/:id/memories/:mid', (req, res) => {
    const mid = parseInt(req.params.mid, 10);
    if (isNaN(mid)) return res.status(400).json({ error: 'Invalid ID' });
    if (!deleteMemory(db, mid)) return res.status(404).json({ error: 'Memory not found' });
    res.json({ success: true });
  });

  // GET /api/agents/:id/prompt-versions — system-prompt history (newest first).
  router.get('/:id/prompt-versions', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid agent ID' });
    res.json(stmtListVersions.all(id));
  });

  // POST /api/agents/:id/prompt-versions/:vid/restore — make a past version active
  // (snapshots the current prompt first, so a restore is itself reversible).
  router.post('/:id/prompt-versions/:vid/restore', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const vid = parseInt(req.params.vid, 10);
    const agent = stmtGetAgent.get(id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    const version = stmtGetVersion.get(vid, id);
    if (!version) return res.status(404).json({ error: 'Version not found' });
    stmtInsertVersion.run(id, agent.system_prompt || '', 'snapshot before restore');
    stmtSetPrompt.run(version.system_prompt, id);
    res.json(parseAgent(stmtGetAgent.get(id)));
  });

  // GET /api/agents - list all agents
  router.get('/', (req, res) => {
    const agents = stmtListAgents.all();
    res.json(agents.map(parseAgent));
  });

  // GET /api/agents/stats - per-agent operational telemetry, aggregated from
  // dispatch traces. Keyed by agent id: { dispatches, tokens, last_active }.
  // Registered before /:id so the literal path wins.
  router.get('/stats', (req, res) => {
    const rows = db.prepare(`
      SELECT agent_id,
             COUNT(*) AS dispatches,
             COALESCE(SUM(COALESCE(input_tokens,0) + COALESCE(output_tokens,0)), 0) AS tokens,
             MAX(created_at) AS last_active
      FROM traces
      WHERE agent_id IS NOT NULL
        AND step_name IN ('ssh_dispatch','api_dispatch','openai_dispatch')
      GROUP BY agent_id
    `).all();
    const out = {};
    for (const r of rows) out[r.agent_id] = { dispatches: r.dispatches, tokens: r.tokens, last_active: r.last_active };
    res.json(out);
  });

  // GET /api/agents/:id - get single agent with full details
  router.get('/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid agent ID' });

    const agent = stmtGetAgent.get(id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    res.json(parseAgent(agent));
  });

  // GET /api/agents/:id/prompt - get raw prompt .md file content
  router.get('/:id/prompt', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid agent ID' });

    const agent = stmtGetPromptFile.get(id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    if (!agent.prompt_file) return res.status(404).json({ error: 'No prompt file for this agent' });

    // Path traversal protection
    const promptPath = resolve(PROMPTS_DIR, agent.prompt_file);
    if (!promptPath.startsWith(PROMPTS_DIR)) {
      return res.status(400).json({ error: 'Invalid prompt file path' });
    }

    try {
      const content = await readFile(promptPath, 'utf-8');
      return res.json({ file: agent.prompt_file, content });
    } catch {
      return res.status(404).json({ error: 'Prompt file not found on disk' });
    }
  });

  // POST /api/agents - create new agent
  router.post('/', (req, res) => {
    const { name, title, tagline, color, icon_id, category, skills, tools, mcp_servers, knowledge_sources, example_tasks, related_agents, system_prompt, prompt_file } = req.body;

    if (!name || !title || !tagline) {
      return res.status(400).json({ error: 'name, title, and tagline are required' });
    }

    // Validate color format
    if (color && !HEX_COLOR_RE.test(color)) {
      return res.status(400).json({ error: 'color must be a hex string like #3B82F6' });
    }

    // Validate enums
    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` });
    }

    // Validate array fields
    for (const [val, field] of [[skills, 'skills'], [tools, 'tools'], [mcp_servers, 'mcp_servers'], [knowledge_sources, 'knowledge_sources'], [example_tasks, 'example_tasks'], [related_agents, 'related_agents']]) {
      const err = validateArrayField(val, field);
      if (err) return res.status(400).json({ error: err });
    }

    try {
      const result = stmtInsertAgent.run(
        name, title, tagline,
        color || '#8B5CF6',
        icon_id || 'default',
        category || 'infrastructure',
        JSON.stringify(skills || []),
        JSON.stringify(tools || []),
        JSON.stringify(mcp_servers || []),
        JSON.stringify(knowledge_sources || []),
        JSON.stringify(example_tasks || []),
        JSON.stringify(related_agents || []),
        system_prompt || '',
        prompt_file || null
      );

      const agent = stmtGetAgent.get(result.lastInsertRowid);
      res.status(201).json(parseAgent(agent));
    } catch (err) {
      if (err.message.includes('UNIQUE')) {
        return res.status(409).json({ error: 'Agent with that name already exists' });
      }
      throw err;
    }
  });

  // PUT /api/agents/:id - update agent
  router.put('/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid agent ID' });

    const existing = stmtGetAgent.get(id);
    if (!existing) return res.status(404).json({ error: 'Agent not found' });

    const { name, title, tagline, color, icon_id, category, status, skills, tools, mcp_servers, knowledge_sources, example_tasks, related_agents, system_prompt, prompt_file } = req.body;

    // Validate color format
    if (color && !HEX_COLOR_RE.test(color)) {
      return res.status(400).json({ error: 'color must be a hex string like #3B82F6' });
    }

    // Validate enums
    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` });
    }
    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    // Validate array fields
    for (const [val, field] of [[skills, 'skills'], [tools, 'tools'], [mcp_servers, 'mcp_servers'], [knowledge_sources, 'knowledge_sources'], [example_tasks, 'example_tasks'], [related_agents, 'related_agents']]) {
      const err = validateArrayField(val, field);
      if (err) return res.status(400).json({ error: err });
    }

    // Snapshot the prior prompt before overwriting it, so every edit is restorable.
    if (system_prompt !== undefined && system_prompt !== existing.system_prompt) {
      stmtInsertVersion.run(id, existing.system_prompt || '', 'snapshot before edit');
    }

    try {
      stmtUpdateAgent.run(
        name ?? existing.name,
        title ?? existing.title,
        tagline ?? existing.tagline,
        color ?? existing.color,
        icon_id ?? existing.icon_id,
        category ?? existing.category,
        status ?? existing.status,
        JSON.stringify(skills ?? JSON.parse(existing.skills)),
        JSON.stringify(tools ?? JSON.parse(existing.tools)),
        JSON.stringify(mcp_servers ?? JSON.parse(existing.mcp_servers)),
        JSON.stringify(knowledge_sources ?? JSON.parse(existing.knowledge_sources)),
        JSON.stringify(example_tasks ?? JSON.parse(existing.example_tasks)),
        JSON.stringify(related_agents ?? JSON.parse(existing.related_agents)),
        system_prompt ?? existing.system_prompt,
        prompt_file !== undefined ? prompt_file : existing.prompt_file,
        id
      );

      const updated = stmtGetAgent.get(id);
      res.json(parseAgent(updated));
    } catch (err) {
      if (err.message.includes('UNIQUE')) {
        return res.status(409).json({ error: 'Agent with that name already exists' });
      }
      throw err;
    }
  });

  // DELETE /api/agents/:id - delete agent
  router.delete('/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid agent ID' });

    const result = stmtDeleteAgent.run(id);
    if (result.changes === 0) return res.status(404).json({ error: 'Agent not found' });

    res.json({ success: true });
  });

  return router;
}
