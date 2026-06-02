import { Router } from 'express';
import { listKeys, createKey, revokeKey, VALID_SCOPES } from '../api-keys.js';

export default function keysRouter() {
  const router = Router();

  // GET /api/keys — list (prefixes + metadata only; never the secret).
  router.get('/', (req, res) => res.json(listKeys()));

  // POST /api/keys — create; the full key is returned ONCE in the response.
  router.post('/', (req, res) => {
    const { name, scopes } = req.body || {};
    const bad = (scopes || []).filter(s => !VALID_SCOPES.includes(s));
    if (bad.length) return res.status(400).json({ error: `invalid scopes: ${bad.join(', ')}` });
    res.status(201).json(createKey(name, scopes && scopes.length ? scopes : ['read']));
  });

  // DELETE /api/keys/:id — revoke.
  router.delete('/:id', (req, res) => {
    if (!revokeKey(parseInt(req.params.id, 10))) return res.status(404).json({ error: 'key not found' });
    res.json({ success: true });
  });

  return router;
}
