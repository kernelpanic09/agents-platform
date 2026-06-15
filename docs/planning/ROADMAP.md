# agents-platform - Product Roadmap

> The headline planning document. Vision, positioning, themes, a phased delivery plan, and the flagship features that anchor each phase. This is an idea/planning artifact - no code changes are implied by its existence.

---

## Where We Are Today

agents-platform is a self-hosted multi-agent control plane already running well beyond its written roadmap. The deployed system (v1.0.27 at MetalLB `10.0.1.203`, K3s + ArgoCD GitOps) is a single-process Express server (Node 20, ESM) serving a pre-built React 18 / Vite SPA, backed by `better-sqlite3` in WAL mode across 11 tables. Five subsystems are wired together at startup: a directory of **20 hardcoded agent personas** with full CRUD; an **in-process `node-cron` scheduler** that dispatches multi-agent runs over SSH to `claude -p --output-format json` in three modes (parallel / sequential / meeting); a **LangGraph workflow engine** with a Haiku task router and three compiled graphs; a **RAG pipeline** (Ollama `nomic-embed-text` embeddings → Qdrant per-agent and global collections); and a **telemetry layer** that records a trace row per direct-Anthropic LLM call. Around these sit an eval framework (LLM-as-judge), a Recharts observability dashboard, a static 11-entry MCP registry, and a read-only catalog of ~100+ agency agents synced from a public GitHub repo. The codebase is genuinely capable - but it carries the marks of fast growth: **the SSH dispatch path produces zero telemetry**, runs are **fire-and-forget with no live feedback**, the `allow_writes` column and `cost_budgets` table are **declared but inert**, there is **no auth anywhere**, and a fresh deployment **seeds no schedules** so it looks empty on first boot. That gap - between what the platform can do and what a viewer can *see and configure* - is precisely what this roadmap exists to close.

---

## North Star

> **Make agents-platform a deeply configurable, self-hosted multi-agent control plane where every agent run is visibly alive, fully instrumented, and governed by knobs an operator can turn from the UI - so that watching it work is the proof that real AI agents are doing real engineering work on real infrastructure.**

Three words carry the weight: **visible**, **configurable**, **governed**. Every initiative below is justified by how much it advances at least one of them.

---

## Positioning

This is a **portfolio piece** that proves its builder can design, instrument, and govern an autonomous AI agent system end-to-end - not just wire an LLM to a chat box. To a senior AI / Cloud / DevOps hiring manager it demonstrates:

| Dimension | What it proves | Evidence in the platform |
|---|---|---|
| **Production observability for agents** | Per-run token/cost/latency tracing, step-level tool-call visibility, platform SLOs | Unified cost dashboard spanning SSH + RAG + eval; Execution Steps timeline parsed from `claude` JSON |
| **Operational maturity** | Retries, dead-letter, budgets, retention, safety policy, human-in-the-loop | Durable SQLite-backed queue; tiered safety engine; budget enforcement; approval gates |
| **Cloud-native fluency** | K3s + ArgoCD GitOps, MetalLB, real Linux dispatch host that picks up `CLAUDE.md` context | SSH dispatch to a host where agents run real `kubectl` / filesystem ops |
| **MLOps quality loop** | Evals, LLM-as-judge, prompt versioning, A/B testing, regression alerts | Configurable judge + Prompt A/B with promote-to-active |
| **Configurability as a design value** | Settings as a first-class surface, not an afterthought | Live Settings Hub replacing 17+ env vars; per-agent inference profiles |

**The honest differentiator:** agents execute `claude -p` in the *same environment a senior engineer uses interactively* - real `kubectl`, real filesystem, real project `CLAUDE.md` context, NVM-managed Node. We lean into the **SSH seam as a feature, not a flaw**, and we make the work **watchable**. A pipeline that shows "executing on a worker node, picking up `~/apps/<project>/CLAUDE.md`, `kubectl get pods` returning live data" is more impressive than any sandbox-confined runtime.

---

## Cost model (reframes T2/T3)

