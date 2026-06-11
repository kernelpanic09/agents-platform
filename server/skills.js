// Agent Skills - the SKILL.md open standard (agentskills.io / anthropics/skills).
// A skill is a folder containing a SKILL.md file: YAML frontmatter (name,
// description, optional license / allowed-tools / metadata) plus markdown
// instructions. The platform stores the file verbatim in the `skills` table,
// lets you attach skills to agents, and materializes attached skills into the
// run workspace's .claude/skills/ at dispatch - Claude Code then loads them
// natively with progressive disclosure (frontmatter in context, full body on
// demand). On the api/openai backends (plain chat completions, no skill
// runtime) attached skills are inlined into the prompt instead.
import YAML from 'yaml';

// Slugs become remote directory names under the run workspace - keep them
// strictly path-safe.
export function slugifySkill(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

/** Parse a SKILL.md document. Throws with a clear message when malformed. */
export function parseSkillMd(text) {
  const m = String(text || '').match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) throw new Error('SKILL.md must start with YAML frontmatter (--- ... ---)');
  let meta;
  try {
    meta = YAML.parse(m[1]) || {};
  } catch (err) {
    throw new Error(`invalid YAML frontmatter: ${err.message}`);
  }
  const name = String(meta.name || '').trim();
  const description = String(meta.description || '').trim();
  if (!name) throw new Error('skill frontmatter requires "name"');
  if (!description) throw new Error('skill frontmatter requires "description"');
  const allowedTools = Array.isArray(meta['allowed-tools']) ? meta['allowed-tools'].map(String) : null;
  return {
    name,
    description,
    license: meta.license ? String(meta.license) : '',
    allowedTools,
    metadata: meta.metadata && typeof meta.metadata === 'object' ? meta.metadata : null,
    body: m[2] || '',
  };
}

