# Roadmap Meeting — Minutes

> **Session:** agents-platform roadmap brainstorm
> **Format:** 10-persona multi-agent meeting, single chair synthesizing
> **North star (owner):** Make the platform *far more flexible* — lots of custom settings and configurability — with features that visibly **show off** that we are leveraging AI agents. It is a portfolio piece for senior AI / Cloud / DevOps hiring managers. Every idea must be both **impressive** and **realistically buildable by one engineer on a homelab K3s cluster**.
> **What it is:** a self-hosted multi-agent control plane — agent directory (20 personas), composition, scheduled multi-agent runs (cron; parallel / sequential / meeting) dispatched over SSH to `claude -p`, RAG (Qdrant + Ollama), LangGraph workflows, an eval framework, observability, and an MCP registry.

This document is intentionally written as a *narrative* of the multi-agent process — it doubles as a portfolio artifact showing how the platform's own design was driven by a roster of specialized agents debating, disagreeing, and converging. The agents proposed; the chair decided.

---

## 1. The Room — Roster & Lenses

Ten personas attended, each reading real code before proposing (no speculation — proposals cite real files like `server/executor.js`, `server/safety-prompt.js`, `server/mcp-registry.js`, `server/workflows/graphs.js`).

| Persona | Domain | Lens they argued from |
|---------|--------|-----------------------|
| **Forge** | Full-Stack Architect | Execution engine internals, run orchestration, plugin/tool extensibility, public API + SDK surface |
| **Pixel** | Frontend / UX Lead | Does the UI *show* the intelligence, or hide it behind static tables? Settings UX, visual builders, theming |
| **Oracle** | AI & Agent Capabilities | Model routing, prompt config, memory, RAG depth, autonomy levels, eval/feedback loops |
| **Scout** | Data / Analytics / Eval | Run observability, eval quality, cost/latency/token analytics, A/B testing, data export |
| **Vault** | Security & Access | Auth, RBAC, secrets, sandboxing, approval gates, allow/deny tool policy, tamper-evident audit |
| **Ledger** | Data Model & Persistence | Schema flexibility (custom fields, tags, versioning, templates), richer run storage, migration path |
| **Tempo** | Execution & Runtime Infra | Dispatch backend, durable job queue, retries/backoff, streaming, K3s autoscaling, concurrency |
| **Relay** | Integrations & Triggers | Inbound webhooks (not just cron), multi-channel notifications, integration catalog, n8n bridge, API keys |
| **Sentinel** | Reliability & Run Observability | Step-level tracing, live streaming, failure handling, run replay/debug, platform SLOs |
| **Flux** | Config, Templates & GitOps | Everything-as-config: agents/schedules/MCP as portable YAML, global settings layer, template marketplace |

---

## 2. Flagship Picks & Hot Takes — One Line Per Persona

Each persona was asked for the *one* feature they would build first, and a deliberately spicy hot take to provoke debate.

