// Per-agent dispatch context: assembles everything an agent's declarations
// contribute to a single dispatch. Phase 1: MCP server provisioning (registry
// entries -> a real --mcp-config for the claude CLI). Later phases extend this
// with skills and memories, so call sites (runner, pipelines, graphs) stay
// one-line consumers instead of each re-implementing the lookups.
import { getMcp } from './mcp-registry.js';
import { skillsForAgent, parseSkillMd } from './skills.js';
import { memoriesForPrompt } from './memory.js';
import { getSetting } from './settings.js';

// Inline fallback (api/openai backends) caps each skill body so a long manual
// can't crowd out the actual task.
const MAX_INLINE_SKILL_CHARS = 6000;

// Seed/catalog configs ship placeholder values like '<your-github-token>' or
// '/path/to/.kube/config'. Those are documentation, not configuration: drop
// them at provision time so the run host's own environment supplies the real
// value. Real secrets stay in host env / K8s secrets, never in the DB.
const PLACEHOLDER_RE = /<[^>]*>|\/path\/to\//;

export function sanitizeMcpEnv(env = {}) {
  const out = {};
  for (const [k, v] of Object.entries(env || {})) {
    if (typeof v === 'string' && PLACEHOLDER_RE.test(v)) continue;
    out[k] = v;
  }
  return out;
}

function parseIds(raw) {
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw || '[]') : (raw || []);
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Build the `{ mcpServers: {...} }` config block for one agent's declared MCP
 * server ids. Returns null when nothing is provisionable: no declarations,
 * entries disabled/unknown/launch-command-less, or the feature toggled off.
 */
export function buildAgentMcp(db, agent) {
  if (String(getSetting('mcp_provisioning')) === 'off') return null;
  const ids = parseIds(agent?.mcp_servers);
  if (!ids.length) return null;
  const servers = {};
  const provisioned = [];
  for (const id of ids) {
    let m = null;
    try { m = getMcp(db, id); } catch { m = null; }
    if (!m || !m.enabled || !m.config || !m.config.command) continue;
    const entry = { command: m.config.command };
    if (Array.isArray(m.config.args)) entry.args = m.config.args;
    const env = sanitizeMcpEnv(m.config.env);
    if (Object.keys(env).length) entry.env = env;
    servers[id] = entry;
    provisioned.push(id);
  }
  if (!provisioned.length) return null;
  return { config: { mcpServers: servers }, ids: provisioned };
}

/** Enabled, attached skills for one agent, or null. Toggle-aware. */
export function buildAgentSkills(db, agent) {
  if (String(getSetting('skill_provisioning')) === 'off') return null;
  if (agent?.id == null) return null;
  let list = [];
  try { list = skillsForAgent(db, agent.id); } catch { list = []; }
  return list.length ? list : null;
}

function toInline(skill) {
  let body = '';
  try { body = parseSkillMd(skill.content).body; } catch { body = skill.content || ''; }
  return { name: skill.name, description: skill.description, body: String(body).trim().slice(0, MAX_INLINE_SKILL_CHARS) };
}

/**
 * Everything one agent's declarations contribute to one dispatch:
 *   {
 *     mcpConfig,                       // -> claude --mcp-config (ssh backend)
 *     skills: [{slug, content}],       // -> materialized .claude/skills/ (ssh backend)
 *     inlineSkills: [{name, ...}],     // -> appended to the prompt (api/openai backends)
 *     provisioned: { mcp: [], skills: [] }   // -> runs.provisioning audit trail
 *   }
 * MCP only applies to the subscription (claude CLI) backend - the api/openai
 * backends are single chat completions with no tool runtime.
 */
export function agentDispatchContext(db, agent, { backend = 'subscription' } = {}) {
  const ctx = { mcpConfig: null, skills: null, inlineSkills: null, memories: null, provisioned: { mcp: [], skills: [] } };
  if (backend === 'subscription') {
    const mcp = buildAgentMcp(db, agent);
    if (mcp) {
      ctx.mcpConfig = mcp.config;
      ctx.provisioned.mcp = mcp.ids;
    }
  }
  const skills = buildAgentSkills(db, agent);
  if (skills) {
    ctx.provisioned.skills = skills.map(s => s.slug);
    if (backend === 'subscription') ctx.skills = skills.map(s => ({ slug: s.slug, content: s.content }));
    else ctx.inlineSkills = skills.map(toInline);
  }
  // Episodic memory: backend-agnostic (always prompt-level).
  if (agent?.id != null) {
    try {
      const mem = memoriesForPrompt(db, agent.id);
      if (mem.length) ctx.memories = mem;
    } catch { /* memory is best-effort */ }
  }
  return ctx;
}

/** True when a context carries anything worth recording on the run. */
export function hasProvisioning(ctx) {
  return !!(ctx && (ctx.provisioned.mcp.length || ctx.provisioned.skills.length));
}

/** Union context for meeting mode (one dispatch voices all agents). */
export function meetingDispatchContext(db, agents = [], opts = {}) {
  const backend = opts.backend || 'subscription';
  const ctx = { mcpConfig: null, skills: null, inlineSkills: null, provisioned: { mcp: [], skills: [] } };

  if (backend === 'subscription') {
    const servers = {};
    const ids = [];
    for (const agent of agents) {
      const mcp = buildAgentMcp(db, agent);
      if (!mcp) continue;
      for (const [id, cfg] of Object.entries(mcp.config.mcpServers)) {
        if (!servers[id]) {
          servers[id] = cfg;
          ids.push(id);
        }
      }
    }
    if (ids.length) {
      ctx.mcpConfig = { mcpServers: servers };
      ctx.provisioned.mcp = ids;
    }
  }

  // Skills: union across participants, deduped by slug.
  const bySlug = new Map();
  for (const agent of agents) {
    for (const s of buildAgentSkills(db, agent) || []) {
      if (!bySlug.has(s.slug)) bySlug.set(s.slug, s);
    }
  }
  if (bySlug.size) {
    const skills = [...bySlug.values()];
    ctx.provisioned.skills = skills.map(s => s.slug);
    if (backend === 'subscription') ctx.skills = skills.map(s => ({ slug: s.slug, content: s.content }));
    else ctx.inlineSkills = skills.map(toInline);
  }
  return ctx;
}
