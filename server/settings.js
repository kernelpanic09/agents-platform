import { SAFETY_PREAMBLE } from './safety-prompt.js';

// Live platform settings. Precedence: DB override > env seed > code default.
// Declarative registry so the API/UI can render + validate without hardcoding.
// NOTE: secrets (ANTHROPIC_API_KEY, SSH key, webhooks) deliberately stay in the
// environment / K8s Secrets — they are NOT settings and never live in this table.
export const SETTINGS_SCHEMA = [
  { key: 'max_concurrent_runs', group: 'Execution', label: 'Max concurrent runs', type: 'number', env: 'MAX_CONCURRENT_RUNS', default: 2, editableLive: true, description: 'Cap on simultaneous runs in the queue.' },
  { key: 'max_parallel_per_run', group: 'Execution', label: 'Max parallel agents / run', type: 'number', env: 'MAX_PARALLEL_PER_RUN', default: 3, editableLive: true, description: 'How many agents run at once within one parallel run.' },
  { key: 'run_timeout_ms', group: 'Execution', label: 'Run timeout (ms)', type: 'number', env: 'RUN_TIMEOUT_MS', default: 900000, editableLive: true, description: 'Per-dispatch SIGKILL timeout (default 15 min).' },
  { key: 'execution_backend', group: 'Execution', label: 'Default execution backend', type: 'enum', options: ['subscription', 'api'], env: 'EXECUTION_BACKEND', default: 'subscription', editableLive: true, description: 'subscription = SSH + claude -p (no API cost); api = Anthropic API.' },
  { key: 'ssh_target', group: 'Execution', label: 'SSH target', type: 'string', env: 'SSH_TARGET', default: 'ubuntu@your-host', editableLive: true, description: 'Remote host for claude -p dispatch (user@host).' },

  { key: 'default_model', group: 'Models', label: 'Default model', type: 'string', env: 'CLAUDE_MODEL', default: 'sonnet', editableLive: true, description: 'Fallback model when an agent/schedule/run sets none.' },
  { key: 'model_allowlist', group: 'Models', label: 'Model allowlist', type: 'string', default: 'haiku,sonnet,opus', editableLive: true, description: 'Comma-separated model IDs valid anywhere — add a new model here, no redeploy.' },

  { key: 'safety_preamble', group: 'Safety', label: 'Safety preamble', type: 'text', default: SAFETY_PREAMBLE, editableLive: true, description: 'Prepended to every agent prompt. Edit to tighten or loosen the global guardrail.' },

  { key: 'retention_max_runs_per_schedule', group: 'Retention', label: 'Keep N runs / schedule', type: 'number', env: 'RETENTION_MAX_RUNS_PER_SCHEDULE', default: 200, editableLive: true, description: 'Older runs beyond this per schedule are pruned nightly.' },
  { key: 'retention_max_age_days', group: 'Retention', label: 'Max run age (days)', type: 'number', env: 'RETENTION_MAX_AGE_DAYS', default: 90, editableLive: true, description: 'Finished runs older than this are pruned nightly.' },
];

const BY_KEY = Object.fromEntries(SETTINGS_SCHEMA.map(s => [s.key, s]));
let _db = null;

function coerce(meta, raw) {
  if (raw == null) return undefined;
  if (meta.type === 'number') { const n = Number(raw); return Number.isFinite(n) ? n : undefined; }
  if (meta.type === 'boolean') return raw === true || raw === 'true' || raw === '1';
  return String(raw);
}

export function initSettings(db) {
  _db = db;
  db.exec(`CREATE TABLE IF NOT EXISTS platform_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  )`);
}

/** Resolve a setting's effective value: DB override > env seed > code default. */
export function getSetting(key) {
  const meta = BY_KEY[key];
  if (!meta) return undefined;
  if (_db) {
    const row = _db.prepare('SELECT value FROM platform_settings WHERE key = ?').get(key);
    if (row && row.value != null) { const v = coerce(meta, row.value); if (v !== undefined) return v; }
  }
  if (meta.env && process.env[meta.env] != null && process.env[meta.env] !== '') {
    const v = coerce(meta, process.env[meta.env]); if (v !== undefined) return v;
  }
  return meta.default;
}

/** Write a live DB override. Throws on unknown/non-live/invalid keys. */
export function setSetting(key, value) {
  const meta = BY_KEY[key];
  if (!meta) throw new Error(`unknown setting: ${key}`);
  if (meta.editableLive === false) throw new Error(`setting "${key}" is not live-editable`);
  const v = coerce(meta, value);
  if (v === undefined) throw new Error(`invalid value for ${key}`);
  if (meta.type === 'enum' && meta.options && !meta.options.includes(v)) {
    throw new Error(`${key} must be one of: ${meta.options.join(', ')}`);
  }
  _db.prepare(`INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).run(key, String(v));
  return getSetting(key);
}

/** Reset a setting to its env/default by removing the DB override. */
export function resetSetting(key) {
  if (_db) _db.prepare('DELETE FROM platform_settings WHERE key = ?').run(key);
  return getSetting(key);
}

/** All settings with current value + source ('db' | 'env' | 'default'), for the UI. */
export function allSettings() {
  return SETTINGS_SCHEMA.map(meta => {
    const dbRow = _db ? _db.prepare('SELECT value FROM platform_settings WHERE key = ?').get(meta.key) : null;
    const source = dbRow && dbRow.value != null ? 'db' : (meta.env && process.env[meta.env] ? 'env' : 'default');
    return {
      key: meta.key, group: meta.group, label: meta.label, type: meta.type,
      options: meta.options || null, description: meta.description || '',
      editableLive: meta.editableLive !== false, requiresRestart: !!meta.requiresRestart,
      source, value: getSetting(meta.key),
    };
  });
}