The default `subscription` backend (SSH → `claude -p`) has **static, ~zero marginal cost** - runs consume the Claude subscription, not metered API tokens. So the observability/budget work (**T2**, **T3**) is **not about controlling spend** for the default path; it's about:

1. **Usage visibility** - tokens per run/agent/schedule, latency, volume (operationally useful regardless of billing).
2. **A "savings vs API" story** - record the *notional* API cost of each subscription run (`source='ssh'`) so the dashboard can show "you'd have paid ≈ $X on the API" - a compelling, honest metric for a portfolio.
3. **Real cost + budgets only matter for `source='api'` runs** - budget enforcement (T3) is therefore **lower priority** and scoped primarily to the opt-in API backend, not the subscription default.

This nuance is folded into the telemetry/dashboard items below.

---

## Themes

Nine themes organize every initiative. They are the durable categories; phases below sequence the work within and across them.

| ID | Theme | One-line summary |
|----|-------|------------------|
| **T1** | **Live Agent Theater** | Turn fire-and-forget runs into watchable, real-time experiences: SSE streaming of per-agent stdout, step-level tool-call decomposition, a live control-room UI. Highest-impact demo transformation - proposed as flagship by 4 of 10 personas. |
| **T2** | **Full-Spectrum Observability** | Close the SSH telemetry blind spot so every run produces real token/cost/latency traces parsed from `claude`'s JSON usage. Unified cost dashboard (SSH + RAG + eval), per-agent/per-schedule attribution, analytics/export, platform SLOs with breach alerting. |
| **T3** | **Agent Governance & Safety** | Wire the inert `allow_writes` column into a tiered safety policy engine (read-only / controlled-write / supervised), add human-in-the-loop approval for destructive runs, enforce budgets against the dead `cost_budgets` table, and add a tamper-evident audit trail. |
| **T4** | **Deep Configurability Surface** | The owner's explicit north star. A live Settings UI replacing scattered env vars, per-agent model/inference profiles (temperature, max_tokens, custom model IDs), per-schedule execution policies, retention, and a global settings table editable without redeploy. |
| **T5** | **Composition & Orchestration Depth** | Make multi-agent orchestration programmable: a DAG/pipeline builder with conditional branching that *finally* routes multi-agent runs through LangGraph, saved compositions/crews, cross-run trigger chaining. Beyond the fixed parallel/sequential/meeting trichotomy. |
| **T6** | **Quality & Self-Improvement Loop** | The MLOps story: prompt version history with diffs, A/B experiments with promote-to-active, a configurable eval judge, eval regression tracking with alerts, per-agent long-term memory from past runs. |
| **T7** | **Event-Driven Integrations** | Transform the cron scheduler into an event-driven runtime: inbound webhook triggers (Prometheus, GitHub Actions, n8n), API-key auth with scopes, multi-channel notification routing, outbound webhook fan-out, an integration catalog. |
| **T8** | **Portability & Templates** | Make agents, schedules, and compositions first-class versioned artifacts: YAML import/export, agent packs (generalizing `agency-sync`), a schedule template gallery seeded with the 10 production schedules, a DB-backed MCP registry with health checks. |
| **T9** | **Runtime Robustness** | Operational hardening: durable SQLite-backed job queue surviving pod restarts, retry/backoff with dead-letter lane, scheduler watchdog for missed runs, retention/cleanup to protect the 1Gi PVC. Less flashy - the foundation that makes everything above trustworthy. |

---

## Roadmap at a Glance

| Phase | Name | Timeframe | Primary themes | Flagship(s) |
|-------|------|-----------|----------------|-------------|
| **P1** | Make It Visible & Honest | Weeks 1–3 | T1, T2 | Live Run Theater · SSH Run Telemetry |
| **P2** | Make It Configurable & Governed | Weeks 4–7 | T3, T4 | Settings Hub & Inference Profiles · Tiered Safety Policy Engine |
| **P3** | Make It Trustworthy & Reactive | Weeks 8–11 | T7, T9 | Inbound Webhook Triggers (+ API-Key Auth) |
| **P4** | Make It Smart & Self-Improving | Weeks 12–16 | T6, T2 | Prompt A/B Testing & Versioning Loop |
| **P5** | Make It Composable & Portable | Weeks 17–22 | T5, T8 | Agent Pipeline Builder (DAG) |

