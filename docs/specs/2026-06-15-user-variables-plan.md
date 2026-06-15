# User-defined Variables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user define key/value variables in the UI ("master sheet") that substitute into agent + task prompts via `{{KEY}}` at dispatch, so the shipped personas point at any environment without code edits.

**Architecture:** A standalone `server/variables.js` (pure substitution + DB CRUD) backs a `variables` table. The dispatch context already assembled per run (`dispatch-context.js`) carries a `vars` map; `buildAgentPrompt`/`buildMeetingPrompt` apply `substitute()` to the final assembled prompt; the single-agent graph path substitutes its task. A `/api/variables` router + a `VariablesPage` (table + paste-`.env` bulk editor) complete it.

**Tech Stack:** Node 20 ESM, better-sqlite3, Express, React 18 + Vite, node:test.

**Repo:** `~/portfolio/agents-platform` (public, github.com/kernelpanic09/agents-platform). Do NOT touch `~/apps/agents`.

---

## File structure

- **Create** `server/variables.js` — key validation, `parseEnv`, `substitute`, and DB CRUD (`listVariables`, `getVariable`, `createVariable`, `updateVariable`, `deleteVariable`, `varsMap`, `replaceAllFromEnv`).
- **Create** `server/routes/variables.js` — REST router.
- **Create** `src/pages/VariablesPage.jsx` — table + bulk `.env` editor.
- **Create** `test/variables.test.js` — engine + CRUD tests.
- **Modify** `server/db.js` — `variables` table + seed starter variables (first boot) + reference `{{CLUSTER_NAME}}` in one seed schedule.
- **Modify** `server/index.js` — mount `/api/variables`.
- **Modify** `server/dispatch-context.js` — add `vars` to both contexts.
- **Modify** `server/executor.js` — substitute in `buildAgentPrompt` + `buildMeetingPrompt`.
- **Modify** `server/workflows/runner.js` — substitute the single-agent task.
- **Modify** `src/App.jsx` + `src/components/Layout.jsx` — route + nav.
- **Modify** `README.md` — document the feature.

---

## Task 1: Variables engine — pure functions (key validation, parseEnv, substitute)

**Files:**
- Create: `server/variables.js`
- Test: `test/variables.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/variables.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidKey, parseEnv, substitute } from '../server/variables.js';

test('isValidKey: uppercase/underscore, must start with a letter', () => {
  for (const k of ['CLUSTER_NAME', 'A', 'X1', 'PRIMARY_DOMAIN']) assert.equal(isValidKey(k), true, k);
  for (const k of ['lower', '1LEAD', 'has-dash', 'has.dot', '', 'WITH SPACE', 'payload.x']) assert.equal(isValidKey(k), false, k);
});

test('substitute: replaces defined keys, repeats, and tolerates inner whitespace', () => {
  const map = { CLUSTER_NAME: 'prod-1', REGISTRY: 'reg.example.com' };
  assert.equal(substitute('on {{CLUSTER_NAME}} push to {{ REGISTRY }} for {{CLUSTER_NAME}}', map),
    'on prod-1 push to reg.example.com for prod-1');
});

test('substitute: leaves undefined tokens literal and never collides with {{payload.x}}', () => {
  const map = { CLUSTER_NAME: 'prod-1' };
  assert.equal(substitute('{{UNKNOWN}} and {{payload.field}} stay; {{CLUSTER_NAME}} goes', map),
    '{{UNKNOWN}} and {{payload.field}} stay; prod-1 goes');
});

test('substitute: a value containing braces is inserted verbatim (no re-expansion)', () => {
  const map = { A: '{{B}}', B: 'deep' };
  assert.equal(substitute('{{A}}', map), '{{B}}');
});

test('substitute: empty/edge inputs', () => {
  assert.equal(substitute('', { A: '1' }), '');
  assert.equal(substitute('no tokens', {}), 'no tokens');
  assert.equal(substitute(null, { A: '1' }), '');
});

test('parseEnv: KEY=value lines, comments, blanks, = in value, trims key', () => {
  const { vars, errors } = parseEnv('# comment\nCLUSTER_NAME=prod-1\n\nDSN = postgres://a?b=c \nBAD KEY=x\nlower=y');
  assert.deepEqual(vars, { CLUSTER_NAME: 'prod-1', DSN: 'postgres://a?b=c' });
  assert.equal(errors.length, 2); // "BAD KEY" and "lower"
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd ~/portfolio/agents-platform && node --test test/variables.test.js`
Expected: FAIL — `Cannot find module '../server/variables.js'`.

