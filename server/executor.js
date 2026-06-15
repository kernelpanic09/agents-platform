import { spawn } from 'child_process';
import { randomBytes } from 'crypto';
import { policyToPrompt, resolveTier, tierCliFlags } from './safety-prompt.js';
import { recordTrace } from './observability/telemetry.js';
import { getSetting } from './settings.js';

const SSH_TARGET = process.env.SSH_TARGET || 'ubuntu@your-host';
const SSH_KEY_PATH = process.env.SSH_KEY_PATH || '/secrets/ssh/id_ed25519';
const RUN_TIMEOUT_MS = parseInt(process.env.RUN_TIMEOUT_MS || '900000', 10); // 15 min
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'sonnet';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3001';

// The SSH backend passes the model alias to `claude` directly; the API backend
// needs a concrete model id (kept in sync with telemetry pricing).
const ANTHROPIC_MODEL_MAP = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6-20250514',
  opus: 'claude-opus-4-7-20250219',
};
const API_MAX_TOKENS = parseInt(process.env.API_MAX_TOKENS || '8192', 10);

// Third backend: any OpenAI-compatible /chat/completions endpoint. Point it at a
// local Ollama (http://ollama:11434/v1) for fully-free local models, or at any
// hosted OpenAI-compatible provider. No SDK needed — plain fetch. Env is read at
// call time so it can be set per-environment without a rebuild.
const openaiBaseUrl = () => (process.env.OPENAI_BASE_URL || '').replace(/\/+$/, '');
const openaiApiKey = () => process.env.OPENAI_API_KEY || 'none'; // local servers accept any token
const openaiDefaultModel = () => process.env.OPENAI_MODEL || 'qwen2.5:7b';

/** Inline skills section for backends without a skill runtime (api/openai). */
function inlineSkillsSection(inlineSkills) {
  if (!inlineSkills || !inlineSkills.length) return '';
  const parts = ['\n\n---\n\n# Skills\nYou have the following skills - procedural instructions to apply when relevant to the task:\n'];
  for (const s of inlineSkills) {
    parts.push(`\n## ${s.name}\n${s.description}\n\n${s.body}\n`);
  }
  return parts.join('');
}

/** Episodic memory section: what this agent learned from previous runs. */
function memoriesSection(memories) {
  if (!memories || !memories.length) return '';
  const parts = ['\n\n---\n\n# What you remember from previous runs\nDistilled observations from your past runs in this environment. Trust but verify - they may be stale:\n'];
  for (const m of memories) {
    parts.push(`- ${m.content}${m.created_at ? ` _(noted ${String(m.created_at).slice(0, 10)})_` : ''}\n`);
  }
  return parts.join('');
}

/**
 * Build the prompt for a single agent in parallel/sequential mode.
 * `ctx` is an agentDispatchContext: inlineSkills (api/openai backends) are
 * appended here; on the subscription backend skills load natively instead.
 */
export function buildAgentPrompt(agent, taskPrompt, priorTranscript = null, tier = 'read_only', ctx = null) {
  const parts = [policyToPrompt(tier, getSetting('safety_preamble'))];
  parts.push(`# You are ${agent.name} — ${agent.title}\n`);
  parts.push(agent.system_prompt || agent.tagline || '');
  parts.push(inlineSkillsSection(ctx?.inlineSkills));
  parts.push(memoriesSection(ctx?.memories));
  parts.push('\n\n---\n\n# Task\n');
  parts.push(taskPrompt);
  if (priorTranscript) {
    parts.push('\n\n---\n\n# Prior agents have already worked on this task. Here is their output:\n\n');
    parts.push(priorTranscript);
    parts.push('\n\n# Your turn\nBuild on, verify, or add to the above. Do not repeat it verbatim.');
  }
  parts.push('\n\nEnd your response with exactly two final lines:\n');
  parts.push('STATUS: <ok|attention|critical>   (your overall assessment: ok = nothing notable, attention = degraded or needs follow-up, critical = urgent problem)\n');
  parts.push('SUMMARY: <one line, under 300 characters>');
  return parts.join('');
}

/**
 * Build the coordinator prompt for meeting mode (single call, voices all agents).
 */
