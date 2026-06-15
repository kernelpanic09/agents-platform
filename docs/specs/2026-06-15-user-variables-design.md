# Design: User-defined variables ("master sheet")

- **Date:** 2026-06-15
- **Status:** approved (design); pending implementation plan
- **Repo:** kernelpanic09/agents-platform (public)

## Problem

The platform ships with personas, schedules, and tasks whose prompts name a
specific environment (a cluster, a registry, a domain). A new user who clones
the repo cannot point the existing agents at *their* environment without editing
source. We want it to be "grab and go": define your environment once in the UI,
and every agent/task picks it up.

## Goal

A small, user-editable set of key/value **variables** (a "master sheet") that are
substituted into agent prompts and task prompts at dispatch via a `{{KEY}}`
placeholder. Define `REGISTRY_URL` once; every `{{REGISTRY_URL}}` in any persona
or task resolves at run time.

## Non-goals (deliberately out of scope)

- Secrets / masked values (secrets stay in env vars / K8s secrets).
- Per-agent variable overrides (global only for v1).
- Recursive expansion (a value containing `{{OTHER}}` does not re-expand).
- Genericizing the personas, or an onboarding wizard (possible fast-follows).

## Design

### 1. Data model

New table, separate from the fixed `platform_settings` schema:

```sql
CREATE TABLE IF NOT EXISTS variables (
  key         TEXT PRIMARY KEY,          -- ^[A-Z][A-Z0-9_]*$
  value       TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);
```

Key format `^[A-Z][A-Z0-9_]*$` keeps `{{KEY}}` unambiguous and guarantees it can
never collide with the existing webhook `{{payload.field}}` syntax (which contains
a dot and lowercase).

### 2. Substitution engine — `server/variables.js`

- CRUD: `listVariables(db)`, `getVariable(db, key)`, `upsertVariable(db, {key, value, description})`,
  `deleteVariable(db, key)`, `replaceAll(db, text)` (bulk `.env` import — parse `KEY=value`
  lines, validate keys, replace the whole set in a transaction).
- `varsMap(db)` -> `{ KEY: value, ... }`.
- `substitute(text, map)`: replace `{{KEY}}` **only for keys present in the map**.
  - Regex: `/\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}/g`; if the captured key is in the map,
    replace, else leave the literal token untouched (never blank it).
  - One pass; replacement values are inserted verbatim (not re-scanned).
- Validation: key matches the pattern; value length capped (e.g. 4 KB); reject
  unknown/garbage keys on write with a clear error.

### 3. Integration points

A single substitution call at the end of prompt assembly, so it covers persona
system prompt + task + inlined skills/memories, across all execution backends:

- `executor.js` `buildAgentPrompt(...)` — substitute the assembled string before return.
- `executor.js` `buildMeetingPrompt(...)` — same.
- `workflows/pipeline.js` node prompt — same (pipeline nodes build their own prompt).

`buildAgentPrompt`/`buildMeetingPrompt` gain access to the vars map. Cleanest:
pass a `vars` map in through the existing dispatch context (`dispatch-context.js`
already assembles per-dispatch data) so the prompt builders stay pure and unit-testable
(map passed in, not a DB call inside the builder). Pipeline resolves `varsMap(db)` once per run.

If no variables are defined, `substitute` is a no-op — zero behavior change.

### 4. API — `server/routes/variables.js`, mounted at `/api/variables`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/variables` | list all variables |
| POST | `/api/variables` | create one (`{key, value, description}`) |
| PUT | `/api/variables/:key` | update value/description |
| DELETE | `/api/variables/:key` | delete |
| PUT | `/api/variables` (bulk) | replace the whole set from an `.env`-style body `{ env: "KEY=value\n..." }` |

Validation errors return 400 with a message; unknown key on PUT/DELETE returns 404.

### 5. UI — `src/pages/VariablesPage.jsx`, nav entry "Variables"

- A key/value/description table: add row, inline edit, delete.
- A "Bulk edit" toggle that swaps the table for a `.env`-style `<textarea>`
  (`KEY=value` per line) with a Save that calls the bulk endpoint — this is the
  literal "paste your master sheet" affordance.
- An empty-state explaining the `{{KEY}}` convention with a copyable example.
- A one-line hint in the agent/schedule editors: "Reference variables with `{{KEY}}`."
- Nav: add to the "Build" group in `Layout.jsx`.

### 6. Demo seed — `server/demo-content.js`

Seed example variables (`CLUSTER_NAME=demo-cluster`, `CLOUD_PROVIDER=kubernetes`,
`PRIMARY_DOMAIN=demo.example.com`, `CONTAINER_REGISTRY=registry.demo.example.com:5000`)
and reference one or two from a demo schedule's task prompt, so the feature is
visibly wired rather than an orphan.

### 7. Edge cases

- Undefined `{{TOKEN}}` in a prompt: left literal (do not blank).
- Duplicate key on create: 409.
- Bulk import with an invalid key/line: reject the whole batch with the offending line (atomic).
- Value with `{{...}}` inside it: inserted verbatim, not re-expanded (documented).

### 8. Testing — `test/variables.test.js`

- `substitute()`: defined keys (single + repeated), undefined left literal,
  whitespace tolerance `{{ KEY }}`, no collision with `{{payload.x}}`, value-with-braces not re-expanded.
- key validation (accept/reject), bulk `.env` parse (valid + one-bad-line rejection).
- route CRUD + bulk happy/`400`/`404` paths.
- Keep the existing suite green.

## Files touched

New: `server/variables.js`, `server/routes/variables.js`, `src/pages/VariablesPage.jsx`,
`test/variables.test.js`.
Edited: `server/db.js` (table), `server/index.js` (mount route), `server/executor.js`
(+ `dispatch-context.js`) and `server/workflows/pipeline.js` (substitution), `server/demo-content.js`
(seed), `src/App.jsx` + `src/components/Layout.jsx` (route + nav), `README.md` (document the feature).
