import { Router } from 'express';
import {
  listSkills, getSkill, createSkill, updateSkill, deleteSkill,
  fetchCatalog, CURATED_CATALOG, importSkillFromUrl, parseSkillMd,
} from '../skills.js';

export default function skillsRouter(db) {
  const router = Router();

  // Library
  router.get('/', (req, res) => {
    res.json(listSkills(db));
  });

  // Public catalog (anthropics/skills). Live GitHub listing with a curated
  // fallback so the page works offline / rate-limited.
  router.get('/catalog', async (req, res) => {
    try {
      const entries = await fetchCatalog({ force: req.query.refresh === '1' });
      res.json({ source: 'live', repo: 'anthropics/skills', entries });
    } catch (err) {
      res.json({ source: 'fallback', repo: 'anthropics/skills', error: err.message, entries: CURATED_CATALOG });
    }
  });

  // Import a SKILL.md by URL (github blob or raw). Used by catalog Adopt too.
  router.post('/import', async (req, res) => {
    const { url, overwrite } = req.body || {};
    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'url is required' });
    try {
      const skill = await importSkillFromUrl(db, url, { overwrite: !!overwrite });
      res.status(201).json(skill);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Validate raw SKILL.md without saving (editor preview).
  router.post('/validate', (req, res) => {
    try {
      const parsed = parseSkillMd(String(req.body?.content || ''));
      res.json({ ok: true, name: parsed.name, description: parsed.description });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  router.post('/', (req, res) => {
    try {
      res.status(201).json(createSkill(db, req.body || {}));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/:id', (req, res) => {
    const skill = getSkill(db, req.params.id);
    if (!skill) return res.status(404).json({ error: 'skill not found' });
    res.json(skill);
  });

  router.put('/:id', (req, res) => {
    try {
      const skill = updateSkill(db, req.params.id, req.body || {});
      if (!skill) return res.status(404).json({ error: 'skill not found' });
      res.json(skill);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/:id', (req, res) => {
    if (!deleteSkill(db, req.params.id)) return res.status(404).json({ error: 'skill not found' });
    res.json({ success: true });
  });

  return router;
}