The sequencing principle is deliberate: **make the existing capability legible and instrumented first** (P1–P2), **make it trustworthy and reactive next** (P3), then **layer intelligence and orchestration depth** (P4–P5). Visual builders and orchestration depth are sequenced *last on purpose* - they are high-effort and most compelling only once the core loop is visible. This directly answers the strongest cross-persona "hot take": ship the things that prove the architecture works before building demo props.

---

## Phase Plan

### P1 - Make It Visible & Honest
**Timeframe:** Weeks 1–3 · **Themes:** T1 (Live Agent Theater), T2 (Full-Spectrum Observability)

**Goal.** Eliminate the two most embarrassing gaps - invisible runs and an empty cost dashboard - so the platform's *existing* capabilities become legible and instrumented. Highest impact-per-effort work; ships the consensus flagships first.

**Headline items.**

- **Live Run Theater (SSE).** New `GET /api/runs/:id/stream` Server-Sent Events endpoint; per-agent streaming panels in `RunDetailPage`. `executor.js`'s string-accumulation pattern in `runClaudeRemote` becomes an `EventEmitter` keyed by `runId`. **Zero new dependencies** - SSE is native to Node's `http.ServerResponse`.
- **SSH Run Telemetry.** Parse `usage.input_tokens` / `usage.output_tokens` from `claude --output-format json` (already returned, currently discarded in `parseClaudeJson`), call the existing `recordTrace()` per agent. Add a `source` column to `traces` (`ssh` | `api`).
- **Unified cost dashboard.** SSH-vs-API cost split, per-agent/per-schedule attribution on `ObservabilityPage` (Recharts already wired).
- **Activity feed widget** on Home showing the last 5 run events with live status.
- **Seed the 10 production schedule templates** so fresh deployments aren't empty (currently they live only in `STANDARDIZE-TODO.md` notes - created against the live instance, never seeded).

**Success criteria.**

- A multi-agent run is watchable live: per-agent panels fill in real time within ~1s of `stdout` arriving; the run page never shows only a bare spinner.
- Every completed SSH run produces ≥1 `traces` row with real (not estimated) token counts when `claude` returns a `usage` block; the cost dashboard is non-empty after a single demo run.
- A clean `helm`/ArgoCD deploy boots with the 10 schedules present and visible.
- No new npm dependencies introduced; SQLite remains single-writer-safe (the stream is in-process/ephemeral).

---

### P2 - Make It Configurable & Governed
**Timeframe:** Weeks 4–7 · **Themes:** T4 (Deep Configurability Surface), T3 (Agent Governance & Safety)

**Goal.** Deliver the owner's north star (deep configurability) and turn ghost schema into real governance. Wire the dead columns, add the settings surface, and make agents *safely capable of action* - not just reporting.

**Headline items.**

- **Settings Hub.** A `platform_settings` table + live Settings UI. Editable without redeploy: model allowlist, `MAX_CONCURRENT_RUNS`, `MAX_PARALLEL_PER_RUN`, `RUN_TIMEOUT_MS`, `SSH_TARGET`, retention policy, and the safety preamble text. **Env vars seed defaults; DB values override at runtime** - no pod restart to tune.
- **Tiered Safety Policy Engine.** Refactor `safety-prompt.js` from a hardcoded constant to `policyToPrompt(policy)`. Wire `allow_writes` (inert since day one) into three tiers - **read-only / controlled-write / supervised** - selectable per schedule *and* per agent. Named policy artifacts carry `allow_kubectl_write`, `allow_file_write`, `allow_external_http`, `allowed_namespaces`, `denied_commands`, `require_dry_run`.
- **Per-Agent Inference Profiles.** A `model_config` column (`model`, `temperature`, `max_tokens`, `top_p`, extended-thinking toggle) plus **custom model IDs beyond the 3-value `haiku/sonnet/opus` enum** (extensible via the model allowlist setting).
- **Budget Enforcement.** Wire `cost_budgets` end-to-end with per-agent / per-schedule / global caps, `alert_threshold` Discord warnings, and a **pre-dispatch budget gate** (`budget_exceeded` run status). Editable model-pricing table so new model prices need no code change.
- **Run retention policy + cleanup job** to protect the 1Gi Longhorn PVC before run history grows unbounded.

