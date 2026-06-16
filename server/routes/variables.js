// server/routes/variables.js
import { Router } from 'express';
import { listVariables, getVariable, createVariable, updateVariable, deleteVariable, replaceAllFromEnv } from '../variables.js';

export default function variablesRouter(db) {
  const router = Router();

  router.get('/', (req, res) => res.json(listVariables(db)));

  router.post('/', (req, res) => {
    try {
      res.status(201).json(createVariable(db, req.body || {}));
    } catch (err) {
      res.status(/already exists/.test(err.message) ? 409 : 400).json({ error: err.message });
    }
  });

  // Bulk replace from a .env-style block: { env: "KEY=value\n..." }
  router.put('/', (req, res) => {
    try {
      const r = replaceAllFromEnv(db, String(req.body?.env ?? ''));
      res.json({ ...r, variables: listVariables(db) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.put('/:key', (req, res) => {
    try {
      const v = updateVariable(db, req.params.key, req.body || {});
      if (!v) return res.status(404).json({ error: 'variable not found' });
      res.json(v);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/:key', (req, res) => {
    if (!deleteVariable(db, req.params.key)) return res.status(404).json({ error: 'variable not found' });
    res.json({ success: true });
  });

  return router;
}
