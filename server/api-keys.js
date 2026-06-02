import crypto from 'crypto';

// API keys for programmatic access (the /claude proxy, inbound webhooks, external
// callers). Keys are shown in full exactly once on creation; only a SHA-256 hash
// is stored. Scopes: read < trigger < write < admin (admin implies all).
let _db = null;
const VALID_SCOPES = ['read', 'trigger', 'write', 'admin'];

export function initApiKeys(db) {
  _db = db;
  db.exec(`CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    key_prefix TEXT NOT NULL,
    scopes TEXT NOT NULL DEFAULT '["read"]',
    created_at TEXT DEFAULT (datetime('now')),
    last_used_at TEXT,
    revoked INTEGER NOT NULL DEFAULT 0
  )`);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function createKey(name, scopes = ['read']) {
  const valid = (Array.isArray(scopes) ? scopes : []).filter(s => VALID_SCOPES.includes(s));
  if (!valid.length) valid.push('read');
  const secret = 'agk_' + crypto.randomBytes(24).toString('base64url');
  const prefix = secret.slice(0, 12);
  const info = _db.prepare(
    `INSERT INTO api_keys (name, key_hash, key_prefix, scopes) VALUES (?, ?, ?, ?)`
  ).run(name || 'key', sha256(secret), prefix, JSON.stringify(valid));
  // `key` is returned ONCE here and never again.
  return { id: info.lastInsertRowid, name: name || 'key', key: secret, key_prefix: prefix, scopes: valid };
}

export function listKeys() {
  if (!_db) return [];
  return _db.prepare(
    `SELECT id, name, key_prefix, scopes, created_at, last_used_at, revoked FROM api_keys ORDER BY id DESC`
  ).all().map(k => ({ ...k, scopes: JSON.parse(k.scopes), revoked: !!k.revoked }));
}

export function revokeKey(id) {
  return _db.prepare(`UPDATE api_keys SET revoked = 1 WHERE id = ?`).run(id).changes > 0;
}

/** Verify a raw key string; returns the row (parsed scopes) or null. Stamps last_used_at. */
export function verifyKey(raw) {
  if (!raw || !_db) return null;
  const row = _db.prepare(`SELECT * FROM api_keys WHERE key_hash = ? AND revoked = 0`).get(sha256(raw));
  if (!row) return null;
  _db.prepare(`UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?`).run(row.id);
  return { ...row, scopes: JSON.parse(row.scopes) };
}

export { VALID_SCOPES };

/** Express middleware: require a valid key holding at least one of `scopes` (admin always passes). */
export function requireScope(...scopes) {
  return (req, res, next) => {
    const auth = req.headers.authorization || '';
    const raw = auth.startsWith('Bearer ') ? auth.slice(7).trim() : (req.headers['x-api-key'] || '');
    const key = verifyKey(raw);
    if (!key) return res.status(401).json({ error: 'A valid API key is required (Authorization: Bearer <key>).' });
    if (!scopes.some(s => key.scopes.includes(s)) && !key.scopes.includes('admin')) {
      return res.status(403).json({ error: `This endpoint requires scope: ${scopes.join(' or ')}.` });
    }
    req.apiKey = key;
    next();
  };
}
