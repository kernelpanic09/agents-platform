const PRICING = {
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
  'claude-sonnet-4-6-20250514': { input: 3.00, output: 15.00 },
  'claude-opus-4-7-20250219': { input: 15.00, output: 75.00 },
  'nomic-embed-text': { input: 0, output: 0 },
  'haiku': { input: 0.80, output: 4.00 },
  'sonnet': { input: 3.00, output: 15.00 },
  'opus': { input: 15.00, output: 75.00 },
};

export function calculateCost(model, inputTokens, outputTokens) {
  const pricing = PRICING[model] || PRICING['haiku'];
  return ((inputTokens * pricing.input) + (outputTokens * pricing.output)) / 1_000_000;
}

let _db = null;

export function initTelemetry(db) {
  _db = db;
}

export function recordTrace({ runId = null, agentId = null, stepName, model, inputTokens = 0, outputTokens = 0, latencyMs, status = 'success', inputPreview = '', outputPreview = '' }) {
  if (!_db) return null;
  const costUsd = calculateCost(model, inputTokens, outputTokens);
  const result = _db.prepare(`
    INSERT INTO traces (run_id, agent_id, step_name, model, input_tokens, output_tokens, latency_ms, cost_usd, status, input_preview, output_preview)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(runId, agentId, stepName, model, inputTokens, outputTokens, latencyMs, costUsd, status, inputPreview?.slice(0, 500) || '', outputPreview?.slice(0, 500) || '');
  return { traceId: result.lastInsertRowid, costUsd };
}

export function getTraces({ runId, agentId, limit = 50, offset = 0 } = {}) {
  if (!_db) return [];
  let sql = 'SELECT * FROM traces';
  const conditions = [];
  const params = [];
  if (runId) { conditions.push('run_id = ?'); params.push(runId); }
  if (agentId) { conditions.push('agent_id = ?'); params.push(agentId); }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  return _db.prepare(sql).all(...params);
}

export function getCostSummary({ days = 30 } = {}) {
  if (!_db) return {};
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const total = _db.prepare('SELECT COALESCE(SUM(cost_usd), 0) as total FROM traces WHERE created_at >= ?').get(since);
  const byModel = _db.prepare('SELECT model, SUM(cost_usd) as cost, SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens, COUNT(*) as calls FROM traces WHERE created_at >= ? GROUP BY model ORDER BY cost DESC').all(since);
  const byAgent = _db.prepare(`
    SELECT t.agent_id, a.name as agent_name, SUM(t.cost_usd) as cost, COUNT(*) as calls
    FROM traces t LEFT JOIN agents a ON t.agent_id = a.id
    WHERE t.created_at >= ? GROUP BY t.agent_id ORDER BY cost DESC
  `).all(since);
  const daily = _db.prepare(`
    SELECT date(created_at) as day, SUM(cost_usd) as cost, COUNT(*) as calls
    FROM traces WHERE created_at >= ? GROUP BY date(created_at) ORDER BY day
  `).all(since);

  return { total: total.total, byModel, byAgent, daily, days };
}

export function getLatencyStats({ days = 7 } = {}) {
  if (!_db) return {};
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const stats = _db.prepare(`
    SELECT model,
      COUNT(*) as calls,
      ROUND(AVG(latency_ms)) as avg_ms,
      MIN(latency_ms) as min_ms,
      MAX(latency_ms) as max_ms
    FROM traces WHERE created_at >= ? AND latency_ms IS NOT NULL
    GROUP BY model
  `).all(since);
  return { stats, days };
}
