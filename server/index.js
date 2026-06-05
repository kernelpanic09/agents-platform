import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initDb } from './db.js';
import { initTelemetry } from './observability/telemetry.js';
import { initSettings } from './settings.js';
import settingsRouter from './routes/settings.js';
import { initApiKeys, requireScope } from './api-keys.js';
import keysRouter from './routes/keys.js';
import webhooksRouter from './routes/webhooks.js';
import agentsRouter from './routes/agents.js';
import agencyRouter from './routes/agency.js';
import schedulesRouter from './routes/schedules.js';
import runsRouter from './routes/runs.js';
import appsRouter from './routes/apps.js';
import ragRouter from './routes/rag.js';
import workflowsRouter from './routes/workflows.js';
import pipelinesRouter from './routes/pipelines.js';
import crewsRouter from './routes/crews.js';
import packsRouter from './routes/packs.js';
import observabilityRouter from './routes/observability.js';
import evalRouter from './routes/eval.js';
import { initMcpRegistry } from './mcp-registry.js';
import mcpRouter from './routes/mcp.js';
import { syncAgencyAgents } from './agency-sync.js';
import { createScheduler } from './scheduler.js';
import { runClaudeRemote } from './executor.js';
import { seedDemoData, IS_DEMO } from './demo.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// Compress everything EXCEPT Server-Sent Events: gzip buffers SSE writes until
// the stream closes, which would turn the Live Run Theater into a replay-at-end.
app.use(compression({
  filter: (req, res) => {
    if (/text\/event-stream/.test(String(res.getHeader('Content-Type') || ''))) return false;
    return compression.filter(req, res);
  },
}));
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Request logging
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  }
  next();
});

// Initialize database
const db = initDb();
initTelemetry(db);
initSettings(db);
initApiKeys(db);
initMcpRegistry(db);
seedDemoData(db);

// Create scheduler (always — API routes need the handle; feature flag only gates hydrate)
const scheduler = createScheduler(db);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/agents', agentsRouter(db));
app.use('/api/agency', agencyRouter(db));
app.use('/api/schedules', schedulesRouter(db, scheduler));
app.use('/api/runs', runsRouter(db, scheduler));
app.use('/api/apps', appsRouter());
app.use('/api/rag', ragRouter(db));
app.use('/api/workflows', workflowsRouter(db));
app.use('/api/pipelines', pipelinesRouter(db, scheduler));
app.use('/api/crews', crewsRouter(db, scheduler));
app.use('/api/packs', packsRouter(db));
app.use('/api/observability', observabilityRouter(db));
app.use('/api/eval', evalRouter(db));
app.use('/api/settings', settingsRouter());
app.use('/api/keys', keysRouter());
app.use('/api/webhooks', webhooksRouter(db, scheduler));

// MCP Server registry (DB-backed: editable at runtime, env + connection checks)
app.use('/api/mcp-servers', mcpRouter(db));

// Claude proxy endpoint for external apps — requires a scoped API key
// (was previously open to any caller when ENABLE_SCHEDULER=true).
app.post('/claude', requireScope('trigger', 'write'), async (req, res) => {
  const { prompt, model, max_turns, timeout } = req.body;
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'prompt is required' });
  }
  const timeoutMs = (timeout && timeout > 0 ? timeout : 240) * 1000;
  try {
    const { stdout, stderr, exitCode, timedOut } = await runClaudeRemote(prompt, {
      model: model || 'sonnet',
      maxTurns: max_turns || 0,
      timeoutMs,
    });
    if (timedOut) {
      return res.status(504).json({ error: 'Claude timed out', stdout, stderr });
    }
    res.json({ stdout, stderr, returncode: exitCode });
  } catch (err) {
    console.error('Claude endpoint error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Serve static files
app.use(express.static(join(__dirname, '../dist'), {
  maxAge: '7d',
  etag: true,
}));

// SPA fallback
app.get('*', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(join(__dirname, '../dist/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(`${new Date().toISOString()} ERROR ${req.method} ${req.path}:`, err.message);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Agents server running on port ${PORT}`);

  // Auto-sync agency agents if table is empty
  const count = db.prepare('SELECT COUNT(*) as count FROM agency_agents').get();
  if (count.count === 0) {
    syncAgencyAgents(db).catch(err => {
      console.error('Auto-sync of agency agents failed:', err.message);
    });
  }

  // Recover runs orphaned by a crash and pump the durable queue. Runs regardless of
  // the scheduler flag — manual / webhook runs drain even with cron disabled.
  scheduler.recoverOrphans();

  // Scheduler: gated by feature flag. When off, API still works (you can create
  // schedules and inspect history), but cron tasks are not registered and no
  // scheduled runs fire. Manual "run now" is also gated.
  if (process.env.ENABLE_SCHEDULER === 'true') {
    scheduler.hydrate();
  } else {
    console.log('[scheduler] ENABLE_SCHEDULER != true — scheduler is idle (UI/API still work)');
  }

  if (IS_DEMO) {
    console.log('[demo] Running in DEMO_MODE — SSH dispatch disabled, sample data loaded');
  }
});
