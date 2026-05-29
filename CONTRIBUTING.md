# Contributing

Pull requests are welcome. This is a personal portfolio project, so if you're planning something bigger than a bug fix or small improvement, please open an issue first so we can talk through the approach before you put the work in.

## Dev setup

```bash
# Clone and install dependencies
git clone https://github.com/kernelpanic09/agents-platform.git
cd agents-platform
npm install

# Start backend (port 3001, watches for changes)
npm run dev:server

# Start frontend dev server (separate terminal)
npm run dev

# Run with Docker Compose (includes Qdrant + Ollama)
cp .env.example .env
# set ANTHROPIC_API_KEY in .env
docker compose up
```

You'll need a local Qdrant and Ollama if running outside Docker:

```bash
docker run -p 6333:6333 qdrant/qdrant
docker run -p 11434:11434 ollama/ollama
docker exec <ollama-container> ollama pull nomic-embed-text
```

For SSH dispatch features, set `SSH_TARGET=user@host` and `ENABLE_SCHEDULER=true` in your `.env`. The target host needs Claude Code installed with SSH key auth.

## Commit style

This repo follows [Conventional Commits](https://www.conventionalcommits.org/). Examples:

- `fix: handle missing SSH key path gracefully`
- `feat: add SSM parameter store tool to MCP registry`
- `chore: bump LangChain dependency`
- `docs: clarify RAG ingestion limits`

Keeping commit messages consistent makes the changelog useful.
