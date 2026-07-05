# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Documentation grooming: corrected the local test-suite count and tightened the
  Development quick start.

## [1.1.0] - 2026-06-16

The capability-plane release: agents grow real tools, memory, and skills, gain
richer orchestration, and the whole platform gets a light/dark redesign plus a
self-contained demo so it runs impressively with zero external dependencies.

### Added
- **Agent Skills** following the [SKILL.md open standard](https://github.com/anthropics/skills):
  attach skills to an agent and they are materialized into the run workspace at dispatch.
- **MCP tool provisioning**: declare Model Context Protocol servers per agent; they are
  injected via `--mcp-config --strict-mcp-config` so a run only sees the tools it was granted.
- **Episodic agent memory**: durable learnings are distilled from run output (locally, at $0)
  and injected into future prompts.
- **Live run streaming down to the tool call**: `--output-format stream-json` drives a
  Live Run Theater with per-step timelines over SSE.
- **Orchestration**: conditional DAG **pipelines** (sandboxed edge conditions) and saved,
  reusable **crews**.
- **Combined Reports**: recurring runs fuse into AI-synthesized briefings with normalized
  metric trends.
- **Environment Variables ("master sheet")**: user-editable, non-secret `{{KEY}}` variables
  substituted into prompts at dispatch, editable in the UI or via bulk `.env` — makes the
  platform grab-and-go for any environment.
- **Trust & governance**: tiered safety policies (read-only / supervised / autonomous) and
  scoped API keys.
- **Evaluation loop**: prompt versioning, A/B comparison, a configurable eval judge, and a
  promote-to-active workflow.
- **Portability**: agent-pack YAML import/export with one-click "adopt", and a DB-backed
  MCP registry with connection/env checks.
- **Observability**: platform SLOs with breach alerting, plus cost and latency dashboards.
- **Self-contained animated demo** (`DEMO_MODE`): seeds runs, a report, memories, and a
  pipeline, and simulates live SSE step events on "Run now" with no SSH host or API key.

### Changed
- **Light/dark dashboard redesign**: CSS-variable neutral ramp with a teal accent and a
  collapsible sidebar.
- Three selectable execution backends: SSH dispatch to `claude -p` (default), the Anthropic
  API, and any OpenAI-compatible endpoint (e.g. a local Ollama model).

### Breaking
- The `/claude` proxy endpoint now requires a scoped API key. Set one in the Settings Hub
  (or via `API_KEYS`) and send it as a bearer token; unauthenticated requests are rejected.

## [1.0.0] - 2026-05-29

Initial public release.

### Added
- Agent roster with composable personas, dispatched on schedules with a full run history.
- RAG engine over ingested knowledge sources (Qdrant-backed).
- LangGraph workflows for routed, multi-step execution.
- Evaluation framework and demo mode.
- Observability with run metrics and charts.

[Unreleased]: https://github.com/kernelpanic09/agents-platform/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/kernelpanic09/agents-platform/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/kernelpanic09/agents-platform/releases/tag/v1.0.0
