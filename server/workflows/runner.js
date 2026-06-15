import { routeTask } from './router.js';
import { buildRagGraph, buildRoutedGraph, buildSshGraph } from './graphs.js';
import { buildAgentPrompt, buildMeetingPrompt, runClaude, resolveBackend, resolveInference, extractSummary, extractVerdict, worstVerdict, parseClaudeJson, resultText, sendDiscordNotify } from '../executor.js';
import { emitRunEvent } from '../run-stream.js';
import { getSetting } from '../settings.js';
import { resolveTier } from '../safety-prompt.js';
import { agentDispatchContext, meetingDispatchContext, hasProvisioning } from '../dispatch-context.js';
import { distillRunMemories } from '../memory.js';
import { onRunFinished as reportsOnRunFinished } from '../reports.js';
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
  // What each agent's declarations provisioned into its dispatch (MCP servers,
  // and from later phases skills) — persisted on the run for the UI/audit trail.
  const provisioning = {};
  const recordProvision = (name, ctx) => {
    if (hasProvisioning(ctx)) provisioning[name] = ctx.provisioned;
  };

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
      const mctx = meetingDispatchContext(db, agents, { backend: runOpts.backend });
      recordProvision('Meeting', mctx);
      const prompt = buildMeetingPrompt(agents, schedule.task_prompt, tier, mctx);
      emitRunEvent(runId, { type: 'agent_start', agent: 'Meeting' });
      const { stdout, stderr, exitCode: ec, timedOut } = await runClaude(prompt, { ...runOpts, mcpConfig: mctx.mcpConfig, skills: mctx.skills, onStreamEvent: (step) => emitRunEvent(runId, { type: 'step', agent: 'Meeting', step }) });
      if (timedOut) { status = 'timeout'; errorMessage = 'Run exceeded timeout'; }
      else if (ec !== 0) { status = 'failed'; errorMessage = `claude exited ${ec}: ${stderr.slice(0, 500)}`; }
      exitCode = ec ?? -1;
      const parsed = parseClaudeJson(stdout);
      const text = resultText(parsed, stdout);
      transcript = text;
      summary = extractSummary(text);
      verdicts.push(extractVerdict(text));
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
      const ctx = agentDispatchContext(db, agent, { backend: runOpts.backend });
      recordProvision(agent.name, ctx);
      const result = await graph.invoke({
        task: schedule.task_prompt,
        agentId: agent.id,
        agentName: agent.name,
        mode: schedule.mode,
        model: inf.model,
        cwd: runOpts.cwd,
        backend: runOpts.backend,
        runId,
        mcpConfig: ctx.mcpConfig,
        skills: ctx.skills,
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
          const ctx = agentDispatchContext(db, agent, { backend: runOpts.backend });
          recordProvision(agent.name, ctx);
          const prompt = buildAgentPrompt(agent, schedule.task_prompt, prior, tier, ctx);
          const { stdout, stderr, exitCode: ec, timedOut } = await runClaude(prompt, { ...runOpts, ...resolveInference(agent, runOpts), agentId: agent.id, mcpConfig: ctx.mcpConfig, skills: ctx.skills, onStreamEvent: (step) => emitRunEvent(runId, { type: 'step', agent: agent.name, step }) });
          if (timedOut) { status = 'timeout'; errorMessage = `Agent ${agent.name} timed out`; outputs[agent.name] = '[timed out]'; emitRunEvent(runId, { type: 'agent_done', agent: agent.name, status: 'timeout' }); break; }
          if (ec !== 0) { status = 'failed'; errorMessage = `Agent ${agent.name} exited ${ec}`; outputs[agent.name] = '[failed]'; emitRunEvent(runId, { type: 'agent_done', agent: agent.name, status: 'failed' }); break; }
          const parsed = parseClaudeJson(stdout);
          const text = resultText(parsed, stdout);
          outputs[agent.name] = text;
          verdicts.push(extractVerdict(text));
          prior = text;
          emitRunEvent(runId, { type: 'agent_done', agent: agent.name, status: 'success', summary: extractSummary(text) });
        }
      } else {
        const MAX_PARALLEL = getSetting('max_parallel_per_run');
        for (let i = 0; i < agents.length; i += MAX_PARALLEL) {
          const batch = agents.slice(i, i + MAX_PARALLEL);
          const batchResults = await Promise.all(batch.map(async (agent) => {
            emitRunEvent(runId, { type: 'agent_start', agent: agent.name });
            const ctx = agentDispatchContext(db, agent, { backend: runOpts.backend });
            recordProvision(agent.name, ctx);
            const prompt = buildAgentPrompt(agent, schedule.task_prompt, null, tier, ctx);
            const result = await runClaude(prompt, { ...runOpts, ...resolveInference(agent, runOpts), agentId: agent.id, mcpConfig: ctx.mcpConfig, skills: ctx.skills, onStreamEvent: (step) => emitRunEvent(runId, { type: 'step', agent: agent.name, step }) });
            const ok = !result.timedOut && result.exitCode === 0;
            emitRunEvent(runId, { type: 'agent_done', agent: agent.name, status: result.timedOut ? 'timeout' : ok ? 'success' : 'failed', summary: ok ? extractSummary(resultText(parseClaudeJson(result.stdout), result.stdout)) : undefined });
            return { agent, ...result };
          }));
          for (const r of batchResults) {
            if (r.timedOut) { outputs[r.agent.name] = '[timed out]'; status = 'failed'; }
            else if (r.exitCode !== 0) { outputs[r.agent.name] = `[exit ${r.exitCode}]`; status = 'failed'; }
            else { const parsed = parseClaudeJson(r.stdout); const text = resultText(parsed, r.stdout); outputs[r.agent.name] = text; verdicts.push(extractVerdict(text)); }
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
      exit_code = ?, error_message = ?, verdict = ?, provisioning = ?
    WHERE id = ?
  `).run(status, finishedAt, durationMs, summary || '', transcript || '',
    perAgentOutput ? JSON.stringify(perAgentOutput) : null, exitCode, errorMessage, worstVerdict(verdicts),
    Object.keys(provisioning).length ? JSON.stringify(provisioning) : null, runId);

  db.prepare(`UPDATE schedules SET last_run_at = ? WHERE id = ?`).run(finishedAt, schedule.id);

  const durationSec = Math.round(durationMs / 1000);
  const color = status === 'success' ? 3066993 : 15158332;
  const title = `${schedule.name} -- ${status} in ${durationSec}s`;
  const body = `${(summary || errorMessage || '').slice(0, 400)}\nView: ${APP_BASE_URL}/schedules/runs/${runId}`;
  sendDiscordNotify(title, body, color).catch(() => {});

  // Combined Reports: a member run finished — debounced rebuild of any report
  // group this schedule belongs to (never breaks the run path).
  try { reportsOnRunFinished(schedule.id); } catch { /* reports never break the run path */ }

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

  // Episodic memory: distill durable learnings from this run's outputs.
  // Fire-and-forget - never blocks or fails the run path. Meetings are skipped
  // (one transcript voices everyone; attribution would be noise).
  if (status === 'success' && !IS_DEMO && schedule.mode !== 'meeting') {
    const outputs = perAgentOutput
      || (agents.length === 1 && transcript ? { [agents[0].name]: transcript } : null);
    if (outputs) {
      distillRunMemories({ db, runId, agents, outputs })
        .then((r) => {
          if (r.stored) console.log(`[memory] run ${runId}: stored ${r.stored} memor${r.stored === 1 ? 'y' : 'ies'}`);
          else if (r.skipped) console.warn(`[memory] run ${runId}: distillation skipped - ${r.skipped}`);
        })
        .catch(() => {});
    }
  }

  emitRunEvent(runId, { type: 'done', status, summary });
  return { status, runId, steps };
}