/** Build a SKILL.md document from fields (the editor saves through this). */
export function serializeSkillMd({ name, description, license = '', allowedTools = null, body = '' }) {
  const meta = { name, description };
  if (license) meta.license = license;
  if (Array.isArray(allowedTools) && allowedTools.length) meta['allowed-tools'] = allowedTools;
  return `---\n${YAML.stringify(meta).trimEnd()}\n---\n\n${String(body).trim()}\n`;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

function rowToSkill(r) {
  return r ? { ...r, enabled: !!r.enabled } : null;
}

export function listSkills(db) {
  return db.prepare(`
    SELECT s.*, (SELECT COUNT(*) FROM agent_skills a WHERE a.skill_id = s.id) AS attached
    FROM skills s ORDER BY s.name COLLATE NOCASE
  `).all().map(rowToSkill);
}

export function getSkill(db, id) {
  return rowToSkill(db.prepare('SELECT * FROM skills WHERE id = ?').get(id));
}

export function getSkillBySlug(db, slug) {
  return rowToSkill(db.prepare('SELECT * FROM skills WHERE slug = ?').get(slug));
}

/**
 * Create a skill from either a raw SKILL.md `content` string or individual
 * fields. Content is stored verbatim (materialized byte-for-byte at dispatch).
 */
export function createSkill(db, input = {}) {
  let parsed;
  let content;
  if (input.content) {
    parsed = parseSkillMd(input.content);
    content = input.content;
  } else {
    if (!input.name || !String(input.name).trim()) throw new Error('name is required');
    if (!input.description || !String(input.description).trim()) throw new Error('description is required');
    parsed = {
      name: String(input.name).trim(),
      description: String(input.description).trim(),
      license: input.license || '',
      allowedTools: Array.isArray(input.allowed_tools) ? input.allowed_tools : null,
      body: input.body || '',
    };
    content = serializeSkillMd(parsed);
  }
  const slug = slugifySkill(input.slug || parsed.name);
  if (!slug) throw new Error('could not derive a slug from the skill name');
  const existing = getSkillBySlug(db, slug);
  if (existing) {
    if (!input.overwrite) throw new Error(`a skill with slug "${slug}" already exists`);
    db.prepare(`UPDATE skills SET name = ?, description = ?, content = ?, source = ?, license = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(parsed.name, parsed.description, content, input.source || existing.source, parsed.license || existing.license, existing.id);
    return getSkill(db, existing.id);
  }
  const res = db.prepare(`
    INSERT INTO skills (slug, name, description, content, source, license, enabled)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(slug, parsed.name, parsed.description, content, input.source || 'custom', parsed.license || '');
  return getSkill(db, res.lastInsertRowid);
}

export function updateSkill(db, id, patch = {}) {
  const existing = getSkill(db, id);
  if (!existing) return null;
  let content = existing.content;
  let { name, description, license } = existing;
  if (patch.content) {
    const parsed = parseSkillMd(patch.content);
    content = patch.content;
    name = parsed.name;
    description = parsed.description;
    license = parsed.license;
  } else if (patch.name !== undefined || patch.description !== undefined || patch.body !== undefined || patch.license !== undefined) {
    const prior = parseSkillMd(existing.content);
    name = patch.name !== undefined ? String(patch.name).trim() : prior.name;
    description = patch.description !== undefined ? String(patch.description).trim() : prior.description;
    license = patch.license !== undefined ? patch.license : prior.license;
    const body = patch.body !== undefined ? patch.body : prior.body;
    if (!name) throw new Error('name is required');
    if (!description) throw new Error('description is required');
    content = serializeSkillMd({ name, description, license, allowedTools: prior.allowedTools, body });
  }
  const enabled = patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : (existing.enabled ? 1 : 0);
  db.prepare(`UPDATE skills SET name = ?, description = ?, content = ?, license = ?, enabled = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(name, description, content, license, enabled, id);
  return getSkill(db, id);
}

export function deleteSkill(db, id) {
  db.prepare('DELETE FROM agent_skills WHERE skill_id = ?').run(id);
  return db.prepare('DELETE FROM skills WHERE id = ?').run(id).changes > 0;
}

// ---------------------------------------------------------------------------
// Agent attachment
// ---------------------------------------------------------------------------

export function agentSkillIds(db, agentId) {
  return db.prepare('SELECT skill_id FROM agent_skills WHERE agent_id = ? ORDER BY skill_id').all(agentId).map(r => r.skill_id);
}

/** Enabled skills attached to an agent (dispatch uses this). */
export function skillsForAgent(db, agentId) {
  return db.prepare(`
    SELECT s.* FROM skills s
    JOIN agent_skills a ON a.skill_id = s.id
    WHERE a.agent_id = ? AND s.enabled = 1
    ORDER BY s.name COLLATE NOCASE
  `).all(agentId).map(rowToSkill);
}

/** Replace an agent's attached skill set. */
export function setAgentSkills(db, agentId, skillIds = []) {
  const valid = db.prepare('SELECT id FROM skills WHERE id = ?');
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM agent_skills WHERE agent_id = ?').run(agentId);
    for (const sid of [...new Set(skillIds)]) {
      if (valid.get(sid)) db.prepare('INSERT INTO agent_skills (agent_id, skill_id) VALUES (?, ?)').run(agentId, sid);
    }
  });
  tx();
  return agentSkillIds(db, agentId);
}

// ---------------------------------------------------------------------------
// Catalog (anthropics/skills) + import
// ---------------------------------------------------------------------------

const CATALOG_REPO = 'anthropics/skills';
const CATALOG_TTL_MS = 60 * 60 * 1000;
let catalogCache = { at: 0, entries: null };

// Shown when the live GitHub listing is unreachable (offline / rate-limited).
export const CURATED_CATALOG = [
  { id: 'skill-creator', path: 'skill-creator/SKILL.md', description: 'Interactive guide for authoring new skills' },
  { id: 'mcp-builder', path: 'mcp-builder/SKILL.md', description: 'Build MCP servers correctly, with eval guidance' },
  { id: 'webapp-testing', path: 'webapp-testing/SKILL.md', description: 'Drive and test local web apps with Playwright' },
  { id: 'artifacts-builder', path: 'artifacts-builder/SKILL.md', description: 'Build polished single-file HTML artifacts' },
  { id: 'canvas-design', path: 'canvas-design/SKILL.md', description: 'Visual design and layout guidance' },
  { id: 'brand-guidelines', path: 'brand-guidelines/SKILL.md', description: 'Apply consistent brand styling' },
].map(e => ({ ...e, name: e.id, raw_url: `https://raw.githubusercontent.com/${CATALOG_REPO}/main/${e.path}` }));

/** List SKILL.md files in the public catalog repo (cached 1h). */
export async function fetchCatalog({ force = false, _fetch = null } = {}) {
  if (!force && catalogCache.entries && Date.now() - catalogCache.at < CATALOG_TTL_MS) return catalogCache.entries;
  const doFetch = _fetch || fetch;
  const res = await doFetch(`https://api.github.com/repos/${CATALOG_REPO}/git/trees/main?recursive=1`, {
    headers: { 'User-Agent': 'agents-platform', Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GitHub tree listing failed: HTTP ${res.status}`);
  const data = await res.json();
  const entries = (data.tree || [])
    .filter(t => t.type === 'blob' && /(^|\/)SKILL\.md$/.test(t.path))
    .map(t => {
      const dir = t.path.replace(/\/?SKILL\.md$/, '');
      return {
        id: dir || 'root',
        name: (dir.split('/').pop() || 'root'),
        path: t.path,
        raw_url: `https://raw.githubusercontent.com/${CATALOG_REPO}/main/${t.path}`,
      };
    });
  catalogCache = { at: Date.now(), entries };
  return entries;
}

/** Normalize a github.com blob URL to its raw.githubusercontent.com form. */
export function toRawGithubUrl(url) {
  const m = String(url || '').match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
  if (m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}/${m[4]}`;
  return url;
}

/** Import a SKILL.md from a URL (github blob or raw). https only. */
export async function importSkillFromUrl(db, url, { overwrite = false, _fetch = null } = {}) {
  const raw = toRawGithubUrl(url);
  if (!/^https:\/\//.test(raw)) throw new Error('only https URLs are supported');
  const doFetch = _fetch || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let text;
  try {
    const res = await doFetch(raw, { headers: { 'User-Agent': 'agents-platform' }, signal: controller.signal });
    if (!res.ok) throw new Error(`fetch failed: HTTP ${res.status}`);
    text = await res.text();
  } finally {
    clearTimeout(timer);
  }
  const ghMatch = raw.match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\//);
  const source = ghMatch ? `${ghMatch[1]}/${ghMatch[2]}` : 'url';
  return createSkill(db, { content: text, source, overwrite });
}
