# Actionable Backlog (TODO)

> A prioritized, checkboxed backlog for **agents-platform** — the self-hosted multi-agent control plane.
> Grouped by the [ROADMAP](./ROADMAP.md) phases (P1–P5). Each item is small, verifiable, and tagged with effort + dependencies.
>
> **North star:** make every agent run *visibly alive, fully instrumented, and governed by knobs an operator can turn from the UI* — so that watching it work is the proof that real AI agents are doing real engineering work on real infrastructure.

## ✅ Shipped

- [x] **Opt-in Anthropic API execution backend** (P3/T9) — live v1.0.28
- [x] **README disclaimer** on the SSH/subscription cost design
- [x] **UI redesign** — flat dark + amber + teal, status pill badges (partial T4 "Appearance")
- [x] **P1 — Make It Visible & Honest** (live v1.0.29): SSH run telemetry (`source='ssh'` + notional cost), unified cost / "savings vs API" dashboard, Live Run Theater (per-agent SSE streaming), seed 10 schedule templates, run retention.
- [x] **P2 — Make It Configurable & Governed** (live v1.0.30): Settings Hub (live DB-backed settings, env→DB override, `/settings`), per-agent inference profiles (`model_config`), tiered safety policy engine (wired the ghost `allow_writes` → read-only / controlled-write / supervised).

**Next:** P3 (API-key auth + inbound webhooks + durable job queue), then P4 (prompt A/B + eval), P5 (DAG builder). Budget enforcement deferred (subscription = static cost).

## How to read this doc

- `[ ]` checkbox per item — keep them small enough to land in one PR / one `deploy.sh` cycle.
- **Effort:** `S` (≤ half day) · `M` (1–2 days) · `L` (3–5 days) · `XL` (a week+ / multi-PR).
- **Theme:** links to the ROADMAP theme (`T1`–`T9`) the item advances.
- **Deps:** concrete files/tables/features that must exist first. `—` means no in-repo blocker.
- Items reference real modules from the codebase (e.g. `server/executor.js`, `server/observability/telemetry.js`) — find-and-grep before you build.

### Effort legend

| Tag | Meaning | Rough size |
|-----|---------|------------|
| `S` | Small | ≤ half day, no schema change or additive-only |
| `M` | Medium | 1–2 days, one table or one new route group |
| `L` | Large | 3–5 days, new page + backend + migration |
| `XL` | Extra-large | week+, multi-PR, touches many modules |

---

## Now

> The five highest impact-per-effort items, drawn directly from `prioritization.now`. **Do these first.** They eliminate the two most embarrassing gaps (invisible runs, empty cost dashboard) and make the platform's *existing* power legible before any new capability is added. All belong to **Phase P1 — Make It Visible & Honest**.

- [ ] **Live Run Theater (SSE streaming)** — add `GET /api/runs/:id/stream` (native Node SSE, no new deps); refactor `runClaudeRemote` in `server/executor.js` to pipe `child.stdout` chunks to a per-`runId` `EventEmitter` instead of buffering to a string; subscribe `RunDetailPage` via `EventSource` and render per-agent streaming panels. The consensus #1 flagship. **[M · T1 · Deps: —]**
- [x] **SSH Run Telemetry** — extract `usage.input_tokens` / `usage.output_tokens` from the existing `claude --output-format json` response in `parseClaudeJson()`, then call the existing `recordTrace()` once per agent per run with `step_name='ssh_dispatch'`. Add a `source` column (`ssh|api`) to `traces`. Fixes the worst gap; unblocks budgets + SLOs. **[S/M · T2 · Deps: `recordTrace()` exists; additive `traces.source` migration]**
- [ ] **Unified cost dashboard panels** — on `ObservabilityPage`, add an SSH-vs-API cost split (donut/stacked bar) and per-agent / per-schedule cost attribution; expand `getCostSummary()` to include the `ssh_dispatch` step name. **[M · T2 · Deps: SSH Run Telemetry]**
- [x] **Seed the 10 production schedule templates** — add a seed function so a fresh deployment isn't empty (the 10 schedules currently live only in `STANDARDIZE-TODO.md` notes, created against the live instance). Mark seeded rows so re-seeds are idempotent. **[S · T8 · Deps: `schedules` table exists]**
- [x] **Run retention / cleanup job** — add a nightly `node-cron` task (separate from user schedules) that prunes old `runs` rows by count/age before the 1 Gi Longhorn PVC fills (verbose transcripts accumulate with no DELETE today). Surface DB file size + projected weeks-to-full on `ObservabilityPage`. **[S · T9 · Deps: `runs` table; `node-cron` already imported]**

