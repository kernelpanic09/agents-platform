import { spawn } from 'child_process';
import { SAFETY_PREAMBLE } from './safety-prompt.js';

const SSH_TARGET = process.env.SSH_TARGET || 'ubuntu@your-host';
const SSH_KEY_PATH = process.env.SSH_KEY_PATH || '/secrets/ssh/id_ed25519';
const RUN_TIMEOUT_MS = parseInt(process.env.RUN_TIMEOUT_MS || '900000', 10); // 15 min
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'sonnet';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3001';
// Parallel-mode agents fire simultaneously but share the remote host's state.
// Cap concurrent SSH calls per run to stay safe.
const MAX_PARALLEL_PER_RUN = parseInt(process.env.MAX_PARALLEL_PER_RUN || '3', 10);

/**
 * Build the prompt for a single agent in parallel/sequential mode.
 */
export function buildAgentPrompt(agent, taskPrompt, priorTranscript = null) {
  const parts = [SAFETY_PREAMBLE];
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
export function buildMeetingPrompt(agents, taskPrompt) {
  const names = agents.map(a => a.name).join(', ');
  const parts = [SAFETY_PREAMBLE];
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

const VALID_MODELS = new Set(['haiku', 'sonnet', 'opus']);
function safeModel(m) {
  if (m && VALID_MODELS.has(m)) return m;
  return CLAUDE_MODEL;
}

/**
 * Run one `claude -p` invocation over SSH to the remote host.
 * Returns { stdout, stderr, exitCode, timedOut }.
 */
export function runClaudeRemote(prompt, { timeoutMs = RUN_TIMEOUT_MS, sshTarget = SSH_TARGET, sshKeyPath = SSH_KEY_PATH, model = CLAUDE_MODEL, cwd = '/tmp', maxTurns = 0 } = {}) {
  return new Promise((resolve) => {
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
      resolve({ stdout, stderr, exitCode: code, timedOut });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: stderr + '\n' + err.message, exitCode: -1, timedOut: false });
    });
  });
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

  const runOpts = {
    cwd: schedule.app_directory || '/tmp',
    model: schedule.model || CLAUDE_MODEL,
  };

  try {
    if (schedule.mode === 'meeting') {
      const prompt = buildMeetingPrompt(agents, schedule.task_prompt);
      const { stdout, stderr, exitCode: ec, timedOut } = await runClaudeRemote(prompt, runOpts);
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
        const prompt = buildAgentPrompt(agent, schedule.task_prompt, prior);
        const { stdout, stderr, exitCode: ec, timedOut } = await runClaudeRemote(prompt, runOpts);
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
          const prompt = buildAgentPrompt(agent, schedule.task_prompt);
          const result = await runClaudeRemote(prompt, runOpts);
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