| Persona | Flagship pick | Hot take (abbreviated) |
|---------|---------------|------------------------|
| **Forge** | Agent Composition Pipelines (DAG + conditional branching) | "The SSH dispatch is **not a constraint — it's a competitive advantage**. Don't hide the SSH seams; make them the feature. Show the `cwd`, show `CLAUDE.md` being picked up, stream the real session." |
| **Pixel** | Live Run Theater (SSE per-agent panels) | "The drag-and-drop Canvas will take 3x the effort and deliver 0.5x the value of simply making existing runs **visible in real time**. Hiring managers aren't impressed by node editors — they're impressed by evidence it works." |
| **Oracle** | Live Run Streaming (SSE) | "The DAG Builder should ship **before** the Discord bot or any Phase 3/4 item. The roadmap optimizes for breadth; the platform's weakness is **depth of the core loop**. Ship the thing that proves the architecture works." |
| **Scout** | Prompt A/B Testing Engine ("Promote to Active") | "The judge should **evaluate the judge**. Haiku at temp 0 on a truncated output is not a ground-truth oracle. Display `judge_accuracy` next to every score before selling eval rigor." |
| **Vault** | Live Run Approval + Veto (mid-run pause gate) | "Human-in-the-loop approval should be the **default for every new schedule**, not opt-in. We proudly run `--dangerously-skip-permissions` on a real cluster with zero review." |
| **Ledger** | Structured SSH run storage + token estimation | "**Delete `cost_budgets` and `allow_writes` entirely** unless you wire them this sprint. Ghost schema is worse than no schema — a staff engineer who finds a stored, displayed, Zod-validated `allow_writes` that never allows writes will wonder what else is unfinished." |
| **Tempo** | Real-Time Run Streaming (SSE) | "The SSH model is **not the bottleneck — the missing execution-policy engine is**. A K8s Job SIGKILL'd at 15 min with no retry is no better than an SSH call SIGKILL'd at 15 min with no retry. Wire `allow_writes`, add a priority queue, give operators per-schedule knobs first." |
| **Relay** | Inbound Webhook Triggers (event-driven runtime) | "The hardcoded `DISCORD_WEBHOOK_URL` (one env var, no routing, no log) showcases the platform more than all twelve React pages combined — and it's the least observable thing in the stack. Rip it out for a DB-driven router with a test-ping button before adding any new AI feature." |
| **Sentinel** | Live Run Streaming + Step-Level Progress | "The eval framework is applied to the **wrong thing**. It scores synthetic cases in isolation. Turn every *scheduled run* into an eval event — **evals-as-observability, not evals-as-QA**. Almost no hobbyist portfolio does this." |
| **Flux** | Safety Policy Engine (wire `allow_writes` to real tiers) | "`agency-sync.js` is the platform's most underused idea — it already pulls YAML agents from GitHub then dead-ends as read-only. Add an 'adopt' button and you have a **live open-source agent marketplace** with zero new infrastructure." |

---

## 3. Persona Deep-Dive — What Each Brought to the Table

### Forge — Full-Stack Architect
Pushed hardest on **making orchestration programmable**. His pipeline proposal (`pipelines` table, `condition_expr` evaluated in a sandboxed `vm.runInNewContext()`, schedulable via a `pipeline_id` FK) is the only one that turns the fixed parallel/sequential/meeting trichotomy into branching logic — and finally routes multi-agent runs through the otherwise-bypassed LangGraph engine. Also surfaced a **Pluggable Tool Registry** (`tool_definitions` with builtin/http/script types) and an **API-key + lightweight SDK + OpenAPI** surface. His framing reframed the whole meeting: *lean into the SSH seam*.

### Pixel — Frontend / UX Lead
The room's loudest voice for **visibility over visual gimmickry**. Proposed Live Run Theater, an Agent Canvas, a four-tab **Settings Hub**, a Unified Run Intelligence dashboard (agent-utilization heatmap, SSH-vs-API cost donut), an in-browser **Agent Profile Studio** (CodeMirror + inline Quick Eval + Claude-generated prompt suggestions), a Schedule Builder 2.0 (template gallery + NL-to-cron), a Cmd+K command palette, and a Theme Engine with a Presentation/Focus mode for live demos. Her hot take directly *contradicted her own Canvas proposal* — a notable act of intellectual honesty that the chair weighted heavily.

### Oracle — AI & Agent Capabilities
Brought the deepest agentic-capability bench: **per-agent model & inference profiles** (`model_config` JSON: model, temperature, max_tokens, top_p, thinking), **per-agent long-term memory** (auto-ingest `per_agent_output` into `agent_<id>` Qdrant collections with recency-weighted recall), **prompt version control + A/B**, a **dynamic safety policy engine**, a **live MCP registry with health checks**, **SSH run telemetry**, and an **explicit dependency DAG** that wires LangGraph into multi-agent runs. Every proposal cited a file he had actually read.

### Scout — Data / Analytics / Eval
The MLOps conscience. Proposed the **SSH Telemetry Bridge** (parse `usage` from `claude --output-format json`, add a `source` column to `traces`), an **Eval Run Diff & Regression Tracker** (baseline pinning + Discord regression alerts), the **Prompt A/B Testing Engine**, **Budget Enforcement**, a **Run Export & Analytics API** (CSV/NDJSON, GitHub-contribution-style activity heatmap), a **Configurable Eval Judge Panel** (custom rubrics/weights, judge-model selection, calibration), and a Live Observability Feed. His "judge the judge" hot take injected necessary humility into the eval story.

