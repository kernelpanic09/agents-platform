import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initDb } from '../server/db.js';
import { initSettings, setSetting } from '../server/settings.js';
import { initMcpRegistry } from '../server/mcp-registry.js';
import {
  parseSkillMd, serializeSkillMd, slugifySkill,
  createSkill, getSkill, listSkills, updateSkill, deleteSkill,
  setAgentSkills, skillsForAgent, agentSkillIds,
  toRawGithubUrl, importSkillFromUrl,
} from '../server/skills.js';
import { agentDispatchContext, meetingDispatchContext } from '../server/dispatch-context.js';
import { buildRemoteCommand, encodeSkillsForRemote, workspacePath, buildAgentPrompt } from '../server/executor.js';

const dir = mkdtempSync(join(tmpdir(), 'skills-'));
process.env.DATA_DIR = dir;
const db = initDb();
initSettings(db);
initMcpRegistry(db);
after(() => { try { db.close(); } catch {} rmSync(dir, { recursive: true, force: true }); });

const SKILL_MD = `---
name: K8s Health Report
description: Produce a structured cluster health report with sections for nodes, workloads, and storage.
license: MIT
---

# K8s Health Report

When asked for a cluster health report, structure it as:
1. Nodes (capacity, pressure)
2. Workloads (crashloops, restarts)
3. Storage (volume health)
`;

