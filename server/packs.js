// Agent Packs (P5) — portable, versioned import/export of the platform's
// composable artifacts (agents, crews, schedules, pipelines). References between
// artifacts are by agent *name* (not id) so a pack moves cleanly between
// deployments. Also generalizes the read-only agency catalog into an "adopt"
// path that copies an agency agent into the runnable roster.

const VALID_TOPO = new Set(['fan', 'chain', 'roundtable']);
const VALID_CATEGORIES = new Set(['infrastructure', 'development', 'security', 'media', 'automation']);
const HEX = (c) => typeof c === 'string' && /^#[0-9A-Fa-f]{6}$/.test(c);

function J(s, fallback = null) { try { return JSON.parse(s); } catch { return fallback; } }
function S(v) { return JSON.stringify(Array.isArray(v) ? v : []); }
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

/** Serialize selected sections into a portable pack object (YAML-stringified by the route). */
export function buildPack(db, include = ['agents', 'crews', 'schedules', 'pipelines'], exportedAt = new Date().toISOString()) {
  const nameById = new Map(db.prepare('SELECT id, name FROM agents').all().map(a => [a.id, a.name]));
  const pack = { apiVersion: 'agents-platform/v1', kind: 'AgentPack', metadata: { exportedAt } };

  if (include.includes('agents')) {
    pack.agents = db.prepare('SELECT * FROM agents').all().map(a => ({
      name: a.name, title: a.title, tagline: a.tagline, color: a.color, icon_id: a.icon_id,
      category: a.category, status: a.status,
      skills: J(a.skills, []), tools: J(a.tools, []), mcp_servers: J(a.mcp_servers, []),
      knowledge_sources: J(a.knowledge_sources, []), example_tasks: J(a.example_tasks, []),
      related_agents: J(a.related_agents, []), system_prompt: a.system_prompt || '',
    }));
  }
  if (include.includes('crews')) {
    pack.crews = db.prepare('SELECT * FROM crews').all().map(c => ({
      name: c.name, description: c.description, topology: c.topology, task: c.task,
      members: (J(c.agent_ids, []) || []).map(id => nameById.get(id)).filter(Boolean),
    }));
  }
  if (include.includes('schedules')) {
    // Skip the transient one-shot schedules crews create per run.
    pack.schedules = db.prepare("SELECT * FROM schedules WHERE name NOT LIKE '%(crew run)'").all().map(s => ({
      name: s.name, description: s.description, mode: s.mode, task_prompt: s.task_prompt,
      cron_expression: s.cron_expression, recurring: !!s.recurring,
      agents: (J(s.agent_ids, []) || []).map(id => nameById.get(id)).filter(Boolean),
    }));
  }
  if (include.includes('pipelines')) {
    pack.pipelines = db.prepare('SELECT * FROM pipelines').all().map(p => {
      const g = J(p.graph, { nodes: [], edges: [] }) || { nodes: [], edges: [] };
      return {
        name: p.name, description: p.description,
        graph: {
          nodes: (g.nodes || []).map(n => ({ id: n.id, agent: nameById.get(n.agent_id) || null, label: n.label, model: n.model || '' })),
          edges: (g.edges || []).map(e => ({ from: e.from, to: e.to, condition: e.condition || '' })),
        },
      };
    });
  }
  return pack;
}

