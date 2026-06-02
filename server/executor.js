import { spawn } from 'child_process';
import { policyToPrompt, resolveTier } from './safety-prompt.js';
import { recordTrace } from './observability/telemetry.js';
import { getSetting } from './settings.js';

const SSH_TARGET = process.env.SSH_TARGET || 'ubuntu@your-host';
const SSH_KEY_PATH = process.env.SSH_KEY_PATH || '/secrets/ssh/id_ed25519';
const RUN_TIMEOUT_MS = parseInt(process.env.RUN_TIMEOUT_MS || '900000', 10); // 15 min
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'sonnet';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3001';
// Parallel-mode agents fire simultaneously but share the remote host's state.
// Cap concurrent SSH calls per run to stay safe.
const MAX_PARALLEL_PER_RUN = parseInt(process.env.MAX_PARALLEL_PER_RUN || '3', 10);

// Execution backend: 'subscription' (default) dispatches over SSH to `claude -p`,
// using the remote host's Claude subscription — no per-token API cost. 'api' calls
// the Anthropic API directly (opt-in: for headless/cloud or pay-per-token use).
const EXECUTION_BACKEND = String(process.env.EXECUTION_BACKEND || 'subscription').toLowerCase();
// The SSH backend passes the model alias to `claude` directly; the API backend
// needs a concrete model id. Mirrors workflows/graphs.js MODEL_MAP + telemetry pricing.
const ANTHROPIC_MODEL_MAP = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6-20250514',
  opus: 'claude-opus-4-7-20250219',
};
const API_MAX_TOKENS = parseInt(process.env.API_MAX_TOKENS || '8192', 10);

/**
 * Build the prompt for a single agent in parallel/sequential mode.
 */
export function buildAgentPrompt(agent, taskPrompt, priorTranscript = null, tier = 'read_only') {
  const parts = [policyToPrompt(tier, getSetting('safety_preamble'))];
  parts.push(`# You are ${agent.name} — ${agent.title}\n`);
  parts.push(agent.system_prompt || agent.tagline || '');
  parts.push('\n\n---\n\n# Task\n');
  parts.push(taskPrompt);
  if (priorTranscript) {
    parts.push('\n\n---\n\n# Prior agents have already worked on this task. Here is their output:\n\n');
    parts.push(priorTranscript);
    parts.push('\n\n# Your turn\nBuild on, verify, or add to the above. Do not repeat it verbatim.');
  }
  parts.push('\n\nEnd your response with a single line starting with "SUMMARY:".');
  return parts.join('');
}

/**
 * Build the coordinator prompt for meeting mode (single call, voices all agents).
 */
export function buildMeetingPrompt(agents, taskPrompt, tier = 'read_only') {
  const names = agents.map(a => a.name).join(', ');
  const parts = [policyToPrompt(tier, getSetting('safety_preamble'))];
  parts.push('# Roundtable Meeting\n\n');
  parts.push(`You are facilitating a roundtable between these personas. Voice each one in turn, staying faithful to their distinct system prompts. Run 3 full rounds with speaker order: ${names}.\n\n`);
  parts.push('## Personas\n\n');
  for (const a of agents) {
    parts.push(`### ${a.name} — ${a.title}\n`);
    parts.push(a.system_prompt || a.tagline || '');
    parts.push('\n\n');
  }
  parts.push('## Topic\n\n');
  parts.push(taskPrompt);
  parts.push('\n\n## Output Format\n\n');
  parts.push('Produce the full meeting transcript. Each contribution on its own lines in the form:\n\n');
  parts.push('**{Name}:** their message\n\n');
  parts.push('End the transcript with a single line starting with "SUMMARY:" naming the decisions reached and any follow-up actions (under 300 chars).');
  return parts.join('');
}

/**
 * Extract a summary from Claude's output.
 * Looks for a "SUMMARY:" line; falls back to last paragraph.
 */
export function extractSummary(resultText) {
  if (!resultText) return '';
  const summaryMatch = resultText.match(/^\s*SUMMARY:\s*(.+?)\s*$/m);
  if (summaryMatch) return summaryMatch[1].trim().slice(0, 2000);

  const paragraphs = resultText.trim().split(/\n\s*\n/);
  const last = paragraphs[paragraphs.length - 1] || resultText;
  return last.trim().slice(0, 2000);
}

/**
 * Parse the raw `claude -p --output-format json` stdout into { result, raw }.
 */
