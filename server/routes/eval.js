import { Router } from 'express';
import { runEvalSuite } from '../eval/runner.js';

export default function evalRouter(db) {
  const router = Router();

  // --- Suites ---
  router.get('/suites', (req, res) => {
    const suites = db.prepare(`
      SELECT s.*, a.name as agent_name,
        (SELECT COUNT(*) FROM eval_cases WHERE suite_id = s.id) as case_count,
        (SELECT COUNT(*) FROM eval_runs WHERE suite_id = s.id) as run_count
      FROM eval_suites s LEFT JOIN agents a ON s.agent_id = a.id
      ORDER BY s.created_at DESC
    `).all();
    res.json(suites);
  });

  router.post('/suites', (req, res) => {
    const { name, agent_id, description } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const result = db.prepare('INSERT INTO eval_suites (name, agent_id, description) VALUES (?, ?, ?)').run(name, agent_id || null, description || '');
    res.status(201).json({ id: result.lastInsertRowid });
  });

  router.delete('/suites/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    db.prepare('DELETE FROM eval_suites WHERE id = ?').run(id);
    res.json({ deleted: true });
  });

  // --- Cases ---
  router.get('/suites/:id/cases', (req, res) => {
    const cases = db.prepare('SELECT * FROM eval_cases WHERE suite_id = ? ORDER BY order_index').all(parseInt(req.params.id, 10));
    res.json(cases);
  });

  router.post('/suites/:id/cases', (req, res) => {
    const { input_prompt, expected_behavior, scoring_criteria } = req.body;
    if (!input_prompt || !expected_behavior) return res.status(400).json({ error: 'input_prompt and expected_behavior required' });
    const suiteId = parseInt(req.params.id, 10);
    const maxOrder = db.prepare('SELECT MAX(order_index) as max_idx FROM eval_cases WHERE suite_id = ?').get(suiteId);
    const result = db.prepare('INSERT INTO eval_cases (suite_id, input_prompt, expected_behavior, scoring_criteria, order_index) VALUES (?, ?, ?, ?, ?)').run(suiteId, input_prompt, expected_behavior, JSON.stringify(scoring_criteria || {}), (maxOrder?.max_idx || 0) + 1);
    res.status(201).json({ id: result.lastInsertRowid });
  });

  router.delete('/cases/:id', (req, res) => {
    db.prepare('DELETE FROM eval_cases WHERE id = ?').run(parseInt(req.params.id, 10));
    res.json({ deleted: true });
  });

  // --- Runs ---
  router.post('/suites/:id/run', async (req, res) => {
    const { model } = req.body;
    try {
      const result = await runEvalSuite(db, parseInt(req.params.id, 10), model || 'haiku');
      res.status(201).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/runs', (req, res) => {
    const { suite_id } = req.query;
    let sql = `SELECT r.*, s.name as suite_name FROM eval_runs r JOIN eval_suites s ON r.suite_id = s.id`;
    const params = [];
    if (suite_id) { sql += ' WHERE r.suite_id = ?'; params.push(parseInt(suite_id, 10)); }
    sql += ' ORDER BY r.created_at DESC LIMIT 50';
    res.json(db.prepare(sql).all(...params));
  });

  router.get('/runs/:id/results', (req, res) => {
    const results = db.prepare(`
      SELECT r.*, c.input_prompt, c.expected_behavior
      FROM eval_results r JOIN eval_cases c ON r.eval_case_id = c.id
      WHERE r.eval_run_id = ? ORDER BY c.order_index
    `).all(parseInt(req.params.id, 10));
    res.json(results.map(r => ({ ...r, scores: JSON.parse(r.scores || '{}') })));
  });

  return router;
}