export function buildMeetingPrompt(agents, taskPrompt, tier = 'read_only', ctx = null) {
  const names = agents.map(a => a.name).join(', ');
  const parts = [policyToPrompt(tier, getSetting('safety_preamble'))];
  parts.push(inlineSkillsSection(ctx?.inlineSkills));
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
  parts.push('End the transcript with exactly two final lines:\n');
  parts.push('STATUS: <ok|attention|critical>   (the meeting\'s overall assessment)\n');
  parts.push('SUMMARY: <decisions reached and follow-up actions, under 300 chars>');
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

const VERDICTS = ['ok', 'attention', 'critical'];

/**
 * Extract the structured STATUS verdict from agent output.
 * Returns 'ok' | 'attention' | 'critical' | null (older runs / non-conforming output).
 */
export function extractVerdict(resultText) {
  if (!resultText) return null;
  // Tolerates markdown emphasis around the label and/or the value
  // (STATUS: critical, **STATUS:** critical, STATUS: **critical**).
  const m = resultText.match(/^\s*\*{0,2}STATUS:?\*{0,2}\s*\*{0,2}(ok|attention|critical)\b/im);
  return m ? m[1].toLowerCase() : null;
}

/** Aggregate per-agent verdicts into a run verdict (worst wins; nulls ignored). */
export function worstVerdict(verdicts) {
  let worst = null;
  for (const v of verdicts) {
    if (!VERDICTS.includes(v)) continue;
    if (worst === null || VERDICTS.indexOf(v) > VERDICTS.indexOf(worst)) worst = v;
  }
  return worst;
}

// What a stream-json event contributes to the step timeline. Returns null for
// events that aren't timeline-worthy (tool_results, deltas). Detail strings
// are short previews; the run transcript holds the full content.
const STEP_DETAIL_KEYS = ['command', 'file_path', 'pattern', 'query', 'url', 'prompt', 'description'];
export function stepFromEvent(evt, atMs = null) {
  if (!evt || typeof evt !== 'object') return null;
  if (evt.type === 'system' && evt.subtype === 'init') {
    const tools = Array.isArray(evt.tools) ? evt.tools.length : 0;
    const mcp = Array.isArray(evt.mcp_servers) ? evt.mcp_servers.map(m => m.name || m).join(', ') : '';
    return { kind: 'init', name: 'session', detail: `${evt.model || ''} · ${tools} tools${mcp ? ` · mcp: ${mcp}` : ''}`.trim(), atMs };
  }
  if (evt.type === 'assistant') {
    const content = evt.message?.content || [];
    for (const block of content) {
      if (block.type === 'tool_use') {
        let detail = '';
        const input = block.input || {};
        for (const k of STEP_DETAIL_KEYS) {
          if (typeof input[k] === 'string' && input[k]) { detail = input[k]; break; }
        }
        if (!detail) {
          const firstStr = Object.values(input).find(v => typeof v === 'string' && v);
          detail = firstStr || JSON.stringify(input);
        }
        return { kind: 'tool', name: block.name, detail: String(detail).slice(0, 160), atMs };
      }
    }
    const text = content.find(b => b.type === 'text')?.text;
    if (text) return { kind: 'text', name: 'assistant', detail: String(text).trim().slice(0, 120), atMs };
    return null;
  }
  if (evt.type === 'result') {
    return { kind: 'result', name: evt.subtype || 'result', detail: `${evt.num_turns ?? '?'} turns · ${Math.round((evt.duration_ms || 0) / 1000)}s`, atMs };
  }
  return null;
}

/**
 * Parse `--output-format stream-json --verbose` stdout (NDJSON): one event per
 * line, ending with a `result` event that carries the final text + usage.
 * Returns the same shape as parseClaudeJson plus a steps timeline.
 */
function resultErrorSubtype(parsed) {
  if (!parsed || typeof parsed !== 'object') return undefined;
  if (parsed.subtype && parsed.subtype !== 'success') return parsed.subtype; // e.g. error_max_turns
  if (parsed.is_error) return 'error';
  return undefined;
}

export function parseStreamJson(stdout) {
  const steps = [];
  let final = null;
  for (const line of String(stdout || '').split('\n')) {
    const t = line.trim();
    if (!t || t[0] !== '{') continue;
    let evt;
    try { evt = JSON.parse(t); } catch { continue; }
    if (evt.type === 'result') final = evt;
    const step = stepFromEvent(evt);
    if (step) steps.push(step);
  }
  if (!final) return { result: '', raw: stdout, steps, parseError: 'no result event in stream' };
  const errorSubtype = resultErrorSubtype(final);
  return { result: final.result || '', raw: stdout, parsed: final, steps, ...(errorSubtype ? { errorSubtype } : {}) };
}

// The result text of a dispatch. For stream-json output (parsed.steps present) an
// empty result stays EMPTY — falling back to raw stdout would propagate the whole
// NDJSON event log as the agent's "output". Legacy single-JSON output keeps the
// raw-stdout fallback (its raw form is the result).
export function resultText(parsed, stdout) {
  return parsed.result || (parsed.steps ? '' : (stdout || ''));
}

/**
 * Parse claude stdout into { result, raw, parsed }. Handles both output
 * formats: a single JSON object (--output-format json) and NDJSON
 * (--output-format stream-json), so callers stay format-agnostic.
 */
export function parseClaudeJson(stdout) {
  if (!stdout) return { result: '', raw: stdout, parseError: 'empty output' };
  try {
    const parsed = JSON.parse(stdout);
    return { result: parsed.result || '', raw: stdout, parsed };
  } catch {
    // NDJSON stream? (one {"type": ...} event per line)
    if (/^\s*\{"type"/.test(stdout)) {
      const stream = parseStreamJson(stdout);
      if (!stream.parseError) return stream;
    }
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
    return { result: stdout, raw: stdout, parseError: 'unparseable output' };
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
 * Assemble the remote bash command for one `claude -p` dispatch. Pure function
 * so the command shape is unit-testable.
 *
 * When an MCP config is provisioned (agent declared MCP servers and the
 * registry resolved them), it is written to a temp file on the run host and
 * passed via --mcp-config WITH --strict-mcp-config: only platform-provisioned
 * servers load, never whatever the host user happens to have configured.
 *
 * IMPORTANT: the command travels through TWO remote shell evaluations
 * (sshd's login shell, then the inner `bash -l -c`), so it must contain NO
 * shell variables or $(...) substitutions - the outer pass would expand them
 * before the inner shell runs (an unset "$VAR" becomes empty and the command
 * silently degrades). The temp file path is generated Node-side instead, and
 * a `trap ... EXIT` handles cleanup while naturally preserving claude's exit
 * code. When no MCP config is present the command is byte-identical to the
 * pre-provisioning shape (zero behavior change).
 */
export function buildRemoteCommand({ b64Prompt, cwd = '/tmp', model, turnsFlag = '', tierFlags = '', mcpB64 = null, mcpPath = null, skills = null, workdir = null, addDir = null, streamJson = false }) {
  // stream-json emits one NDJSON event per line (tool calls included) so the
  // platform can show a live step timeline; it requires --verbose in -p mode.
  const formatFlags = streamJson ? 'stream-json --verbose' : 'json';
  const claudeCmd = `claude -p --output-format ${formatFlags} --model ${model}${turnsFlag}${tierFlags}`;
  const tail = '--no-session-persistence --dangerously-skip-permissions';
  const pre = [
    'source ~/.nvm/nvm.sh >/dev/null 2>&1;',
    'nvm use 20 >/dev/null 2>&1;',
  ];
  const addDirFlag = addDir ? ` --add-dir ${addDir}` : '';

  // Workspace mode (agent has skills attached): build an isolated per-run
  // directory whose .claude/skills/ holds each attached SKILL.md, and run
  // claude from there - Claude Code discovers and loads the skills natively
  // (progressive disclosure included). Parallel runs never collide because
  // each gets its own workspace. When the schedule pins an app directory, it
  // stays reachable via --add-dir.
  if (skills && skills.length && workdir) {
    const parts = [...pre, `trap 'rm -rf ${workdir}' EXIT;`];
    parts.push(`mkdir -p ${skills.map(s => `${workdir}/.claude/skills/${s.slug}`).join(' ')} &&`);
    for (const s of skills) {
      parts.push(`echo '${s.b64}' | base64 -d > ${workdir}/.claude/skills/${s.slug}/SKILL.md &&`);
    }
    let mcpFlags = '';
    if (mcpB64) {
      parts.push(`echo '${mcpB64}' | base64 -d > ${workdir}/mcp-config.json &&`);
      mcpFlags = ` --mcp-config ${workdir}/mcp-config.json --strict-mcp-config`;
    }
    parts.push(`cd ${workdir} &&`);
    parts.push(`echo '${b64Prompt}' | base64 -d | ${claudeCmd}${mcpFlags}${addDirFlag} ${tail}`);
    return parts.join(' ');
  }

  if (mcpB64 && mcpPath) {
    return [
      ...pre,
      `cd ${cwd} &&`,
      `trap 'rm -f ${mcpPath}' EXIT;`,
      `echo '${mcpB64}' | base64 -d > ${mcpPath} &&`,
      `echo '${b64Prompt}' | base64 -d | ${claudeCmd} --mcp-config ${mcpPath} --strict-mcp-config ${tail}`,
    ].join(' ');
  }
  return [...pre, `cd ${cwd} &&`, `echo '${b64Prompt}' | base64 -d | ${claudeCmd} ${tail}`].join(' ');
}

/** Node-side temp path for the provisioned MCP config (no $(mktemp): see buildRemoteCommand). */
export function mcpTempPath() {
  return `/tmp/agents-mcp-${randomBytes(6).toString('hex')}.json`;
}

/** Node-side per-run workspace path for skill materialization. */
export function workspacePath() {
  return `/tmp/agents-ws-${randomBytes(6).toString('hex')}`;
}

// Slugs become remote paths; total payload is bounded so a pathological skill
// set can't blow up the SSH command line (ARG_MAX).
const SKILL_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_SKILLS_B64_TOTAL = 400 * 1024;

/** Encode {slug, content} skills for remote materialization; invalid slugs and overflow are dropped (logged). */
export function encodeSkillsForRemote(skills) {
  if (!skills || !skills.length) return null;
  const out = [];
  let total = 0;
  for (const s of skills) {
    if (!SKILL_SLUG_RE.test(s.slug || '')) {
      console.warn(`[skills] skipping skill with unsafe slug: ${JSON.stringify(s.slug)}`);
      continue;
    }
    const b64 = Buffer.from(String(s.content || ''), 'utf-8').toString('base64');
    if (total + b64.length > MAX_SKILLS_B64_TOTAL) {
      console.warn(`[skills] skipping ${s.slug}: total skill payload would exceed ${MAX_SKILLS_B64_TOTAL} bytes`);
      continue;
    }
    total += b64.length;
    out.push({ slug: s.slug, b64 });
  }
  return out.length ? out : null;
}

/**
 * Run one `claude -p` invocation over SSH to the remote host.
 * Returns { stdout, stderr, exitCode, timedOut }.
 */
export function runClaudeRemote(prompt, { timeoutMs = getSetting('run_timeout_ms'), sshTarget = getSetting('ssh_target'), sshKeyPath = SSH_KEY_PATH, model = getSetting('default_model'), cwd = '/tmp', maxTurns = 0, tier = null, runId = null, agentId = null, mcpConfig = null, skills = null, onStreamEvent = null } = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    const b64 = Buffer.from(prompt, 'utf-8').toString('base64');
    const safe = safeCwd(cwd);
    const chosenModel = safeModel(model);
    const turnsFlag = maxTurns > 0 ? ` --max-turns ${maxTurns}` : '';
    // Tier enforcement: read_only disables file-mutation tools at the CLI
    // permission layer (real guardrail), on top of the prompt preamble.
    const tierFlags = tierCliFlags(tier);
    const mcpB64 = mcpConfig ? Buffer.from(JSON.stringify(mcpConfig), 'utf-8').toString('base64') : null;
    const remoteSkills = encodeSkillsForRemote(skills);
    const workdir = remoteSkills ? workspacePath() : null;
    const streamJson = String(getSetting('step_streaming')) !== 'off';
    // Claude Code running from /tmp does not walk up into /home/ubuntu, so
    // the user-level CLAUDE.md is not loaded — no swap required. This lets
    // multiple parallel calls run without racing on a shared file.
    // When cwd is an app directory, claude DOES walk up looking for CLAUDE.md,
    // which is exactly what we want (app-scoped context). In workspace mode
    // (skills attached) the run executes from the workspace instead and the
    // app directory stays reachable via --add-dir.
    const remoteCmd = buildRemoteCommand({
      b64Prompt: b64, cwd: safe, model: chosenModel, turnsFlag, tierFlags,
      mcpB64, mcpPath: mcpB64 && !workdir ? mcpTempPath() : null,
      skills: remoteSkills, workdir, addDir: workdir && safe !== '/tmp' ? safe : null,
      streamJson,
    });

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
    // Step timeline: in stream-json mode each stdout line is an event; parse
    // them as they arrive (line-buffered), stamp wall-clock offsets, and
    // forward to the caller for live display.
    const steps = [];
    let lineBuf = '';
    const handleLine = (line) => {
      const t = line.trim();
      if (!t || t[0] !== '{') return;
      let evt;
      try { evt = JSON.parse(t); } catch { return; }
      const step = stepFromEvent(evt, Date.now() - started);
      if (!step) return;
      steps.push(step);
      if (onStreamEvent) { try { onStreamEvent(step); } catch { /* listener errors never kill a run */ } }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGKILL'); } catch { /* already dead */ }
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString('utf-8');
      stdout += text;
      if (streamJson) {
        lineBuf += text;
        let idx;
        while ((idx = lineBuf.indexOf('\n')) >= 0) {
          handleLine(lineBuf.slice(0, idx));
          lineBuf = lineBuf.slice(idx + 1);
        }
      }
    });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf-8'); });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (streamJson && lineBuf) handleLine(lineBuf);
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
            steps: steps.length ? steps : null,
          });
        } catch { /* telemetry is best-effort; never fail a run on it */ }
      }
      resolve({ stdout, stderr, exitCode: code, timedOut, steps });
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
  return v === 'api' || v === 'openai' ? v : 'subscription';
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

/** Map a model alias to the OpenAI-compatible backend: Claude aliases (and the
 *  empty default) use OPENAI_MODEL; anything else passes through verbatim so
 *  agents/schedules can name a concrete local or hosted model directly. */
export function openaiModelId(model) {
  if (!model || ANTHROPIC_MODEL_MAP[model]) return openaiDefaultModel();
  return model;
}

/**
 * Run one agent turn against any OpenAI-compatible /chat/completions endpoint
 * (local Ollama, vLLM, OpenAI, etc). Same result shape as the other backends.
 * Pass `_fetch` to inject a stub in tests.
 */
export async function runClaudeOpenAI(prompt, { model = '', maxTokens = API_MAX_TOKENS, temperature, timeoutMs = getSetting('run_timeout_ms'), runId = null, agentId = null, _fetch = null } = {}) {
  const started = Date.now();
  const baseUrl = openaiBaseUrl();
  if (!baseUrl) {
    return { stdout: '', stderr: 'openai backend error: OPENAI_BASE_URL is not set', exitCode: 1, timedOut: false };
  }
  const chosenModel = openaiModelId(model);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const doFetch = _fetch || fetch;
    const resp = await doFetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiApiKey()}` },
      body: JSON.stringify({
        model: chosenModel,
        max_tokens: maxTokens,
        ...(temperature != null ? { temperature } : {}),
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const detail = (await resp.text().catch(() => '')).slice(0, 300);
      return { stdout: '', stderr: `openai backend error: HTTP ${resp.status} ${detail}`, exitCode: 1, timedOut: false };
    }
    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content || '';
    const usage = data.usage || {};
    try {
      recordTrace({
        runId, agentId, stepName: 'openai_dispatch', model: chosenModel,
        inputTokens: usage.prompt_tokens || 0, outputTokens: usage.completion_tokens || 0,
        latencyMs: Date.now() - started, source: 'openai',
        inputPreview: prompt, outputPreview: text,
      });
    } catch { /* telemetry is best-effort; never fail a run on it */ }
    return {
      stdout: JSON.stringify({ result: text, usage: { input_tokens: usage.prompt_tokens || 0, output_tokens: usage.completion_tokens || 0 }, model: chosenModel, backend: 'openai' }),
      stderr: '', exitCode: 0, timedOut: false,
    };
  } catch (err) {
    const timedOut = err.name === 'AbortError';
    return { stdout: '', stderr: `openai backend error: ${timedOut ? 'timed out' : err.message}`, exitCode: 1, timedOut };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Backend-agnostic dispatcher. Selects the SSH (subscription), Anthropic API,
 * or OpenAI-compatible backend from `opts.backend`. All backends return the
 * same result shape, so callers (runner.js, pipelines) are
 * backend-agnostic.
 */
export function runClaude(prompt, opts = {}) {
  const backend = opts.backend || 'subscription';
  if (backend === 'api') return runClaudeApi(prompt, opts);
  if (backend === 'openai') return runClaudeOpenAI(prompt, opts);
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