---

## Phase P1 — Make It Visible & Honest

> **Goal:** eliminate the two most embarrassing gaps — invisible runs and an empty cost dashboard — so existing capabilities become legible and instrumented. Highest impact-per-effort; ships the consensus flagships first.
> **Timeframe:** Weeks 1–3.

### Live Agent Theater (T1)

- [ ] Refactor `executor.js` stdout handling from string accumulation to a streaming callback / `EventEmitter` keyed by `runId` (final transcript still written to `runs.transcript` on completion). **[M · T1 · Deps: —]**
- [ ] Add SSE endpoint `GET /api/runs/:id/stream` with `text/event-stream` headers; replay buffered chunks on connect, then live-stream; emit a terminal `event: done` with final status + summary. **[M · T1 · Deps: EventEmitter refactor]**
- [ ] For finished runs, have the stream endpoint fall back to replaying `runs.transcript` from the DB so the same UI works for history. **[S · T1 · Deps: SSE endpoint]**
- [ ] Replace polling `useEffect` in `RunDetailPage` with an `EventSource` client; render per-agent panels (route parallel chunks by agent name, highlight the active agent in sequential mode). **[M · T1 · Deps: SSE endpoint]**
- [ ] Add a `MAX_STREAM_DURATION_MS` guard + heartbeat keepalive so SSE connections don't hang open indefinitely on a single-replica pod. **[S · T1 · Deps: SSE endpoint]**
- [ ] Add a Home-page **Activity Feed** widget showing the last 5 run events with live status + elapsed time. **[S · T1 · Deps: SSE endpoint or `runs` list query]**

### Full-Spectrum Observability (T2)

- [ ] In `parseClaudeJson()`, stop discarding `parsed.usage`; extract input/output token counts (fall back to a `chars/4` estimate with an `estimated` badge for older CLI output). **[S · T2 · Deps: —]**
- [ ] Call `recordTrace()` from `executeRun()` — one trace per agent for parallel/sequential, one facilitator trace for meeting mode; compute cost from the existing pricing table. **[S · T2 · Deps: token extraction]**
- [ ] Add `source` column (`ssh|api`) to `traces` (additive migration) so the dashboard can split metered vs estimated cost. **[S · T2 · Deps: `traces` table]**
- [ ] Add the SSH-vs-API split panel + per-agent / per-schedule cost leaderboard to `ObservabilityPage` (reuse Recharts; no new dep). **[M · T2 · Deps: trace writes for SSH runs]**

### Templates & Robustness baseline (T8 / T9)

- [ ] Write a `seedSchedules()` function for the 10 production schedule templates; call it on first boot when `schedules` is empty (mirrors the existing agent seed pattern). **[S · T8 · Deps: `schedules` table]**
- [ ] Add a nightly retention cleanup job + a "Storage Health" readout (DB file size via `fs.stat`, row counts per table, projected weeks-to-full). **[S · T9 · Deps: `runs` table; `node-cron`]**

**P1 exit criteria:** a fresh deploy shows 10 schedules; triggering a multi-agent run streams live per-agent output; the cost dashboard shows real SSH run cost with per-agent attribution; run history is bounded.

---

## Phase P2 — Make It Configurable & Governed

> **Goal:** deliver the owner's north star (deep configurability) and turn ghost schema into real governance. Wire the dead columns, add the settings surface, make agents safely capable of action.
> **Timeframe:** Weeks 4–7. **Maps to `prioritization.next`.**

### Settings Hub (T4)

