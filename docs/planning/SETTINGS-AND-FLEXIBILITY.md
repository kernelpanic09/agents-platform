# Settings & Flexibility Architecture

> **Companion to [`ROADMAP.md`](./ROADMAP.md) → "Settings Pillars (the Configurability Surface)".** That section names the eight pillars; this document is the *contract* behind them - the full settings surface, a navigable information architecture, the precedence/override resolution model, and a setting-by-setting map of where every knob lives, what it controls, and its default. This is a **planning artifact only**: no code changes are implied by its existence.

---

## Why This Document Exists

The owner's north star is unambiguous: **make agents-platform deeply configurable - lots of custom settings and genuine flexibility - and make that configurability a visible design value, not an afterthought.** ([ROADMAP](./ROADMAP.md) Theme **T4**, Guiding Principle #4.)

Today the platform fails that bar in three concrete ways, all grounded in the recon:

1. **Configuration is invisible and immovable.** There are **17+ environment variables** (`PORT`, `SSH_TARGET`, `CLAUDE_MODEL`, `MAX_CONCURRENT_RUNS`, `RUN_TIMEOUT_MS`, `DEMO_MODE`, …) and **zero settings UI**. Changing `SSH_TARGET` or the model fallback requires editing a Kubernetes Secret and restarting the pod. To a hiring manager, the app reads as a black box that needs `kubectl` to tune.
2. **The model surface is a 3-value enum.** `safeModel()` in `executor.js` validates against a hardcoded `[haiku, sonnet, opus]` allowlist, and `MODEL_MAP` in `workflows/graphs.js` pins versioned IDs. A newer Claude release cannot be used without a code deploy, and the **pricing table hardcodes versioned IDs** (`claude-haiku-4-5-…`, etc.) so unknown models silently fall back to Haiku pricing - underreporting cost.
3. **Two configuration knobs are ghosts.** `schedules.allow_writes` is stored, displayed, and Zod-validated but **never read** by `executor.js` or `workflows/runner.js`. The `cost_budgets` table is declared in `db.js` with `daily_limit_usd` / `monthly_limit_usd` / `alert_threshold` but has **no routes, no enforcement, no UI**. Both signal unfinished work to any reviewer (ROADMAP Principle #3: *no ghost schema*).

This document specifies the system that closes all three gaps: a **live, DB-backed settings layer** where env vars seed defaults and database values override at runtime *without a redeploy*, organized into a navigable tree, resolved through a deterministic precedence chain, and exposed as the platform's most legible proof that it was *designed to be operated*.

### The Flexibility Thesis

A portfolio platform earns "flexible" only if a viewer can *turn knobs and watch behavior change*. Five agents running in parallel, each with a **different model badge** and a **different safety tier**, is a 10-second demo that communicates sophisticated orchestration far more directly than any architecture diagram. Every design choice below optimizes for that: **configuration that is visible, layered, and consequential at execution time.**

---

## Design Principles for the Settings Surface

These extend the ROADMAP's five guiding principles to the specific domain of configuration.

| # | Principle | Consequence |
|---|---|---|
| **S1** | **Env seeds, DB overrides, request refines.** | Env vars provide first-boot defaults; a `platform_settings` row overrides at runtime without restart; per-agent / per-schedule / per-run values refine further down the chain. |
| **S2** | **Every hardcoded constant is a candidate knob.** | The 3-value model enum, the `MAX_PARALLEL_PER_RUN=3` batch size, the 3 meeting rounds, the 4000-char SUMMARY cap, the pricing table - all become settings, not source edits. |
| **S3** | **Deterministic precedence, always.** | A single resolver (`resolveSetting(key, ctx)`) computes the effective value for any key given a `{agent, schedule, run}` context. No scattered `process.env.X ?? default` reads. |
| **S4** | **Inherit by default, override by exception.** | A schedule with no model uses the agent's; an agent with no model uses the platform default. Overriding is opt-in and always visible as a badge in the UI. |
| **S5** | **No ghost knobs.** | A setting that exists is wired. `allow_writes` becomes a real safety tier; `cost_budgets` becomes real enforcement. If we cannot wire it this cycle, we do not ship the column. |
| **S6** | **Settings are portable artifacts.** | Platform settings, safety policies, agent profiles, and themes all export to YAML/JSON and import back - generalizing the existing `agency-sync` ingest pattern (T8). Configuration is GitOps-able. |
| **S7** | **Safe-to-edit-live vs. requires-restart is explicit.** | Each setting declares `editable_live` and `requires_restart`. The UI never lets a user think a change took effect when it did not (e.g. `PORT` needs a restart; `MAX_CONCURRENT_RUNS` does not). |
| **S8** | **Secrets never become settings.** | `ANTHROPIC_API_KEY`, `SSH_KEY_PATH`, webhook secrets, API-key hashes stay in K8s Secrets / dedicated encrypted stores - never in the editable `platform_settings` table or any export. |

---

## The Eight Settings Pillars

These are the durable categories from the [ROADMAP](./ROADMAP.md). This document is their detailed contract; each maps to one or more roadmap themes and lands in a specific phase.

| # | Pillar | What it governs | Storage | Theme | Phase |
|---|--------|-----------------|---------|-------|-------|
| **1** | **Platform Settings** (live, DB-backed) | Global runtime defaults: model allowlist, concurrency, timeouts, SSH target, retention, safety-preamble text, pricing table | `platform_settings` (key/value) | T4 | P2 |
| **2** | **Per-Agent Profiles** | Inference profile (`model_config`), default safety tier, `extra_preamble`, `cwd_override`, `max_turns`, `env_overrides`, memory, tags + custom fields | `agents.model_config` + `agent_settings` | T4, T6 | P2 / P4 |
| **3** | **Per-Schedule Execution Policy** | Priority, timeout override, `allow_writes`/safety tier, `allowed_commands`, retry policy, notification routing, retention override, stream mode | `schedules.execution_policy` | T3, T4, T9 | P2 / P3 |
| **4** | **Safety & Governance Policies** | Named reusable tiers (read-only / controlled-write / supervised) with capability flags, namespace allowlists, denied commands, dry-run | `safety_policies` | T3 | P2 |
| **5** | **Budgets & Cost Controls** | Per-agent / per-schedule / global daily + monthly caps, alert threshold, exceeded-action, reset day, editable pricing | `cost_budgets` (wired) + `budgets_spent` | T2, T3 | P2 |
| **6** | **Eval & Judge Configuration** | Judge model, custom scoring dimensions + weights, pass threshold, judge prompt template, per-suite baseline + regression threshold | `judge_configs` + `eval_suites.judge_config_id` | T6 | P4 |
| **7** | **Notifications & Integrations** | Multi-channel routing rules, inbound webhook tokens, outbound webhooks, API-key scopes + rate limits | `notification_channels`, `schedule_notifications`, `webhooks`, `api_keys` | T7 | P3 |
| **8** | **Appearance & Presentation** | Accent color, dark-mode variant, density, terminal theme, presentation/focus mode | `localStorage` (per-user) + exportable theme JSON | T4 | P2 |

> **Storage strategy at a glance:** *global* settings → one `platform_settings` key/value table; *entity-scoped* settings → JSON columns or sidecar tables on `agents` / `schedules`; *reusable artifacts* → their own tables (`safety_policies`, `judge_configs`, `notification_channels`); *per-viewer cosmetics* → `localStorage`. Secrets → never in any of the above.

---

## Settings Information Architecture (the Navigable Tree)

A single **`/settings`** route is the operator control plane. It is organized as a left-rail tree that mirrors the eight pillars, with entity-scoped settings *also* reachable in-context (e.g. an agent's inference profile is editable both under **Settings → Agents** and on the **Agent Profile** page itself - same backend, two entry points).

```
/settings
│
├── General                                    [Pillar 1 · platform_settings]
│   ├── Dispatch          SSH_TARGET, SSH_KEY_PATH (masked), DISPATCH defaults
│   ├── Concurrency       MAX_CONCURRENT_RUNS, MAX_PARALLEL_PER_RUN
│   ├── Timeouts          RUN_TIMEOUT_MS, per-call SIGKILL grace
│   ├── Scheduler         ENABLE_SCHEDULER, watchdog grace, hydrate-on-boot
│   └── Demo / Env        DEMO_MODE status, APP_BASE_URL, effective-env viewer (read-only)
│
├── Models                                     [Pillar 1 + 2]
│   ├── Allowlist         comma-separated model IDs (extends haiku/sonnet/opus)
│   ├── Default model     CLAUDE_MODEL fallback
│   ├── Pricing table     per-model input/output $/1k  (editable - no code deploy)
│   └── Inference defaults temperature, max_tokens, top_p, extended-thinking (platform floor)
│
├── Agents                                     [Pillar 2 · per-agent]
│   └── <Agent> ─┬── Inference Profile   model, temperature, max_tokens, top_p, thinking
│                ├── Execution           cwd_override, max_turns, env_overrides
│                ├── Safety              default_safety_tier (→ Pillar 4 policy)
│                ├── Prompt              extra_preamble, system_prompt + version history (T6)
│                ├── Memory              memory_enabled, memory_depth, recency_weight (T6)
│                ├── Tools / MCP         per-agent tool grants, MCP activations
│                └── Tags & Custom       arbitrary key/value metadata
│
├── Schedules                                  [Pillar 3 · per-schedule]
│   └── <Schedule> ─┬── Execution Policy priority, timeout_override, stream_mode
│                   ├── Safety            allow_writes / safety_tier, allowed_commands
│                   ├── Retry             max_attempts, backoff_strategy, retry_on
│                   ├── Retention         override of global retention
│                   ├── Notifications     channel routing (→ Pillar 7)
│                   └── Triggers          webhook tokens, depends_on, trigger_on_* (T7)
│
├── Safety Policies                            [Pillar 4 · reusable artifacts]
│   ├── Read-Only         (default, immutable)
│   ├── Controlled-Write  allow_file_write, allowed_namespaces, require_dry_run
│   ├── Supervised        full access behind approval gate (T3)
│   └── + Custom Policy    capability builder · export YAML
│
├── Budgets & Costs                            [Pillar 5 · cost_budgets wired]
│   ├── Global            daily / monthly cap, alert_threshold, reset day
│   ├── Per-Agent         spend caps + utilization bars
│   ├── Per-Schedule      spend caps + utilization bars
│   └── Exceeded action   skip · queue · notify-only
│
├── Eval & Judge                               [Pillar 6 · judge_configs]
│   ├── Judge model        haiku / sonnet / opus / custom
│   ├── Dimensions         name · description · weight  (default: relevance/accuracy/completeness/format)
│   ├── Pass threshold     default 0.6
│   ├── Judge prompt       template with {{output}} {{expected}} {{dimensions}}
│   └── Regression         per-suite baseline_run_id + regression_threshold
│
├── Notifications & Integrations               [Pillar 7]
│   ├── Channels           Discord / Slack / email / generic webhook  (+ test-ping)
│   ├── Routing rules      on-start / on-success / on-failure · filter_expr
│   ├── Inbound webhooks   tokens · payload templates · rate limits
│   ├── Outbound webhooks  event subscriptions · HMAC secret · delivery log
│   └── API Keys           create / scope / rate-limit / revoke / last-used
│
├── Appearance                                 [Pillar 8 · localStorage]
│   ├── Accent color       violet (default) · indigo · cyan · emerald · rose · amber
│   ├── Dark variant       zinc-950 · slate-950 · glass-on-image
│   ├── Density            compact · comfortable · spacious
│   ├── Terminal theme     for the live run stream (dark-green / amber / blue / per-agent)
│   └── Presentation mode  focus view · export/import theme JSON
│
└── Danger Zone                                [cross-pillar]
    ├── Run retention      purge runs older than N days (row-count preview)
    ├── Reset demo data    re-seed synthetic traces + eval suite
    └── Export / Import     full settings-pack.yaml (secrets excluded)
```

### IA Rules

- **Two entry points, one source of truth.** Entity-scoped panels (Agents, Schedules) appear under `/settings` *and* on the entity's own page. Both `PUT` the same backend; there is no second store.
- **Effective-value badges everywhere.** Any field showing an *inherited* value renders an "inherited from <scope>" badge; overriding flips it to an "override" badge. The user always knows which layer is winning (Principle S4).
- **Live vs. restart is visually distinct.** Fields tagged `requires_restart` show a restart-pill and a "queued for next restart" state after save; `editable_live` fields apply immediately (Principle S7).
- **Search across the tree.** A settings search box ("Cmd+K in settings") jumps to any knob by key or description - important once the surface is large.

---

## The Precedence / Override Model

The heart of the flexibility story is a **deterministic 5-layer resolution chain**. The same key resolves to one effective value given a request context, computed by a single resolver so behavior is never surprising.

### Precedence Order (lowest → highest)

```
  code default  <  global (platform_settings)  <  workspace*  <  agent  <  schedule  <  run
  (env-seeded)      (DB, live-editable)            (future)       (profile) (exec policy) (override)
       │                    │                          │             │           │          │
       └─ lowest priority ──┴──────────────────────────┴─────────────┴───────────┴──── highest
```

> **Canonical chain (per the brief):** `global < workspace < agent < schedule < run`, sitting atop the env-seeded **code default**. Higher layers win. A `null`/unset value at any layer means "inherit from the layer below."

\* **Workspace** is included as a first-class layer in the precedence model for forward-compatibility (Ledger's multi-workspace proposal), but it is explicitly **Not Now** for the single-user homelab (see ROADMAP *Not Now* list). Until workspaces ship, the resolver simply skips that layer - the chain degrades cleanly to `global < agent < schedule < run`.

### Resolution Semantics

| Rule | Behavior |
|------|----------|
| **Null means inherit** | A `null` / empty value at any layer is transparent - resolution falls through to the next-lower layer. Only a *set* value overrides. |
| **Most-specific wins** | The highest layer with a set value determines the effective value. A run-level model override beats schedule, agent, and global. |
| **Validation at the resolved value** | The model allowlist is checked against the *resolved* model, not the layer it came from - a run override of an unlisted model is rejected just like a schedule one. |
| **Lists merge, scalars replace** | Scalars (model, temperature) replace. Additive lists (`extra_preamble`, `env_overrides`, `denied_commands`) **merge** lower→higher so an agent's base preamble + a schedule's extra both apply. Merge vs. replace is declared per setting. |
| **Safety is floor-clamped** | Safety is the one inversion: a *more permissive* lower layer cannot be overridden to *less* safe by a higher one without explicit gating. The platform `safety_floor` setting clamps the maximum tier any run can reach (e.g. "no run may exceed Controlled-Write unless `SUPERVISED_OVERRIDE` is set"). Safety never silently escalates. |
| **Explainability** | The resolver can return *why*: `resolveSetting('model', ctx)` → `{ value: 'opus', source: 'schedule', overrides: ['agent:sonnet','global:sonnet'] }`. The UI uses this to render the inheritance badges. |

### Worked Examples

**Example A - model resolution for one agent in a run**

| Layer | `model` value | Notes |
|-------|--------------|-------|
| code default (env) | `sonnet` | `CLAUDE_MODEL` env seed |
| global (`platform_settings`) | *(null)* | inherit |
| agent (`Atlas.model_config`) | `sonnet` | Atlas tuned for precise infra queries |
| schedule (`execution_policy`) | *(null)* | inherit |
| run (one-shot override) | `opus` | operator escalated this run |
| **→ effective** | **`opus`** | source: `run`; overrides agent+global |

**Example B - safety tier with floor clamp**

| Layer | `safety_tier` | Notes |
|-------|--------------|-------|
| code default | `read_only` | universal preamble today |
| global `safety_floor` | `controlled_write` | platform ceiling for non-supervised runs |
| agent (`Flux.default_tier`) | `controlled_write` | Flux is a GitOps writer |
| schedule | `supervised` | user requested full access |
| **→ effective** | **`controlled_write`** | clamped by `safety_floor`; `supervised` requires `SUPERVISED_OVERRIDE` env + approval gate (T3) |

**Example C - additive merge of preambles**

| Layer | `extra_preamble` (additive) |
|-------|------------------------------|
| agent (Atlas) | "Always check node memory before recommending restarts." |
| schedule (Nightly Audit) | "Scope findings to the `media` namespace only." |
| **→ effective composed prompt** | base safety preamble **+** agent line **+** schedule line (merged lower→higher) |

### Resolver Contract (pseudocode)

```js
// One resolver to rule them all. No scattered process.env reads.
function resolveSetting(key, ctx /* {agent, schedule, run} */) {
  const layers = [
    codeDefault(key),                 // env-seeded constant
    platformSettings.get(key),        // DB, live-editable
    ctx.workspace?.[key],             // Not Now - skipped until workspaces ship
    ctx.agent?.[key],
    ctx.schedule?.[key],
    ctx.run?.[key],
  ];
  let value = codeDefault(key), source = 'default', overrides = [];
  for (const [i, layer] of layers.entries()) {
    if (layer == null) continue;                 // null = inherit
    if (isAdditive(key)) value = merge(value, layer); // lists merge
    else { if (source !== 'default') overrides.push(`${source}:${value}`); value = layer; source = layerName(i); }
  }
  value = clampSafety(key, value);               // safety floor never escalates
  validate(key, value);                          // allowlist etc. on resolved value
  return { value, source, overrides };
}
```

Every dispatch path (`executor.js`, `workflows/runner.js`, `eval/runner.js`, `rag/chat.js`) consumes `resolveSetting()` instead of reading env or hardcoded constants - collapsing today's duplicated `executor.js` / `runner.js` logic into one resolution point (addresses the recon's "duplicate execution logic" smell).

---

## Extensibility Points (How the Platform Stays Flexible Over Time)

Configurability is not just knobs - it is **seams that let an operator add capability without a code deploy.** Each extensibility point reuses an existing primitive so it stays buildable by one engineer.

| Extensibility point | What it lets you add | Reuses | Phase |
|---|---|---|---|
| **Model allowlist + pricing table** | A newer Claude model (free-text ID) with correct cost accounting, by editing a settings row - not `executor.js`/`graphs.js` | `platform_settings` | P2 |
| **Safety policies as artifacts** | A new named permission tier (e.g. "media-stack-write, no kubectl") selectable per agent/schedule, exportable as YAML | `safety_policies` table | P2 |
| **DB-backed MCP registry** | A new MCP server (any npm package) registered + health-checked from the UI, replacing the static 11-entry `mcp-registry.js` object | `agency-sync` SSH probe pattern | P5 |
| **Pluggable tool registry** | An HTTP tool (`{method,url_template,auth_env_var}`) or path-allowlisted script tool, granted per-agent - gated behind the safety engine | `workflows/tools.js` dynamic load | later (post-governance) |
| **Agent packs (import/export)** | Adopt a community agent from a GitHub YAML pack into the *runnable* roster (finishes what read-only `agency-sync` half-built) | `agency-sync` YAML frontmatter parser | P5 |
| **Schedule templates** | Seed the 10 production schedules + share new ones as YAML - fixes "fresh deploy looks empty" | seed function + `schedule_templates` | P1 / P5 |
| **Inbound webhooks** | An external event source (Prometheus, GitHub Actions, n8n) fires a run via `POST /api/webhooks/:token` | `scheduler.fireRun()` | P3 |
| **Outbound webhooks** | Any HTTP consumer subscribes to run events with HMAC-signed payloads | run state transitions | later |
| **Notification channels** | A new Slack/email/webhook destination, DB-driven, no env-var redeploy | `notification_channels` | P3 |
| **Theme JSON import/export** | A shared accent/density/terminal theme across deployments | `localStorage` + JSON schema | P2 |
| **Agents-as-config (YAML)** | An entire agent - prompt, model_config, tools, safety tier - expressed as a versioned `.yaml` artifact and round-tripped | YAML serializer | P5 |
| **Settings-pack export** | The whole `platform_settings` + policies as one `settings-pack.yaml` for backup/GitOps (secrets excluded) | settings table | P2 |

> **Guardrail (Principle S8 + ROADMAP Not-Now):** the pluggable HTTP/script tool registry expands the attack surface meaningfully, so it is deliberately **gated behind the safety policy engine** and sequenced *after* governance lands. Flexibility never outruns safety.

---

## Master Settings Map

The full surface, setting by setting: **where it lives**, **what it controls**, and its **default**. Grouped by pillar. `env` = environment seed; `DB:<table>` = database-backed (live-editable unless noted); `JSON:<column>` = JSON blob column; `localStorage` = per-viewer. *Italic defaults* mark values that are hardcoded constants today and become settings under this plan.

### Pillar 1 - Platform Settings (global, live, DB-backed)

| Setting | Lives in | Controls | Default | Live? |
|---|---|---|---|---|
| `model_allowlist` | `DB:platform_settings` (seed: code) | Which model IDs are valid anywhere (extends the 3-value enum) | `haiku,sonnet,opus` | ✅ |
| `default_model` (`CLAUDE_MODEL`) | `env` → `DB:platform_settings` | Fallback model when no agent/schedule/run model set | `sonnet` | ✅ |
| `model_pricing` | `DB:platform_settings` | Per-model input/output $/1k for cost accounting (no code deploy) | *hardcoded versioned table* | ✅ |
| `MAX_CONCURRENT_RUNS` | `env` → `DB:platform_settings` | Global cap on simultaneous runs in the queue | `2` | ✅ |
| `MAX_PARALLEL_PER_RUN` | `env` → `DB:platform_settings` | Max simultaneous SSH calls within one parallel run | `3` | ✅ |
| `RUN_TIMEOUT_MS` | `env` → `DB:platform_settings` | Per-SSH-call SIGKILL timeout | `900000` (15 min) | ✅ |
| `SSH_TARGET` | `env` → `DB:platform_settings` | Remote host for `claude -p` dispatch + app discovery | `ubuntu@your-host` | ✅ |
| `SSH_KEY_PATH` | `env` (Secret, masked) | SSH private key path (never DB, never exported) | `/secrets/ssh/id_ed25519` | ❌ secret |
| `execution_backend` | `env` → `DB:platform_settings` | Default dispatch backend: SSH (`subscription` tokens, no API cost) vs Anthropic `api` | `subscription` | ✅ |
| `ENABLE_SCHEDULER` | `env` → `DB:platform_settings` | Gates scheduler hydrate + manual `/run` | `false` | restart |
| `DEMO_MODE` | `env` (read-only in UI) | Seeds synthetic traces + eval suite; disables SSH single-agent | `false` | restart |
| `safety_preamble_text` | `DB:platform_settings` | Editable base read-only preamble text | *constant in `safety-prompt.js`* | ✅ |
| `safety_floor` | `DB:platform_settings` | Max tier any run may reach without `SUPERVISED_OVERRIDE` | `read_only` | ✅ |
| `meeting_rounds` | `DB:platform_settings` | Rounds in meeting mode | *`3` hardcoded* | ✅ |
| `summary_max_chars` | `DB:platform_settings` | Cap on extracted SUMMARY line | *`2000`* | ✅ |
| `retention_max_age_days` | `DB:platform_settings` | Global run-retention age before cleanup (protects 1Gi PVC) | *(none today)* `90` | ✅ |
| `retention_max_runs_per_schedule` | `DB:platform_settings` | Cap on runs kept per schedule | *(none today)* `200` | ✅ |
| `PORT` | `env` | Express listen port | `3001` | restart |
| `DATA_DIR` | `env` | SQLite file directory | `.` | restart |
| `APP_BASE_URL` | `env` → `DB:platform_settings` | Base URL in Discord notification links | `http://localhost:3001` | ✅ |
| `QDRANT_URL` / `OLLAMA_URL` / `EMBED_MODEL` | `env` → `DB:platform_settings` | RAG backend endpoints + embedding model | `…6333` / `…11434` / `nomic-embed-text` | restart-ish |

> **Execution backend (`subscription` vs `api`) - owner priority.** The default `subscription` backend dispatches over SSH to `claude -p`, consuming the tokens included in a Claude subscription (**no per-token API cost**, no API key required to run as shipped). The opt-in `api` backend uses the Anthropic API (`@anthropic-ai/sdk`, already a dependency) for headless/cloud or pay-per-token use. It resolves `global < agent < schedule < run` like any other knob, and `ANTHROPIC_API_KEY` stays a **secret** (Principle S8) - never a setting. (ROADMAP P3 · TODO "Pluggable Execution Backend".)

### Pillar 2 - Per-Agent Profiles

| Setting | Lives in | Controls | Default |
|---|---|---|---|
| `model_config.model` | `JSON:agents.model_config` | Per-agent model (free-text, allowlist-checked) | inherit `default_model` |
| `model_config.temperature` | `JSON:agents.model_config` | Sampling temperature for this agent | *inherit / `0.3`* |
| `model_config.max_tokens` | `JSON:agents.model_config` | Output cap | *inherit / `4096`* |
| `model_config.top_p` | `JSON:agents.model_config` | Nucleus sampling | inherit |
| `model_config.thinking` | `JSON:agents.model_config` | Extended-thinking toggle | `false` |
| `execution_backend` | `DB:agent_settings` | Per-agent backend override (`subscription` / `api`) | inherit |
| `default_safety_tier` | `DB:agent_settings` | Default policy tier (→ Pillar 4) | `read_only` |
| `extra_preamble` *(additive)* | `DB:agent_settings` | Agent-specific instructions prepended to every task | empty |
| `cwd_override` | `DB:agent_settings` | Per-agent working dir (overrides schedule `app_directory`) | inherit |
| `max_turns` | `DB:agent_settings` | `--max-turns` for the agent's loop | *unset (effectively unbounded)* |
| `env_overrides` *(additive)* | `JSON:agent_settings` | Key/value SSH env exports before `claude` | `{}` |
| `memory_enabled` | `DB:agent_settings` | Auto-ingest past run output into the agent's vector collection (T6) | `false` |
| `memory_depth` | `DB:agent_settings` | Past runs retrieved with recency boost | `5` (max 20) |
| `tags` | `DB:agent_tags` map | Filterable labels; enable tag-based schedule targeting | none |
| `custom_fields` | `DB:agent_custom_fields` | Arbitrary typed key/value metadata | none |
| `tool_grants` | `JSON:agents.tools` (wired) | Which registry tools this agent may use at runtime | the 3 builtins |
| `mcp_activations` | `DB:agent_mcp_activations` | Which MCP servers are active for this agent | from `agents.mcp_servers` |

### Pillar 3 - Per-Schedule Execution Policy

| Setting | Lives in | Controls | Default |
|---|---|---|---|
| `mode` | `DB:schedules` | parallel / sequential / meeting | `parallel` |
| `model` | `DB:schedules` | Schedule-level model (overrides agent, fallback to global) | `null` (inherit) |
| `app_directory` | `DB:schedules` | Scopes `claude` to an app's `CLAUDE.md` | `null` |
| `execution_backend` | `JSON:schedules.execution_policy` | Per-schedule backend override (`subscription` / `api`) | inherit |
| `priority` | `JSON:schedules.execution_policy` | Queue ordering / preemption (1–10) | `5` |
| `timeout_override_ms` | `JSON:schedules.execution_policy` | Overrides global `RUN_TIMEOUT_MS` | inherit |
| `allow_writes` → `safety_tier` | `DB:schedules` (**wired**) | Selects read-only / controlled-write / supervised (Pillar 4) | `read_only` |
| `allowed_commands` *(additive)* | `JSON:schedules.execution_policy` | Explicit command allowlist for controlled-write | `[]` |
| `max_turns` | `JSON:schedules.execution_policy` | Per-run turn cap (overrides agent) | inherit |
| `retry.max_attempts` | `JSON:schedules.execution_policy` | Retries before dead-letter (T9) | `1` |
| `retry.backoff_strategy` | `JSON:schedules.execution_policy` | fixed / linear / exponential | `exponential` |
| `retry.retry_on` | `JSON:schedules.execution_policy` | timeout / error / both | `both` |
| `stream_mode` | `JSON:schedules.execution_policy` | live / summary-only / off (T1) | `live` |
| `retention_override` | `JSON:schedules.execution_policy` | Per-schedule retention vs. global | inherit |
| `notification_routing` | `DB:schedule_notifications` | Channels + on-start/success/failure rules (Pillar 7) | global Discord |
| `cron_expression` / `recurring` | `DB:schedules` | Firing cadence | - / `true` |
| `webhook_tokens` | `DB:webhooks` | Inbound trigger tokens (T7) | none |
| `depends_on` / `trigger_on_success` | `JSON:schedules` | Cross-run pipeline chaining (T7) | none |

### Pillar 4 - Safety & Governance Policies

| Setting | Lives in | Controls | Default |
|---|---|---|---|
| Policy `name` | `DB:safety_policies` | Reusable artifact name (read-only / controlled-write / supervised / custom) | 3 seeded tiers |
| `allow_kubectl_write` | `JSON:safety_policies.rules` | Permit `kubectl apply`/`delete` etc. | `false` |
| `allow_file_write` | `JSON:safety_policies.rules` | Permit filesystem writes | `false` |
| `allow_external_http` | `JSON:safety_policies.rules` | Permit outbound HTTP from the agent | `false` |
| `allowed_namespaces` | `JSON:safety_policies.rules` | K8s namespaces the agent may touch | `[]` |
| `denied_commands` *(additive)* | `JSON:safety_policies.rules` | Explicit command blocklist (merged across layers) | destructive set |
| `require_dry_run` | `JSON:safety_policies.rules` | Force `--dry-run=client` on kubectl writes | `true` (controlled-write) |
| `require_approval` | `JSON:safety_policies.rules` | Route supervised runs through HITL gate (T3) | `true` (supervised) |
| Policy export | YAML | GitOps-able governance artifact | - |

### Pillar 5 - Budgets & Cost Controls (`cost_budgets` wired)

| Setting | Lives in | Controls | Default |
|---|---|---|---|
| `scope` | `DB:cost_budgets` | global / agent / schedule (/ workspace future) | `global` |
| `daily_limit_usd` | `DB:cost_budgets` | Daily spend cap for the scope | *(none today)* unset |
| `monthly_limit_usd` | `DB:cost_budgets` | Monthly spend cap | unset |
| `alert_threshold` | `DB:cost_budgets` | Fraction of limit that fires a warning | `0.8` |
| `budget_exceeded_action` | `DB:cost_budgets` | skip / queue / notify-only | `skip` |
| `reset_day` | `DB:cost_budgets` | Day-of-month monthly counters reset | `1` |
| spend tracking | `DB:budgets_spent` | Atomic per-period spend (daily/monthly) | computed |
| pricing source | `DB:platform_settings.model_pricing` | Drives all cost math incl. **SSH-run telemetry** (T2) | shared |

> **Prerequisite:** budgets are only meaningful once **SSH runs produce trace rows** (T2 - parse `usage` from `claude --output-format json`, call existing `recordTrace()`). Until then the dashboard sees only RAG/eval cost. Budget enforcement is wired *after* SSH telemetry lands.

### Pillar 6 - Eval & Judge Configuration

| Setting | Lives in | Controls | Default |
|---|---|---|---|
| `judge_model` | `DB:judge_configs` | Model the judge uses (today always Haiku) | `haiku` |
| `dimensions` | `JSON:judge_configs.dimensions` | Scoring dimensions w/ name, description, weight | relevance/accuracy/completeness/format |
| `pass_threshold` | `DB:judge_configs` | Overall score to pass | `0.6` |
| `judge_prompt_template` | `DB:judge_configs` | Template w/ `{{output}}` `{{expected}}` `{{dimensions}}` | seeded default |
| `eval_run.model` | request param | Response model under test (judge is separate) | `sonnet` |
| `baseline_run_id` | `DB:eval_suites` | Baseline for regression comparison | `null` |
| `regression_threshold` | `DB:eval_suites` | Delta that flags a regression + alerts | `0.1` |

### Pillar 7 - Notifications & Integrations

| Setting | Lives in | Controls | Default |
|---|---|---|---|
| Channel `type` + `config` | `DB:notification_channels` | Discord / Slack / email / generic webhook | from `DISCORD_WEBHOOK_URL` env |
| routing `on_start/success/failure` | `DB:schedule_notifications` | Per-schedule event rules | success+failure |
| `filter_expr` | `DB:schedule_notifications` | e.g. notify only if summary contains `CRITICAL` | none |
| inbound `token` + `payload_template` | `DB:webhooks` | External event → `fireRun()` (T7) | none |
| `max_calls_per_hour` | `DB:webhooks` | Per-token rate limit | unlimited |
| outbound webhook `events` + `secret` | `DB:outbound_webhooks` | Push run events w/ HMAC signature | none |
| API key `scopes` | `DB:api_keys` | read / trigger / write / admin (secures open `/claude` proxy) | none (open today) |
| API key `rate_limit_rpm` | `DB:api_keys` | Per-key throttle | unlimited |

### Pillar 8 - Appearance & Presentation (per-viewer)

| Setting | Lives in | Controls | Default |
|---|---|---|---|
| `accent_color` | `localStorage` | Primary accent across UI (CSS var `--accent`) | violet-600 |
| `dark_variant` | `localStorage` | zinc-950 / slate-950 / glass-on-image | zinc-950 |
| `density` | `localStorage` | compact / comfortable / spacious | comfortable |
| `terminal_theme` | `localStorage` | Live-stream terminal palette | per-agent-color |
| `presentation_mode` | `localStorage` | Sidebar-hidden focus/demo view | off |
| `theme_export` | JSON | Shareable theme artifact (import on another deploy) | - |

> **Notably absent from every table:** `ANTHROPIC_API_KEY`, `SSH_KEY_PATH`, webhook secrets, API-key raw values. These are **secrets**, not settings (Principle S8) - they stay in K8s Secrets or one-time-reveal flows and are excluded from `settings-pack.yaml` exports.

---

## Data Model Additions (Planning Sketch)

New / changed schema to back the surface above. Additive migrations only; existing rows default to current behavior.

| Table / column | Pillar | Purpose |
|---|---|---|
| `platform_settings (key, value, value_type, description, editable_live, requires_restart)` | 1 | Global live-editable settings; env seeds defaults |
| `agents.model_config` (JSON) | 2 | Per-agent inference profile |
| `agent_settings (agent_id PK, default_safety_tier, extra_preamble, cwd_override, max_turns, env_overrides JSON, memory_enabled, memory_depth)` | 2 | Per-agent execution + memory profile |
| `agent_tags` / `agent_tag_map` / `agent_custom_fields` | 2 | Tags + arbitrary metadata; tag-based targeting |
| `schedules.execution_policy` (JSON) | 3 | Priority, timeouts, retry, stream_mode, retention override |
| `schedules.allow_writes` → wired to `safety_tier` | 3, 4 | The ghost column finally read by the resolver |
| `safety_policies (id, name, rules JSON, is_default)` | 4 | Reusable governance artifacts |
| `cost_budgets` (wired) + `budgets_spent (scope, scope_id, period, period_key, spent_usd)` | 5 | Enforcement + atomic spend tracking |
| `traces.source` (`ssh` / `api`) | 5 | Distinguish SSH-estimated from API-metered cost |
| `judge_configs` + `eval_suites.judge_config_id` + `eval_suites.baseline_run_id` | 6 | Configurable judge + regression baseline |
| `notification_channels` / `schedule_notifications` | 7 | Multi-channel routing |
| `webhooks` / `outbound_webhooks` / `api_keys` | 7 | Event triggers + auth |

---

## Phasing & Sequencing

Aligned to the [ROADMAP](./ROADMAP.md) phases. Settings work is concentrated in **P2** (the configurability + governance phase) but deliberately sequenced behind **P1**'s telemetry so budgets have real data to enforce against.

| Phase | Settings deliverables | Why here |
|-------|----------------------|----------|
| **P1 - Make It Visible & Honest** | `traces.source` column; SSH-run telemetry feeds the pricing table (prerequisite for budgets); seed the 10 schedule templates | Budgets and cost settings are meaningless without SSH cost data; templates fix "empty on first boot" |
| **P2 - Make It Configurable & Governed** | **`platform_settings` + Settings Hub UI** (Pillars 1, 8); **per-agent inference profiles** (Pillar 2); **tiered safety policy engine wiring `allow_writes`** (Pillars 3, 4); **budget enforcement** (Pillar 5); the **`resolveSetting()` resolver** | The north-star phase: this document's core surface ships here |
| **P3 - Make It Trustworthy & Reactive** | API-key scopes, inbound webhook tokens, multi-channel notification routing (Pillar 7); retry policy settings (Pillar 3) | Settings that secure and connect the platform to the outside |
| **P4 - Make It Smart & Self-Improving** | Configurable eval judge + regression thresholds (Pillar 6); per-agent memory settings (Pillar 2); prompt-version settings | MLOps configurability |
| **P5 - Make It Composable & Portable** | DB-backed MCP registry; agent-pack + settings-pack + theme YAML import/export (Pillar 8); workspace layer (if a real multi-tenant need emerges) | Portability turns settings into shareable artifacts |

### Effort & Risk Notes

- **Highest leverage, lowest effort:** moving the **model allowlist + pricing table** into `platform_settings` (S effort) removes two of the most embarrassing "requires-a-code-deploy" constraints at once.
- **Highest payoff:** **per-agent inference profiles** (M) - five agents with five model badges is the most direct visual proof of flexible orchestration.
- **Risk to retire first:** the **ghost knobs** (`allow_writes`, `cost_budgets`). Wire them in P2 or remove them (Principle S5 / ROADMAP Principle #3). This document commits to wiring.
- **Deliberately deferred:** the **workspace** precedence layer and the **pluggable HTTP/script tool registry** - both real flexibility wins, both on the ROADMAP *Not Now* list until single-user scope demands them and governance is solid, respectively.

---

## Open Questions

1. **Resolver caching.** `resolveSetting()` runs per dispatch. With SQLite single-writer + WAL, is an in-process settings cache (invalidated on `PUT /api/settings`) worth it, or is per-run resolution cheap enough at homelab scale? *Lean: cache global layer, resolve entity layers live.*
2. **Live vs. restart UX honesty.** For `requires_restart` settings edited live, do we (a) queue + show a "pending restart" badge, or (b) refuse the edit with a clear message? *Lean: (a) - store the value, apply on next boot, badge it.*
3. **Safety floor escalation.** Should `supervised` ever be reachable purely from settings, or always require both the `SUPERVISED_OVERRIDE` env gate **and** a human approval (T3)? *Lean: both, always - safety never escalates from config alone.*
4. **Workspace timing.** When (if ever) does the homelab need the workspace precedence layer? Keep it in the resolver contract as a no-op until a concrete multi-context need appears.
5. **Settings-pack secret boundary.** Confirm the export filter is allowlist-based (export only known-safe keys) rather than denylist-based (risk of leaking a future secret key). *Lean: allowlist.*

---

*This is a living planning document and the detailed contract behind the ROADMAP's "Settings Pillars" section. Revisit the precedence rules and the master settings map after P2 ships against real demo feedback. No code changes are implied by this document.*