**Success criteria.**

- A user can change `MAX_CONCURRENT_RUNS` (or the model allowlist) from the UI and have it take effect on the next run **without a pod restart**.
- A schedule tagged "controlled-write" demonstrably runs a write command (e.g., `kubectl apply`, `git commit`) that a "read-only" schedule is refused - the active policy is visible on the run.
- `allow_writes` and `cost_budgets` are no longer ghost schema: both have routes, UI, and live behavior (resolving the staff-engineer "unfinished work" smell).
- A demo of five agents in parallel shows **five distinct model badges** at execution time.
- Run history is bounded by the retention policy; projected PVC-exhaustion date is visible and not imminent.

---

### P3 - Make It Trustworthy & Reactive
**Timeframe:** Weeks 8–11 · **Themes:** T7 (Event-Driven Integrations), T9 (Runtime Robustness)

**Goal.** Operational hardening plus the event-driven leap. Make runs fault-tolerant and let external systems trigger agents *safely*. Auth lands alongside webhooks because one is the precondition for the other.

**Headline items.**

- **API-Key Auth.** An `api_keys` table, Bearer middleware, per-key scopes (`read` / `trigger` / `write` / `admin`), and a Settings → API Keys UI. **Secures the currently-open `/claude` proxy** - today any LAN caller can execute arbitrary Claude prompts over the platform's SSH credentials. (Public read-only browse mode optional, gated by setting.)
- **Inbound Webhook Triggers.** A `webhooks` table; `POST /api/webhooks/:token` → existing `scheduler.fireRun()`; payload-template interpolation (`{{payload.field}}`) so one schedule runs different prompts depending on what fired it. Unlocks Prometheus Alertmanager, GitHub Actions, and the n8n bridge.
- **Durable job queue.** Move the in-closure queue array + running counter to a SQLite-backed `job_queue` table surviving pod restarts; retry/backoff with a **dead-letter lane**; `POST /api/runs/:id/retry`.
- **Human-in-the-loop approval gate** for runs flagged `allow_writes`/destructive: `awaiting_approval` status + Discord approve/deny (signed HMAC token).
- **Multi-channel notification router** replacing the single hardcoded `DISCORD_WEBHOOK_URL` (Discord / Slack / email / generic webhook; per-schedule on-start/success/failure rules).
- **Pluggable execution backend.** Keep SSH/`claude -p` as the **default** (uses Claude **subscription** tokens - zero marginal cost) and add an **opt-in Anthropic API backend** (`@anthropic-ai/sdk` is already a dependency) for headless/cloud or pay-per-token use. Selectable global → agent → schedule → run; the active backend is shown per run and feeds the same `traces.source` (`ssh`/`api`) cost split. Additive, *not* a replacement for SSH (cf. the *Not Now* K3s-Job dispatch).

**Success criteria.**

- The `/claude` proxy and all write endpoints reject unauthenticated calls; a scoped `trigger`-only key can fire a run but cannot delete a schedule.
- A `POST` to a webhook token fires the correct schedule with interpolated context, end-to-end, from an external caller (e.g., a simulated Prometheus alert).
- A pod restart mid-run does not silently drop queued/running jobs: orphaned jobs are re-locked and resumed/retried on boot.
- A transient SSH failure retries with backoff rather than failing permanently; exhausted runs land in the dead-letter view with a one-click retry.
- A run flagged destructive pauses for human approval and proceeds only on explicit approve.

---

### P4 - Make It Smart & Self-Improving
**Timeframe:** Weeks 12–16 · **Themes:** T6 (Quality & Self-Improvement Loop), T2 (Full-Spectrum Observability)

