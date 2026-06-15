// Demo live-run simulator. In DEMO_MODE there is no SSH host and no API key, so
// a "Run now" cannot dispatch a real agent. Instead this fabricates a believable
// run: it streams the same SSE events the real runner emits (run_start ->
// agent_start -> step* -> agent_done -> done) on a timer so the Live Run Theater
// animates exactly as it would in production, then writes a completed run row
// with per-agent output + step timelines. No external services, no real data.
import { emitRunEvent } from './run-stream.js';
import { recordTrace } from './observability/telemetry.js';
import { agentContent, mkSteps, WORST } from './demo-content.js';
import { onRunFinished as reportsOnRunFinished } from './reports.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function simulateRun({ db, runId, schedule, agents }) {
  const started = Date.now();
  db.prepare(`UPDATE runs SET status = 'running', started_at = ? WHERE id = ?`)
    .run(new Date().toISOString().replace('T', ' ').slice(0, 19), runId);

  const mode = schedule.mode || 'parallel';
  const isMeeting = mode === 'meeting';
  const lanes = isMeeting ? [{ name: 'Meeting', members: agents.map(a => a.name) }] : agents.map(a => ({ name: a.name, agent: a }));
  emitRunEvent(runId, { type: 'run_start', mode, agents: lanes.map(l => l.name) });

  // Build each lane's content + step list.
  const built = lanes.map((lane) => {
    if (isMeeting) {
      const tools = [{ name: 'Skill', detail: 'roundtable facilitation' }, { name: 'Bash', detail: 'gather each domain’s state' }];
      const out = agents.map(a => `**${a.name}:** ${agentContent(schedule.id, a.name).out.split('\n')[0]}`).join('\n')
        + '\nSTATUS: ok\nSUMMARY: Roundtable reached consensus; action items assigned.';
      return { name: 'Meeting', out, verdict: 'ok', steps: mkSteps(tools) };
    }
    const c = agentContent(schedule.id, lane.name);
    return { name: lane.name, agent: lane.agent, out: c.out, verdict: c.verdict, steps: mkSteps(c.tools) };
  });

  // agent_start: all at once for parallel/meeting, one-by-one for sequential.
  if (mode === 'sequential') {
    // handled in the lane loop below
  } else {
    for (const b of built) emitRunEvent(runId, { type: 'agent_start', agent: b.name });
  }

  const emitSummary = (out) => (out.match(/SUMMARY:\s*(.+)$/m) || [, ''])[1];

  if (mode === 'sequential') {
    for (const b of built) {
      emitRunEvent(runId, { type: 'agent_start', agent: b.name });
      for (const s of b.steps) { await sleep(550); emitRunEvent(runId, { type: 'step', agent: b.name, step: s }); }
      await sleep(400);
      emitRunEvent(runId, { type: 'agent_done', agent: b.name, status: 'success', summary: emitSummary(b.out) });
    }
  } else {
    // Round-robin one step per lane per tick so parallel lanes light up together.
    const maxLen = Math.max(...built.map(b => b.steps.length));
    for (let i = 0; i < maxLen; i++) {
      for (const b of built) {
        if (i < b.steps.length) { await sleep(380); emitRunEvent(runId, { type: 'step', agent: b.name, step: b.steps[i] }); }
      }
    }
    for (const b of built) emitRunEvent(runId, { type: 'agent_done', agent: b.name, status: 'success', summary: emitSummary(b.out) });
  }

  // Persist the finished run + per-agent step traces (mirrors the real runner).
  const outputs = {};
  const provisioning = {};
  for (const b of built) {
    outputs[b.name] = b.out;
    if (!isMeeting) {
      const mcp = b.steps.some(s => s.name?.startsWith('mcp__')) ? ['kubernetes'] : [];
      const skills = b.steps.some(s => s.name === 'Skill') ? ['k8s-health-report'] : [];
      if (mcp.length || skills.length) provisioning[b.name] = { mcp, skills };
      const agentId = db.prepare('SELECT id FROM agents WHERE name = ?').get(b.name)?.id;
      recordTrace({
        runId, agentId, stepName: 'ssh_dispatch', model: 'claude-haiku-4-5-20251001',
        inputTokens: 1400, outputTokens: 520, latencyMs: Date.now() - started, source: 'ssh',
        inputPreview: schedule.task_prompt, outputPreview: b.out, steps: b.steps,
      });
    }
  }
  const verdict = built.map(b => b.verdict).reduce((w, v) => (WORST[v] > WORST[w] ? v : w), 'ok');
  const summary = built.map(b => `${b.name}: ${emitSummary(b.out)}`).join('\n').slice(0, 2000);
  const finishedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
  db.prepare(`UPDATE runs SET status='success', finished_at=?, duration_ms=?, summary=?, transcript=?, per_agent_output=?, exit_code=0, verdict=?, provisioning=? WHERE id=?`)
    .run(finishedAt, Date.now() - started, summary, isMeeting ? built[0].out : JSON.stringify(outputs),
      JSON.stringify(outputs), verdict, Object.keys(provisioning).length ? JSON.stringify(provisioning) : null, runId);
  db.prepare(`UPDATE schedules SET last_run_at=? WHERE id=?`).run(finishedAt, schedule.id);

  try { reportsOnRunFinished(schedule.id); } catch { /* reports never break the run path */ }
  emitRunEvent(runId, { type: 'done', status: 'success', summary });
  return { status: 'success', runId };
}