- [ ] Add a `platform_settings` table (`key`, `value`, `value_type`, `description`, `editable_live`, `requires_restart`); env vars seed defaults, DB values override at read time. **[M · T4 · Deps: —]**
- [ ] Build a tabbed **Settings** page (General / Models / Safety / Budgets) with `GET /api/settings` + `PUT /api/settings/:key`. **[M · T4 · Deps: `platform_settings` table]**
- [ ] Move the 3-value model allowlist into a settings row (comma-separated IDs) so a new model (e.g. a newer Sonnet) needs only a UI edit, not a code change. **[S · T4 · Deps: Settings page]**
- [ ] Make the safety preamble text + `MAX_CONCURRENT_RUNS` / `MAX_PARALLEL_PER_RUN` / `RUN_TIMEOUT_MS` / retention policy editable live (DB override of env defaults). **[M · T4 · Deps: `platform_settings` table; safety-policy refactor below]**
- [ ] Make the model **pricing table** DB-editable so new model pricing needs no code change (today it hardcodes versioned IDs and silently falls back to Haiku pricing). **[S · T4 · Deps: Settings page]**

### Per-Agent Inference Profiles (T4)

- [ ] Add a `model_config` JSON column to `agents` (`model`, `temperature`, `max_tokens`, `top_p`, extended-thinking toggle). **[S · T4 · Deps: `agents` migration]**
- [ ] Read `model_config` per agent in `executor.js` (pass `--model` per agent; schedule-level model becomes the fallback) and in `graphs.js`/`getLLM()` for direct SDK calls. **[M · T4 · Deps: `model_config` column]**
- [ ] Add a `CUSTOM_MODEL_IDS` setting to extend the allowlist beyond `haiku/sonnet/opus`. **[S · T4 · Deps: Settings model allowlist]**
- [ ] Add a Model Config panel to `AgentProfile` (sliders/dropdowns + per-agent model badge shown at run time). **[M · T4 · Deps: `model_config` column]**

### Tiered Safety Policy Engine (T3)

- [ ] Refactor `server/safety-prompt.js` from a single hardcoded `SAFETY_PREAMBLE` constant into `buildSafetyPreamble(policy)` / `policyToPrompt(policy)`. **[S · T3 · Deps: —]**
- [ ] Add a `safety_policies` table with named tiers — `read_only` / `controlled_write` / `supervised` — carrying `allow_kubectl_write`, `allow_file_write`, `allow_external_http`, `allowed_namespaces`, `denied_commands`, `require_dry_run`. **[M · T3 · Deps: preamble refactor]**
- [ ] **Wire the ghost `allow_writes` column:** `executor.js` (and `workflows/runner.js`) read the schedule's policy and compose the preamble accordingly — `allow_writes` selects between read-only and controlled-write tiers. **[M · T3 · Deps: `safety_policies`; preamble refactor]**
- [ ] Add a per-agent `default_policy` column so e.g. Flux defaults to controlled-write while Sentinel stays read-only. **[S · T3 · Deps: `safety_policies`]**
- [ ] Add a **Policy** tab to the schedule UI showing exactly which commands are allowed/blocked for the run (legible, auditable safety posture). **[M · T3 · Deps: `safety_policies`]**

### Budget Enforcement (T3)

- [ ] Add CRUD routes for the dead `cost_budgets` table (`scope` = global / agent / schedule). **[M · T3 · Deps: `cost_budgets` table; SSH telemetry from P1]**
- [ ] Add a pre-dispatch budget gate in `executeRun()` (and the eval runner): query today/this-month spend from `traces`; if over limit, mark the run `budget_exceeded` and skip. **[M · T3 · Deps: budget routes; SSH telemetry]**
- [ ] Fire a Discord alert when rolling spend crosses `alert_threshold` (default 0.8); add a `budget_exceeded_action` setting (`skip` / `queue` / `notify_only`). **[S · T3 · Deps: budget gate]**
- [ ] Add a **Budgets** tab to Settings/Observability with per-scope progress bars (spend vs limit). **[M · T4 · Deps: budget routes]**

### Retention follow-through (T9)

- [ ] Promote the P1 retention job to a `retention_policies` table (per-schedule overrides for `max_runs_kept` / `max_age_days` / `archive_transcript`). **[S · T9 · Deps: P1 cleanup job]**