### Vault — Security & Access
Forced the governance conversation. Proposed a **per-schedule tool policy engine** (allow/deny lists, tiered preambles), a **human-in-the-loop approval gate** (HMAC-signed approve/deny links, an ApprovalQueue page), a **tamper-evident audit log** (SHA-256 hash chain with a "Verify Chain" button), **API-key auth with scopes**, **per-agent secret bindings** (AES-256-GCM or Vaultwarden-backed env injection with transcript scrubbing), **run sandbox profiles** (ulimit/nice/network isolation), and a WebSocket veto gate. His "approval should be the default" stance was the meeting's strongest safety position.

### Ledger — Data Model & Persistence
The schema realist. Proposed **agent versioning** (Haiku-summarized prompt changelogs), a **custom fields + tags system** (schedule-by-tag targeting), **structured run-span storage with FTS5 search + token estimation**, **schedule templates with parameter substitution** (NL → template generation), a **multi-workspace schema** (per-workspace SSH target / model / webhook overrides), **live budget enforcement**, a **Postgres + TimescaleDB migration path** (adapter shim, hypertables), and a **meeting transcript parser + synthesis** (consensus / dissent / next-action extraction). His "delete the ghost columns or wire them" hot take aligned tightly with Flux and Tempo.

### Tempo — Execution & Runtime Infra
The robustness engineer. Proposed a **durable SQLite-backed job queue** (retry/backoff/dead-letter, orphan re-locking on pod restart), **real-time SSE streaming**, a **K3s Job-per-run dispatch backend** (`DISPATCH_MODE=k8s-job`), **SSH trace instrumentation**, a **per-schedule execution policy engine** (priority queue, preemption, wired `allow_writes`, `--max-turns`), a **run dependency graph** (cross-run trigger chaining with `{{upstream_summary}}` interpolation), and a **scheduler health watchdog** (missed-run detection + auto-recovery). His hot take — *policy engine before dispatch rewrite* — became a load-bearing sequencing decision.

### Relay — Integrations & Triggers
The ecosystem advocate. Proposed **inbound webhook triggers** (`webhooks` table, `POST /api/webhooks/:token` → existing `scheduler.fireRun()`, payload-template interpolation), a **multi-channel notification router** (DB-driven, per-schedule on-start/success/failure rules, filter expressions), **API-key auth with scopes + usage telemetry**, a **bidirectional n8n bridge**, an **Integration Catalog** marketplace UI, **outbound webhook fan-out** (HMAC-signed, delivery log + re-delivery), and a **run retention policy + storage health dashboard**. His webhook proposal is the keystone that unlocks Prometheus/GitHub/n8n integration.

### Sentinel — Reliability & Run Observability
The "show your work" persona. Proposed **SSH run telemetry**, **live SSE streaming with step-level progress**, **structured step tracing** (parse `tool_use` blocks → an Execution Steps timeline), **run replay & debug** (`replay_of` lineage + side-by-side diff), an **SLO dashboard** (success rate / p95 latency / daily cost / scheduler on-time, with breach alerts), **retry policies with failure escalation** (model fallback after N failures, sequential checkpoint resumption), and **run anomaly detection** (Haiku-as-judge scoring *every* run, not just eval suites). His evals-as-observability framing reframed the quality story.

