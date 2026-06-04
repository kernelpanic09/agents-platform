# Prioritization, Risks & Sequencing

> **Lens:** principal engineer + hiring manager. This document sorts every proposal in the idea bank into tiers, lays out a build-first sequence that maximizes interview "wow" per unit of risk, names the dependencies and platform constraints that govern that sequence, and ends with an explicit *do-not-build-yet* list and an *if-you-only-build-3-things* recommendation.

**North star.** Make `agents-platform` a deeply configurable, self-hosted multi-agent control plane where every agent run is *visibly alive*, *fully instrumented*, and *governed by knobs an operator can turn from the UI* - so that watching it work is the proof that real AI agents are doing real engineering work on real infrastructure.

**The honest differentiator.** Agents execute `claude -p` over SSH in the same environment a senior engineer uses interactively: real `kubectl`, real filesystem, real `CLAUDE.md` project context, real NVM-managed Node. The SSH seam is a *feature to lean into*, not a flaw to apologize for. Every prioritization call below is made through one filter: **does this make that real work more visible, more configurable, or more trustworthy - and can one engineer ship it on a single-replica K3s deployment without breaking what already works?**

---

## 1. The Brutal Summary (read this first)

The deployed codebase is already far ahead of its written `ROADMAP.md`: scheduler, LangGraph workflows, RAG, eval, observability, and agency sync are all live. The problem is **not capability - it is legibility and finish.** Three facts dominate every decision in this doc:

1. **The most powerful thing the platform does is invisible.** Multi-agent parallel runs hide behind a 15-minute spinner. A hiring manager watching a demo sees nothing move.
2. **The cost dashboard is empty despite real work.** SSH runs write zero trace rows. A staff engineer opening Observability sees only RAG noise and concludes the platform does nothing.
3. **Ghost schema signals unfinished work.** `allow_writes` is stored, displayed, validated by Zod - and never read. `cost_budgets` exists with no routes. A code reviewer flags both within five minutes and starts wondering what else is fake.

Fixing those three is *higher leverage than any net-new feature.* The cross-persona consensus is unusually strong: **8 of 10 personas independently named SSH telemetry as the worst gap, and live streaming was the flagship pick of 4 personas (Pixel, Oracle, Tempo, Sentinel).** When ten specialists converge on the same two items without coordinating, that is the signal. Build those first.

---

## 2. Tier Classification

Every proposal in the idea bank, sorted by interview impact × buildability × risk. Effort is the proposers' estimate (S/M/L/XL); *Risk* reflects how likely it is to destabilize the single-replica deployment or expand scope unboundedly.

### 🏆 Flagship - the demo *is* this feature

These produce the "lean forward" moment for a senior AI/Cloud/DevOps hiring manager. Each is buildable by one engineer with no (or one small) new dependency.

| Feature | Theme | Effort | Risk | Why flagship |
|---|---|---|---|---|
| **Live Run Theater (SSE streaming)** | T1 | M | Low | Consensus #1. Turns the spinner into a live control room. Native Node SSE - zero new deps. Per-agent panel layout already exists as static output. |
| **SSH Run Telemetry & Unified Cost Attribution** | T2 | S–M | Low | 8/10 personas. Parse `usage` from `claude --output-format json`, call existing `recordTrace()`. Fills the empty dashboard; unblocks budgets + SLOs. |
| **Tiered Safety Policy Engine (wire `allow_writes`)** | T3 | S–M | Med | Kills the longest-standing ghost column. Turns a read-only oracle into a governed orchestrator. Vivid governance demo (Flux writes vs Sentinel read-only). |
| **Settings Hub + Per-Agent Inference Profiles** | T4 | M | Med | Directly serves the owner's explicit north star (lots of settings). Five agents in parallel, each a different model badge, reads as sophisticated orchestration. |
| **Prompt A/B Testing & Versioning ("Promote to Active")** | T6 | M | Low | The recursive meta-AI moment. Hypothesize → A/B → see which cases improved → promote. No new deps; `system_prompt` is a plain TEXT column. |
| **Inbound Webhook Triggers (event-driven runtime)** | T7 | M | Med | Transforms cron-scheduler → reactive runtime. Prometheus alert fires Atlas+Sentinel. Unlocks the n8n/integration narrative. Needs auth alongside. |
| **Agent Pipeline Builder (DAG w/ conditional branching)** | T5 | L | High | Makes multi-agent orchestration *programmable*; finally routes multi-agent runs through LangGraph. Highest ceiling, highest effort - sequenced *late* on purpose. |

