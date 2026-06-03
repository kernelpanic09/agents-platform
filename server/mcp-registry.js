// MCP Server Integration Registry (P5: DB-backed).
// The static catalog below SEEDS a `mcp_servers` table on first boot; after that
// the registry is editable at runtime (add/edit/delete) with no redeploy, and
// each server exposes an env-var validation check + a remote connection test.
import { spawn } from 'child_process';
import { getSetting } from './settings.js';

const SEED_MCP = {
  kubernetes: {
    id: 'kubernetes',
    name: 'Kubernetes',
    description: 'Query and manage Kubernetes clusters — pods, deployments, services, logs, and resources',
    package: '@anthropic/mcp-kubernetes',
    category: 'infrastructure',
    color: '#326CE5',
    url: 'https://github.com/anthropics/mcp-kubernetes',
    config: {
      command: 'npx',
      args: ['-y', '@anthropic/mcp-kubernetes'],
      env: { KUBECONFIG: '/path/to/.kube/config' }
    }
  },

  context7: {
    id: 'context7',
    name: 'Context7',
    description: 'Fetch up-to-date documentation and code examples for any library, framework, or API',
    package: '@anthropic/mcp-context7',
    category: 'development',
    color: '#8B5CF6',
    url: 'https://github.com/upstash/context7',
    config: {
      command: 'npx',
      args: ['-y', '@upstash/context7-mcp@latest']
    }
  },

  playwright: {
    id: 'playwright',
    name: 'Playwright',
    description: 'Browser automation and E2E testing — navigate pages, fill forms, take screenshots, run test suites',
    package: '@anthropic/mcp-playwright',
    category: 'testing',
    color: '#2EAD33',
    url: 'https://github.com/anthropics/mcp-playwright',
    config: {
      command: 'npx',
      args: ['-y', '@anthropic/mcp-playwright']
    }
  },

  puppeteer: {
    id: 'puppeteer',
    name: 'Puppeteer',
    description: 'Control headless Chrome — scrape pages, generate PDFs, capture screenshots, test UI',
    package: '@anthropic/mcp-puppeteer',
    category: 'testing',
    color: '#00D8A2',
    url: 'https://github.com/anthropics/mcp-puppeteer',
    config: {
      command: 'npx',
      args: ['-y', '@anthropic/mcp-puppeteer']
    }
  },

  github: {
    id: 'github',
    name: 'GitHub',
    description: 'Manage repositories, issues, pull requests, branches, and code search via GitHub API',
    package: '@anthropic/mcp-github',
    category: 'development',
    color: '#F0F6FC',
    url: 'https://github.com/anthropics/mcp-github',
    config: {
      command: 'npx',
      args: ['-y', '@anthropic/mcp-github'],
      env: { GITHUB_TOKEN: '<your-github-token>' }
    }
  },

  postgres: {
    id: 'postgres',
    name: 'PostgreSQL',
    description: 'Query PostgreSQL databases — run SQL, inspect schemas, analyze data, manage migrations',
    package: '@anthropic/mcp-postgres',
    category: 'data',
    color: '#336791',
    url: 'https://github.com/anthropics/mcp-postgres',
    config: {
      command: 'npx',
      args: ['-y', '@anthropic/mcp-postgres', 'postgresql://user:pass@localhost:5432/dbname']
    }
  },

  sqlite: {
    id: 'sqlite',
    name: 'SQLite',
    description: 'Query SQLite databases — run SQL, inspect tables, analyze local data files',
    package: '@anthropic/mcp-sqlite',
    category: 'data',
    color: '#003B57',
    url: 'https://github.com/anthropics/mcp-sqlite',
    config: {
      command: 'npx',
      args: ['-y', '@anthropic/mcp-sqlite', '--db-path', '/path/to/database.db']
    }
  },

  'sequential-thinking': {
    id: 'sequential-thinking',
    name: 'Sequential Thinking',
    description: 'Step-by-step reasoning for complex problems — break down tasks, track dependencies, revise approach',
    package: '@anthropic/mcp-sequential-thinking',
    category: 'reasoning',
    color: '#7C3AED',
    url: 'https://github.com/anthropics/mcp-sequential-thinking',
    config: {
      command: 'npx',
      args: ['-y', '@anthropic/mcp-sequential-thinking']
    }
  },

  'brave-search': {
    id: 'brave-search',
    name: 'Brave Search',
    description: 'Web and local search via Brave API — find current information, research topics, discover resources',
    package: '@anthropic/mcp-brave-search',
    category: 'research',
    color: '#FB542B',
    url: 'https://github.com/anthropics/mcp-brave-search',
    config: {
      command: 'npx',
      args: ['-y', '@anthropic/mcp-brave-search'],
      env: { BRAVE_API_KEY: '<your-brave-api-key>' }
    }
  },

  memory: {
    id: 'memory',
    name: 'Memory',
    description: 'Persistent knowledge graph — store entities, relations, and observations across sessions',
    package: '@anthropic/mcp-memory',
    category: 'reasoning',
    color: '#EC4899',
    url: 'https://github.com/anthropics/mcp-memory',
    config: {
      command: 'npx',
      args: ['-y', '@anthropic/mcp-memory']
    }
  },

  filesystem: {
    id: 'filesystem',
    name: 'Filesystem',
    description: 'Read, write, search, and manage files and directories with controlled access',
    package: '@anthropic/mcp-filesystem',
    category: 'infrastructure',
    color: '#F59E0B',
    url: 'https://github.com/anthropics/mcp-filesystem',
    config: {
      command: 'npx',
      args: ['-y', '@anthropic/mcp-filesystem', '/path/to/allowed/directory']
    }
  }
};