**P2 exit criteria:** an operator can tune the platform from the UI without `kubectl`; `allow_writes` actually changes behavior under an auditable tier; budgets block runaway spend; agents run with per-agent models visible as badges.

---

## Phase P3 — Make It Trustworthy & Reactive

> **Goal:** operational hardening plus the event-driven leap. Make runs fault-tolerant and let external systems trigger agents safely.
> **Timeframe:** Weeks 8–11. **Maps to the tail of `prioritization.next`.**

### API-Key Auth & Scopes (T7)

- [ ] Add an `api_keys` table (`key_hash`, `key_prefix`, `scopes` JSON, `rate_limit_rpm`, `last_used_at`, `revoked`); keys shown in full once on create (GitHub-PAT pattern). **[M · T7 · Deps: —]**
- [ ] Add Bearer-token middleware: read-only GETs may stay public via `PUBLIC_BROWSE_MODE`, but writes and the `/claude` proxy require a valid scoped key. **[M · T7 · Deps: `api_keys`]**
- [ ] Define scopes (`read` / `trigger` / `write` / `admin`) and enforce per route prefix; bootstrap the first admin key on first boot (printed to logs). **[S · T7 · Deps: middleware]**
- [ ] Add a **Settings → API Keys** page (create / scope / revoke / last-used). **[M · T7 · Deps: `api_keys`]**

### Inbound Webhook Triggers (T7)

- [ ] Add a `webhooks` table (per-schedule tokens, `label`, `last_triggered_at`, `trigger_count`). **[S · T7 · Deps: —]**
- [ ] Add `POST /api/webhooks/:token` → validate token → call the existing `scheduler.fireRun()`; accept an optional `override_prompt`. **[M · T7 · Deps: `webhooks`; API-key auth; `scheduler.fireRun()` exists]**
- [ ] Support `{{payload.field}}` interpolation into `task_prompt` so one schedule runs different prompts per trigger source (Prometheus alert vs git push). **[M · T7 · Deps: webhook endpoint]**
- [ ] Add a **Webhook Triggers** panel to `ScheduleDetailPage` (copy button, live trigger count). **[S · T7 · Deps: `webhooks`]**

### Durable Job Queue & Retry (T9)

- [ ] Persist the queue to a `job_queue` table (`run_id`, `attempt`, `max_attempts`, `next_attempt_at`, `status`, `locked_at`) so a pod restart doesn't silently drop queued/running jobs. **[M · T9 · Deps: —]**
- [ ] On startup, `hydrate()` re-locks orphaned jobs (older than `2× RUN_TIMEOUT_MS`). **[S · T9 · Deps: `job_queue`]**
- [ ] Wrap `runClaudeRemote()` in retry-with-backoff (exponential; per-schedule `max_attempts` / `backoff_strategy`); after exhaustion, move to a dead-letter lane. **[M · T9 · Deps: `job_queue`]**
- [ ] Add `POST /api/runs/:id/retry` + a dead-letter view on `AllRunsPage` with one-click retry. **[S · T9 · Deps: retry wrapper]**

### Pluggable Execution Backend — SSH (subscription) + opt-in Claude API (T9)

> Added per owner request (2026-06-01). Keep the SSH/`claude -p` path as the **default** — it uses the tokens included in a Claude **subscription**, so runs cost nothing extra. Add the Anthropic API as an **opt-in** backend for headless/cloud or pay-per-token use. Additive, *not* a replacement (distinct from the *Not Now* "K3s Job-per-run dispatch").

- [ ] Extract an `ExecutionBackend` interface from `executor.js` (`run(prompt, {model, cwd, timeout}) → {text, usage, exitCode}`); make the current SSH dispatch the `subscription` implementation. **[M · T9 · Deps: executor refactor; consolidate with `workflows/runner.js`]**
- [ ] Add an `api` backend using the already-present `@anthropic-ai/sdk` (reuse the RAG/eval client); map its `usage` to the same trace shape so cost telemetry (`traces.source='api'`) works unchanged. **[M · T9 · Deps: `ANTHROPIC_API_KEY` secret; `traces.source` from P1]**
- [ ] Add an `execution_backend` setting (`subscription` default | `api`), resolvable global < agent < schedule < run (see SETTINGS precedence). **[S · T9/T4 · Deps: Settings Hub from P2]**
- [ ] Show the active backend as a run badge (SSH vs API) and degrade gracefully if `api` is selected without a key configured. **[S · T9 · Deps: api backend]**

