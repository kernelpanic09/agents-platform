import { Router } from 'express';
import { allSettings, setSetting, resetSetting } from '../settings.js';

export default function settingsRouter() {
  const router = Router();

  // GET /api/settings — all settings, grouped, with current value + source.
  router.get('/', (req, res) => {
    const settings = allSettings();
    const groups = {};
    for (const s of settings) (groups[s.group] = groups[s.group] || []).push(s);
    res.json({ groups, settings });
  });

  // PUT /api/settings/:key — set a live override.
  router.put('/:key', (req, res) => {
    try {
      const value = setSetting(req.params.key, req.body?.value);
      res.json({ key: req.params.key, value });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // DELETE /api/settings/:key — reset to the env/default value.
  router.delete('/:key', (req, res) => {
    res.json({ key: req.params.key, value: resetSetting(req.params.key) });
  });

  return router;
}