**Goal.** The MLOps quality loop - the features that prove production AI/ML thinking. This is the recursive "AI improving AI" moment senior AI hiring managers lean forward for.

**Headline items.**

- **Prompt Versioning.** A `prompt_versions` table; auto-snapshot on edit; unified diff view; **Haiku-generated change summaries** ("tightened kubectl verb allowlist, added Longhorn constraints"); one-click restore.
- **Prompt A/B Testing.** Run an eval suite against two prompt variants in parallel; side-by-side per-case scores; **"Promote to Active"** rewrites `agents.system_prompt` from the empirical winner. No new deps - the eval runner is already parameterized and `system_prompt` is a plain `TEXT` column.
- **Configurable Eval Judge.** Custom rubrics/dimensions/weights, **judge model selection** (fixes the smell that the judge is always Haiku even when grading Opus output), configurable pass threshold, per-suite baseline + **regression tracking with Discord alerts**.
- **Step-level tool-call tracing.** Parse `tool_use` blocks from `claude`'s JSON `messages` array; render an Execution Steps timeline (which tools an agent actually called, in order).
- **Run replay / debug.** Re-execute a historical run with parameter overrides (`task_prompt`, `model`, agent subset) + a diff view against the original.

**Success criteria.**

- Editing an agent prompt auto-creates a restorable version with a human-readable diff and an AI-generated change summary.
- An A/B experiment surfaces exactly which eval cases improved vs. regressed between two prompt variants, and "Promote to Active" updates the live prompt.
- A suite can be graded by a Sonnet/Opus judge with custom dimensions; a regression past the configured threshold fires a Discord alert.
- A run's detail page shows an ordered timeline of the agent's actual tool calls (e.g., `kubectl get nodes` → `read_file` → synthesize).
- A historical run can be replayed with an overridden prompt and diffed against the original.

---

### P5 - Make It Composable & Portable
**Timeframe:** Weeks 17–22 · **Themes:** T5 (Composition & Orchestration Depth), T8 (Portability & Templates)

**Goal.** Programmable orchestration and artifact portability - the depth features that change *what the platform fundamentally is*. Sequenced last deliberately: high effort, and most compelling only after the core loop is visible and instrumented.

**Headline items.**

- **Agent Pipeline Builder.** A DAG with conditional branching, **routed through LangGraph for multi-agent runs** (finally exercising the otherwise-bypassed engine and justifying the dependency), with a live node-status overlay on `RunDetailPage`. Conditions evaluated against prior-step output (`output.includes("CRITICAL")`) via sandboxed `vm.runInNewContext`.
- **Saved Compositions / Crews.** Named reusable agent teams with topology diagrams (fan / chain / round-table), each with run / schedule / export actions; suggested crews auto-derived from the existing `related_agents` graph.
- **Agent Pack & Schedule Template import/export** as versioned YAML - generalizing `agency-sync` into a *writable* marketplace, including an "adopt" path that copies a read-only agency agent into the runnable roster with a `source_pack` tag.
- **DB-backed MCP Registry** with env-var validation badges and an SSH connection test (replacing the static 11-entry in-memory object).
- **Platform SLO dashboard** with breach alerting (success rate, p95 latency, daily cost).

**Success criteria.**

- A pipeline routes between agents based on a prior agent's output (e.g., Sentinel's health check → Atlas *or* Mirror, with Relay always firing) and executes through LangGraph with a live node-status overlay.
- A saved crew can be re-run or scheduled in one click and exported/imported as YAML across deployments.
- An agency agent can be adopted into the runnable roster and then composed/scheduled/evaluated.
- The MCP registry is editable without a redeploy; each server shows an env-var validation badge and a connection-test result.
- The SLO dashboard shows live green/warning/breach status against configured targets and alerts on transition to breach.

---

## Flagship Features

These are the anchor demonstrations - each ties to a theme, carries strong cross-persona consensus, and is the feature a hiring manager remembers from a 90-second screen-share.