/** Import a pack: create agents (skip name clashes), then resolve name→id for the rest. */
export function importPack(db, pack) {
  if (!pack || typeof pack !== 'object') throw new Error('Empty or invalid pack');
  if (pack.kind !== 'AgentPack') throw new Error('Not an AgentPack (missing "kind: AgentPack")');
  if (pack.apiVersion && !String(pack.apiVersion).startsWith('agents-platform/')) throw new Error(`Unsupported apiVersion: ${pack.apiVersion}`);

  const summary = {
    created: { agents: 0, crews: 0, schedules: 0, pipelines: 0 },
    skipped: { agents: 0, crews: 0, schedules: 0, pipelines: 0 },
    warnings: [],
  };
  const sourceTag = `pack:${pack.metadata?.name || 'import'}`;

  const tx = db.transaction(() => {
    const existsAgent = db.prepare('SELECT id FROM agents WHERE name = ?');
    const insAgent = db.prepare(`INSERT INTO agents
      (name, title, tagline, color, icon_id, category, status, skills, tools, mcp_servers, knowledge_sources, example_tasks, related_agents, system_prompt, source_pack)
      VALUES (@name, @title, @tagline, @color, @icon_id, @category, 'active', @skills, @tools, @mcp_servers, @knowledge_sources, @example_tasks, @related_agents, @system_prompt, @source_pack)`);

    for (const a of pack.agents || []) {
      if (!a.name) { summary.warnings.push('an agent without a name was skipped'); continue; }
      if (existsAgent.get(a.name)) { summary.skipped.agents++; continue; }
      insAgent.run({
        name: a.name, title: a.title || 'Imported Agent', tagline: a.tagline || '',
        color: HEX(a.color) ? a.color : '#a78bfa', icon_id: a.icon_id || 'imported',
        category: VALID_CATEGORIES.has(a.category) ? a.category : 'automation',
        skills: S(a.skills), tools: S(a.tools), mcp_servers: S(a.mcp_servers),
        knowledge_sources: S(a.knowledge_sources), example_tasks: S(a.example_tasks),
        related_agents: S(a.related_agents), system_prompt: a.system_prompt || '', source_pack: sourceTag,
      });
      summary.created.agents++;
    }

    const nameToId = new Map(db.prepare('SELECT id, name FROM agents').all().map(x => [x.name, x.id]));

    for (const c of pack.crews || []) {
      const ids = (c.members || []).map(n => nameToId.get(n)).filter(Boolean);
      if (ids.length < 2) { summary.skipped.crews++; summary.warnings.push(`crew "${c.name}" skipped (fewer than 2 known members)`); continue; }
      db.prepare(`INSERT INTO crews (name, description, agent_ids, topology, task, source) VALUES (?, ?, ?, ?, ?, 'pack')`)
        .run(c.name || 'Imported Crew', c.description || '', JSON.stringify(ids), VALID_TOPO.has(c.topology) ? c.topology : 'fan', c.task || '');
      summary.created.crews++;
    }

    for (const s of pack.schedules || []) {
      const ids = (s.agents || []).map(n => nameToId.get(n)).filter(Boolean);
      if (ids.length < 1) { summary.skipped.schedules++; summary.warnings.push(`schedule "${s.name}" skipped (no known agents)`); continue; }
      db.prepare(`INSERT INTO schedules (name, description, agent_ids, mode, task_prompt, cron_expression, recurring, allow_writes, status, next_run_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'paused', NULL)`)
        .run(s.name || 'Imported Schedule', s.description || '', JSON.stringify(ids), s.mode || 'parallel', s.task_prompt || '', s.cron_expression || '0 9 * * *', s.recurring ? 1 : 0);
      summary.created.schedules++;
    }

    for (const p of pack.pipelines || []) {
      const g = p.graph || { nodes: [], edges: [] };
      let missing = false;
      const nodes = (g.nodes || []).map(n => {
        const aid = nameToId.get(n.agent);
        if (!aid) missing = true;
        return { id: n.id, agent_id: aid || null, label: n.label || n.agent || n.id, model: n.model || '' };
      });
      if (missing) summary.warnings.push(`pipeline "${p.name}" has nodes referencing unknown agents (left unassigned)`);
      db.prepare(`INSERT INTO pipelines (name, description, graph) VALUES (?, ?, ?)`)
        .run(p.name || 'Imported Pipeline', p.description || '', JSON.stringify({ nodes, edges: g.edges || [] }));
      summary.created.pipelines++;
    }
  });
  tx();
  return summary;
}

/** Copy a read-only agency catalog agent into the runnable roster, tagged with its origin. */
export function adoptAgencyAgent(db, agencyId) {
  const ag = db.prepare('SELECT * FROM agency_agents WHERE id = ?').get(agencyId);
  if (!ag) return { error: 'Agency agent not found', status: 404 };
  const existing = db.prepare('SELECT id FROM agents WHERE name = ?').get(ag.name);
  if (existing) return { error: 'An agent with this name already exists in the roster', id: existing.id, status: 409 };

  const info = db.prepare(`INSERT INTO agents
    (name, title, tagline, color, icon_id, category, status, skills, tools, mcp_servers, knowledge_sources, example_tasks, related_agents, system_prompt, source_pack)
    VALUES (?, ?, ?, ?, 'imported', ?, 'active', '[]', '[]', '[]', '[]', '[]', '[]', ?, ?)`)
    .run(
      ag.name,
      ag.category ? `${cap(ag.category)} Specialist` : 'Adopted Agent',
      (ag.description || ag.vibe || '').slice(0, 200),
      HEX(ag.color) ? ag.color : '#14b8a6',
      VALID_CATEGORIES.has(ag.category) ? ag.category : 'automation',
      ag.system_prompt || '',
      `agency:${ag.source_file}`,
    );
  return { id: info.lastInsertRowid };
}
