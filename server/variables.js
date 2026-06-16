// server/variables.js
// User-defined variables ("master sheet"). Non-secret key/value pairs that get
// substituted into agent + task prompts at dispatch via {{KEY}}. Keys are
// uppercase/underscore so {{KEY}} can never collide with the webhook
// {{payload.field}} syntax (dotted/lowercase). Stored plaintext; not for secrets.

export const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
export const VALUE_MAX = 4096;

export function isValidKey(key) {
  return typeof key === 'string' && KEY_RE.test(key);
}

// Replace {{KEY}} (optional inner whitespace) for keys present in `map`.
// Unknown tokens are left literal; values are inserted verbatim (one pass).
const TOKEN_RE = /\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}/g;
export function substitute(text, map = {}) {
  if (!text) return '';
  return String(text).replace(TOKEN_RE, (whole, key) =>
    Object.prototype.hasOwnProperty.call(map, key) ? map[key] : whole);
}

// Parse a .env-style block into { vars, errors }. Skips blanks and # comments.
// Invalid keys are collected in errors (the caller decides whether to reject).
export function parseEnv(text) {
  const vars = {};
  const errors = [];
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) { errors.push(`no '=' in line: ${line.slice(0, 60)}`); continue; }
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!isValidKey(key)) { errors.push(`invalid key: ${key.slice(0, 40)}`); continue; }
    if (value.length > VALUE_MAX) { errors.push(`value too long for ${key}`); continue; }
    vars[key] = value;
  }
  return { vars, errors };
}

function row(r) { return r || null; }

export function listVariables(db) {
  return db.prepare('SELECT key, value, description, created_at, updated_at FROM variables ORDER BY key').all();
}

export function getVariable(db, key) {
  return row(db.prepare('SELECT key, value, description, created_at, updated_at FROM variables WHERE key = ?').get(key));
}

function validate(key, value) {
  if (!isValidKey(key)) throw new Error(`invalid key "${key}": must match ${KEY_RE}`);
  if (String(value ?? '').length > VALUE_MAX) throw new Error(`value too long (max ${VALUE_MAX})`);
}

export function createVariable(db, { key, value = '', description = '' }) {
  validate(key, value);
  if (getVariable(db, key)) throw new Error(`variable "${key}" already exists`);
  db.prepare('INSERT INTO variables (key, value, description) VALUES (?, ?, ?)').run(key, String(value), String(description || ''));
  return getVariable(db, key);
}

export function updateVariable(db, key, { value, description } = {}) {
  const existing = getVariable(db, key);
  if (!existing) return null;
  const nextValue = value !== undefined ? String(value) : existing.value;
  if (nextValue.length > VALUE_MAX) throw new Error(`value too long (max ${VALUE_MAX})`);
  const nextDesc = description !== undefined ? String(description) : existing.description;
  db.prepare(`UPDATE variables SET value = ?, description = ?, updated_at = datetime('now') WHERE key = ?`).run(nextValue, nextDesc, key);
  return getVariable(db, key);
}

export function deleteVariable(db, key) {
  return db.prepare('DELETE FROM variables WHERE key = ?').run(key).changes > 0;
}

export function varsMap(db) {
  const map = {};
  for (const r of db.prepare('SELECT key, value FROM variables').all()) map[r.key] = r.value;
  return map;
}

// Replace the entire variable set from a .env-style block (atomic). Throws on any bad line.
export function replaceAllFromEnv(db, text) {
  const { vars, errors } = parseEnv(text);
  if (errors.length) throw new Error(errors.join('; '));
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM variables').run();
    const ins = db.prepare('INSERT INTO variables (key, value) VALUES (?, ?)');
    for (const [k, v] of Object.entries(vars)) ins.run(k, v);
  });
  tx();
  return { count: Object.keys(vars).length };
}
