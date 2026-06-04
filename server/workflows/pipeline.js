import vm from 'vm';
import { StateGraph, START, END, Annotation } from '@langchain/langgraph';
import { buildAgentPrompt, runClaude, parseClaudeJson, extractSummary, extractVerdict, resolveInference } from '../executor.js';
import { emitRunEvent } from '../run-stream.js';
import { getSetting } from '../settings.js';
import { IS_DEMO } from '../demo.js';

// ---------------------------------------------------------------------------
// Pure helpers (no LLM, no DB) — unit-testable in isolation.
// A pipeline graph is { nodes: [{id, agent_id, label, model?}], edges: [{from,to,condition?}] }.
// An edge with an empty/whitespace condition is the unconditional "else" route.
// ---------------------------------------------------------------------------

/**
 * Evaluate an edge condition against a node's result in a sandboxed context.
 * The expression sees only `output` and `summary` (plain strings) plus
 * `verdict` ('ok' | 'attention' | 'critical' | null, parsed from the agent's
 * structured STATUS line) — no Node globals, no require/process — and is
 * hard-bounded to 50ms. Empty condition means "always" (the default/else
 * edge). Any error evaluates to false.
 */
export function evalEdgeCondition(condition, ctx = {}) {
  const expr = String(condition || '').trim();
  if (!expr) return true;
  try {
    const sandbox = {
      output: String(ctx.output ?? ''),
      summary: String(ctx.summary ?? ''),
      verdict: ctx.verdict ?? null,
    };
    return Boolean(vm.runInNewContext(`(${expr})`, sandbox, { timeout: 50, displayErrors: false }));
  } catch {
    return false;
  }
}

/** Node ids with no incoming edge — the pipeline's entry point(s). */
export function computeRoots(graphDef) {
  const nodes = graphDef?.nodes || [];
  const hasIncoming = new Set((graphDef?.edges || []).map(e => e.to));
  return nodes.filter(n => !hasIncoming.has(n.id)).map(n => n.id);
}

/** Targets to route to from a node given its result (conditions evaluated in order). */
export function routeFromNode(graphDef, nodeId, output, summary, verdict = null) {
  const targets = [];
  for (const e of (graphDef?.edges || [])) {
    if (e.from === nodeId && evalEdgeCondition(e.condition, { output, summary, verdict })) targets.push(e.to);
  }
  return [...new Set(targets)];
}

/** Validate structure: nodes exist, edges reference real nodes, DAG (no cycles), has a root. */
export function validatePipelineGraph(graphDef) {
  const errors = [];
  const nodes = graphDef?.nodes || [];
  const edges = graphDef?.edges || [];
  if (nodes.length === 0) errors.push('Pipeline has no nodes.');

  const ids = new Set();
  for (const n of nodes) {
    if (!n.id) errors.push('A node is missing an id.');
    else if (ids.has(n.id)) errors.push(`Duplicate node id: ${n.id}`);
    else ids.add(n.id);
    if (n.agent_id == null) errors.push(`Node "${n.label || n.id || '?'}" has no agent assigned.`);
  }
  for (const e of edges) {
    if (!ids.has(e.from)) errors.push(`Edge from unknown node: ${e.from}`);
    if (!ids.has(e.to)) errors.push(`Edge to unknown node: ${e.to}`);
  }

  if (errors.length === 0) {
    // Cycle detection (DFS with white/gray/black coloring).
    const adj = new Map(nodes.map(n => [n.id, []]));
    for (const e of edges) adj.get(e.from)?.push(e.to);
    const color = new Map(nodes.map(n => [n.id, 0])); // 0=white 1=gray 2=black
    let cyclic = false;
    const visit = (u) => {
      color.set(u, 1);
      for (const v of adj.get(u) || []) {
        if (color.get(v) === 1) { cyclic = true; return; }
        if (color.get(v) === 0) visit(v);
        if (cyclic) return;
      }
      color.set(u, 2);
    };
    for (const n of nodes) { if (color.get(n.id) === 0) visit(n.id); if (cyclic) break; }
    if (cyclic) errors.push('Pipeline graph has a cycle (must be a DAG).');
    else if (computeRoots(graphDef).length === 0) errors.push('Pipeline has no start node (every node has an incoming edge).');
  }

  return { ok: errors.length === 0, errors };
}