export function parseClaudeJson(stdout) {
  if (!stdout) return { result: '', raw: stdout, parseError: 'empty output' };
  try {
    const parsed = JSON.parse(stdout);
    return { result: parsed.result || '', raw: stdout, parsed };
  } catch (err) {
    // Fallback: stdout may have extra lines; try to find JSON object
    const firstBrace = stdout.indexOf('{');
    const lastBrace = stdout.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        const parsed = JSON.parse(stdout.slice(firstBrace, lastBrace + 1));
        return { result: parsed.result || '', raw: stdout, parsed };
      } catch {
        /* fall through */
      }
    }
    return { result: stdout, raw: stdout, parseError: err.message };
  }
}

// Whitelist: the executor only cds to /tmp or APPS_ROOT/<name>. Anything
// else (defense in depth; routes also validate) falls back to /tmp.
const APPS_ROOT = process.env.APPS_ROOT || '/home/ubuntu/apps';
function safeCwd(dir) {
  if (!dir) return '/tmp';
  if (dir.startsWith(APPS_ROOT + '/') && /^[a-zA-Z0-9_/-]+$/.test(dir)) return dir;
  return '/tmp';
}

function safeModel(m) {
  const allow = String(getSetting('model_allowlist') || 'haiku,sonnet,opus').split(',').map(s => s.trim()).filter(Boolean);
  if (m && allow.includes(m)) return m;
  return getSetting('default_model') || CLAUDE_MODEL;
}

/**
 * Run one `claude -p` invocation over SSH to the remote host.
 * Returns { stdout, stderr, exitCode, timedOut }.
 */
export function runClaudeRemote(prompt, { timeoutMs = getSetting('run_timeout_ms'), sshTarget = getSetting('ssh_target'), sshKeyPath = SSH_KEY_PATH, model = getSetting('default_model'), cwd = '/tmp', maxTurns = 0, runId = null, agentId = null } = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    const b64 = Buffer.from(prompt, 'utf-8').toString('base64');
    const safe = safeCwd(cwd);
    const chosenModel = safeModel(model);
    const turnsFlag = maxTurns > 0 ? ` --max-turns ${maxTurns}` : '';
    // Claude Code running from /tmp does not walk up into /home/ubuntu, so
    // the user-level CLAUDE.md is not loaded — no swap required. This lets
    // multiple parallel calls run without racing on a shared file.
    // When cwd is an app directory, claude DOES walk up looking for CLAUDE.md,
    // which is exactly what we want (app-scoped context).
    const remoteCmd = [
      'source ~/.nvm/nvm.sh >/dev/null 2>&1;',
      'nvm use 20 >/dev/null 2>&1;',
      `cd ${safe} &&`,
      `echo '${b64}' | base64 -d | claude -p --output-format json --model ${chosenModel}${turnsFlag} --no-session-persistence --dangerously-skip-permissions`,
    ].join(' ');

    const sshArgs = [
      '-i', sshKeyPath,
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null',
      '-o', 'BatchMode=yes',
      '-o', 'ServerAliveInterval=30',
      sshTarget,
      'bash -l -c ' + JSON.stringify(remoteCmd),
    ];

    const child = spawn('ssh', sshArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGKILL'); } catch { /* already dead */ }
    }, timeoutMs);

    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf-8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf-8'); });

    child.on('close', (code) => {
      clearTimeout(timer);
      // SSH-run telemetry (source='ssh'): record token usage + the *notional* API
      // cost (subscription runs are ~free, but this powers the "savings vs API" view).
      if (code === 0 && !timedOut && stdout) {
        try {
          const parsed = parseClaudeJson(stdout);
          const usage = parsed.parsed?.usage || {};
          recordTrace({
            runId, agentId, stepName: 'ssh_dispatch', model: chosenModel,
            inputTokens: usage.input_tokens || 0, outputTokens: usage.output_tokens || 0,
            latencyMs: Date.now() - started, source: 'ssh',
            inputPreview: prompt, outputPreview: parsed.result,
          });
        } catch { /* telemetry is best-effort; never fail a run on it */ }
      }
      resolve({ stdout, stderr, exitCode: code, timedOut });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: stderr + '\n' + err.message, exitCode: -1, timedOut: false });
    });
  });
}

/**
 * Resolve which execution backend a run should use.
 * Precedence: per-schedule `execution_backend` > EXECUTION_BACKEND env > 'subscription'.
 */
export function resolveBackend(schedule = {}) {
  const v = String(schedule.execution_backend || getSetting('execution_backend') || 'subscription').toLowerCase();
  return v === 'api' ? 'api' : 'subscription';
}