### Human-in-the-Loop Approval (T3)

- [ ] Add `approval_required` + `approval_timeout_minutes` to `schedules`; on fire, create the run as `awaiting_approval` and post a Discord embed with signed (HMAC) approve/deny links. **[M · T3 · Deps: notification router below; safety policy engine]**
- [ ] Add `POST /api/runs/:id/approve` / `/deny` and an **Approval Queue** page (diff-style prompt view, agent icons, one-click approve/deny). **[M · T3 · Deps: approval columns]**

### Multi-Channel Notifications (T7)

- [ ] Add `notification_channels` + `schedule_notifications` tables; refactor the hardcoded `DISCORD_WEBHOOK_URL` into a DB-driven `NotificationRouter` (on-start / success / failure rules, optional `filter_expr`). **[M · T7 · Deps: —]**
- [ ] Add a **Channels** admin surface with test-ping buttons (Discord first; Slack/email/generic webhook as channel types). **[M · T7 · Deps: `notification_channels`]**

**P3 exit criteria:** the `/claude` proxy is no longer an open relay; a Prometheus alert can fire agents via a scoped token; a transient SSH failure retries instead of dying; destructive runs can require a human approve in Discord.

---

## Phase P4 — Make It Smart & Self-Improving

> **Goal:** the MLOps quality loop and execution introspection — the features that prove production AI/ML thinking.
> **Timeframe:** Weeks 12–16. **Maps to the front of `prioritization.later`.**

### Prompt Versioning (T6)

- [ ] Add a `prompt_versions` table (`agent_id`, `version_tag`, `system_prompt`, `notes`, `created_at`); auto-snapshot the prior value on every `PUT /api/agents/:id` that changes `system_prompt`. **[M · T6 · Deps: —]**
- [ ] Add a **Prompt History** drawer in `AgentProfile` with a unified diff view + one-click restore. **[M · T6 · Deps: `prompt_versions`]**
- [ ] Generate a one-line Haiku change summary on save (the platform narrates its own evolution). **[S · T6 · Deps: `prompt_versions`; `ANTHROPIC_API_KEY`]**

### Prompt A/B Testing (T6)

- [ ] Extend the eval runner to accept a `variant`/historical `system_prompt` and tag the `eval_run` with it. **[M · T6 · Deps: `prompt_versions`; eval runner]**
- [ ] Add an A/B mode: run the same suite against version A and version B in parallel; render side-by-side per-case scores. **[M · T6 · Deps: variant support]**
- [ ] Add a **Promote to Active** button that overwrites `agents.system_prompt` with the winning variant (the recursive meta-AI moment). **[S · T6 · Deps: A/B mode]**

### Configurable Eval Judge & Regression Tracking (T6)

- [ ] Add a `judge_configs` table (model, `pass_threshold`, custom weighted `dimensions`, judge prompt template) and a nullable `judge_config_id` on `eval_suites`. **[L · T6 · Deps: eval runner]**
- [ ] Parameterize `runEvalSuite` to use the judge config (selectable judge model — today the judge is always Haiku regardless of eval model). **[M · T6 · Deps: `judge_configs`]**
- [ ] Add `GET /api/eval/runs/diff?run_a&run_b` + a diff view; store `regression_count` on `eval_runs`; add a per-suite `baseline_run_id` with Discord alert on regression. **[M · T6 · Deps: eval results schema]**

### Execution Introspection (T1 / T2)

- [ ] Parse the `messages` array from `claude --output-format json`, emit one trace per `tool_use` block (`step_name='tool_call:<tool>'`, input/result previews in `metadata`). **[M · T2 · Deps: SSH telemetry from P1]**
- [ ] Add an **Execution Steps** timeline tab to `RunDetailPage` (color-coded by tool type) + a `filter by tool_name` control on Observability. **[M · T1 · Deps: tool-call traces]**
- [ ] Add `POST /api/runs/:id/replay` (re-execute with `task_prompt` / `model` / `agent_ids` overrides; `replay_of` lineage) + a side-by-side diff of original vs replay. **[M · T1 · Deps: `runs` `replay_of`/`metadata` columns]**

