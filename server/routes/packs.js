import { Router } from 'express';
import YAML from 'yaml';
import { buildPack, importPack } from '../packs.js';

const SECTIONS = ['agents', 'crews', 'schedules', 'pipelines'];

export default function packsRouter(db) {
  const router = Router();

  // GET /api/packs/export?include=agents,crews,...&format=yaml|json
  router.get('/export', (req, res) => {
    const include = req.query.include
      ? String(req.query.include).split(',').map(s => s.trim()).filter(s => SECTIONS.includes(s))
      : SECTIONS;
    const pack = buildPack(db, include);
    if (req.query.format === 'json') return res.json(pack);
    res.set('Content-Type', 'application/x-yaml; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="agents-pack.yaml"');
    res.send(YAML.stringify(pack));
  });

  // POST /api/packs/import  body: { yaml: "<text>" } or a raw pack object
  router.post('/import', (req, res) => {
    const payload = req.body?.yaml ?? req.body;
    try {
      const pack = typeof payload === 'string' ? YAML.parse(payload) : payload;
      const summary = importPack(db, pack);
      res.json(summary);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