/**
 * Resolve an agent's inference profile, merging its model_config over run defaults.
 * `model` applies to both backends; `temperature`/`max_tokens` apply to the API
 * backend only (the `claude` CLI exposes neither).
 */
export function resolveInference(agent, runOpts = {}) {
  let cfg = {};
  try {
    const raw = agent && agent.model_config;
    cfg = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
  } catch { cfg = {}; }
  return { model: cfg.model || runOpts.model, temperature: cfg.temperature, maxTokens: cfg.max_tokens };
}

/** Map a model alias (haiku/sonnet/opus) to a concrete Anthropic API model id. */
export function apiModelId(model) {
  return ANTHROPIC_MODEL_MAP[model] || ANTHROPIC_MODEL_MAP[CLAUDE_MODEL] || ANTHROPIC_MODEL_MAP.sonnet;
}

/**
 * Build a stdout payload shaped like `claude -p --output-format json`, so the
 * rest of the pipeline (parseClaudeJson / extractSummary) stays backend-agnostic.
 */
export function buildApiResultJson({ text, usage = {}, model }) {
  return JSON.stringify({
    result: text || '',
    usage: { input_tokens: usage.input_tokens || 0, output_tokens: usage.output_tokens || 0 },
    model,
    backend: 'api',
  });
}

/**
 * Run one agent turn via the Anthropic API (opt-in backend). Returns the SAME
 * shape as runClaudeRemote: { stdout, stderr, exitCode, timedOut }. The SDK is
 * imported lazily so the server boots without ANTHROPIC_API_KEY when the default
 * subscription backend is in use. Pass `_client` to inject a stub in tests.
 */
