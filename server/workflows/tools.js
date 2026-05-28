import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { ragSearch } from '../rag/chat.js';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { spawn } from 'child_process';

export const ragSearchTool = tool(
  async ({ query, agentId, limit }) => {
    const results = await ragSearch(query, { agentId, limit: limit || 5 });
    if (results.length === 0) return 'No relevant documents found.';
    return results.map((r, i) => `[${i + 1}] (score: ${r.score.toFixed(3)}) ${r.text.slice(0, 500)}`).join('\n\n');
  },
  {
    name: 'rag_search',
    description: 'Search the knowledge base for relevant documents. Use this to find information before answering questions.',
    schema: z.object({
      query: z.string().describe('The search query'),
      agentId: z.number().nullable().optional().describe('Optional agent ID to scope search'),
      limit: z.number().optional().describe('Number of results (default 5)'),
    }),
  }
);

export const kubectlTool = tool(
  async ({ command }) => {
    const allowed = ['get', 'describe', 'logs', 'top'];
    const verb = command.split(' ')[0];
    if (!allowed.includes(verb)) {
      return `Error: kubectl verb "${verb}" not allowed. Allowed: ${allowed.join(', ')}`;
    }
    return new Promise((res) => {
      const child = spawn('kubectl', command.split(' '), { timeout: 30000 });
      let stdout = '', stderr = '';
      child.stdout.on('data', d => { stdout += d; });
      child.stderr.on('data', d => { stderr += d; });
      child.on('close', code => {
        res(code === 0 ? stdout.slice(0, 4000) : `Error (exit ${code}): ${stderr.slice(0, 1000)}`);
      });
      child.on('error', err => res(`Error: ${err.message}`));
    });
  },
  {
    name: 'kubectl',
    description: 'Run read-only kubectl commands. Only get, describe, logs, and top are allowed.',
    schema: z.object({
      command: z.string().describe('kubectl command without the "kubectl" prefix, e.g. "get pods -n default"'),
    }),
  }
);

const ALLOWED_DIRS = (process.env.ALLOWED_INGEST_DIRS || '/home/ubuntu/apps,/home/ubuntu/terraform,/home/ubuntu/kube').split(',');

export const fileReadTool = tool(
  async ({ path }) => {
    const resolved = resolve(path);
    if (!ALLOWED_DIRS.some(dir => resolved.startsWith(dir))) {
      return 'Error: path not in allowed directories';
    }
    try {
      const content = await readFile(resolved, 'utf-8');
      return content.slice(0, 8000);
    } catch (err) {
      return `Error reading file: ${err.message}`;
    }
  },
  {
    name: 'file_read',
    description: 'Read a file from allowed directories (apps, kube, terraform)',
    schema: z.object({
      path: z.string().describe('Absolute path to the file'),
    }),
  }
);

export function getToolsForAgent(agent) {
  const tools = [ragSearchTool, fileReadTool];
  const agentTools = JSON.parse(agent.tools || '[]');
  if (agentTools.includes('kubectl')) tools.push(kubectlTool);
  return tools;
}
