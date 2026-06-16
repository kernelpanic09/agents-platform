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