export async function runClaudeApi(prompt, { model = CLAUDE_MODEL, maxTokens = API_MAX_TOKENS, temperature, runId = null, agentId = null, _client = null } = {}) {
  const started = Date.now();
  const apiModel = apiModelId(model);
  try {
    let client = _client;
    if (!client) {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
    }
    const resp = await client.messages.create({
      model: apiModel,
      max_tokens: maxTokens,
      ...(temperature != null ? { temperature } : {}),
      messages: [{ role: 'user', content: prompt }],
    });
    const text = (resp.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    const usage = resp.usage || {};
    try {
      recordTrace({
        runId, agentId, stepName: 'api_dispatch', model: apiModel,
        inputTokens: usage.input_tokens || 0, outputTokens: usage.output_tokens || 0,
        latencyMs: Date.now() - started, source: 'api',
        inputPreview: prompt, outputPreview: text,
      });
    } catch { /* telemetry is best-effort; never fail a run on it */ }
    return { stdout: buildApiResultJson({ text, usage, model: apiModel }), stderr: '', exitCode: 0, timedOut: false };
  } catch (err) {
    return { stdout: '', stderr: `api backend error: ${err.message}`, exitCode: 1, timedOut: false };
  }
}

/**
 * Backend-agnostic dispatcher. Selects the SSH (subscription) or Anthropic API
 * backend from `opts.backend`. Both backends return the same result shape, so
 * callers (executeRun, runner.js, the ssh graph node) are backend-agnostic.
 */
export function runClaude(prompt, opts = {}) {
  if ((opts.backend || 'subscription') === 'api') return runClaudeApi(prompt, opts);
  return runClaudeRemote(prompt, opts);
}

/**
 * Send a Discord notification via webhook URL.
 * No-ops when DISCORD_WEBHOOK_URL is not set.
 */
export async function sendDiscordNotify(title, body, color = 3066993) {
  if (!DISCORD_WEBHOOK_URL) return;
  try {
    const payload = {
      embeds: [{
        title: title.slice(0, 256),
        description: body.slice(0, 4000),
        color,
        timestamp: new Date().toISOString(),
      }],
    };
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // Never throw from notification path
  }
}

/**
 * Execute a full run given a scheduleId. Persists results to the `runs` row.
 *
 * Requires a db with prepared statements set up (see scheduler.js).
 */
export async function executeRun({ db, runId, schedule, agents }) {
  const startedAt = new Date().toISOString();
  const started = Date.now();

  db.prepare(`UPDATE runs SET status = 'running', started_at = ? WHERE id = ?`).run(startedAt, runId);

  let summary = '';
  let transcript = '';
  let perAgentOutput = null;
  let status = 'success';
  let errorMessage = null;
  let exitCode = 0;

  const tier = resolveTier(schedule);
  const runOpts = {
    cwd: schedule.app_directory || '/tmp',
    model: schedule.model || getSetting('default_model'),
    backend: resolveBackend(schedule),
    runId,
  };

  try {
    if (schedule.mode === 'meeting') {
      const prompt = buildMeetingPrompt(agents, schedule.task_prompt, tier);
      const { stdout, stderr, exitCode: ec, timedOut } = await runClaude(prompt, runOpts);
      if (timedOut) {
        status = 'timeout';
        errorMessage = 'Run exceeded timeout';
      } else if (ec !== 0) {
        status = 'failed';
        errorMessage = `claude exited ${ec}: ${stderr.slice(0, 500)}`;
      }
      exitCode = ec ?? -1;
      transcript = stdout;
      const parsed = parseClaudeJson(stdout);
      summary = extractSummary(parsed.result);
    } else if (schedule.mode === 'sequential') {
      const outputs = {};
      let prior = null;
      for (const agent of agents) {
        const prompt = buildAgentPrompt(agent, schedule.task_prompt, prior, tier);
        const { stdout, stderr, exitCode: ec, timedOut } = await runClaude(prompt, { ...runOpts, agentId: agent.id });
        if (timedOut) {
          status = 'timeout';
          errorMessage = `Agent ${agent.name} timed out`;
          exitCode = -1;
          outputs[agent.name] = '[timed out]';
          break;
        }
        if (ec !== 0) {
          status = 'failed';
          errorMessage = `Agent ${agent.name} exited ${ec}: ${stderr.slice(0, 500)}`;
          exitCode = ec ?? -1;
          outputs[agent.name] = '[failed] ' + stderr.slice(0, 500);
          break;
        }
        const parsed = parseClaudeJson(stdout);
        outputs[agent.name] = parsed.result || stdout;
        prior = parsed.result || stdout;
      }
      perAgentOutput = outputs;
      transcript = prior || '';
      summary = status === 'success'
        ? extractSummary(prior)
        : errorMessage;
    } else {
      // parallel (default) — fires agents in batches of MAX_PARALLEL_PER_RUN
      const outputs = {};
      const results = [];
      for (let i = 0; i < agents.length; i += MAX_PARALLEL_PER_RUN) {
        const batch = agents.slice(i, i + MAX_PARALLEL_PER_RUN);
        const batchResults = await Promise.all(batch.map(async (agent) => {
          const prompt = buildAgentPrompt(agent, schedule.task_prompt, null, tier);
          const result = await runClaude(prompt, { ...runOpts, agentId: agent.id });
          return { agent, ...result };
        }));
        results.push(...batchResults);
      }
      let anyFailed = false;
      for (const r of results) {
        if (r.timedOut) {
          outputs[r.agent.name] = '[timed out]';
          anyFailed = true;
        } else if (r.exitCode !== 0) {
          const stdoutSnippet = (r.stdout || '').slice(0, 400);
          outputs[r.agent.name] = `[exit ${r.exitCode}]\nstderr: ${r.stderr.slice(0, 400)}\nstdout: ${stdoutSnippet}`;
          anyFailed = true;
        } else {
          const parsed = parseClaudeJson(r.stdout);
          outputs[r.agent.name] = parsed.result || r.stdout;
        }
      }
      perAgentOutput = outputs;
      const summaries = Object.entries(outputs).map(([name, out]) => {
        const s = extractSummary(out);
        return `${name}: ${s}`;
      });
      summary = summaries.join('\n').slice(0, 4000);
      transcript = JSON.stringify(outputs, null, 2);
      if (anyFailed) {
        status = 'failed';
        errorMessage = 'One or more agents failed; see per_agent_output.';
      }
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
  `).run(
    status,
    finishedAt,
    durationMs,
    summary || '',
    transcript || '',
    perAgentOutput ? JSON.stringify(perAgentOutput) : null,
    exitCode,
    errorMessage,
    runId,
  );

  db.prepare(`UPDATE schedules SET last_run_at = ? WHERE id = ?`).run(finishedAt, schedule.id);

  const durationSec = Math.round(durationMs / 1000);
  const color = status === 'success' ? 3066993 : 15158332;
  const title = `${schedule.name} — ${status} in ${durationSec}s`;
  const body = `${(summary || errorMessage || '').slice(0, 400)}\nView: ${APP_BASE_URL}/schedules/runs/${runId}`;
  sendDiscordNotify(title, body, color).catch(() => {});

  return { status, runId };
}
