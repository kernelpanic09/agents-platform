# agents-platform

[![License: MIT](https://img.shields.io/github/license/kernelpanic09/agents-platform)](LICENSE)
[![Release](https://img.shields.io/github/v/release/kernelpanic09/agents-platform?include_prereleases&sort=semver)](https://github.com/kernelpanic09/agents-platform/releases)
[![Last commit](https://img.shields.io/github/last-commit/kernelpanic09/agents-platform)](https://github.com/kernelpanic09/agents-platform/commits)
[![Top language](https://img.shields.io/github/languages/top/kernelpanic09/agents-platform)](https://github.com/kernelpanic09/agents-platform)

An AI agent orchestration platform with RAG, LangGraph workflows, observability, and evaluation. Manage a roster of agent personas, run them against real infrastructure via SSH, and measure their performance over time.

---

## What is this

Agents Platform is a full-stack application for building, managing, and running AI agents. Each agent has a persona, system prompt, skill set, tool inventory, and knowledge sources. The platform dispatches agents via SSH to a remote Claude Code session, tracks every run with cost and latency telemetry, and surfaces the results through a dark glassmorphism dashboard.

It ships with 26 pre-built agent personas covering infrastructure, development, security, media, and automation domains, plus a six-agent suite purpose-built for a Go betting platform. A demo mode runs locally with docker-compose. no SSH target needed.

---

## Features

### 1. Agent Roster
- 26 persona definitions: name, title, tagline, system prompt, skills, tools, MCP servers, knowledge sources, example tasks, and related agents
- Full CRUD via REST API and in-app forms
- Category filtering (infrastructure, development, security, media, automation)
- Per-agent accent color and SVG avatar (26 unique illustrations)

### 2. SSH Dispatch and Multi-agent Modes
- Runs `claude -p "<prompt>"` on a remote host over SSH
- Three composition modes: parallel (fan-out, aggregate), sequential (pipeline), meeting (structured debate)
- Cron scheduling with configurable concurrency limits
- Per-run Discord webhook notifications (success and failure)
- Run history with stdout capture and status tracking

### 3. RAG Engine
- Vector store: Qdrant with Ollama embeddings (`nomic-embed-text`)
- Pluggable document loaders: Markdown files, YAML, Terraform, URLs, transcripts
- RAG Playground UI: load documents, query the index, inspect retrieved chunks
- LangChain retrieval chain with Anthropic Claude for generation

### 4. LangGraph Workflows
- Task router: Claude Haiku classifies each request (RAG query / workflow / SSH dispatch)
- State machine graphs built with `@langchain/langgraph`
- Built-in tools: `kubectl` runner, file reader, RAG search
- Workflows UI for inspecting graph state and step-by-step traces

### 5. Observability and Evaluation
- Telemetry middleware captures every API call: model, tokens in/out, latency, cost
- Cost calculator using Claude model pricing tiers
- Recharts dashboard: daily cost trends, model distribution, latency percentiles, recent trace table
- Eval suite: write test cases, run LLM-as-judge scoring, compare models, detect regressions

---

## Architecture

```
Browser (React 18 + Vite)
    |
    |  REST / JSON
    v
Express.js (port 3001)
    |-- /api/agents       Agent CRUD
    |-- /api/schedules    Cron scheduler
    |-- /api/runs         Run history
    |-- /api/rag          RAG ingest + query
    |-- /api/workflows    LangGraph execution
    |-- /api/observability Telemetry traces
    |-- /api/eval         Evaluation suites
    |
    |-- SQLite (better-sqlite3, WAL)
    |       agents, runs, schedules, traces, eval results
    |
    |-- LangGraph
    |       Task router (Haiku) --> RAG chain | Workflow graph | SSH dispatch
    |
    |-- Qdrant (vector store)
    |       Ollama embeddings (nomic-embed-text)
    |
    |-- SSH --> Remote Host
                claude -p "<system prompt + task>"
                (Claude Code CLI, parallel / sequential / meeting modes)
```

---

## Quick Start

**Requirements:** Docker, Docker Compose, and (for SSH dispatch) a remote host running Claude Code.

```bash
git clone https://github.com/kernelpanic09/agents-platform.git
cd agents-platform
cp .env.example .env
# Edit .env. set ANTHROPIC_API_KEY at minimum
docker compose up
```

Open http://localhost:3001.

Demo mode is on by default (`DEMO_MODE=true` in docker-compose.yml). SSH dispatch is disabled in demo mode. all other features work.

On first start, Ollama needs to pull the embedding model:

```bash
docker compose exec ollama ollama pull nomic-embed-text
```

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Express server port |
| `DATA_DIR` | `.` | Directory for `agents.db` SQLite file |
| `ANTHROPIC_API_KEY` | _(required)_ | Anthropic API key for RAG chat and eval |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant vector store URL |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama embedding server URL |
| `EMBED_MODEL` | `nomic-embed-text` | Ollama model for embeddings |
| `SSH_TARGET` | _(required for dispatch)_ | Remote host in `user@host` format |
| `SSH_KEY_PATH` | _(optional)_ | Path to SSH private key |
| `CLAUDE_MODEL` | `sonnet` | Claude model to use for SSH dispatch |
| `ENABLE_SCHEDULER` | `false` | Enable cron scheduler and manual `/run` endpoint |
| `MAX_CONCURRENT_RUNS` | `2` | Max parallel SSH dispatch jobs |
| `DISCORD_WEBHOOK_URL` | _(optional)_ | Discord webhook for run notifications |
| `APPS_ROOT` | `/home/ubuntu/apps` | Root directory for app workspaces on the SSH target |
| `ALLOWED_INGEST_DIRS` | _(see .env.example)_ | Comma-separated paths allowed for RAG ingestion |
| `MAX_PARALLEL_PER_RUN` | `3` | Max agents in a single parallel batch |
| `RUN_TIMEOUT_MS` | `900000` | SSH dispatch timeout (15 min default) |
| `APP_BASE_URL` | `http://localhost:3001` | Base URL for Discord notification links |
| `DEMO_MODE` | `false` | Seed demo data and disable SSH |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite 5, Tailwind CSS 3, React Router v6 |
| UI Components | Lucide React, Recharts, custom SVG avatars |
| Backend | Node.js, Express.js |
| Database | SQLite via better-sqlite3 (WAL mode) |
| AI Orchestration | LangChain, LangGraph, Anthropic SDK |
| Vector Store | Qdrant |
| Embeddings | Ollama (nomic-embed-text) |
| SSH Dispatch | Native Node.js `child_process` over SSH |
| Scheduling | node-cron |
| Tool Schemas | Zod (LangChain tool definitions) |
| Containerization | Docker, Docker Compose |

---

## API Reference

### Agents
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/agents` | List all agents (excludes system_prompt) |
| `GET` | `/api/agents/:id` | Full agent detail with system_prompt |
| `POST` | `/api/agents` | Create agent |
| `PUT` | `/api/agents/:id` | Update agent (partial) |
| `DELETE` | `/api/agents/:id` | Delete agent |
| `GET` | `/api/agents/:id/prompt` | Raw prompt file content (dev only) |

### Agency
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/agency` | List agency agents |
| `GET` | `/api/agency/:id` | Agency agent detail |
| `POST` | `/api/agency/sync` | Sync agents from source |

### Apps
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/apps` | List app directories on SSH target |

### Schedules and Runs
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/schedules` | List all schedules |
| `GET` | `/api/schedules/_/stats` | Scheduler stats (registered, queued, running) |
| `GET` | `/api/schedules/:id` | Schedule detail with recent runs |
| `POST` | `/api/schedules` | Create schedule (cron + agent + task) |
| `PUT` | `/api/schedules/:id` | Update schedule |
| `DELETE` | `/api/schedules/:id` | Delete schedule |
| `POST` | `/api/schedules/:id/run` | Trigger schedule manually |
| `POST` | `/api/schedules/:id/pause` | Pause a schedule |
| `POST` | `/api/schedules/:id/resume` | Resume a paused schedule |
| `GET` | `/api/runs` | List all runs with status |
| `GET` | `/api/runs/:id` | Run detail with transcript |

### RAG
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/rag/health` | Qdrant + Ollama connectivity check |
| `POST` | `/api/rag/ingest` | Ingest document into Qdrant |
| `POST` | `/api/rag/search` | Semantic search across ingested documents |
| `POST` | `/api/rag/chat` | RAG-augmented chat (retrieve + generate) |
| `GET` | `/api/rag/sources` | List ingested document sources |
| `DELETE` | `/api/rag/sources/:id` | Remove source and its vectors |

### Workflows
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/workflows/types` | List available workflow types |
| `POST` | `/api/workflows/route` | Classify a task (RAG / workflow / SSH) |

### Observability
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/observability/traces` | Recent telemetry traces |
| `GET` | `/api/observability/costs` | Aggregated cost stats (by model, agent, day) |
| `GET` | `/api/observability/latency` | Latency percentiles per model |

### Evaluation
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/eval/suites` | List eval suites with case/run counts |
| `POST` | `/api/eval/suites` | Create eval suite |
| `POST` | `/api/eval/suites/:id/cases` | Add test case to suite |
| `POST` | `/api/eval/suites/:id/run` | Run eval suite against a model |
| `GET` | `/api/eval/runs` | List eval runs |
| `GET` | `/api/eval/runs/:id/results` | Per-case results with judge scores |
| `GET` | `/api/eval/suites/:id/cases` | List test cases in a suite |
| `DELETE` | `/api/eval/suites/:id` | Delete a suite |
| `DELETE` | `/api/eval/cases/:id` | Delete a test case |

### MCP Registry
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/mcp-servers` | List available MCP servers |
| `GET` | `/api/mcp-servers/:id` | MCP server detail |
| `POST` | `/api/mcp-servers/config` | Generate MCP config JSON for selected servers |

### Health
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | `{ status: "ok", timestamp }` |

---

## Project Structure

```
agents-platform/
├── docker-compose.yml          # App + Qdrant + Ollama
├── Dockerfile                  # Multi-stage: build React, serve with Express
├── .env.example
│
├── server/
│   ├── index.js                # Express app, middleware, route wiring
│   ├── db.js                   # SQLite schema init, migration
│   ├── seed.js                 # 26 agent persona definitions
│   ├── demo.js                 # Demo mode seed data
│   ├── executor.js             # SSH dispatch, parallel/sequential/meeting modes
│   ├── scheduler.js            # node-cron scheduler, Discord notifications
│   ├── agency-sync.js          # Agent sync utilities
│   ├── mcp-registry.js         # MCP server definitions
│   ├── safety-prompt.js        # Prepended safety context for SSH runs
│   ├── rag/
│   │   ├── qdrant.js           # Qdrant client wrapper
│   │   ├── embeddings.js       # Ollama embedding client
│   │   ├── splitter.js         # Recursive text chunker
│   │   ├── ingest.js           # Document ingestion pipeline
│   │   ├── chat.js             # RAG search and chat
│   │   └── loaders/            # Pluggable loaders (md, yaml, tf, url, transcript)
│   ├── workflows/
│   │   ├── state.js            # LangGraph state schema
│   │   ├── tools.js            # LangChain tools (kubectl, file read, RAG)
│   │   ├── router.js           # Task classifier (Haiku)
│   │   ├── graphs.js           # LangGraph graph definitions
│   │   └── runner.js           # Graph execution engine
│   ├── eval/
│   │   └── runner.js           # Eval suite runner with LLM judge
│   ├── observability/
│   │   └── telemetry.js        # Cost calculator, trace middleware
│   └── routes/
│       ├── agents.js           # Agent CRUD
│       ├── agency.js           # Agency operations
│       ├── schedules.js        # Cron schedule management
│       ├── runs.js             # Run history
│       ├── apps.js             # App discovery
│       ├── rag.js              # RAG ingest and query
│       ├── workflows.js        # LangGraph workflow execution
│       ├── observability.js    # Telemetry and dashboard
│       └── eval.js             # Evaluation suites and LLM judge
│
├── src/
│   ├── App.jsx                 # React Router setup, lazy page loading
│   ├── index.css               # Tailwind + glassmorphism custom styles
│   ├── components/
│   │   ├── Layout.jsx          # Nav header with 7 sections
│   │   ├── AgentCard.jsx
│   │   ├── AgentAvatar.jsx     # 26 unique inline SVG avatars
│   │   ├── rag/                # IngestPanel, SearchPanel, ChatPanel, SourceList
│   │   └── workflows/          # GraphView (SVG route visualization)
│   └── pages/
│       ├── Home.jsx            # Agent grid, search, category filter
│       ├── AgentProfile.jsx    # Full agent detail, activate modal
│       ├── AgencyAgentProfile.jsx
│       ├── ComposePage.jsx     # Multi-agent composition
│       ├── SchedulesPage.jsx
│       ├── ScheduleDetailPage.jsx
│       ├── AllRunsPage.jsx
│       ├── RunDetailPage.jsx
│       ├── RagPlayground.jsx   # RAG document loader + query UI
│       ├── WorkflowsPage.jsx
│       ├── ObservabilityPage.jsx
│       └── EvalPage.jsx
│
└── test/
    └── rag-smoke.js            # RAG integration smoke test
```

---

## Development

```bash
# Install dependencies
npm install

# Start backend (watches for changes)
npm run dev:server

# Start frontend dev server (in a second terminal)
npm run dev

# Build for production
npm run build
npm start
```

The Vite dev server proxies `/api`, `/health`, and `/claude` to `:3001`, so both servers run simultaneously without CORS issues.

**Local Qdrant and Ollama:**

```bash
docker run -p 6333:6333 qdrant/qdrant
docker run -p 11434:11434 ollama/ollama
docker exec <ollama-container> ollama pull nomic-embed-text
```

Set `QDRANT_URL` and `OLLAMA_URL` in your `.env`.

**SSH Dispatch:**

Set `SSH_TARGET=user@your-host` and `ENABLE_SCHEDULER=true` in `.env`. The target host must have Claude Code installed and accessible via SSH key auth. Set `SSH_KEY_PATH` if the key is not at the default location.

SSH dispatch runs Claude Code with `--dangerously-skip-permissions` for unattended execution. A safety preamble (`server/safety-prompt.js`) is prepended to every prompt with guardrails. The `/claude` proxy endpoint is gated behind `ENABLE_SCHEDULER=true` and should only be exposed on trusted networks.

---

## Related Projects

- [mcp-server-aws](https://github.com/kernelpanic09/mcp-server-aws) — gives agents direct access to AWS resources via Model Context Protocol, so instead of SSHing to a host and running `aws` commands, a Claude session can query EC2, IAM, cost data, and more through a local MCP server.
- [terraform-aws-modules](https://github.com/kernelpanic09/terraform-aws-modules) — provisions the AWS infrastructure this platform can run on. The `bedrock-knowledge-base` module in particular is a native AWS alternative to the Qdrant/Ollama RAG stack used here if you'd rather keep everything in one cloud.
- [github-actions-platform](https://github.com/kernelpanic09/github-actions-platform) — the CI/CD workflow library I use across this and other projects, covering Docker build/push, Terraform plan/apply, and release automation.

---

## License

MIT
