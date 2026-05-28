import { Router } from 'express';
import { getTraces, getCostSummary, getLatencyStats } from '../observability/telemetry.js';

export default function observabilityRouter(db) {
  const router = Router();

  router.get('/traces', (req, res) => {
    const { run_id, agent_id, limit, offset } = req.query;
    const traces = getTraces({
      runId: run_id ? parseInt(run_id, 10) : undefined,
      agentId: agent_id ? parseInt(agent_id, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
    res.json(traces);
  });

  router.get('/costs', (req, res) => {
    const days = req.query.days ? parseInt(req.query.days, 10) : 30;
    res.json(getCostSummary({ days }));
  });

  router.get('/latency', (req, res) => {
    const days = req.query.days ? parseInt(req.query.days, 10) : 7;
    res.json(getLatencyStats({ days }));
  });

  return router;
}
