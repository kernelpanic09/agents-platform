import { routeTask } from './router.js';
import { buildRagGraph, buildRoutedGraph, buildSshGraph } from './graphs.js';
import { buildAgentPrompt, buildMeetingPrompt, runClaude, resolveBackend, extractSummary, parseClaudeJson, sendDiscordNotify } from '../executor.js';
import { IS_DEMO } from '../demo.js';

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'sonnet';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3001';

export async function executeRunViaGraph({ db, runId, schedule, agents }) {
  const startedAt = new Date().toISOString();
  const started = Date.now();

  db.prepare(`UPDATE runs SET status = 'running', started_at = ? WHERE id = ?`).run(startedAt, runId);

  let summary = '';
  let transcript = '';
  let perAgentOutput = null;
  let status = 'success';
  let errorMessage = null;
  let exitCode = 0;
  let steps = [];

  const runOpts = {
    cwd: schedule.app_directory || '/tmp',
    model: schedule.model || CLAUDE_MODEL,
    backend: resolveBackend(schedule),
    runId,
  };

  try {
    if (IS_DEMO && schedule.mode !== 'meeting') {
      // In demo mode, single-agent runs route to RAG (no SSH); multi-agent stubs out.
      if (agents.length === 1) {
        const graph = buildRagGraph();
        const result = await graph.invoke({
          task: schedule.task_prompt,
          agentId: agents[0].id,
          agentName: agents[0].name,
          mode: schedule.mode,
          model: runOpts.model,
          cwd: runOpts.cwd,
          routeDecision: 'rag',
        });
        summary = result.summary || 'Demo mode: RAG response';
        transcript = result.result || '';
        steps.push({ name: 'demo_rag', status: 'done' });
      } else {
        summary = 'Demo mode: multi-agent SSH dispatch disabled.';
        transcript = summary;
        steps.push({ name: 'demo_stub', status: 'done' });
      }
    } else if (schedule.mode === 'meeting') {
      const prompt = buildMeetingPrompt(agents, schedule.task_prompt);
      const { stdout, stderr, exitCode: ec, timedOut } = await runClaude(prompt, runOpts);
      if (timedOut) { status = 'timeout'; errorMessage = 'Run exceeded timeout'; }
      else if (ec !== 0) { status = 'failed'; errorMessage = `claude exited ${ec}: ${stderr.slice(0, 500)}`; }
      exitCode = ec ?? -1;
      transcript = stdout;
      const parsed = parseClaudeJson(stdout);
      summary = extractSummary(parsed.result);
      steps.push({ name: 'meeting', status: timedOut ? 'timeout' : ec === 0 ? 'done' : 'failed' });
    } else if (agents.length === 1) {
      const agent = agents[0];
      const route = await routeTask(schedule.task_prompt, agent);
      steps.push({ name: 'route', decision: route });

      let graph;
      if (route === 'rag') graph = buildRagGraph();
      else if (route === 'workflow') graph = buildRoutedGraph();
      else graph = buildSshGraph();

      const result = await graph.invoke({
        task: schedule.task_prompt,
        agentId: agent.id,
        agentName: agent.name,
        mode: schedule.mode,
        model: runOpts.model,
        cwd: runOpts.cwd,
        backend: runOpts.backend,
        runId,
        routeDecision: route,
      });

      summary = result.summary || '';
      transcript = result.result || '';
      steps.push(...(result.steps ? (Array.isArray(result.steps) ? result.steps : [result.steps]) : []));
      if (result.error) { status = 'failed'; errorMessage = result.error; }
    } else {
      const outputs = {};

      if (schedule.mode === 'sequential') {
        let prior = null;
        for (const agent of agents) {
          const prompt = buildAgentPrompt(agent, schedule.task_prompt, prior);
          const { stdout, stderr, exitCode: ec, timedOut } = await runClaude(prompt, { ...runOpts, agentId: agent.id });
          if (timedOut) { status = 'timeout'; errorMessage = `Agent ${agent.name} timed out`; outputs[agent.name] = '[timed out]'; break; }
          if (ec !== 0) { status = 'failed'; errorMessage = `Agent ${agent.name} exited ${ec}`; outputs[agent.name] = '[failed]'; break; }
          const parsed = parseClaudeJson(stdout);
          outputs[agent.name] = parsed.result || stdout;
          prior = parsed.result || stdout;
        }
      } else {
        const MAX_PARALLEL = parseInt(process.env.MAX_PARALLEL_PER_RUN || '3', 10);
        for (let i = 0; i < agents.length; i += MAX_PARALLEL) {
          const batch = agents.slice(i, i + MAX_PARALLEL);
          const batchResults = await Promise.all(batch.map(async (agent) => {
            const prompt = buildAgentPrompt(agent, schedule.task_prompt);
            const result = await runClaude(prompt, { ...runOpts, agentId: agent.id });
            return { agent, ...result };
          }));
          for (const r of batchResults) {
            if (r.timedOut) { outputs[r.agent.name] = '[timed out]'; status = 'failed'; }
            else if (r.exitCode !== 0) { outputs[r.agent.name] = `[exit ${r.exitCode}]`; status = 'failed'; }
            else { const parsed = parseClaudeJson(r.stdout); outputs[r.agent.name] = parsed.result || r.stdout; }
          }
        }
      }

      perAgentOutput = outputs;
      const summaries = Object.entries(outputs).map(([name, out]) => `${name}: ${extractSummary(out)}`);
      summary = summaries.join('\n').slice(0, 4000);
      transcript = JSON.stringify(outputs, null, 2);
      if (status === 'failed' && !errorMessage) errorMessage = 'One or more agents failed';
    }
  } catch (err) {
    status = 'failed';
    errorMessage = err.message;
    exitCode = -1;
  }

  const finishedAt = new Date().toISOString();
  const durationMs = Date.now() - started;

  db.prepare(`
    UPDATE runs SET
      status = ?, finished_at = ?, duration_ms = ?,
      summary = ?, transcript = ?, per_agent_output = ?,
      exit_code = ?, error_message = ?
    WHERE id = ?
  `).run(status, finishedAt, durationMs, summary || '', transcript || '',
    perAgentOutput ? JSON.stringify(perAgentOutput) : null, exitCode, errorMessage, runId);

  db.prepare(`UPDATE schedules SET last_run_at = ? WHERE id = ?`).run(finishedAt, schedule.id);

  const durationSec = Math.round(durationMs / 1000);
  const color = status === 'success' ? 3066993 : 15158332;
  const title = `${schedule.name} -- ${status} in ${durationSec}s`;
  const body = `${(summary || errorMessage || '').slice(0, 400)}\nView: ${APP_BASE_URL}/schedules/runs/${runId}`;
  sendDiscordNotify(title, body, color).catch(() => {});

  return { status, runId, steps };
}