/** Direct predecessors of a node (whose output feeds it as context). */
function predecessorsOf(graphDef, nodeId) {
  return (graphDef?.edges || []).filter(e => e.to === nodeId).map(e => e.from);
}

// ---------------------------------------------------------------------------
// Dynamic LangGraph construction + execution.
// ---------------------------------------------------------------------------

const PipelineState = Annotation.Root({
  task: Annotation({ reducer: (_, v) => v, default: () => '' }),
  outputs: Annotation({ reducer: (p, v) => ({ ...p, ...v }), default: () => ({}) }),
  summaries: Annotation({ reducer: (p, v) => ({ ...p, ...v }), default: () => ({}) }),
  verdicts: Annotation({ reducer: (p, v) => ({ ...p, ...v }), default: () => ({}) }),
});

/**
 * Build a compiled LangGraph from a pipeline definition. `nodeRunner(node, state)`
 * does the work and returns a partial state ({outputs, summaries}); routing between
 * nodes is driven by each node's outgoing edge conditions evaluated against its
 * output. Separated from execution so it can be unit-tested with a stub runner.
 */
export function buildPipelineGraph(graphDef, nodeRunner) {
  const g = new StateGraph(PipelineState);

  for (const node of graphDef.nodes) {
    g.addNode(node.id, async (state) => nodeRunner(node, state));
  }
  for (const root of computeRoots(graphDef)) {
    g.addEdge(START, root);
  }
  for (const node of graphDef.nodes) {
    const out = (graphDef.edges || []).filter(e => e.from === node.id);
    if (out.length === 0) { g.addEdge(node.id, END); continue; }
    const pathMap = { [END]: END };
    for (const t of [...new Set(out.map(e => e.to))]) pathMap[t] = t;
    g.addConditionalEdges(node.id, (state) => {
      const targets = routeFromNode(graphDef, node.id, state.outputs[node.id] || '', state.summaries[node.id] || '', (state.verdicts || {})[node.id] ?? null);
      return targets.length ? targets : END;
    }, pathMap);
  }

  return g.compile();
}

/**
 * Execute a pipeline run end to end: build the graph, run each agent node through
 * LangGraph, persist per-node status to `pipeline_runs.node_states`, and stream
 * lifecycle events over SSE (channel `pipeline-run:<id>`) for the live overlay.
 */
