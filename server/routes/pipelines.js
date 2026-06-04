import { Router } from 'express';
import { validatePipelineGraph, executePipelineRun } from '../workflows/pipeline.js';
import { subscribeRun, isRunLive } from '../run-stream.js';

const EMPTY_GRAPH = '{"nodes":[],"edges":[]}';

function parsePipeline(row) {
  if (!row) return null;
  let graph;
  try { graph = JSON.parse(row.graph || EMPTY_GRAPH); } catch { graph = { nodes: [], edges: [] }; }
  return { ...row, graph };
}

function parsePipelineRun(row) {
  if (!row) return null;
  const safe = (s, d) => { try { return JSON.parse(s || d); } catch { return JSON.parse(d); } };
  return { ...row, node_states: safe(row.node_states, '{}'), outputs: safe(row.outputs, '{}') };
}

export default function pipelinesRouter(db) {
  const router = Router();

  // --- Pipelines CRUD ---
  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT * FROM pipelines ORDER BY updated_at DESC`).all();
    res.json(rows.map(r => {
      const p = parsePipeline(r);
      return {
        id: p.id, name: p.name, description: p.description, last_run_at: p.last_run_at,
        node_count: p.graph.nodes?.length || 0, edge_count: p.graph.edges?.length || 0,
        created_at: p.created_at, updated_at: p.updated_at,
      };
    }));
  });

  router.get('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM pipelines WHERE id = ?`).get(parseInt(req.params.id, 10));
    if (!row) return res.status(404).json({ error: 'Pipeline not found' });
    res.json(parsePipeline(row));
  });

  router.post('/', (req, res) => {
    const { name, description, graph } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
    const graphStr = graph ? JSON.stringify(graph) : EMPTY_GRAPH;
    const result = db.prepare(`INSERT INTO pipelines (name, description, graph) VALUES (?, ?, ?)`)
      .run(name.trim(), description || '', graphStr);
    res.status(201).json(parsePipeline(db.prepare(`SELECT * FROM pipelines WHERE id = ?`).get(result.lastInsertRowid)));
  });

  router.put('/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = db.prepare(`SELECT * FROM pipelines WHERE id = ?`).get(id);
    if (!existing) return res.status(404).json({ error: 'Pipeline not found' });
    const { name, description, graph } = req.body;
    let graphStr = existing.graph;
    if (graph !== undefined) {
      const check = validatePipelineGraph(graph);
      // Allow saving a structurally-incomplete draft, but never one with a cycle
      // (which would hang execution). Surface non-fatal issues as a warning.
      if (graph.nodes?.length && (check.errors || []).some(e => e.includes('cycle'))) {
        return res.status(400).json({ error: check.errors.find(e => e.includes('cycle')) });
      }
      graphStr = JSON.stringify(graph);
    }
    db.prepare(`UPDATE pipelines SET name = ?, description = ?, graph = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(name ?? existing.name, description ?? existing.description, graphStr, id);
    res.json(parsePipeline(db.prepare(`SELECT * FROM pipelines WHERE id = ?`).get(id)));
  });

  router.delete('/:id', (req, res) => {
    db.prepare(`DELETE FROM pipelines WHERE id = ?`).run(parseInt(req.params.id, 10));
    res.json({ deleted: true });
  });

  // Validate a graph without saving (for the builder).
  router.post('/:id/validate', (req, res) => {
    res.json(validatePipelineGraph(req.body.graph || {}));
  });

  // --- Run a pipeline ---
  router.post('/:id/run', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const pipeline = db.prepare(`SELECT * FROM pipelines WHERE id = ?`).get(id);
    if (!pipeline) return res.status(404).json({ error: 'Pipeline not found' });

    let graphDef;
    try { graphDef = JSON.parse(pipeline.graph || EMPTY_GRAPH); } catch { graphDef = { nodes: [], edges: [] }; }
    const check = validatePipelineGraph(graphDef);
    if (!check.ok) return res.status(400).json({ error: 'Pipeline is invalid', details: check.errors });

    const task = (req.body.task && req.body.task.trim()) || pipeline.description || pipeline.name;
    const runResult = db.prepare(`INSERT INTO pipeline_runs (pipeline_id, task, status) VALUES (?, ?, 'queued')`).run(id, task);
    const runId = runResult.lastInsertRowid;

    // Fire-and-forget: the HTTP response returns immediately; progress streams over SSE.
    executePipelineRun({ db, pipeline, task, pipelineRunId: runId }).catch(err => {
      console.error(`[pipeline] run ${runId} crashed:`, err.message);
      db.prepare(`UPDATE pipeline_runs SET status='failed', error_message=?, finished_at=datetime('now') WHERE id=?`).run(err.message, runId);
    });

    res.status(201).json({ run_id: runId, status: 'queued' });
  });

  // --- Pipeline runs ---
  router.get('/:id/runs', (req, res) => {
    const rows = db.prepare(`SELECT id, pipeline_id, task, status, started_at, finished_at, duration_ms, summary, error_message, created_at
      FROM pipeline_runs WHERE pipeline_id = ? ORDER BY created_at DESC LIMIT 50`).all(parseInt(req.params.id, 10));
    res.json(rows);
  });

  router.get('/runs/:runId', (req, res) => {
    const row = db.prepare(`SELECT pr.*, p.name AS pipeline_name, p.graph AS pipeline_graph
      FROM pipeline_runs pr JOIN pipelines p ON p.id = pr.pipeline_id WHERE pr.id = ?`).get(parseInt(req.params.runId, 10));
    if (!row) return res.status(404).json({ error: 'Pipeline run not found' });
    let graph; try { graph = JSON.parse(row.pipeline_graph || EMPTY_GRAPH); } catch { graph = { nodes: [], edges: [] }; }
    const { pipeline_graph, ...rest } = row;
    res.json({ ...parsePipelineRun(rest), graph });
  });

  // SSE stream for the live node-status overlay (mirrors /api/runs/:id/stream).
  router.get('/runs/:runId/stream', (req, res) => {
    const id = parseInt(req.params.runId, 10);
    if (isNaN(id)) return res.status(400).end();
    const run = db.prepare(`SELECT * FROM pipeline_runs WHERE id = ?`).get(id);
    if (!run) return res.status(404).end();
    const channel = `pipeline-run:${id}`;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = (ev) => { res.write(`data: ${JSON.stringify(ev)}\n\n`); res.flush?.(); };

    const finished = ['success', 'failed', 'timeout'].includes(run.status);
    if (finished && !isRunLive(channel)) {
      send({ type: 'replay', status: run.status, summary: run.summary, node_states: parsePipelineRun(run).node_states });
      send({ type: 'done', status: run.status, summary: run.summary });
      return res.end();
    }

    send({ type: 'status', status: run.status });
    const keepalive = setInterval(() => { res.write(': ping\n\n'); res.flush?.(); }, 20000);
    const unsub = subscribeRun(channel, (ev) => {
      send(ev);
      if (ev.type === 'done') { clearInterval(keepalive); unsub(); res.end(); }
    });
    req.on('close', () => { clearInterval(keepalive); unsub(); });
  });

  return router;
}
