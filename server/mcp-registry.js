// MCP Server Integration Catalog
// Rich metadata for popular MCP servers used by agents

export const mcpRegistry = {
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

// Get registry as array for API responses
export function getMcpList() {
  return Object.values(mcpRegistry);
}

// Look up a single MCP server by ID
export function getMcpById(id) {
  return mcpRegistry[id] || null;
}

// Resolve an array of MCP IDs to full metadata
export function resolveMcpServers(ids) {
  return ids.map(id => mcpRegistry[id] || { id, name: id, description: 'Custom MCP server', category: 'other', color: '#71717A' });
}

// Generate a settings.json-compatible MCP config block for a list of IDs
export function generateMcpConfig(ids) {
  const config = {};
  for (const id of ids) {
    const mcp = mcpRegistry[id];
    if (mcp?.config) {
      config[id] = { ...mcp.config };
    }
  }
  return config;
}