### 🧱 Table-stakes - expected by any serious reviewer, mostly invisible until inspected

Not demo-flashy, but their *absence* is a red flag. A senior engineer who can't find these assumes the platform is a toy.

| Feature | Theme | Effort | Risk | Why table-stakes |
|---|---|---|---|---|
| **API-key auth + per-key scopes** | T7 | M | Med | "No auth anywhere" + an open `/claude` SSH proxy is the first thing a senior engineer flags. Prerequisite for webhooks/integrations. |
| **Run retention / cleanup job** | T9 | S | Low | The 1Gi PVC will fill with verbose transcripts. No DELETE endpoint today. Protects the foundation. |
| **Seed the 10 production schedule templates** | T8 | S | Low | Fresh deploys are *empty* - the schedules live only in `STANDARDIZE-TODO.md` notes. A blank platform demos terribly. |
| **Budget enforcement (wire `cost_budgets`)** | T3 | M | Med | Second ghost table. Self-governing spend caps is a trust signal - but only real *after* SSH telemetry exists. |
| **Durable job queue + retry/backoff + dead-letter** | T9 | M | Med | In-memory queue drops everything on pod restart; one SSH blip = permanent failure. Operational maturity. |
| **Configurable eval judge (rubrics, judge model)** | T6 | L | Med | Hardcoded Haiku judge / 4 fixed dims / 0.6 threshold reads as a black box to an MLOps reviewer. |
| **Run replay/debug with diff** | (Sentinel) | M | Low | The iterative agent-dev loop. Cheap, high-utility, makes prompt iteration visible. |
| **Step-level tool-call tracing (Execution Steps timeline)** | T2 | M | Med | Parse `tool_use` blocks from claude JSON → show the agent *thinking*. Strong "show your work" payoff. Depends on telemetry landing first. |

### 🎁 Nice-to-have - real value, but later or optional

Genuinely good ideas that improve the platform but are not load-bearing for the portfolio story. Build after the core loop is visible and governed.

