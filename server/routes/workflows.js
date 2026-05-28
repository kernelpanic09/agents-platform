import { Router } from 'express';
import { routeTask } from '../workflows/router.js';

export default function workflowsRouter(db) {
  const router = Router();

  router.get('/types', (req, res) => {
    res.json({
      types: [
        { id: 'rag', name: 'RAG Query', description: 'Answer from knowledge base' },
        { id: 'workflow', name: 'Multi-Step Workflow', description: 'Tool use with conditional routing' },
        { id: 'ssh', name: 'SSH Dispatch', description: 'Full Claude Code session via SSH' },
        { id: 'meeting', name: 'Meeting', description: 'Multi-agent roundtable discussion' },
      ],
    });
  });

  router.post('/route', async (req, res) => {
    const { task, agent_id } = req.body;
    if (!task) return res.status(400).json({ error: 'task is required' });

    const agent = agent_id
      ? db.prepare('SELECT * FROM agents WHERE id = ?').get(agent_id)
      : { name: 'General', title: 'General Assistant' };

    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    try {
      const route = await routeTask(task, agent);
      res.json({ route, task: task.slice(0, 200), agent: agent.name });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