**P4 exit criteria:** prompt changes are versioned, diffable, A/B-tested, and promotable on evidence; the judge is configurable; every run exposes a step-level tool-call timeline; any run is replayable with overrides.

---

## Phase P5 — Make It Composable & Portable

> **Goal:** programmable orchestration and artifact portability — the depth features that change what the platform fundamentally *is*. Sequenced last deliberately: high effort, most compelling only after the core loop is visible and instrumented.
> **Timeframe:** Weeks 17–22. **Maps to the tail of `prioritization.later`.**

### Agent Pipeline Builder (T5)

- [ ] Add a `workflow_graph` JSON column to `schedules` (nodes = agents, edges carry a `data_key` + condition); add `graph` as a fourth mode alongside parallel/sequential/meeting. **[M · T5 · Deps: —]**
- [ ] Route multi-agent `graph`-mode runs through **LangGraph** (each node → a `StateGraph` node, edges → conditional edges) — finally using the engine that single-agent runs already touch and multi-agent runs bypass today. **[L · T5 · Deps: `workflow_graph`; topological sort in executor]**
- [ ] Build a visual DAG editor on `ComposePage` (lightweight SVG drag-connect, or React Flow if a dep is acceptable) with conditional-branch edge labels. **[L · T5 · Deps: `workflow_graph`]**
- [ ] Overlay live node status (queued / running / done / failed / skipped) on `RunDetailPage`, fed by the P1 SSE stream. **[M · T5 · Deps: DAG editor; SSE streaming]**

### Saved Compositions / Crews (T5)

- [ ] Add a `compositions` table (named reusable agent teams: `agent_ids`, `mode`, `task_prompt_template`, `tags`); add "Save as Composition" on `ComposePage`. **[M · T5 · Deps: —]**
- [ ] Add a **Compositions** gallery + detail page with a topology diagram (fan / chain / round-table by mode) and run / schedule / export actions. **[M · T5 · Deps: `compositions`]**
- [ ] Auto-suggest crews from the existing `related_agents` graph (e.g. Atlas → Sentinel + Bastion + Vault). **[S · T5 · Deps: `compositions`]**

### Portability & Marketplace (T8)

- [ ] Add YAML import/export for agents (`POST /api/agents/import` from file or GitHub URL; `GET /api/agents/export`) generalizing the existing `agency-sync.js` pattern into a *writable* path; tag rows with `source_pack`. **[M · T8 · Deps: `agents` `source_pack` column; js-yaml]**
- [ ] Add an **Adopt** button that copies a read-only agency agent into the runnable `agents` table — finishing what `agency-sync.js` half-built. **[S · T8 · Deps: import path]**
- [ ] Add a `schedule_templates` table + **Template Gallery** UI (the P1 seeds become first-class, parameterized templates with `{{var}}` substitution and import/export). **[M · T8 · Deps: P1 seed function]**
- [ ] Migrate the static `mcp-registry.js` to a DB-backed `mcp_servers` table with env-var validation badges + an SSH connection test; add custom-server CRUD. **[L · T8 · Deps: SSH channel; `mcp_servers` migration + seed]**

### Platform SLOs (T2)

- [ ] Add an `slo_rules` table (metric, scope, `target_value`, `window_minutes`, `alert_channel`); seed 5 defaults (success rate ≥ 90%, p95 duration ≤ 300s, daily cost ≤ $1, scheduler on-time ≥ 95%, eval pass ≥ 75%). **[L · T2 · Deps: SSH telemetry; notification router]**
- [ ] Add a **SLO** page (gauges + 7-day sparklines + breach history) and a 5-min background evaluator that fires breach notifications (read-only prepared statements only — respect the SQLite single-writer). **[M · T2 · Deps: `slo_rules`]**
- [ ] Add a scheduler **watchdog**: compare `next_run_at` vs now every 60s, auto-fire missed runs, log to `scheduler_events`. **[S · T9 · Deps: scheduler hydrate]**