### 1. Live Run Theater (SSE Streaming) - *T1*
**The strongest consensus in the entire brainstorm** - proposed as the flagship pick by Pixel, Oracle, Tempo, and Sentinel independently. Today the platform's most powerful capability (multiple agents executing in parallel) is hidden behind a 15-minute spinner. Replacing it with live per-agent streaming panels is the single most visceral, immediately-legible demonstration that real AI agents are doing real work.

- **Why flagship:** zero new dependencies (native Node SSE), the per-agent panel layout already exists as static output, and the payoff is unambiguous to any viewer.
- **Agentic payoff:** viewers watch Atlas grep cluster logs, Sentinel read metrics, and Bastion inspect volumes fill their panels *simultaneously, in real time* - proof of orchestrated AI, not canned outputs.

### 2. SSH Run Telemetry & Unified Cost Attribution - *T2*
**Proposed by 8 of 10 personas - the #1 "embarrassing gap."** Every scheduled SSH run currently produces zero trace rows, so the cost dashboard is empty despite real runs completing. The fix is small (parse `usage` from `claude`'s existing JSON output, call the existing `recordTrace()`) but transformative.

- **Why flagship:** turns the observability dashboard from RAG noise into the full economics of every agent run; it is also the **data prerequisite for budget enforcement and SLOs**.
- **Agentic payoff:** a 5-agent Opus run appears as a real `$0.40` row with per-agent breakdown - the platform accounts for every dollar of AI spend, a key trust signal.

### 3. Tiered Safety Policy Engine (wire `allow_writes`) - *T3*
**Flagship pick by Vault and Flux; surfaced by Oracle and Tempo.** `allow_writes` has been a ghost column since day one - stored, displayed, validated, documented, never read. A staff engineer reviewing the code immediately flags it as unfinished work.

- **Why flagship:** replacing the single hardcoded preamble with a per-schedule/per-agent policy engine (read-only / controlled-write / supervised) turns the platform from a read-only oracle into a controllable orchestrator.
- **Agentic payoff:** the safety posture becomes legible and configurable per run - agents can legitimately commit, apply, and deploy under an **auditable, tiered policy** rather than being universally crippled. Vivid demo: Flux running a GitOps sync with write permission vs. Sentinel running a strictly read-only audit.

### 4. Settings Hub & Per-Agent Inference Profiles - *T4*
**Directly serves the owner's explicit north star.** Today the app has 17+ env vars, a 3-value hardcoded model allowlist, and zero settings UI - it looks like a black box requiring `kubectl` to tune.

- **Why flagship:** a `platform_settings` table with a live Settings UI, plus per-agent `model_config` (model, temperature, max_tokens, custom model IDs), makes the platform feel *owned and operable*.
- **Agentic payoff:** Atlas runs Sonnet at temp 0.1 (precise infra queries) while Oracle runs Opus at temp 0.7 (creative workflow design) - visible differentiation at execution time, not just cosmetic system-prompt differences.

### 5. Inbound Webhook Triggers (event-driven runtime) - *T7*
**Flagship pick by Relay.** A single feature that transforms the platform from a cron scheduler into an event-driven agentic runtime: a Prometheus alert fires Atlas + Sentinel, a git push fires Tempo + Flux - all via `POST /api/webhooks/:token` into the existing `scheduler.fireRun()`.

- **Why flagship:** the prerequisite that unlocks the n8n bridge, Prometheus integration, and the integration catalog. Medium effort, no new external deps. Depends on API-key auth landing alongside it for safety.
- **Agentic payoff:** agents react to the real world instead of just a clock - they become reactive infrastructure components, not a periodic novelty.

### 6. Prompt A/B Testing & Versioning Loop - *T6*
**Flagship pick by Scout; reinforced by Oracle, Pixel, and Ledger.** The "Promote to Active" button - where the platform rewrites an agent's system prompt based on empirical eval results - tells the whole MLOps story in one interaction.

- **Why flagship:** buildable with no new deps (eval runner already parameterized; `system_prompt` is a plain `TEXT` column). This is the recursive meta-AI moment senior AI hiring managers lean forward for.
- **Agentic payoff:** you hypothesize a prompt change, A/B test it against a known eval suite, see exactly which cases improved vs. regressed, and promote the winner - the canonical AI engineering workflow made visible.