function safeJson(s, fallback = {}) { try { return JSON.parse(s); } catch { return fallback; } }
function parseRow(r) { return r ? { ...r, enabled: !!r.enabled, config: safeJson(r.config) } : null; }

/** Create the table and seed it from the static catalog on a fresh DB. */
export function initMcpRegistry(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mcp_servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      package TEXT DEFAULT '',
      category TEXT DEFAULT 'other',
      color TEXT DEFAULT '#71717A',
      url TEXT DEFAULT '',
      config TEXT DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
  const count = db.prepare('SELECT COUNT(*) AS c FROM mcp_servers').get().c;
  if (count === 0) {
    const ins = db.prepare(`INSERT INTO mcp_servers (id, name, description, package, category, color, url, config, enabled)
      VALUES (@id, @name, @description, @package, @category, @color, @url, @config, 1)`);
    const tx = db.transaction(() => {
      for (const m of Object.values(SEED_MCP)) {
        ins.run({ id: m.id, name: m.name, description: m.description || '', package: m.package || '', category: m.category || 'other', color: m.color || '#71717A', url: m.url || '', config: JSON.stringify(m.config || {}) });
      }
    });
    tx();
    console.log(`[mcp] seeded ${Object.keys(SEED_MCP).length} MCP servers`);
  }
}

export function listMcp(db) {
  return db.prepare('SELECT * FROM mcp_servers ORDER BY category, name').all().map(parseRow);
}

export function getMcp(db, id) {
  return parseRow(db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id));
}

export function createMcp(db, m) {
  const id = String(m.id || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!id) throw new Error('id is required');
  if (!m.name || !m.name.trim()) throw new Error('name is required');
  if (db.prepare('SELECT id FROM mcp_servers WHERE id = ?').get(id)) throw new Error(`an MCP server with id "${id}" already exists`);
  db.prepare(`INSERT INTO mcp_servers (id, name, description, package, category, color, url, config, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`)
    .run(id, m.name.trim(), m.description || '', m.package || '', m.category || 'other', m.color || '#71717A', m.url || '', JSON.stringify(m.config || {}));
  return getMcp(db, id);
}

export function updateMcp(db, id, patch) {
  const existing = getMcp(db, id);
  if (!existing) return null;
  const merged = { ...existing, ...patch };
  db.prepare(`UPDATE mcp_servers SET name = ?, description = ?, package = ?, category = ?, color = ?, url = ?, config = ?, enabled = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(merged.name, merged.description || '', merged.package || '', merged.category || 'other', merged.color || '#71717A', merged.url || '',
      JSON.stringify(patch.config !== undefined ? patch.config : existing.config), patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : (existing.enabled ? 1 : 0), id);
  return getMcp(db, id);
}

export function deleteMcp(db, id) {
  return db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id).changes > 0;
}

/** Generate a settings.json-compatible MCP config block for a list of IDs. */
export function generateMcpConfig(db, ids) {
  const config = {};
  for (const id of ids) {
    const mcp = getMcp(db, id);
    if (mcp?.config) config[id] = { ...mcp.config };
  }
  return config;
}

/** Validate that the env vars an MCP server declares are present in this process. */
export function checkMcpEnv(server) {
  const env = (server?.config && server.config.env) || {};
  const required = Object.keys(env);
  const missing = required.filter(k => !process.env[k]);
  return { required, missing, ok: missing.length === 0 };
}

/**
 * Best-effort connection test: SSH to the run host and confirm the MCP launcher
 * command (e.g. `npx`) is available there. Bounded; never throws.
 */
export function testMcpConnection(server, { timeoutMs = 8000 } = {}) {
  return new Promise((resolve) => {
    const rawCmd = (server?.config && server.config.command) || 'npx';
    const cmd = String(rawCmd).replace(/[^a-zA-Z0-9._/-]/g, '');
    const target = getSetting('ssh_target');
    const key = process.env.SSH_KEY_PATH || '/secrets/ssh/id_ed25519';
    if (!cmd) return resolve({ reachable: false, detail: 'no launch command configured' });
    if (!target || /your-host/.test(target)) return resolve({ reachable: false, detail: 'SSH target not configured' });

    const remote = `command -v ${cmd} >/dev/null 2>&1 && echo FOUND || echo MISSING`;
    const args = ['-i', key, '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', target, remote];
    const child = spawn('ssh', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* dead */ } resolve({ reachable: false, detail: 'timed out' }); }, timeoutMs);
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { err += d.toString(); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return resolve({ reachable: false, detail: (err.trim().slice(0, 200)) || `ssh exited ${code}` });
      const found = out.includes('FOUND');
      resolve({ reachable: found, detail: found ? `${cmd} available on ${target}` : `${cmd} not found on host` });
    });
    child.on('error', (e) => { clearTimeout(timer); resolve({ reachable: false, detail: e.message }); });
  });
}