- [ ] **Step 3: Write the engine (pure functions only for now)**

```js
// server/variables.js
// User-defined variables ("master sheet"). Non-secret key/value pairs that get
// substituted into agent + task prompts at dispatch via {{KEY}}. Keys are
// uppercase/underscore so {{KEY}} can never collide with the webhook
// {{payload.field}} syntax (dotted/lowercase). Stored plaintext; not for secrets.

export const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
export const VALUE_MAX = 4096;

export function isValidKey(key) {
  return typeof key === 'string' && KEY_RE.test(key);
}

// Replace {{KEY}} (optional inner whitespace) for keys present in `map`.
// Unknown tokens are left literal; values are inserted verbatim (one pass).
const TOKEN_RE = /\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}/g;
export function substitute(text, map = {}) {
  if (!text) return '';
  return String(text).replace(TOKEN_RE, (whole, key) =>
    Object.prototype.hasOwnProperty.call(map, key) ? map[key] : whole);
}

// Parse a .env-style block into { vars, errors }. Skips blanks and # comments.
// Invalid keys are collected in errors (the caller decides whether to reject).
export function parseEnv(text) {
  const vars = {};
  const errors = [];
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) { errors.push(`no '=' in line: ${line.slice(0, 60)}`); continue; }
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!isValidKey(key)) { errors.push(`invalid key: ${key.slice(0, 40)}`); continue; }
    if (value.length > VALUE_MAX) { errors.push(`value too long for ${key}`); continue; }
    vars[key] = value;
  }
  return { vars, errors };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test test/variables.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/variables.js test/variables.test.js
git commit -m "feat(variables): substitution engine + .env parsing (pure)"
```

---

## Task 2: Variables table + DB CRUD

**Files:**
- Modify: `server/db.js` (add table next to the `skills`/`agent_memories` tables)
- Modify: `server/variables.js` (add CRUD + `varsMap` + `replaceAllFromEnv`)
- Test: `test/variables.test.js` (append)

- [ ] **Step 1: Add the table to `server/db.js`**

Find the block that creates the `agent_memories` table (added previously) and add immediately after it, inside `initDb`:

```js
  // User-defined variables ("master sheet"): {{KEY}} substituted into prompts at dispatch.
  db.exec(`
    CREATE TABLE IF NOT EXISTS variables (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL DEFAULT '',
      description TEXT DEFAULT '',
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now'))
    );
  `);
```

- [ ] **Step 2: Write failing CRUD tests (append to `test/variables.test.js`)**

```js
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { after } from 'node:test';
import {
  listVariables, getVariable, createVariable, updateVariable, deleteVariable,
  varsMap, replaceAllFromEnv,
} from '../server/variables.js';

const dir = mkdtempSync(join(tmpdir(), 'vars-'));
process.env.DATA_DIR = dir;
const { initDb } = await import('../server/db.js');
const db = initDb();
after(() => { try { db.close(); } catch {} rmSync(dir, { recursive: true, force: true }); });

test('createVariable: validates key, rejects dup, stores', () => {
  const v = createVariable(db, { key: 'CLUSTER_NAME', value: 'prod-1', description: 'cluster' });
  assert.equal(v.key, 'CLUSTER_NAME');
  assert.throws(() => createVariable(db, { key: 'bad key', value: 'x' }), /invalid key/);
  assert.throws(() => createVariable(db, { key: 'CLUSTER_NAME', value: 'y' }), /already exists/);
});

test('update / get / delete', () => {
  updateVariable(db, 'CLUSTER_NAME', { value: 'prod-2', description: 'edited' });
  assert.equal(getVariable(db, 'CLUSTER_NAME').value, 'prod-2');
  assert.equal(updateVariable(db, 'NOPE', { value: 'z' }), null);
  assert.equal(deleteVariable(db, 'CLUSTER_NAME'), true);
  assert.equal(getVariable(db, 'CLUSTER_NAME'), null);
});

test('varsMap: flat key->value object', () => {
  createVariable(db, { key: 'A', value: '1' });
  createVariable(db, { key: 'B', value: '2' });
  assert.deepEqual(varsMap(db), { A: '1', B: '2' });
});

test('replaceAllFromEnv: atomic replace; bad line rejects whole batch', () => {
  assert.throws(() => replaceAllFromEnv(db, 'A=ok\nbad line here'), /invalid|no '='/);
  assert.deepEqual(varsMap(db), { A: '1', B: '2' }); // unchanged after rejection
  const r = replaceAllFromEnv(db, '# sheet\nCLUSTER_NAME=prod-1\nREGION=us-west-2');
  assert.equal(r.count, 2);
  assert.deepEqual(varsMap(db), { CLUSTER_NAME: 'prod-1', REGION: 'us-west-2' });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `node --test test/variables.test.js`
Expected: FAIL — `createVariable is not a function`.

- [ ] **Step 4: Add CRUD to `server/variables.js`**

```js
function row(r) { return r || null; }

