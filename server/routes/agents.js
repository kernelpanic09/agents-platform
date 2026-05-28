import { Router } from 'express';
import { readFile } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = resolve(__dirname, '../../prompts');

const JSON_FIELDS = ['skills', 'tools', 'mcp_servers', 'knowledge_sources', 'example_tasks', 'related_agents'];
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
    SELECT id, name, title, tagline, color, icon_id, category, status,
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

  // GET /api/agents - list all agents
  router.get('/', (req, res) => {
    const agents = stmtListAgents.all();
    res.json(agents.map(parseAgent));
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