### 7. Agent Pipeline Builder (DAG with conditional branching) - *T5*
**Flagship pick by Forge and Oracle.** The only proposal that makes multi-agent orchestration *programmable* rather than fixed, and it finally routes multi-agent runs through the otherwise-bypassed LangGraph engine - justifying that dependency.

- **Why flagship:** a visual graph where Sentinel's health-check output conditionally routes to Atlas (fix) or Mirror (backup), with Relay always firing, is genuinely novel for a homelab portfolio. **Sequenced deliberately after streaming/telemetry land** (per Pixel's and Tempo's hot takes that visual builders are over-weighted vs. making existing capability visible).
- **Agentic payoff:** agents make routing decisions based on prior-agent output - the clearest possible proof of orchestrated AI intelligence rather than a for-loop over SSH calls.

---

## Prioritization

A condensed view of sequencing. **Now** maps to P1, **Next** spans P2–P3, **Later** spans P4–P5, and **Not Now** is explicitly deferred.

### Now (P1)
- Live Run Theater (SSE streaming) - consensus #1 flagship, zero new deps, **M** effort
- SSH Run Telemetry & cost attribution - 8/10 personas, **S/M** effort, fixes the worst gap, unblocks budgets + SLOs
- Unified cost dashboard panels (SSH vs. API split, per-agent attribution)
- Seed the 10 production schedule templates - **S** effort, fixes "fresh deploy looks empty"
- Run retention/cleanup job - **S** effort, protects the 1Gi PVC before run history grows

### Next (P2–P3)
- Settings Hub + `platform_settings` table - the north-star configurability surface
- Tiered Safety Policy Engine wiring `allow_writes` - kills the longest-standing ghost column
- Per-agent inference profiles (`model_config`, custom model IDs)
- Budget enforcement against `cost_budgets` - now that SSH telemetry makes the data real
- API-key auth with scopes - security gap + prerequisite for external integrations
- Inbound webhook triggers - the event-driven leap, depends on auth
- Durable job queue + retry/backoff + dead-letter

### Later (P4–P5)
- Prompt versioning + A/B testing + promote-to-active
- Configurable eval judge + eval regression tracking
- Step-level tool-call tracing (Execution Steps timeline)
- Run replay/debug with diff
- Agent Pipeline Builder (DAG with branching) - flagship-tier but **L** effort; deliberately after the core loop is visible
- Saved compositions/crews with topology diagrams
- Agent pack + schedule template YAML import/export
- DB-backed MCP registry with health checks
- Multi-channel notification router + outbound webhook fan-out + integration catalog
- Human-in-the-loop approval gate
- Per-agent long-term memory from past runs
- Platform SLO dashboard with breach alerting
- Scheduler watchdog for missed runs

### Not Now (explicitly deferred - with rationale)

| Deferred item | Why not now |
|---|---|
| **Postgres / TimescaleDB migration (XL)** | Premature; SQLite + retention handles homelab scale. Revisit only on a real multi-replica need, and coordinate with the separately-specced cross-app centralized Postgres effort. |
| **K3s Job-per-run dispatch (L)** | The SSH dispatch model is a feature to *lean into*, not replace; new RBAC + runner image isn't worth it for a single-host portfolio demo. |
| **Multi-workspace / multi-tenant schema (L)** | Single-user homelab needs no namespace isolation yet; touches 6 tables and adds migration risk for speculative benefit. |
| **Mid-run WebSocket veto (L)** | SSE streaming + the approval gate already cover the supervised-autonomy story without ws connection management. |
| **Published npm SDK + OpenAPI generation** | API-key auth + documented REST is enough; a polished SDK is over-investment for a portfolio piece. |
| **n8n custom community node package** | Outbound webhook + inbound trigger already bridge n8n bidirectionally; a packaged node is diminishing returns. |
| **Run anomaly detection on every run** | Compelling but adds per-run cost/latency; fold into the eval-as-observability story only after the judge is configurable. |
| **Meeting transcript structured parser** | Nice-to-have polish; the streaming Theater view already makes meetings watchable. |
| **Pluggable HTTP/script tool registry** | Powerful but materially expands the attack surface; gate behind the safety policy engine and revisit after governance is solid. |