### Flux — Config, Templates & GitOps
The everything-as-config evangelist. Proposed **agent pack import/export** (YAML-native, generalizing `agency-sync.js` into a writable marketplace), a **global settings system** (`platform_settings` table replacing scattered env vars), a **schedule template marketplace** (seeds the 10 production schedules so fresh deploys aren't empty), a **DB-backed MCP registry with health checks**, **SSH telemetry backfill**, **saved composition profiles** (with topology diagrams), and a **safety policy engine** (`safety_policies` table, `policyToPrompt()`, `allow_writes` finally wired to a tier). His flagship became the platform-wide flagship for governance.

---

## 4. Major Themes of Agreement

Despite ten lenses, convergence was striking. Five themes drew near-unanimous support.

### Theme A — "Make the work watchable" (Live Run Theater via SSE)
**Proposed independently as flagship by Pixel, Oracle, Tempo, and Sentinel** — the single strongest consensus in the entire brainstorm. Today the platform's most powerful capability (multiple agents executing in parallel) is hidden behind a 15-minute spinner; `executor.js` buffers stdout into a string and writes it to SQLite only after the child process exits. Everyone agreed: pipe `child.stdout` chunks to a per-run `EventEmitter`, expose `GET /api/runs/:id/stream` as native SSE (zero new dependencies), and render live per-agent panels in `RunDetailPage`. The per-agent panel layout *already exists* as static output. Forge, Vault, and Sentinel further noted streaming is the architectural prerequisite for step-level tracing and mid-run veto.

### Theme B — "Close the SSH telemetry blind spot" (Full-Spectrum Observability)
**Proposed by 8 of 10 personas** and labeled the platform's #1 "embarrassing gap." Every scheduled SSH run produces *zero* trace rows because `recordTrace()` is never called from `executor.js` — so the cost dashboard is empty despite real runs completing. The fix is small and unanimous: `parseClaudeJson()` already receives `claude`'s JSON output containing a `usage` block; extract `input_tokens`/`output_tokens`, call the existing `recordTrace()` with `step_name='ssh_dispatch'` and a `source` column, and the observability dashboard goes from "RAG noise only" to "the full economics of every run." It is also the *data prerequisite* for budget enforcement and SLOs.

### Theme C — "Kill the ghost schema; make governance real" (wire `allow_writes`)
**Flagship for Vault and Flux; explicitly reinforced by Oracle, Tempo, and Ledger.** The `allow_writes` column is stored, displayed, Zod-validated, and documented — but never read by `executor.js` or `workflows/runner.js`. The `cost_budgets` table has columns and no routes. Consensus: replace the single hardcoded `SAFETY_PREAMBLE` with a `policyToPrompt(policy)` function and tiered policies (**read-only / controlled-write / supervised**) selectable per-schedule and per-agent. Ledger's blunt framing — *"ship the feature or drop the table"* — was adopted as a principle.

### Theme D — "Configurability is a design value, not an afterthought" (the owner's north star)
Every persona contributed a settings surface: Pixel's Settings Hub, Oracle's per-agent inference profiles, Tempo's per-schedule execution policy, Flux's `platform_settings` table, Ledger's custom fields/tags, Scout's configurable judge, Relay's notification routing, Vault's safety policies. Unanimous direction: a **live, DB-backed settings layer** where env vars *seed defaults* but DB values *override without a pod restart*, plus a free-text model field that escapes the 3-value `haiku/sonnet/opus` enum.

### Theme E — "Make every run a first-class, durable, attributable artifact"
Tempo (durable queue), Ledger (structured run-spans + FTS5), Sentinel (replay/lineage), Relay (retention policy), and Scout (export API) all converged on the same insight: runs are currently opaque, unbounded blobs on a 1Gi PVC with no cleanup. The shared direction: structure the storage, attribute the cost, protect the disk, and make runs replayable and exportable.

---

## 5. Points of Tension & Debate

The interesting part. The hot takes were engineered to collide — here is where they did.

### Debate 1 — Visibility vs. Visual Builders *(the central tension)*
> **Pixel:** "The drag-and-drop Canvas delivers 0.5x the value of making runs visible in real time. The Canvas is Phase-3 nice-to-have, not a Phase-1 flagship."
> **Forge & Oracle (DAG flagships):** "The DAG Builder *changes what the platform is*. One visual graph wiring LangGraph to live SSH runs does more than ten new personas."

Both are partly right, and they were arguing past each other. Pixel is right that a builder shipped *before* runs are visible is a demo prop. Forge/Oracle are right that the DAG is the deepest agentic showcase. **The disagreement is about sequence, not merit** — and Tempo's hot take ("depth of the core loop first") broke the tie in Pixel's favor on *ordering*.

### Debate 2 — Is the SSH seam a feature or a flaw?
> **Forge:** "SSH dispatch is a competitive advantage — agents run in the same environment a senior engineer uses interactively. Don't apologize for it; stream the real session."
> **Tempo:** "Add a K3s Job-per-run backend so each run is a first-class K8s workload, visible in `kubectl get jobs`, logged by Loki, resource-governed."

Tempo's own hot take partially conceded the point: *"A K8s Job SIGKILL'd at 15 min with no retry is no better than an SSH call SIGKILL'd at 15 min."* The room landed on Forge's framing as the *narrative* (lean into SSH, make it watchable) while keeping Tempo's K8s Job dispatch as an explicit **non-goal for now** — too much new RBAC + a runner image for a single-host portfolio demo.

### Debate 3 — Should the platform act, or only report?
> **Vault:** "Human-in-the-loop approval should be the **default** for every schedule. We run `--dangerously-skip-permissions` with zero review."
> **Flux / Oracle / Tempo:** "Wire `allow_writes` into tiered policies so agents can *legitimately* act — commit, apply, deploy — under an auditable policy."

These aren't opposed so much as two halves of one system: tiered policy *enables* action; approval gates *govern* it. The tension was over defaults. The chair sided with capability-with-governance: policies first (so action is *possible* and *legible*), approval gate as a *fast follow* gating only write-tier runs — not a blanket default that would make every demo start with a permission prompt.

### Debate 4 — Can we trust our own eval judge?
> **Scout:** "The judge should evaluate the judge. Haiku on a truncated output is not ground truth. Show `judge_accuracy` before selling eval rigor."
> **Sentinel:** "Evals are applied to the wrong thing — score *every run*, not synthetic cases. Evals-as-observability."

Complementary, not contradictory, but they pull effort in different directions: Scout wants the judge *calibrated*; Sentinel wants it *ubiquitous*. The room agreed both are right and **sequenced calibration before ubiquity** — a configurable, calibrated judge (Scout) must land before scoring every run (Sentinel), or you scale an unreliable measurement. Sentinel's per-run anomaly scoring was flagged for cost/latency review and pushed to *after* the judge is configurable.

### Debate 5 — Schema ambition vs. homelab pragmatism
> **Ledger (one proposal):** Multi-workspace schema + Postgres/TimescaleDB migration (adapter shim, hypertables, StatefulSet).
> **Ledger (his own hot take) + the room:** "SQLite + a retention policy handles homelab scale. Don't pay XL migration cost for speculative benefit."

Ledger argued *against his own most ambitious proposal*, and the room agreed. Postgres/Timescale and multi-tenant schema were ruled **premature** — SQLite WAL + retention is sufficient, and a separately-specced cross-app Postgres effort already exists to coordinate with later.

### Debate 6 — Notifications: polish the pipe, or add AI?
> **Relay:** "Before any new AI feature, rip out `DISCORD_WEBHOOK_URL` for a DB-driven router with a test-ping button. Observability of your own notification pipeline signals engineering maturity."

This was less a debate than a provocation that *no one rebutted* — a rare unanimous nod. It reframed an "unglamorous" item as a maturity signal, and the multi-channel router earned a firm place in the roadmap.

---

## 6. The Chair's Decisions

After hearing all ten, the chair synthesized a single coherent plan. The decisions below are binding for the roadmap.

### 6.1 The North Star (adopted)
> **Make agents-platform a deeply configurable, self-hosted multi-agent control plane where every agent run is visibly alive, fully instrumented, and governed by knobs an operator can turn from the UI — so that watching it work is the proof that real AI agents are doing real engineering work on real infrastructure.**

**Positioning for hiring managers** — the platform proves the builder can *design, instrument, and govern* an autonomous AI agent system end-to-end, demonstrating: (1) production observability applied to agent runs; (2) operational maturity (retries, dead-letter, budgets, retention, safety, human-in-the-loop); (3) cloud-native fluency (K3s + ArgoCD GitOps, MetalLB, SSH dispatch picking up real `CLAUDE.md` context); (4) an MLOps quality loop (evals, LLM-as-judge, prompt versioning, A/B, regression alerts); and (5) genuine configurability as a design value. **The SSH seam is leaned into as a feature, not apologized for as a flaw.**

### 6.2 The Flagship Features (chosen)
Seven flagships, each tied to a theme, each chosen for impact-per-effort and the multi-agent showcase.

| # | Flagship | Theme | Why it won the room |
|---|----------|-------|---------------------|
| 1 | **Live Run Theater (SSE streaming)** | Live Agent Theater | Strongest consensus (4 independent flagship picks). Zero new deps; per-agent panel already exists. The single most visceral demo: watch Atlas grep logs, Sentinel read metrics, Bastion inspect volumes — simultaneously, live. |
| 2 | **SSH Run Telemetry & Unified Cost Attribution** | Full-Spectrum Observability | 8/10 personas; the #1 embarrassing gap. Parse `usage` from existing JSON, call existing `recordTrace()`. A 5-agent opus run becomes a real `$0.40` row with per-agent breakdown. Unblocks budgets + SLOs. |
| 3 | **Tiered Safety Policy Engine (wire `allow_writes`)** | Agent Governance & Safety | Vault + Flux flagship. Kills the longest-standing ghost column. Vivid governance demo: Flux runs a GitOps sync *with* kubectl write vs Sentinel runs a strictly read-only audit. |
| 4 | **Settings Hub & Per-Agent Inference Profiles** | Deep Configurability | Directly serves the owner's explicit north star. `platform_settings` + live UI; per-agent `model_config` (model/temp/max_tokens, custom model IDs). Five agents in parallel, each with a different model badge. |
| 5 | **Agent Pipeline Builder (DAG + conditional branching)** | Composition & Orchestration Depth | Forge + Oracle flagship. The only proposal making orchestration *programmable*; finally routes multi-agent runs through LangGraph. **Deliberately sequenced AFTER streaming/telemetry** per Pixel's and Tempo's hot takes. |
| 6 | **Prompt A/B Testing & Versioning Loop** | Quality & Self-Improvement | Scout flagship; reinforced by Oracle, Pixel, Ledger. The "Promote to Active" button tells the whole MLOps story in one click. No new deps. |
| 7 | **Inbound Webhook Triggers (event-driven runtime)** | Event-Driven Integrations | Relay flagship. Turns a cron scheduler into a reactive runtime: a Prometheus alert fires Atlas + Sentinel via `POST /api/webhooks/:token` → existing `scheduler.fireRun()`. Depends on API-key auth landing alongside. |

### 6.3 Prioritization Calls
The chair organized the work into **five phases**, sequenced by the meeting's resolved tensions (visibility first; depth and builders deliberately last).

| Phase | Name | Goal | Timeframe |
|-------|------|------|-----------|
| **P1** | Make It Visible & Honest | Eliminate the two most embarrassing gaps — invisible runs, empty cost dashboard. Highest impact-per-effort; ships the consensus flagships first. | Weeks 1–3 |
| **P2** | Make It Configurable & Governed | Deliver deep configurability and turn ghost schema into real governance. | Weeks 4–7 |
| **P3** | Make It Trustworthy & Reactive | Operational hardening + the event-driven leap; secure the open API. | Weeks 8–11 |
| **P4** | Make It Smart & Self-Improving | The MLOps quality loop — prove production AI/ML thinking. | Weeks 12–16 |
| **P5** | Make It Composable & Portable | Programmable orchestration + artifact portability. Last by design: high effort, most compelling once the core loop is visible. | Weeks 17–22 |

**Phase headline items:**

- **P1 — Make It Visible & Honest**
  - Live Run Theater: SSE `GET /api/runs/:id/stream`, per-agent streaming panels (zero new deps)
  - SSH Run Telemetry: parse `usage` from `claude --output-format json`, write trace rows; add `source` column (`ssh`|`api`)
  - Unified cost dashboard: SSH-vs-API split, per-agent/per-schedule attribution on `ObservabilityPage`
  - Activity-feed widget on Home (last 5 run events, live status)
  - **Seed the 10 production schedule templates** so fresh deployments aren't empty

- **P2 — Make It Configurable & Governed**
  - Settings Hub: `platform_settings` table + live UI (model allowlist, concurrency, timeouts, retention, safety preamble) editable without redeploy
  - Tiered Safety Policy Engine: `safety-prompt.js` → `policyToPrompt()`, wire `allow_writes` to read-only / controlled-write / supervised
  - Per-Agent Inference Profiles: `model_config` (model, temperature, max_tokens, top_p); custom model IDs beyond the 3-value enum
  - Budget Enforcement: wire `cost_budgets` end-to-end (per-agent/per-schedule/global caps, alert_threshold, pre-dispatch gate)
  - Run retention policy + cleanup job (protect the 1Gi PVC)

- **P3 — Make It Trustworthy & Reactive**
  - API-Key Auth: `api_keys` table, Bearer middleware, scopes (read/trigger/write/admin) — secures the open `/claude` proxy
  - Inbound Webhook Triggers: `webhooks` table, `POST /api/webhooks/:token` → `scheduler.fireRun()`, payload interpolation
  - Durable job queue: SQLite-backed, survives pod restarts; retry/backoff + dead-letter lane; `/api/runs/:id/retry`
  - Human-in-the-loop approval gate for write-tier/destructive runs (`awaiting_approval` + Discord approve/deny)
  - Multi-channel notification router replacing the single hardcoded `DISCORD_WEBHOOK_URL`

- **P4 — Make It Smart & Self-Improving**
  - Prompt Versioning: `prompt_versions` table, auto-snapshot on edit, diff view, Haiku-generated change summaries, restore
  - Prompt A/B Testing: suite against two variants in parallel, side-by-side scores, **Promote-to-Active**
  - Configurable Eval Judge: custom rubrics/weights, judge-model selection, regression tracking + baseline alerts
  - Step-level tool-call tracing: parse `tool_use` blocks → Execution Steps timeline
  - Run replay/debug: re-execute a historical run with parameter overrides + diff

- **P5 — Make It Composable & Portable**
  - Agent Pipeline Builder: DAG + conditional branching, routed through LangGraph, live node-status overlay
  - Saved Compositions/Crews: named reusable teams with topology diagrams
  - Agent Pack & Schedule Template import/export as versioned YAML (generalizing `agency-sync.js` into a writable marketplace)
  - DB-backed MCP Registry with env-var validation badges + SSH connection test
  - Platform SLO dashboard with breach alerting (success rate, p95 latency, daily cost)

### 6.4 The Prioritization Ledger — Now / Next / Later / Not Now

**▶ NOW** *(highest impact-per-effort; ships consensus flagships)*
- Live Run Theater (SSE) — consensus #1, zero new deps, **M** effort
- SSH Run Telemetry & cost attribution — 8/10 personas, **S/M**, fixes the worst gap, unblocks budgets + SLOs
- Unified cost dashboard panels (SSH-vs-API split, per-agent attribution)
- Seed the 10 production schedule templates — **S**, fixes "fresh deploy looks empty"
- Run retention/cleanup job — **S**, protects the 1Gi PVC before history grows

**⏭ NEXT** *(the configurability + governance north star)*
- Settings Hub + `platform_settings` table
- Tiered Safety Policy Engine wiring `allow_writes`
- Per-agent inference profiles (`model_config`, custom model IDs)
- Budget enforcement against `cost_budgets` (now that SSH telemetry makes the data real)
- API-key auth with scopes (security gap + prerequisite for integrations)
- Inbound webhook triggers (depends on auth)
- Durable job queue + retry/backoff + dead-letter

**🕓 LATER** *(depth & MLOps; sequenced after the core loop is visible)*
- Prompt versioning + A/B + promote-to-active
- Configurable eval judge + regression tracking
- Step-level tool-call tracing (Execution Steps timeline)
- Run replay/debug with diff
- **Agent Pipeline Builder (DAG + branching)** — flagship-tier but **L**; deliberately after the core loop is visible
- Saved compositions/crews with topology diagrams
- Agent pack + schedule template YAML import/export
- DB-backed MCP registry with health checks
- Multi-channel notification router + outbound webhook fan-out + integration catalog
- Human-in-the-loop approval gate
- Per-agent long-term memory from past runs
- Platform SLO dashboard with breach alerting
- Scheduler watchdog for missed runs

**⛔ NOT NOW** *(explicitly deferred, with rationale)*
- **Postgres/TimescaleDB migration (XL)** — premature; SQLite + retention handles homelab scale; coordinate with the separate cross-app Postgres effort
- **K3s Job-per-run dispatch (L)** — the SSH model is a feature to lean into, not replace; new RBAC + runner image not worth it for a single-host demo
- **Multi-workspace/multi-tenant schema (L)** — single-user homelab needs no namespace isolation; migration risk for speculative benefit
- **Mid-run WebSocket veto (L)** — SSE + the approval gate cover supervised autonomy without ws connection management
- **Published npm SDK + OpenAPI generation** — API-key auth + documented REST is enough for a portfolio
- **n8n custom community node package** — inbound trigger + outbound webhook already bridge n8n bidirectionally
- **Run anomaly detection on every run** — adds per-run cost/latency; fold into eval-as-observability *after* the judge is configurable (resolves Scout-vs-Sentinel sequencing)
- **Meeting transcript structured parser** — the streaming Theater already makes meetings watchable
- **Pluggable HTTP/script tool registry** — expands attack surface; gate behind the policy engine and revisit after governance is solid

### 6.5 Settings Pillars (the configurability commitment)
The owner's north star, decomposed into eight concrete pillars the Settings surface must eventually cover:

1. **Platform Settings (live, DB-backed)** — model allowlist, `MAX_CONCURRENT_RUNS`, `MAX_PARALLEL_PER_RUN`, `RUN_TIMEOUT_MS`, `SSH_TARGET`, retention policy, safety preamble text; env vars seed defaults, DB values override without restart.
2. **Per-Agent Profiles** — `model_config` (free-text model ID, temperature, max_tokens, top_p, extended thinking), default safety tier, extra preamble, `cwd_override`, `max_turns`, env overrides, memory enabled/depth, tags + custom key-value fields.
3. **Per-Schedule Execution Policy** — priority, timeout override, `allow_writes`/safety tier (now wired), allowed commands, max turns, retry policy, notification routing, retention override, stream mode.
4. **Safety & Governance Policies** — named reusable artifacts (read-only / controlled-write / supervised) with `allow_kubectl_write`, `allow_file_write`, `allow_external_http`, `allowed_namespaces`, `denied_commands`, `require_dry_run`; selectable per schedule and per agent; exportable as YAML.
5. **Budgets & Cost Controls** — per-agent / per-schedule / global daily & monthly caps, configurable alert_threshold, `budget_exceeded_action` (skip/queue/notify-only), reset day, editable model pricing table.
6. **Eval & Judge Configuration** — judge-model selection, custom scoring dimensions with weights/descriptions, configurable pass threshold, custom judge prompt template, per-suite baseline + regression threshold.
7. **Notifications & Integrations** — DB-backed multi-channel routing (Discord/Slack/email/webhook), per-schedule on-start/success/failure rules, filter expressions, inbound webhook tokens, API-key scopes + rate limits.
8. **Appearance & Presentation** — accent color, dark-mode variant, density, terminal theme for the live stream, presentation/focus mode; persisted to localStorage and exportable as theme JSON.

---

## 7. Closing Synthesis — Why This Plan Wins the Interview

The chair's summary, delivered to the room:

> *"We are not going to out-feature a funded startup, and we shouldn't try. What we will do is prove a thesis no chatbot wrapper can: that one engineer designed, instrumented, and governed an autonomous multi-agent system on real infrastructure — and made it watchable. P1 makes the existing work visible and honest. P2 makes it ours, with knobs on everything. P3 makes it trustworthy and reactive. P4 makes it measurably self-improving. P5 makes it composable. The ghost columns get wired, the cost dashboard fills with real numbers, and the SSH seam — the thing everyone else would hide — becomes the headline: real `kubectl`, real filesystem, real `CLAUDE.md`, streamed live. That is the demo where a hiring manager leans forward."*

The vote was the work itself: ten specialized agents, debating from genuinely different lenses, converging on a sequenced plan. That process — proposal, dissent, synthesis — *is* the portfolio story. The platform was designed the way the platform runs.