export async function executePipelineRun({ db, pipeline, task, pipelineRunId }) {
  const channel = `pipeline-run:${pipelineRunId}`;
  const graphDef = JSON.parse(pipeline.graph || '{"nodes":[],"edges":[]}');
  const started = Date.now();

  const agentIds = [...new Set(graphDef.nodes.map(n => n.agent_id).filter(x => x != null))];
  const placeholders = agentIds.map(() => '?').join(',') || 'NULL';
  const agentRows = agentIds.length ? db.prepare(`SELECT * FROM agents WHERE id IN (${placeholders})`).all(...agentIds) : [];
  const agentById = new Map(agentRows.map(a => [a.id, a]));

  const nodeStates = {};
  for (const n of graphDef.nodes) nodeStates[n.id] = { label: n.label, agent_id: n.agent_id, status: 'pending', summary: '' };
  const persistNodes = () => db.prepare(`UPDATE pipeline_runs SET node_states = ? WHERE id = ?`).run(JSON.stringify(nodeStates), pipelineRunId);

  db.prepare(`UPDATE pipeline_runs SET status = 'running', started_at = ?, node_states = ? WHERE id = ?`)
    .run(new Date().toISOString(), JSON.stringify(nodeStates), pipelineRunId);
  emitRunEvent(channel, { type: 'run_start', nodes: graphDef.nodes.map(n => ({ id: n.id, label: n.label })) });

  const defaultModel = getSetting('default_model');
  const backend = (getSetting('execution_backend') === 'api') ? 'api' : 'subscription';
  let anyFailed = false;

  const nodeRunner = async (node, state) => {
    const agent = agentById.get(node.agent_id);
    nodeStates[node.id].status = 'running'; persistNodes();
    emitRunEvent(channel, { type: 'agent_start', node: node.id, agent: node.label || agent?.name });

    if (!agent) {
      nodeStates[node.id] = { ...nodeStates[node.id], status: 'failed', summary: 'agent not found' }; persistNodes();
      emitRunEvent(channel, { type: 'agent_done', node: node.id, status: 'failed' });
      anyFailed = true;
      return { outputs: { [node.id]: '[agent not found]' }, summaries: { [node.id]: 'agent not found' } };
    }

    // Demo mode never dispatches SSH; emit a labeled stub so the overlay still animates.
    if (IS_DEMO) {
      const text = `**${agent.name}** (demo): completed "${task.slice(0, 80)}". SUMMARY: demo response from ${agent.name}.`;
      nodeStates[node.id] = { ...nodeStates[node.id], status: 'success', summary: `demo response from ${agent.name}` }; persistNodes();
      emitRunEvent(channel, { type: 'agent_done', node: node.id, status: 'success', summary: nodeStates[node.id].summary });
      return { outputs: { [node.id]: text }, summaries: { [node.id]: nodeStates[node.id].summary } };
    }

    const preds = predecessorsOf(graphDef, node.id);
    const upstream = preds.length
      ? preds.map(p => `## From ${nodeStates[p]?.label || p}:\n${state.outputs[p] || ''}`).join('\n\n')
      : null;
    const inf = resolveInference(agent, { model: node.model || defaultModel });
    const prompt = buildAgentPrompt(agent, task, upstream, 'read_only');

    const { stdout, stderr, exitCode, timedOut } = await runClaude(prompt, {
      cwd: '/tmp', model: inf.model || node.model || defaultModel,
      temperature: inf.temperature, maxTokens: inf.maxTokens, backend, agentId: agent.id,
      tier: 'read_only', maxTurns: getSetting('default_max_turns'),
    });

    if (timedOut || exitCode !== 0) {
      const st = timedOut ? 'timeout' : 'failed';
      nodeStates[node.id] = { ...nodeStates[node.id], status: st, summary: timedOut ? 'timed out' : `exit ${exitCode}: ${stderr.slice(0, 200)}` };
      persistNodes();
      emitRunEvent(channel, { type: 'agent_done', node: node.id, status: st });
      anyFailed = true;
      return { outputs: { [node.id]: stdout || `[${st}]` }, summaries: { [node.id]: nodeStates[node.id].summary } };
    }

    const parsed = parseClaudeJson(stdout);
    const text = parsed.result || stdout;
    const summary = extractSummary(text);
    const verdict = extractVerdict(text);
    nodeStates[node.id] = { ...nodeStates[node.id], status: 'success', summary: summary.slice(0, 300), verdict }; persistNodes();
    emitRunEvent(channel, { type: 'agent_done', node: node.id, status: 'success', summary: summary.slice(0, 300), verdict });
    return { outputs: { [node.id]: text }, summaries: { [node.id]: summary }, verdicts: { [node.id]: verdict } };
  };

  let status = 'success', errorMessage = null, finalOutputs = {};
  try {
    const compiled = buildPipelineGraph(graphDef, nodeRunner);
    const result = await compiled.invoke({ task }, { recursionLimit: 50 });
    finalOutputs = result.outputs || {};
    if (anyFailed) { status = 'failed'; errorMessage = 'One or more pipeline nodes failed.'; }
  } catch (err) {
    status = 'failed';
    errorMessage = err.message;
  }

  const finishedAt = new Date().toISOString();
  const durationMs = Date.now() - started;
  const summary = Object.values(nodeStates).map(s => `${s.label}: ${s.summary || s.status}`).join('\n').slice(0, 4000);

  db.prepare(`UPDATE pipeline_runs SET status = ?, finished_at = ?, duration_ms = ?, summary = ?, outputs = ?, error_message = ? WHERE id = ?`)
    .run(status, finishedAt, durationMs, summary, JSON.stringify(finalOutputs), errorMessage, pipelineRunId);
  db.prepare(`UPDATE pipelines SET last_run_at = ? WHERE id = ?`).run(finishedAt, pipeline.id);
  emitRunEvent(channel, { type: 'done', status, summary });

  return { status, pipelineRunId };
}
