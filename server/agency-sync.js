// Fetches agent definitions from https://github.com/msitarzewski/agency-agents
// Parses YAML frontmatter + markdown body, stores in SQLite

const REPO_OWNER = 'msitarzewski';
const REPO_NAME = 'agency-agents';
const BRANCH = 'main';
const RAW_BASE = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}`;
const API_BASE = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;

// Map text color names to hex
const COLOR_MAP = {
  red: '#EF4444',
  orange: '#F97316',
  amber: '#F59E0B',
  yellow: '#EAB308',
  lime: '#84CC16',
  green: '#22C55E',
  emerald: '#10B981',
  teal: '#14B8A6',
  cyan: '#06B6D4',
  sky: '#0EA5E9',
  blue: '#3B82F6',
  indigo: '#6366F1',
  violet: '#8B5CF6',
  purple: '#A855F7',
  fuchsia: '#D946EF',
  pink: '#EC4899',
  rose: '#F43F5E',
  slate: '#64748B',
  gray: '#6B7280',
  zinc: '#71717A',
  stone: '#78716C',
  white: '#FFFFFF',
};

function resolveColor(color) {
  if (!color) return '#8B5CF6';
  if (color.startsWith('#')) return color;
  return COLOR_MAP[color.toLowerCase()] || '#8B5CF6';
}

// Simple YAML frontmatter parser (handles the agency-agents format)
function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const yamlStr = match[1];
  const body = match[2];
  const meta = {};
  const services = [];
  let currentService = null;

  for (const line of yamlStr.split('\n')) {
    // Service array item
    if (/^\s+-\s+name:\s*(.*)/.test(line)) {
      currentService = { name: RegExp.$1.trim().replace(/^["']|["']$/g, '') };
      services.push(currentService);
      continue;
    }
    if (currentService && /^\s+url:\s*(.*)/.test(line)) {
      currentService.url = RegExp.$1.trim().replace(/^["']|["']$/g, '');
      continue;
    }
    if (currentService && /^\s+tier:\s*(.*)/.test(line)) {
      currentService.tier = RegExp.$1.trim().replace(/^["']|["']$/g, '');
      continue;
    }

    // Top-level key: value
    const kvMatch = line.match(/^(\w+):\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1];
      let val = kvMatch[2].trim().replace(/^["']|["']$/g, '');
      if (key === 'services') {
        // services header, skip - we parse children
        currentService = null;
        continue;
      }
      currentService = null;
      meta[key] = val;
    }
  }

  if (services.length > 0) {
    meta.services = services;
  }

  return { meta, body };
}

// Category directories in the repo
const CATEGORIES = [
  'academic', 'design', 'engineering', 'game-development', 'integrations',
  'marketing', 'paid-media', 'product', 'project-management', 'sales',
  'spatial-computing', 'specialized', 'strategy', 'support', 'testing',
];

export async function syncAgencyAgents(db) {
  console.log('Starting agency-agents sync from GitHub...');

  try {
    // Get the full repo tree
    const treeRes = await fetch(`${API_BASE}/git/trees/${BRANCH}?recursive=1`, {
      headers: { 'User-Agent': 'agents-app' },
    });

    if (!treeRes.ok) {
      throw new Error(`GitHub API returned ${treeRes.status}: ${treeRes.statusText}`);
    }

    const treeData = await treeRes.json();

    // Filter for .md files in category directories
    const agentFiles = treeData.tree.filter(item => {
      if (item.type !== 'blob' || !item.path.endsWith('.md')) return false;
      const parts = item.path.split('/');
      return parts.length === 2 && CATEGORIES.includes(parts[0]);
    });

    console.log(`Found ${agentFiles.length} agent files to sync`);

    // Fetch files in batches of 15
    const agents = [];
    const batchSize = 15;

    for (let i = 0; i < agentFiles.length; i += batchSize) {
      const batch = agentFiles.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (file) => {
          const res = await fetch(`${RAW_BASE}/${file.path}`, {
            headers: { 'User-Agent': 'agents-app' },
          });
          if (!res.ok) return null;
          const content = await res.text();
          return { path: file.path, content };
        })
      );

      for (const result of results) {
        if (result.status !== 'fulfilled' || !result.value) continue;
        const { path, content } = result.value;
        const { meta, body } = parseFrontmatter(content);

        if (!meta.name) continue;

        const parts = path.split('/');
        const category = parts[0];

        agents.push({
          name: meta.name,
          description: meta.description || '',
          color: resolveColor(meta.color),
          emoji: meta.emoji || '',
          vibe: meta.vibe || '',
          category,
          source_file: path,
          services: JSON.stringify(meta.services || []),
          system_prompt: body.trim(),
        });
      }
    }

    // Insert into DB (clear and re-insert)
    const insertAgent = db.prepare(`
      INSERT OR REPLACE INTO agency_agents (name, description, color, emoji, vibe, category, source_file, services, system_prompt, synced_at)
      VALUES (@name, @description, @color, @emoji, @vibe, @category, @source_file, @services, @system_prompt, datetime('now'))
    `);

    const insertAll = db.transaction((items) => {
      db.prepare('DELETE FROM agency_agents').run();
      for (const item of items) {
        insertAgent.run(item);
      }
    });

    insertAll(agents);
    console.log(`Synced ${agents.length} agency agents`);
    return { count: agents.length, categories: [...new Set(agents.map(a => a.category))] };
  } catch (err) {
    console.error('Agency sync failed:', err.message);
    throw err;
  }
}