| Feature | Effort | Note |
|---|---|---|
| Saved Compositions/Crews + topology diagrams | M | Reusable agent teams. Strong visual, but secondary to making *runs* visible first. |
| Agent Pack + Schedule Template YAML import/export | M | Finishes the half-built `agency-sync.js` pattern (Flux's insight). "Open-source agent marketplace" story. |
| DB-backed MCP registry + health checks | M | Turns a static config generator into a live capability matrix. Currently inert. |
| Multi-channel notification router (Discord/Slack/email/webhook) | M | Replaces the single hardcoded `DISCORD_WEBHOOK_URL`. Maturity signal, modest wow. |
| Human-in-the-loop approval gate | M | Supervised-autonomy story. SSE + tiered policy already cover most of this narrative. |
| Per-agent long-term memory from past runs | M | Needs a Qdrant PVC (currently emptyDir). Compelling "stateful AI" but infra-dependent. |
| Platform SLO dashboard + breach alerting | L | Self-monitoring is impressive; needs telemetry + budgets as a data substrate first. |
| Scheduler watchdog for missed runs | S | Self-healing reliability. Pairs naturally with the durable queue. |
| Pluggable tool registry (HTTP/script tools) | L | Powerful, but expands attack surface - gate behind the policy engine. |
| Outbound webhook fan-out + integration catalog | M/L | Ecosystem-citizen polish; build after inbound triggers + auth. |
| Custom agent fields & tags | M | Schema flexibility (tag-based schedule targeting). Nice config surface, not core. |
| Global command palette (Cmd+K) | S | Power-user UX. Pure polish. |
| Theme engine / presentation mode | S | "Portfolio-ready" demo polish - genuinely useful for *recording* the demo, but cosmetic. |
| Meeting transcript structured parser | M | The Theater view already makes meetings watchable. |
| Schedule Builder 2.0 wizard + NL→cron | M | UX upgrade; valuable but not a differentiator on its own. |

### 🔇 Noise - do not build (this cycle, or possibly ever)

High effort, speculative benefit, or actively counter to the "lean into SSH" thesis. Building these *subtracts* from the portfolio by burning weeks on plumbing a reviewer will never see.

| Feature | Effort | Why it's noise *for this portfolio* |
|---|---|---|
| **Postgres/TimescaleDB migration** | XL | Premature. SQLite + retention handles homelab scale. A separately-specced cross-app Postgres effort already exists - don't duplicate. |
| **K3s Job-per-run dispatch** | L | Replaces the very thing that makes this platform distinctive. New RBAC + runner image for a single-host demo = complexity with no demo payoff. |
| **Multi-workspace / multi-tenant schema** | L | Touches 6 tables for a single-user homelab. Migration risk for speculative isolation nobody needs. |
| **Mid-run WebSocket veto** | L | SSE + the approval gate cover supervised autonomy. A `ws` dependency + connection management is over-engineering. |
| **Published npm SDK + OpenAPI generation** | M | API-key auth + documented REST is enough. A polished SDK is over-investment for a portfolio. |
| **n8n custom community node package** | L | Inbound trigger + outbound webhook already bridge n8n bidirectionally. Diminishing returns. |
| **Per-run anomaly detection / quality scoring** | L | Adds per-run cost + latency to *every* run. Fold into the eval-as-observability story *only after* the judge is configurable. |

---

## 3. The "Make It Visible & Honest First" Sequencing Principle

The single most important sequencing decision, validated by two independent hot takes (Pixel and Tempo):

> **Visual builders are over-weighted versus making existing capability visible.** A drag-and-drop DAG editor is impressive in a screenshot, but senior AI/Cloud/DevOps reviewers are impressed by *evidence the system works and is instrumented* - not by node graphs. Ship the things that make the *current* power legible before the things that add *new* power.

This is why the flagship-tier **Pipeline Builder is sequenced last** despite being a flagship: it adds capability the platform can't yet *show*. Streaming and telemetry add no capability but reveal everything. Reveal first, then extend.

---

## 4. Recommended Build-First Sequence

Five phases, each with a single thesis. Phases ship in order; items *within* a phase can parallelize. Timeframes assume one engineer part-time.

### Phase 1 - Make It Visible & Honest *(Weeks 1–3)*

> **Thesis:** Eliminate the two embarrassing gaps. After this phase, a 90-second screen-share demo is genuinely impressive with *zero* new platform capability - just exposed truth.

| Step | What | Rationale | Risk / Dependency |
|---|---|---|---|
| 1.1 | **SSH Run Telemetry** - extend `parseClaudeJson()` to read `usage.{input,output}_tokens`; call existing `recordTrace()` per agent; add a `source` column (`ssh`\|`api`) to `traces`. | *Smallest effort, fixes the worst gap.* Data already exists in claude's JSON output and is currently discarded. Unblocks budgets + SLOs. Do it first so everything downstream has real numbers. | Effort S. No new deps. **Dependency for:** budgets, SLOs, step tracing. |
| 1.2 | **Live Run Theater (SSE)** - `GET /api/runs/:id/stream`; replace stdout string-buffer accumulation with an in-process `EventEmitter` keyed by `runId`; per-agent streaming panels in `RunDetailPage`. | The consensus #1 flagship. Highest visceral payoff per hour. The per-agent panel layout already exists as static output. | Effort M. Native Node SSE, no new deps. **Risk:** must add a `MAX_STREAM_DURATION_MS` guard so connections don't hang; in-memory registry is fine on single replica (lost on restart - acceptable). |
| 1.3 | **Unified cost dashboard panels** - SSH-vs-API split, per-agent / per-schedule attribution on `ObservabilityPage`; activity-feed widget on Home. | Makes 1.1's new data legible. The dashboard goes from "RAG noise" to "full economics of every run." | Effort S. Recharts already wired. Depends on 1.1. |
| 1.4 | **Seed the 10 production schedule templates** - a real seed function so fresh deploys aren't empty. | Trivial effort, fixes "fresh deploy looks broken." Required for *any* clean demo. | Effort S. Low risk. |
| 1.5 | **Run retention / cleanup job** - nightly node-cron purge, configurable `max_runs`/`max_age_days`; storage-health readout. | Protect the 1Gi PVC *before* run history grows. Cheap insurance; do it while touching the runs table. | Effort S. node-cron already imported. Low risk. |

**Phase 1 exit criteria:** a recorded demo shows five agent panels streaming live, a cost dashboard populating in real time during the run, and a non-empty schedule gallery. That alone clears the bar for most interviews.

### Phase 2 - Make It Configurable & Governed *(Weeks 4–7)*

> **Thesis:** Deliver the owner's explicit north star (deep configurability) and convert ghost schema into real governance. After this phase the platform "feels owned" and is safely capable of *action*, not just reporting.

| Step | What | Rationale | Risk / Dependency |
|---|---|---|---|
| 2.1 | **Settings Hub** - `platform_settings` table + live Settings UI (model allowlist, concurrency, timeouts, retention, editable safety preamble). Env vars seed defaults; DB values override without a pod restart. | The configurability north star made concrete. Replaces "17 env vars + kubectl to tune" with an operator console. | Effort M. **Risk:** must keep env-var fallback so nothing breaks if the table is empty. |
| 2.2 | **Tiered Safety Policy Engine** - refactor `safety-prompt.js` from a constant to `policyToPrompt(policy)`; wire `allow_writes` into read-only / controlled-write / supervised tiers, selectable per-schedule and per-agent. | Kills the #1 ghost column. Produces the governance demo: Flux runs a GitOps sync with write permission while Sentinel stays strictly read-only - and the policy is a visible, auditable artifact. | Effort S–M. **Risk:** elevated permissions on a real cluster - *default must remain read-only*; supervised tier should require a second gate (env flag). |
| 2.3 | **Per-Agent Inference Profiles** - `model_config` column (model ID free-text beyond the 3-value enum, temperature, max_tokens, top_p); per-agent badges at execution time. | Visible differentiation: Atlas sonnet@0.1 (precise) vs Oracle opus@0.7 (creative). Removes the hardcoded 3-model allowlist that blocks new model versions without a code deploy. | Effort M. Touches `executor.js` `safeModel()` and `graphs.js` `getLLM()`. Low–med risk. |
| 2.4 | **Budget enforcement** - wire `cost_budgets` end-to-end: per-agent / per-schedule / global daily-monthly caps, `alert_threshold` Discord warnings, pre-dispatch budget gate. | The second ghost table made real - and *now meaningful* because 1.1 made SSH spend visible. Self-throttling is an autonomous-governance trust signal. | Effort M. **Hard dependency on 1.1** (no real spend data before it). |

**Phase 2 exit criteria:** an operator can change the model allowlist, concurrency, and a safety tier from the UI with no redeploy; a write-enabled run visibly executes a real change under an auditable policy; a runaway schedule is blocked at its budget.

### Phase 3 - Make It Trustworthy & Reactive *(Weeks 8–11)*

> **Thesis:** Operational hardening + the event-driven leap. Runs become fault-tolerant and external systems can safely trigger agents.

| Step | What | Rationale | Risk / Dependency |
|---|---|---|---|
| 3.1 | **API-key auth + per-key scopes** - `api_keys` table, Bearer middleware, scopes (read/trigger/write/admin), Settings → API Keys UI. | Closes the "no auth anywhere" gap and secures the open `/claude` proxy. **Must land *with or before* webhooks.** | Effort M. `crypto` only, no new deps. **Risk:** don't lock out the SPA - leave GETs public-browse if desired via a flag. |
| 3.2 | **Inbound webhook triggers** - `webhooks` table, `POST /api/webhooks/:token` → existing `scheduler.fireRun()`, payload-template interpolation. | The reactive-runtime leap: a Prometheus alert fires agents. Unlocks n8n / Prometheus / integration-catalog narratives. | Effort M. **Hard dependency on 3.1** for safety. |
| 3.3 | **Durable job queue + retry/backoff + dead-letter** - SQLite-backed queue surviving pod restarts; `/api/runs/:id/retry`. | The in-memory queue silently drops everything on restart; one SSH blip = permanent fail. Foundation that makes everything above trustworthy. | Effort M. **Risk:** respect SQLite single-writer - queue ops are writes; keep them serialized. |
| 3.4 | **Run replay/debug + diff** | The iterative agent-dev loop, cheap and high-utility. Pairs naturally with retry. | Effort M. Low risk. Needs a `replay_of` column. |

**Phase 3 exit criteria:** an external `curl` (or Prometheus alert) fires a scoped, authenticated agent run; a pod restart mid-run resumes from the durable queue; a failed run retries with backoff and lands in a dead-letter lane if it exhausts attempts.

### Phase 4 - Make It Smart & Self-Improving *(Weeks 12–16)*

> **Thesis:** The MLOps quality loop - the features that prove production AI/ML thinking to a senior AI hiring manager.

| Step | What | Rationale | Risk / Dependency |
|---|---|---|---|
| 4.1 | **Prompt versioning** - `prompt_versions` table, auto-snapshot on edit, diff view, optional Haiku-generated change summaries, restore. | Foundation for A/B. Turns prompt edits from artisanal to scientific; tells the "how I shaped this agent" story. | Effort M. Low risk; `system_prompt` is plain TEXT. |
| 4.2 | **Prompt A/B testing ("Promote to Active")** - run a suite against two variants in parallel, side-by-side scores, promote the winner. | The flagship recursive meta-AI moment. The single interaction that tells the whole MLOps story. | Effort M. Eval runner is already parameterized. Low risk. |
| 4.3 | **Configurable eval judge** - custom rubrics/dimensions/weights, judge-model selection, regression tracking + baseline alerts. | Removes the black-box judge smell (hardcoded Haiku / 4 dims / 0.6). Domain-specific rubrics read as genuine LLM-as-judge rigor. | Effort L. Med risk (scope creep - keep dimensions data-driven, not code). |
| 4.4 | **Step-level tool-call tracing** - parse `tool_use` blocks from claude JSON → Execution Steps timeline. | "Show your work": watch the agent run kubectl, read a file, synthesize. Strongest agentic-observability payoff. | Effort M. Depends on 1.1 telemetry plumbing. |

**Phase 4 exit criteria:** a prompt change is A/B-tested against a known suite, the winner promoted with one click, and the per-case diff shows exactly what improved vs regressed; a run's Execution Steps timeline shows the tool calls it made.

### Phase 5 - Make It Composable & Portable *(Weeks 17–22)*

> **Thesis:** Programmable orchestration + artifact portability - the depth features that change *what the platform fundamentally is*. Sequenced last deliberately: high effort, and most compelling only after the core loop is visible and instrumented.

| Step | What | Rationale | Risk / Dependency |
|---|---|---|---|
| 5.1 | **Agent Pipeline Builder (DAG + conditional branching)** - routed through LangGraph for multi-agent runs; live node-status overlay on `RunDetailPage`. | The flagship-tier capability leap: agents route on prior-agent output. Finally justifies the LangGraph dependency by using it for the *interesting* multi-agent case. | Effort L. **Risk:** highest scope; needs sandboxed condition eval (`vm.runInNewContext`) and cycle detection. Worth it only on top of streaming (5.1's node overlay *is* the Theater view). |
| 5.2 | **Saved Compositions/Crews** + topology diagrams | Named reusable teams with run/schedule/export actions. | Effort M. Low risk. |
| 5.3 | **Agent Pack + Schedule Template YAML import/export** | Generalizes `agency-sync.js` into a writable marketplace - finishes a half-built idea. | Effort M. Low risk; `js-yaml` is a transitive dep already. |
| 5.4 | **DB-backed MCP registry + health checks** | Turns the static config generator into a live capability matrix with validation badges. | Effort M. Low risk. |
| 5.5 | **Platform SLO dashboard + breach alerting** | Self-monitoring; needs telemetry + budgets as substrate. | Effort L. Depends on Phases 1–2 data. |

---

## 5. Dependency Graph (what blocks what)

```
SSH Run Telemetry (1.1) ──┬──> Unified Cost Dashboard (1.3)
                          ├──> Budget Enforcement (2.4)
                          ├──> Step-Level Tool Tracing (4.4)
                          └──> Platform SLO Dashboard (5.5)

Live Run Theater / SSE (1.2) ──> Pipeline live node-status overlay (5.1)

API-Key Auth (3.1) ──> Inbound Webhooks (3.2) ──> n8n bridge / Integration Catalog (Phase 5+)

Tiered Safety Policy (2.2) ──> Human-in-the-loop approval gate (nice-to-have)
                            └──> Pluggable tool registry (gated; nice-to-have)

Prompt Versioning (4.1) ──> Prompt A/B Testing (4.2)
Configurable Eval Judge (4.3) ──> Eval regression tracking / SLO eval metric

Durable Job Queue (3.3) ──> Scheduler watchdog (nice-to-have)
```

**Critical-path takeaways:**
- **SSH telemetry (1.1) is the single most-depended-on item.** It is also the cheapest. Build it first, full stop.
- **Auth (3.1) must precede webhooks (3.2)** - exposing trigger endpoints without auth on a platform that runs `--dangerously-skip-permissions` is unacceptable.
- **Versioning (4.1) precedes A/B (4.2).** You can't promote a winner you didn't snapshot.

---

## 6. Platform Constraints That Govern Everything

These are hard boundaries from `recon.constraints`. Every proposal must respect them; several "noise"-tier items exist *because* they violate one.

| Constraint | Consequence for the roadmap |
|---|---|
| **Single replica only** - in-process node-cron scheduler + in-memory concurrency queue are process-local. | A second replica double-fires every cron. **No horizontal scaling.** The durable queue (3.3) makes restarts safe but does *not* enable multi-replica. Rules out K3s Job dispatch's main supposed benefit. |
| **SQLite single-writer (WAL)** - `better-sqlite3` is synchronous, single-process. | Concurrent reads fine; concurrent writes serialize. Queue/budget/telemetry writes must stay on one process. **Hard blocker for Postgres-free horizontal scale** → Postgres migration is XL and out of scope. |
| **1Gi Longhorn PVC** - DB + WAL must stay well under 1Gi. | Run retention (1.5) is *mandatory*, not optional. Verbose transcripts will exhaust the volume in months. |
| **SSH-only dispatch, no streaming from claude, fire-and-forget subprocess.** | SSE (1.2) streams the *SSH stdout pipe*, not a native claude stream - design accordingly. No native tool-call loop; step tracing (4.4) parses the returned JSON `messages` array post-hoc. |
| **No auth anywhere; open `/claude` proxy.** | Table-stakes gap. Auth (3.1) is non-negotiable before any external-trigger feature. |
| **Telemetry blind to SSH runs.** | The empty-dashboard problem. Fixed by 1.1. |
| **`allow_writes` inert; safety preamble universally read-only.** | Ghost column. Fixed by 2.2. |
| **3-value model allowlist; pricing table hardcodes versioned model IDs.** | New models silently fall back to Haiku pricing → undercounted cost. Fixed by 2.3 (free-text model IDs) + an editable pricing table in Settings (2.1). |
| **Qdrant + Ollama optional, on emptyDir (data lost on restart), no graceful degradation.** | Per-agent memory (nice-to-have) needs a Qdrant PVC first. RAG features must fail soft if either dep is down - add a circuit breaker before leaning on them in a demo. |
| **15-min hard SSH timeout, SIGKILL, no partial preservation.** | Long runs lose everything. SSE (1.2) partially mitigates (you saw the work stream); retry (3.3) and incremental transcript flushing reduce blast radius. |
| **MCP registry is static code; agency agents are read-only dead-ends.** | DB-backed MCP registry + agent-pack adoption are real opportunities (Phase 5 / nice-to-have) but not core. |
| **No retry on SSH dispatch.** | Transient SSH failures permanently fail runs. Addressed by 3.3. |

---

## 7. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Scope creep on the Pipeline Builder** (the L-effort flagship) | High | High | Sequence it last (Phase 5). Do not start it until streaming + telemetry + policy ship. Time-box; ship a 3-node linear-with-one-branch MVP before the full canvas. |
| **Elevated write permissions damage the real K3s cluster** | Med | High | Default policy stays read-only. Supervised tier requires a second env gate. Pair write-enabled demos with the approval gate. Never demo writes against production namespaces. |
| **SSE connections leak / hang on single replica** | Med | Med | `MAX_STREAM_DURATION_MS` guard; clean up the in-memory run registry on completion and on a heartbeat interval. |
| **1Gi PVC exhaustion** | High (if retention slips) | High | Retention job in Phase 1, not deferred. Storage-health readout surfaces projected weeks-to-full. |
| **Pricing table drift undercounts cost** (hardcoded versioned model IDs) | High | Med | Editable pricing table in Settings (2.1). Show an "estimated" badge when usage is inferred from char count rather than parsed. |
| **Open webhook/proxy before auth lands** | Med | High | Hard-sequence auth (3.1) before webhooks (3.2). Treat the open `/claude` proxy as a P0 to gate. |
| **Duplicate dispatch logic drifts** (`executor.js` vs `workflows/runner.js`) | Med | Med | When wiring policy/telemetry, consolidate the parallel/sequential/meeting logic into one path. Do not add a *third* path for the DAG - route it through LangGraph cleanly. |
| **Judge isn't ground truth** (Haiku@temp0, truncated output) | Low | Med | Before selling eval rigor, run a meta-eval against human-scored cases and surface judge-accuracy honestly. Configurable judge (4.3) lets high-stakes evals use Sonnet. |
| **Qdrant/Ollama down mid-demo (emptyDir, no circuit breaker)** | Med | Med | Add fail-soft degradation + a status indicator before relying on RAG in a live demo; move Qdrant to a PVC before per-agent memory. |

---

## 8. Do NOT Build Yet - and Why

An explicit stop-list. Each of these is a *defensible* idea that is wrong *now* - building it would burn weeks a reviewer never rewards, or actively undercut the platform's thesis.

| Do NOT build | Reason |
|---|---|
| **Postgres / TimescaleDB migration (XL)** | Premature. SQLite + a retention policy handles homelab scale comfortably. The constraint that supposedly motivates it (scale) doesn't exist for a single-user portfolio. A separate cross-app centralized-Postgres effort is already specced - duplicating it here is wasted XL effort. *Revisit only if a genuine multi-replica need emerges.* |
| **K3s Job-per-run dispatch (L)** | Directly contradicts the platform's honest differentiator. The SSH-to-real-host model is the *feature* - agents run where a senior engineer runs them, picking up real `CLAUDE.md` context. Swapping to sandboxed Job runners adds RBAC + a runner image + watch-loop complexity for *zero* demo payoff on a single host. |
| **Multi-workspace / multi-tenant schema (L)** | Touches 6 tables to add namespace isolation a single-user homelab will never use. Pure migration risk for speculative benefit. |
| **Mid-run WebSocket veto (L)** | SSE streaming + the (nice-to-have) approval gate already tell the supervised-autonomy story. Adding a `ws` dependency and connection lifecycle management is over-engineering for a marginal narrative gain. |
| **Published npm SDK + OpenAPI generation** | API-key auth + a documented REST surface is sufficient. A polished, versioned SDK is product-team work, not portfolio work. |
| **n8n custom community-node package (L)** | Inbound webhook triggers + outbound webhook fan-out already bridge n8n in both directions. A packaged node is diminishing returns. |
| **Per-run anomaly detection / quality scoring on every run** | Adds Haiku-judge latency and cost to *every* run. Compelling, but premature - fold it into the eval-as-observability story *after* the configurable judge (4.3) exists, and make it opt-in per schedule. |
| **Meeting transcript structured parser** | The streaming Theater view (1.2) already makes meetings watchable. Nice-to-have polish, not a gap. |
| **Pluggable HTTP/script tool registry** | Powerful, but it significantly expands the attack surface on a platform with `--dangerously-skip-permissions`. Gate it behind a *solid* safety policy engine (2.2) and revisit only after governance is proven. |
| **Pipeline Builder, *right now*** | It's a real flagship - but building it before streaming/telemetry/policy means demoing new capability the platform can't yet *show* or *govern*. Correct in Phase 5; wrong in Phase 1 (per the explicit Pixel + Tempo hot takes). |

---

## 9. If You Only Build 3 Things

If the budget is one short sprint and nothing else, build exactly these - in this order. Together they convert the platform from "described" to "demonstrated and credible" and they are the lowest-risk, highest-consensus items in the entire idea bank.

### 1. SSH Run Telemetry & Unified Cost Attribution  *(Effort: S · Risk: Low · 8/10 personas)*
Parse `usage.{input,output}_tokens` from claude's existing `--output-format json` output, call the existing `recordTrace()` once per agent, add a `source` column. **Why first:** it's the cheapest item, it fixes the single most embarrassing gap (an empty cost dashboard despite real runs), and it is the data prerequisite for budgets, SLOs, and step tracing. Without it, every other observability and governance feature is built on phantom zeros.

### 2. Live Run Theater (SSE Streaming)  *(Effort: M · Risk: Low · flagship pick of 4 personas)*
Replace stdout buffering with a per-`runId` `EventEmitter`; expose `GET /api/runs/:id/stream`; render per-agent streaming panels. **Why second:** it is the single most visceral demonstration that real AI agents are doing real work - five panels filling simultaneously as Atlas greps logs, Sentinel reads metrics, and Bastion inspects volumes. Zero new dependencies, the panel layout already exists, and the payoff is unambiguous to any hiring manager in a 90-second screen-share.

### 3. Tiered Safety Policy Engine (wire `allow_writes`)  *(Effort: S–M · Risk: Med, mitigated)*
Refactor `safety-prompt.js` to `policyToPrompt(policy)`; wire the ghost `allow_writes` column into read-only / controlled-write / supervised tiers. **Why third:** it kills the longest-standing "unfinished work" smell a code reviewer will spot in minutes, and it transforms the platform from a read-only oracle into a *governed orchestrator* - producing the vivid demo where Flux runs a real GitOps sync with write permission while Sentinel stays strictly read-only, the policy visible and auditable.

> **The combined story these three tell a hiring manager:** *"My platform runs real AI agents that do real engineering work on real infrastructure - and you can watch them work live, see exactly what every run costs, and control precisely what each one is allowed to do, all from the UI."* That is the entire north star, proven, in one sprint - with telemetry (S) and the policy engine (S–M) being cheap, and streaming (M) being the only medium-effort item among them.

---

*Sources: this prioritization is built strictly from the recon brief, the canonical roadmap skeleton, and the ten persona proposals in the idea bank. Effort ratings are the proposers'; tier and sequence calls are the principal-engineer + hiring-manager synthesis described above.*