export function listVariables(db) {
  return db.prepare('SELECT key, value, description, created_at, updated_at FROM variables ORDER BY key').all();
}

export function getVariable(db, key) {
  return row(db.prepare('SELECT key, value, description, created_at, updated_at FROM variables WHERE key = ?').get(key));
}

function validate(key, value) {
  if (!isValidKey(key)) throw new Error(`invalid key "${key}": must match ${KEY_RE}`);
  if (String(value ?? '').length > VALUE_MAX) throw new Error(`value too long (max ${VALUE_MAX})`);
}

export function createVariable(db, { key, value = '', description = '' }) {
  validate(key, value);
  if (getVariable(db, key)) throw new Error(`variable "${key}" already exists`);
  db.prepare('INSERT INTO variables (key, value, description) VALUES (?, ?, ?)').run(key, String(value), String(description || ''));
  return getVariable(db, key);
}

export function updateVariable(db, key, { value, description } = {}) {
  const existing = getVariable(db, key);
  if (!existing) return null;
  const nextValue = value !== undefined ? String(value) : existing.value;
  if (nextValue.length > VALUE_MAX) throw new Error(`value too long (max ${VALUE_MAX})`);
  const nextDesc = description !== undefined ? String(description) : existing.description;
  db.prepare(`UPDATE variables SET value = ?, description = ?, updated_at = datetime('now') WHERE key = ?`).run(nextValue, nextDesc, key);
  return getVariable(db, key);
}

export function deleteVariable(db, key) {
  return db.prepare('DELETE FROM variables WHERE key = ?').run(key).changes > 0;
}

export function varsMap(db) {
  const map = {};
  for (const r of db.prepare('SELECT key, value FROM variables').all()) map[r.key] = r.value;
  return map;
}

// Replace the entire variable set from a .env-style block (atomic). Throws on any bad line.
export function replaceAllFromEnv(db, text) {
  const { vars, errors } = parseEnv(text);
  if (errors.length) throw new Error(errors.join('; '));
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM variables').run();
    const ins = db.prepare('INSERT INTO variables (key, value) VALUES (?, ?)');
    for (const [k, v] of Object.entries(vars)) ins.run(k, v);
  });
  tx();
  return { count: Object.keys(vars).length };
}
```

- [ ] **Step 5: Run to verify pass**

Run: `node --test test/variables.test.js`
Expected: PASS (10 tests).

- [ ] **Step 6: Commit**

```bash
git add server/db.js server/variables.js test/variables.test.js
git commit -m "feat(variables): table + CRUD + atomic .env replace"
```

---

## Task 3: REST API + mount

**Files:**
- Create: `server/routes/variables.js`
- Modify: `server/index.js`

- [ ] **Step 1: Write the router**

```js
// server/routes/variables.js
import { Router } from 'express';
import { listVariables, getVariable, createVariable, updateVariable, deleteVariable, replaceAllFromEnv } from '../variables.js';