---

## Settings Pillars (the Configurability Surface)

Theme **T4** is the owner's explicit north star, so the configuration surface gets its own contract. Across the roadmap, settings cluster into eight pillars. Env vars seed defaults; **DB-backed values override at runtime without a redeploy.**

| Pillar | Representative knobs |
|---|---|
| **Platform Settings** (live, DB-backed) | model allowlist, `MAX_CONCURRENT_RUNS`, `MAX_PARALLEL_PER_RUN`, `RUN_TIMEOUT_MS`, `SSH_TARGET`, default execution backend (subscription/api), retention policy, safety preamble text |
| **Per-Agent Profiles** | `model_config` (free-text model ID beyond the 3-value enum, temperature, max_tokens, top_p, extended thinking), default safety tier, `extra_preamble`, `cwd_override`, `max_turns`, `env_overrides`, memory enabled/depth, tags + custom key-value fields |
| **Per-Schedule Execution Policy** | priority, timeout override, `allow_writes` / safety tier (now wired), `allowed_commands`, `max_turns`, retry policy (`max_attempts`, backoff strategy), `execution_backend` (subscription/api), notification routing, retention override, stream mode |
| **Safety & Governance Policies** | named reusable artifacts (read-only / controlled-write / supervised) with `allow_kubectl_write`, `allow_file_write`, `allow_external_http`, `allowed_namespaces`, `denied_commands`, `require_dry_run` - selectable per schedule and per agent, exportable as YAML |
| **Budgets & Cost Controls** | per-agent / per-schedule / global daily + monthly caps, `alert_threshold`, `budget_exceeded_action` (skip / queue / notify-only), reset day, **editable model-pricing table** (new pricing needs no code change) |
| **Eval & Judge Configuration** | judge model selection, custom scoring dimensions with weights + descriptions, configurable pass threshold, custom judge prompt template, per-suite baseline + regression threshold |
| **Notifications & Integrations** | DB-backed multi-channel routing (Discord / Slack / email / webhook), per-schedule on-start/success/failure rules, filter expressions, inbound webhook tokens, API-key scopes + rate limits |
| **Appearance & Presentation** | accent color, dark-mode variant, density (compact / comfortable / spacious), terminal theme for the live stream, presentation/focus mode - persisted to `localStorage`, exportable as a theme JSON |

---

## Guiding Principles (carried from the brainstorm)

1. **Lean into the SSH seam.** Agents run in the *real* environment a senior engineer uses - real `kubectl`, real filesystem, real `CLAUDE.md` context. Show the `cwd`, show the project context being picked up, stream the session output. Do not hide the seams; make them the feature. **Say so in the README:** the SSH/terminal-spawn design deliberately uses Claude **subscription** tokens to avoid API cost (no API key needed to run as shipped); the Anthropic API is offered only as an **opt-in** backend for headless/cloud use.
2. **Visible before clever.** A live, streamed, instrumented run beats a sophisticated-but-invisible feature. Ship legibility first (P1), depth last (P5).
3. **No ghost schema.** Wire `allow_writes` and `cost_budgets` or remove them - half-built columns signal unfinished work to any reviewer. This roadmap commits to wiring both.
4. **Configurability is a design value, not an afterthought.** Every hardcoded constant and scattered env var is a candidate knob (T4 + the eight settings pillars).
5. **Buildable by one engineer on a homelab K3s cluster.** Effort estimates (S/M/L) and the explicit *Not Now* list keep scope honest: prefer features with **no new dependencies** that reuse existing primitives (`recordTrace`, `scheduler.fireRun`, the eval runner, the `agency-sync` ingest pattern).

---

*This is a living planning document. Phases are intentionally bounded and impact-ordered; revisit prioritization after each phase against real demo feedback.*