test('parseSkillMd: frontmatter + body', () => {
  const p = parseSkillMd(SKILL_MD);
  assert.equal(p.name, 'K8s Health Report');
  assert.match(p.description, /structured cluster health report/);
  assert.equal(p.license, 'MIT');
  assert.match(p.body, /## |# K8s Health Report/);
});

test('parseSkillMd: rejects missing frontmatter and missing required fields', () => {
  assert.throws(() => parseSkillMd('no frontmatter here'), /frontmatter/);
  assert.throws(() => parseSkillMd('---\ndescription: x\n---\nbody'), /requires "name"/);
  assert.throws(() => parseSkillMd('---\nname: x\n---\nbody'), /requires "description"/);
});

test('serialize -> parse roundtrip preserves fields', () => {
  const text = serializeSkillMd({ name: 'My Skill', description: 'Does things.', license: 'MIT', allowedTools: ['Bash', 'Read'], body: '# Steps\nDo the thing.' });
  const p = parseSkillMd(text);
  assert.equal(p.name, 'My Skill');
  assert.equal(p.description, 'Does things.');
  assert.deepEqual(p.allowedTools, ['Bash', 'Read']);
  assert.match(p.body, /Do the thing/);
});

test('slugifySkill: path-safe slugs', () => {
  assert.equal(slugifySkill('K8s Health Report'), 'k8s-health-report');
  assert.equal(slugifySkill('  Wéird--Náme!! '), 'w-ird-n-me');
});

test('CRUD: create from content, list with attached count, update, delete', () => {
  const s = createSkill(db, { content: SKILL_MD });
  assert.equal(s.slug, 'k8s-health-report');
  assert.equal(s.source, 'custom');
  assert.equal(s.enabled, true);
  assert.throws(() => createSkill(db, { content: SKILL_MD }), /already exists/);

  const fromFields = createSkill(db, { name: 'Runbook Writer', description: 'Writes runbooks.', body: 'Sections: context, steps, rollback.' });
  assert.equal(fromFields.slug, 'runbook-writer');
  assert.match(fromFields.content, /^---\n/);

  const all = listSkills(db);
  assert.equal(all.length, 2);
  assert.equal(all[0].attached, 0);

  const upd = updateSkill(db, fromFields.id, { description: 'Writes excellent runbooks.', enabled: false });
  assert.equal(upd.enabled, false);
  assert.match(upd.content, /excellent runbooks/);

  assert.equal(deleteSkill(db, fromFields.id), true);
  assert.equal(getSkill(db, fromFields.id), null);
});

test('attach: setAgentSkills replaces the set; skillsForAgent excludes disabled', () => {
  const a = createSkill(db, { name: 'A Skill', description: 'a', body: 'a' });
  const b = createSkill(db, { name: 'B Skill', description: 'b', body: 'b' });
  setAgentSkills(db, 1, [a.id, b.id, 99999]);
  assert.deepEqual(agentSkillIds(db, 1), [a.id, b.id].sort((x, y) => x - y));

  updateSkill(db, b.id, { enabled: false });
  const active = skillsForAgent(db, 1);
  assert.deepEqual(active.map(s => s.slug), ['a-skill']);

  setAgentSkills(db, 1, [a.id]);
  assert.deepEqual(agentSkillIds(db, 1), [a.id]);
});

test('dispatch context: ssh gets materializable skills, api gets inline, audit always', () => {
  const k8s = getSkill(db, 1); // k8s-health-report from earlier test
  setAgentSkills(db, 1, [k8s.id]);
  const agent = { id: 1, name: 'Atlas', mcp_servers: '[]' };

  const ssh = agentDispatchContext(db, agent, { backend: 'subscription' });
  assert.deepEqual(ssh.provisioned.skills, ['k8s-health-report']);
  assert.equal(ssh.skills[0].slug, 'k8s-health-report');
  assert.match(ssh.skills[0].content, /^---\n/);
  assert.equal(ssh.inlineSkills, null);

  const api = agentDispatchContext(db, agent, { backend: 'api' });
  assert.equal(api.skills, null);
  assert.equal(api.inlineSkills[0].name, 'K8s Health Report');
  assert.ok(!api.inlineSkills[0].body.includes('---\nname:'), 'inline body must not include frontmatter');

  setSetting('skill_provisioning', 'off');
  const off = agentDispatchContext(db, agent, { backend: 'subscription' });
  assert.deepEqual(off.provisioned.skills, []);
  setSetting('skill_provisioning', 'on');
});

test('meeting context: skill union deduped across agents', () => {
  const k8s = getSkill(db, 1);
  const extra = createSkill(db, { name: 'Extra', description: 'x', body: 'x' });
  setAgentSkills(db, 1, [k8s.id, extra.id]);
  setAgentSkills(db, 2, [k8s.id]);
  const ctx = meetingDispatchContext(db, [{ id: 1, mcp_servers: '[]' }, { id: 2, mcp_servers: '[]' }], { backend: 'subscription' });
  assert.deepEqual(ctx.provisioned.skills.sort(), ['extra', 'k8s-health-report']);
  setAgentSkills(db, 2, []);
});

test('encodeSkillsForRemote: rejects unsafe slugs, bounds payload', () => {
  const ok = encodeSkillsForRemote([{ slug: 'fine-slug', content: 'hello' }, { slug: '../evil', content: 'x' }, { slug: 'UPPER', content: 'x' }]);
  assert.equal(ok.length, 1);
  assert.equal(ok[0].slug, 'fine-slug');
  assert.equal(Buffer.from(ok[0].b64, 'base64').toString(), 'hello');
  assert.equal(encodeSkillsForRemote([]), null);
});

test('buildRemoteCommand: workspace mode materializes skills, no shell vars', () => {
  const cmd = buildRemoteCommand({
    b64Prompt: 'UFJPTVBU', cwd: '/tmp', model: 'sonnet',
    skills: [{ slug: 'k8s-health-report', b64: 'U0tJTEw=' }],
    workdir: '/tmp/agents-ws-abc123',
  });
  assert.ok(cmd.includes("trap 'rm -rf /tmp/agents-ws-abc123' EXIT;"));
  assert.ok(cmd.includes('mkdir -p /tmp/agents-ws-abc123/.claude/skills/k8s-health-report &&'));
  assert.ok(cmd.includes("echo 'U0tJTEw=' | base64 -d > /tmp/agents-ws-abc123/.claude/skills/k8s-health-report/SKILL.md &&"));
  assert.ok(cmd.includes('cd /tmp/agents-ws-abc123 &&'));
  assert.ok(!cmd.includes('$'), 'must survive double shell evaluation');
});

test('buildRemoteCommand: workspace mode carries MCP config inside the workspace + --add-dir for app runs', () => {
  const cmd = buildRemoteCommand({
    b64Prompt: 'UFJPTVBU', cwd: '/home/ubuntu/apps/control', model: 'sonnet',
    mcpB64: 'TUNQ', skills: [{ slug: 's1', b64: 'QQ==' }],
    workdir: '/tmp/agents-ws-xyz', addDir: '/home/ubuntu/apps/control',
  });
  assert.ok(cmd.includes("echo 'TUNQ' | base64 -d > /tmp/agents-ws-xyz/mcp-config.json &&"));
  assert.ok(cmd.includes('--mcp-config /tmp/agents-ws-xyz/mcp-config.json --strict-mcp-config'));
  assert.ok(cmd.includes('--add-dir /home/ubuntu/apps/control'));
  assert.ok(!cmd.includes('$'));
});

test('workspacePath: unique', () => {
  assert.notEqual(workspacePath(), workspacePath());
  assert.match(workspacePath(), /^\/tmp\/agents-ws-[0-9a-f]{12}$/);
});

test('buildAgentPrompt: inline skills section appears for api/openai contexts only', () => {
  const agent = { name: 'Atlas', title: 'Infra', system_prompt: 'You are Atlas.' };
  const ctx = { inlineSkills: [{ name: 'K8s Health Report', description: 'desc', body: 'Use sections.' }] };
  const withSkills = buildAgentPrompt(agent, 'check the cluster', null, 'read_only', ctx);
  assert.match(withSkills, /# Skills/);
  assert.match(withSkills, /K8s Health Report/);
  const without = buildAgentPrompt(agent, 'check the cluster', null, 'read_only', { inlineSkills: null });
  assert.ok(!without.includes('# Skills'));
});

test('toRawGithubUrl: blob -> raw, raw passthrough', () => {
  assert.equal(
    toRawGithubUrl('https://github.com/anthropics/skills/blob/main/skill-creator/SKILL.md'),
    'https://raw.githubusercontent.com/anthropics/skills/main/skill-creator/SKILL.md',
  );
  const raw = 'https://raw.githubusercontent.com/x/y/main/SKILL.md';
  assert.equal(toRawGithubUrl(raw), raw);
});

test('importSkillFromUrl: fetches, parses, tags source (stubbed fetch)', async () => {
  const _fetch = async () => ({ ok: true, text: async () => SKILL_MD.replace('K8s Health Report', 'Imported Skill') });
  const s = await importSkillFromUrl(db, 'https://github.com/anthropics/skills/blob/main/imported/SKILL.md', { _fetch });
  assert.equal(s.slug, 'imported-skill');
  assert.equal(s.source, 'anthropics/skills');
});