**P5 exit criteria:** multi-agent runs execute as a conditional DAG through LangGraph with live node status; teams and templates are saved, versioned, and YAML-portable; the MCP registry is DB-backed with health checks; an SLO page reports the platform's own reliability.

---

## Cross-cutting hygiene (do alongside the phase it touches)

- [ ] **Kill or wire ghost schema this sprint.** `allow_writes` (wired in P2/T3) and `cost_budgets` (wired in P2/T3) must do something or be removed — inert columns that are stored, displayed, validated, and documented signal unfinished work to a reviewing staff engineer. **[S · T3]**
- [ ] **De-duplicate dispatch logic.** `executor.js` and `workflows/runner.js` independently implement parallel/sequential/meeting (runner lacks the parallel `anyFailed` summary). Consolidate before the DAG work in P5 compounds the divergence. **[M · T5]**
- [ ] **Validate `task_prompt` length** before base64 + SSH (very large prompts can silently truncate/fail). **[S · T9]**
- [ ] **Surface SSH app-discovery failures.** `GET /api/apps` returns an empty array silently when SSH is unreachable — show an error in the schedule-creation UI. **[S · T9]**
- [ ] **Persist Qdrant + Ollama to PVCs.** Both run on `emptyDir` today (data lost on pod restart); add graceful degradation so RAG features fail soft, not at request time. **[M · T9]**
- [ ] **Document the SSH/subscription design in the README** (owner request, 2026-06-01). Add a short disclaimer: the platform dispatches over SSH and spawns a terminal (`claude -p`) *by design*, to use the tokens included in a Claude **subscription** and avoid per-token API cost — so no API key is needed to run it as shipped. Note the opt-in Claude API backend as the alternative for headless/cloud. **[S · docs · pairs with "Pluggable Execution Backend" above]**

---

## Explicitly NOT now

> From `prioritization.not_now`. Recorded so they aren't re-proposed — each is deferred for a concrete reason, not forgotten.

| Item | Why deferred |
|------|--------------|
| Postgres / TimescaleDB migration (`XL`) | Premature; SQLite + retention policy handles homelab scale. Revisit only on a real multi-replica need, and coordinate with the separately-specced cross-app centralized Postgres effort. |
| K3s Job-per-run dispatch (`L`, new RBAC + runner image) | The SSH dispatch model is a feature to lean into, not replace — not worth the complexity for a single-host portfolio demo. |
| Multi-workspace / multi-tenant schema (`L`, touches 6 tables) | Single-user homelab needs no namespace isolation yet; migration risk for speculative benefit. |
| Mid-run WebSocket veto (`L`) | SSE streaming + the approval gate cover the supervised-autonomy story without an extra `ws` dependency. |
| Published npm SDK + OpenAPI generation | API-key auth + documented REST is enough; a polished SDK is over-investment for a portfolio piece. |
| n8n custom community node package | The outbound webhook + inbound trigger already bridge n8n bidirectionally; a packaged node is diminishing returns. |
| Run anomaly detection on every run | Adds per-run cost/latency; fold into the eval-as-observability story only after the judge is configurable (P4). |
| Meeting transcript structured parser | Nice-to-have polish; the streaming Theater view already makes meetings watchable. |
| Pluggable HTTP/script tool registry | Powerful but expands the attack surface; gate behind the safety policy engine and revisit after governance is solid. |

---

## Phase → flagship at a glance

| Phase | Flagship(s) | Theme | Primary effort |
|-------|-------------|-------|----------------|
| **P1** Visible & Honest | Live Run Theater · SSH Telemetry | T1, T2 | M + S/M |
| **P2** Configurable & Governed | Settings Hub · Tiered Safety Engine · Inference Profiles | T4, T3 | M |
| **P3** Trustworthy & Reactive | API-Key Auth · Inbound Webhooks · Durable Queue | T7, T9 | M |
| **P4** Smart & Self-Improving | Prompt A/B + Promote-to-Active · Configurable Judge | T6 | M–L |
| **P5** Composable & Portable | Agent Pipeline Builder (DAG) · Agent Packs | T5, T8 | L |