export default function variablesRouter(db) {
  const router = Router();

  router.get('/', (req, res) => res.json(listVariables(db)));

  router.post('/', (req, res) => {
    try {
      res.status(201).json(createVariable(db, req.body || {}));
    } catch (err) {
      res.status(/already exists/.test(err.message) ? 409 : 400).json({ error: err.message });
    }
  });

  // Bulk replace from a .env-style block: { env: "KEY=value\n..." }
  router.put('/', (req, res) => {
    try {
      const r = replaceAllFromEnv(db, String(req.body?.env ?? ''));
      res.json({ ...r, variables: listVariables(db) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.put('/:key', (req, res) => {
    try {
      const v = updateVariable(db, req.params.key, req.body || {});
      if (!v) return res.status(404).json({ error: 'variable not found' });
      res.json(v);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/:key', (req, res) => {
    if (!deleteVariable(db, req.params.key)) return res.status(404).json({ error: 'variable not found' });
    res.json({ success: true });
  });

  return router;
}
```

- [ ] **Step 2: Mount in `server/index.js`**

Add with the other route imports (near `skillsRouter`):
```js
import variablesRouter from './routes/variables.js';
```
Add with the other `app.use(...)` mounts (near `/api/skills`):
```js
app.use('/api/variables', variablesRouter(db));
```

- [ ] **Step 3: Smoke-test the wiring**

Run:
```bash
DEMO_MODE=true PORT=3011 DATA_DIR=/tmp/vars-smoke node server/index.js >/tmp/vars-smoke.log 2>&1 &
until curl -s -m2 http://localhost:3011/health >/dev/null; do sleep 1; done
curl -s -X POST http://localhost:3011/api/variables -H 'Content-Type: application/json' -d '{"key":"CLUSTER_NAME","value":"prod-1"}'
curl -s http://localhost:3011/api/variables
fuser -k 3011/tcp 2>/dev/null
```
Expected: POST returns the created variable; GET lists it.

- [ ] **Step 4: Commit**

```bash
git add server/routes/variables.js server/index.js
git commit -m "feat(variables): REST API mounted at /api/variables"
```

---

## Task 4: Substitute at dispatch (the integration)

**Files:**
- Modify: `server/dispatch-context.js` (add `vars`)
- Modify: `server/executor.js` (`buildAgentPrompt`, `buildMeetingPrompt`)
- Modify: `server/workflows/runner.js` (single-agent task)
- Test: `test/variables.test.js` (append a build-prompt test)

- [ ] **Step 1: Write the failing integration test (append)**

```js
import { buildAgentPrompt, buildMeetingPrompt } from '../server/executor.js';

test('buildAgentPrompt/buildMeetingPrompt substitute ctx.vars', () => {
  const agent = { name: 'Atlas', title: 'Infra', system_prompt: 'Audit the {{CLUSTER_NAME}} cluster.' };
  const ctx = { vars: { CLUSTER_NAME: 'prod-1' } };
  const p = buildAgentPrompt(agent, 'check {{CLUSTER_NAME}} nodes', null, 'read_only', ctx);
  assert.ok(p.includes('Audit the prod-1 cluster.'));
  assert.ok(p.includes('check prod-1 nodes'));
  assert.ok(!p.includes('{{CLUSTER_NAME}}'));
  // no ctx.vars -> unchanged (no-op)
  const p2 = buildAgentPrompt(agent, 'check {{CLUSTER_NAME}} nodes', null, 'read_only', {});
  assert.ok(p2.includes('{{CLUSTER_NAME}}'));

  const m = buildMeetingPrompt([agent], 'discuss {{CLUSTER_NAME}}', 'read_only', ctx);
  assert.ok(m.includes('discuss prod-1'));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/variables.test.js`
Expected: FAIL — output still contains `{{CLUSTER_NAME}}`.

- [ ] **Step 3: Apply substitution in `server/executor.js`**

Add the import near the top (with the other local imports):
```js
import { substitute } from './variables.js';
```
In `buildAgentPrompt`, change the final return from `return parts.join('');` to:
```js
  const assembled = parts.join('');
  return ctx?.vars ? substitute(assembled, ctx.vars) : assembled;
```
In `buildMeetingPrompt`, change the final return the same way:
```js
  const assembled = parts.join('');
  return ctx?.vars ? substitute(assembled, ctx.vars) : assembled;
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test test/variables.test.js`
Expected: PASS.

- [ ] **Step 5: Thread `vars` into the dispatch context (`server/dispatch-context.js`)**

Add the import:
```js
import { varsMap } from './variables.js';
```
In `agentDispatchContext`, add `vars: varsMap(db)` to the returned `ctx` object literal (alongside `mcpConfig`, `skills`, `memories`). In `meetingDispatchContext`, add `vars: varsMap(db)` to its returned `ctx` object the same way.

- [ ] **Step 6: Substitute the single-agent graph task (`server/workflows/runner.js`)**

Add the import (with runner's other imports):
```js
import { substitute } from '../variables.js';
```

In the single-agent branch (`agents.length === 1`), where `ctx` is created via `agentDispatchContext`, change the `graph.invoke({ task: schedule.task_prompt, ... })` call so the task is substituted:
```js
        task: substitute(schedule.task_prompt, ctx.vars || {}),
```

- [ ] **Step 7: Run the full suite + build**

Run: `npm test 2>&1 | grep -E "^# (tests|pass|fail)"` then `npm run build 2>&1 | tail -1`
Expected: all tests pass; build succeeds.

- [ ] **Step 8: Commit**

```bash
git add server/dispatch-context.js server/executor.js server/workflows/runner.js test/variables.test.js
git commit -m "feat(variables): substitute {{KEY}} into prompts at dispatch"
```

---

## Task 5: Seed starter variables + reference one in a schedule (first boot)

**Files:**
- Modify: `server/db.js`

- [ ] **Step 1: Seed starter variables on a fresh DB**

In `initDb`, after the schedule-template seed block, add (seeds only when the table is empty, like the other seeds):
```js
  // Starter variables so a new user has examples to edit (a "grab and go" master sheet).
  if (db.prepare('SELECT COUNT(*) AS c FROM variables').get().c === 0) {
    const seedVar = db.prepare('INSERT INTO variables (key, value, description) VALUES (?, ?, ?)');
    const tx = db.transaction(() => {
      seedVar.run('CLUSTER_NAME', 'demo-cluster', 'Name of the cluster/environment agents operate on');
      seedVar.run('CLOUD_PROVIDER', 'kubernetes', 'Where workloads run (kubernetes, aws, gcp, ...)');
      seedVar.run('PRIMARY_DOMAIN', 'demo.example.com', 'Primary domain for services');
      seedVar.run('CONTAINER_REGISTRY', 'registry.demo.example.com:5000', 'Container image registry');
    });
    tx();
    console.log('[db] seeded 4 starter variables');
  }
```

- [ ] **Step 2: Reference `{{CLUSTER_NAME}}` in one seed schedule**

In the `SEED_SCHEDULES` array, change the "Nightly Infrastructure Audit" prompt to use the variable. Find its row and update the prompt string to begin:
```
Walk the {{CLUSTER_NAME}} cluster top to bottom; flag any node over 80% CPU or with disk pressure and verify last night's backups.
```

- [ ] **Step 3: Verify on a fresh DB**

Run:
```bash
rm -rf /tmp/vars-seed && DEMO_MODE=true ENABLE_SCHEDULER=true PORT=3012 DATA_DIR=/tmp/vars-seed node server/index.js >/tmp/vars-seed.log 2>&1 &
until curl -s -m2 http://localhost:3012/health >/dev/null; do sleep 1; done
curl -s http://localhost:3012/api/variables | python3 -c "import json,sys;print('vars:',[v['key'] for v in json.load(sys.stdin)])"
fuser -k 3012/tcp 2>/dev/null
```
Expected: `vars: ['CLOUD_PROVIDER', 'CLUSTER_NAME', 'CONTAINER_REGISTRY', 'PRIMARY_DOMAIN']`.

- [ ] **Step 4: Commit**

```bash
git add server/db.js
git commit -m "feat(variables): seed starter variables + reference {{CLUSTER_NAME}} in a schedule"
```

---

## Task 6: Variables UI page + nav

**Files:**
- Create: `src/pages/VariablesPage.jsx`
- Modify: `src/App.jsx`, `src/components/Layout.jsx`

- [ ] **Step 1: Write the page**

```jsx
// src/pages/VariablesPage.jsx
import { useState, useEffect, useCallback } from 'react';
import { Variable, Plus, Trash2, FileText, Table } from 'lucide-react';

export default function VariablesPage() {
  const [vars, setVars] = useState([]);
  const [bulk, setBulk] = useState(false);
  const [envText, setEnvText] = useState('');
  const [draft, setDraft] = useState({ key: '', value: '', description: '' });
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    fetch('/api/variables').then(r => r.json()).then(setVars).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setEnvText(vars.map(v => `${v.key}=${v.value}`).join('\n')); }, [vars]);

  const add = async () => {
    setError(null);
    const res = await fetch('/api/variables', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft),
    });
    if (!res.ok) { setError((await res.json()).error); return; }
    setDraft({ key: '', value: '', description: '' });
    load();
  };

  const save = async (key, patch) => {
    await fetch(`/api/variables/${key}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    });
    load();
  };

  const remove = async (key) => {
    if (!window.confirm(`Delete {{${key}}}?`)) return;
    await fetch(`/api/variables/${key}`, { method: 'DELETE' });
    load();
  };

  const saveBulk = async () => {
    setError(null);
    const res = await fetch('/api/variables', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ env: envText }),
    });
    if (!res.ok) { setError((await res.json()).error); return; }
    setBulk(false);
    load();
  };

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2.5">
            <Variable className="text-violet-400" size={22} /> Variables
          </h1>
          <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
            Your environment's "master sheet". Reference any variable in an agent's system prompt
            or a task with <code className="text-zinc-300">{'{{KEY}}'}</code> - it's substituted at dispatch.
            Non-secret values only (keep keys/tokens in env/secrets).
          </p>
        </div>
        <button onClick={() => setBulk(b => !b)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-white/10 text-zinc-300 hover:bg-white/5">
          {bulk ? <><Table size={15} /> Table</> : <><FileText size={15} /> Bulk edit (.env)</>}
        </button>
      </div>

      {error && <div className="text-sm text-red-400 bg-red-950/30 border border-red-900/50 rounded-lg px-3 py-2 mb-4">{error}</div>}

      {bulk ? (
        <div>
          <textarea value={envText} onChange={(e) => setEnvText(e.target.value)} rows={14} spellCheck={false}
            placeholder={'CLUSTER_NAME=prod-1\nPRIMARY_DOMAIN=example.com'}
            className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-violet-500/50" />
          <p className="text-xs text-zinc-500 mt-1">One <code>KEY=value</code> per line. Keys are UPPER_SNAKE. Saving replaces the whole set.</p>
          <button onClick={saveBulk} className="mt-3 px-4 py-2 text-sm rounded-lg bg-violet-600 hover:bg-violet-500 font-medium">Save sheet</button>
        </div>
      ) : (
        <div className="space-y-2">
          {vars.map(v => (
            <div key={v.key} className="flex items-center gap-2 bg-zinc-900/50 border border-white/5 rounded-lg px-3 py-2">
              <code className="text-sm text-violet-300 font-mono w-48 shrink-0">{v.key}</code>
              <input defaultValue={v.value} onBlur={(e) => e.target.value !== v.value && save(v.key, { value: e.target.value })}
                className="flex-1 bg-zinc-950/60 border border-white/10 rounded px-2 py-1 text-sm" />
              <input defaultValue={v.description} placeholder="description"
                onBlur={(e) => e.target.value !== v.description && save(v.key, { description: e.target.value })}
                className="flex-1 bg-zinc-950/60 border border-white/10 rounded px-2 py-1 text-sm text-zinc-400" />
              <button onClick={() => remove(v.key)} className="p-1.5 text-zinc-500 hover:text-red-400"><Trash2 size={14} /></button>
            </div>
          ))}
          {vars.length === 0 && <div className="text-sm text-zinc-500 border border-dashed border-white/10 rounded-xl py-8 text-center">No variables yet.</div>}

          <div className="flex items-center gap-2 pt-3 border-t border-white/5 mt-3">
            <input value={draft.key} onChange={(e) => setDraft({ ...draft, key: e.target.value.toUpperCase() })} placeholder="NEW_KEY"
              className="w-48 shrink-0 bg-zinc-950 border border-white/10 rounded px-2 py-1 text-sm font-mono" />
            <input value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} placeholder="value"
              className="flex-1 bg-zinc-950 border border-white/10 rounded px-2 py-1 text-sm" />
            <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="description"
              className="flex-1 bg-zinc-950 border border-white/10 rounded px-2 py-1 text-sm" />
            <button onClick={add} disabled={!draft.key} className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-zinc-800 border border-white/10 hover:bg-zinc-700 disabled:opacity-40"><Plus size={14} /> Add</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the route in `src/App.jsx`**

With the other lazy imports:
```jsx
const VariablesPage = lazy(() => import('./pages/VariablesPage'));
```
With the other routes (near `/skills`):
```jsx
              <Route
                path="/variables"
                element={<Suspense fallback={SuspenseLoader}><VariablesPage /></Suspense>}
              />
```

- [ ] **Step 3: Add nav in `src/components/Layout.jsx`**

Add `Variable` to the lucide import list, and add to the `Build` group's `items` array:
```jsx
      { to: '/variables', label: 'Variables', icon: Variable, match: (p) => p === '/variables' },
```

- [ ] **Step 4: Build to verify it compiles**

Run: `npm run build 2>&1 | tail -1`
Expected: `built in ...` (success, no errors).

- [ ] **Step 5: Commit**

```bash
git add src/pages/VariablesPage.jsx src/App.jsx src/components/Layout.jsx
git commit -m "feat(variables): Variables page (table + .env bulk editor) + nav"
```

---

## Task 7: Document in README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a feature bullet + a Variables subsection**

Under "## Features", insert a new section immediately after "Settings Hub" and renumber the sections that follow by +1 (the file currently runs 1-14; Settings Hub is #9, so this becomes #10 and RAG..Portability shift to 11..15). Use the heading number that follows Settings Hub:
```markdown
### 10. Environment Variables ("master sheet")
- Define non-secret key/value variables once in the UI (or paste a whole `.env`-style sheet); reference them anywhere in a persona's system prompt or a task with `{{KEY}}`
- Substituted at dispatch across every execution backend, so the shipped personas point at *your* environment (cluster, cloud, domain, registry) with no code edits
- Undefined `{{tokens}}` are left untouched; non-secret only (secrets stay in env / K8s)
```
Add `/api/variables` to the architecture route list and add a short API table:
```markdown
### Variables
| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/api/variables` | list / create a variable |
| PUT | `/api/variables` | bulk replace from a `.env`-style body `{ env }` |
| PUT/DELETE | `/api/variables/:key` | update / delete |
```

- [ ] **Step 2: Verify no em dashes introduced**

Run: `grep -c '—' README.md`
Expected: `0`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document the environment-variables master sheet"
```

---

## Task 8: Final verification + push

- [ ] **Step 1: Full suite + build + secrets scan**

```bash
npm test 2>&1 | grep -E "^# (tests|pass|fail)"
npm run build 2>&1 | tail -1
/home/ubuntu/portfolio/scan.sh . 2>/dev/null | tail -1
```
Expected: all tests pass; build succeeds; "no hard failures".

- [ ] **Step 2: Live click-through (optional but recommended)**

Boot demo on a temp dir (`run_in_background`), open `/variables`, add a variable, fire a schedule that references `{{CLUSTER_NAME}}`, confirm the dispatched prompt shows the substituted value (check the run detail / per-agent output), then `fuser -k <port>/tcp`.

- [ ] **Step 3: Push**

```bash
git push origin main
```
Expected: refs updated on github.com/kernelpanic09/agents-platform.

---

## Notes for the implementer
- Commit identity is already `kernelpanic09 <103852527+kernelpanic09@users.noreply.github.com>`; do NOT add a Co-Authored-By trailer (portfolio-repo rule).
- Run everything in `~/portfolio/agents-platform`. Never touch `~/apps/agents`.
- Kill demo servers by port (`fuser -k <port>/tcp`), never `pkill -f "server/index.js"` (that pattern matches the shell running it and self-kills).
