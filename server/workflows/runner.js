import { routeTask } from './router.js';
import { buildRagGraph, buildRoutedGraph, buildSshGraph } from './graphs.js';
import { buildAgentPrompt, buildMeetingPrompt, runClaude, resolveBackend, resolveInference, extractSummary, extractVerdict, worstVerdict, parseClaudeJson, sendDiscordNotify } from '../executor.js';
import { emitRunEvent } from '../run-stream.js';
import { getSetting } from '../settings.js';
import { resolveTier } from '../safety-prompt.js';
import { IS_DEMO } from '../demo.js';

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'sonnet';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3001';

export async function executeRunViaGraph({ db, runId, schedule, agents }) {
  const startedAt = new Date().toISOString();
  const started = Date.now();

  db.prepare(`UPDATE runs SET status = 'running', started_at = ? WHERE id = ?`).run(startedAt, runId);
  emitRunEvent(runId, { type: 'run_start', mode: schedule.mode, agents: agents.map(a => a.name) });

  let summary = '';
  let transcript = '';
  let perAgentOutput = null;
  let status = 'success';
  let errorMessage = null;
  let exitCode = 0;
  let steps = [];
  const verdicts = [];

  const tier = resolveTier(schedule);
  const runOpts = {
    cwd: schedule.app_directory || '/tmp',
    model: schedule.model || getSetting('default_model'),
    backend: resolveBackend(schedule),
    maxTurns: schedule.max_turns ?? getSetting('default_max_turns'),
    tier,
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
      const prompt = buildMeetingPrompt(agents, schedule.task_prompt, tier);
      emitRunEvent(runId, { type: 'agent_start', agent: 'Meeting' });
      const { stdout, stderr, exitCode: ec, timedOut } = await runClaude(prompt, runOpts);
      if (timedOut) { status = 'timeout'; errorMessage = 'Run exceeded timeout'; }
      else if (ec !== 0) { status = 'failed'; errorMessage = `claude exited ${ec}: ${stderr.slice(0, 500)}`; }
      exitCode = ec ?? -1;
      transcript = stdout;
      const parsed = parseClaudeJson(stdout);
      summary = extractSummary(parsed.result);
      verdicts.push(extractVerdict(parsed.result));
      emitRunEvent(runId, { type: 'agent_done', agent: 'Meeting', status: timedOut ? 'timeout' : ec === 0 ? 'success' : 'failed', summary });
      steps.push({ name: 'meeting', status: timedOut ? 'timeout' : ec === 0 ? 'done' : 'failed' });
    } else if (agents.length === 1) {
      const agent = agents[0];
      const route = await routeTask(schedule.task_prompt, agent);
      steps.push({ name: 'route', decision: route });

      let graph;
      if (route === 'rag') graph = buildRagGraph();
      else if (route === 'workflow') graph = buildRoutedGraph();
      else graph = buildSshGraph();

      emitRunEvent(runId, { type: 'agent_start', agent: agent.name });
      const inf = resolveInference(agent, runOpts);
      const result = await graph.invoke({
        task: schedule.task_prompt,
        agentId: agent.id,
        agentName: agent.name,
        mode: schedule.mode,
        model: inf.model,
        cwd: runOpts.cwd,
        backend: runOpts.backend,
        runId,
        routeDecision: route,
      });

      summary = result.summary || '';
      transcript = result.result || '';
      verdicts.push(extractVerdict(transcript));
      steps.push(...(result.steps ? (Array.isArray(result.steps) ? result.steps : [result.steps]) : []));
      if (result.error) { status = 'failed'; errorMessage = result.error; }
      emitRunEvent(runId, { type: 'agent_done', agent: agent.name, status: result.error ? 'failed' : 'success', summary });
    } else {
      const outputs = {};

      if (schedule.mode === 'sequential') {
        let prior = null;
        for (const agent of agents) {
          emitRunEvent(runId, { type: 'agent_start', agent: agent.name });
          const prompt = buildAgentPrompt(agent, schedule.task_prompt, prior, tier);
          const { stdout, stderr, exitCode: ec, timedOut } = await runClaude(prompt, { ...runOpts, ...resolveInference(agent, runOpts), agentId: agent.id });
          if (timedOut) { status = 'timeout'; errorMessage = `Agent ${agent.name} timed out`; outputs[agent.name] = '[timed out]'; emitRunEvent(runId, { type: 'agent_done', agent: agent.name, status: 'timeout' }); break; }
          if (ec !== 0) { status = 'failed'; errorMessage = `Agent ${agent.name} exited ${ec}`; outputs[agent.name] = '[failed]'; emitRunEvent(runId, { type: 'agent_done', agent: agent.name, status: 'failed' }); break; }
          const parsed = parseClaudeJson(stdout);
          outputs[agent.name] = parsed.result || stdout;
          verdicts.push(extractVerdict(parsed.result || stdout));
          prior = parsed.result || stdout;
          emitRunEvent(runId, { type: 'agent_done', agent: agent.name, status: 'success', summary: extractSummary(parsed.result || stdout) });
        }
      } else {
        const MAX_PARALLEL = getSetting('max_parallel_per_run');
        for (let i = 0; i < agents.length; i += MAX_PARALLEL) {
          const batch = agents.slice(i, i + MAX_PARALLEL);
          const batchResults = await Promise.all(batch.map(async (agent) => {
            emitRunEvent(runId, { type: 'agent_start', agent: agent.name });
            const prompt = buildAgentPrompt(agent, schedule.task_prompt, null, tier);
            const result = await runClaude(prompt, { ...runOpts, ...resolveInference(agent, runOpts), agentId: agent.id });
            const ok = !result.timedOut && result.exitCode === 0;
            emitRunEvent(runId, { type: 'agent_done', agent: agent.name, status: result.timedOut ? 'timeout' : ok ? 'success' : 'failed', summary: ok ? extractSummary(parseClaudeJson(result.stdout).result || '') : undefined });
            return { agent, ...result };
          }));
          for (const r of batchResults) {
            if (r.timedOut) { outputs[r.agent.name] = '[timed out]'; status = 'failed'; }
            else if (r.exitCode !== 0) { outputs[r.agent.name] = `[exit ${r.exitCode}]`; status = 'failed'; }
            else { const parsed = parseClaudeJson(r.stdout); outputs[r.agent.name] = parsed.result || r.stdout; verdicts.push(extractVerdict(parsed.result || r.stdout)); }
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
      exit_code = ?, error_message = ?, verdict = ?
    WHERE id = ?
  `).run(status, finishedAt, durationMs, summary || '', transcript || '',
    perAgentOutput ? JSON.stringify(perAgentOutput) : null, exitCode, errorMessage, worstVerdict(verdicts), runId);

  db.prepare(`UPDATE schedules SET last_run_at = ? WHERE id = ?`).run(finishedAt, schedule.id);

  const durationSec = Math.round(durationMs / 1000);
  const color = status === 'success' ? 3066993 : 15158332;
  const title = `${schedule.name} -- ${status} in ${durationSec}s`;
  const body = `${(summary || errorMessage || '').slice(0, 400)}\nView: ${APP_BASE_URL}/schedules/runs/${runId}`;
  sendDiscordNotify(title, body, color).catch(() => {});

  // Operational alert: an agent reported a CRITICAL verdict - distinct red alert
  // so verdicts feed monitoring, not just badges.
  const runVerdict = worstVerdict(verdicts);
  if (runVerdict === 'critical') {
    sendDiscordNotify(
      `CRITICAL verdict -- ${schedule.name}`,
      `An agent reported STATUS: critical.\n${(summary || '').slice(0, 400)}\nView: ${APP_BASE_URL}/schedules/runs/${runId}`,
      15158332,
    ).catch(() => {});
  }

  emitRunEvent(runId, { type: 'done', status, summary });
  return { status, runId, steps };
}
