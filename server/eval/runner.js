import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { recordTrace } from '../observability/telemetry.js';

const MODEL_MAP = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6-20250514',
  opus: 'claude-opus-4-7-20250219',
};

async function runSingleCase(agent, evalCase, model) {
  const llm = new ChatAnthropic({
    model: MODEL_MAP[model] || MODEL_MAP.haiku,
    maxTokens: 2048,
  });

  const startTime = Date.now();
  const response = await llm.invoke([
    new SystemMessage(agent.system_prompt || `You are ${agent.name}, ${agent.title}.`),
    new HumanMessage(evalCase.input_prompt),
  ]);
  const latencyMs = Date.now() - startTime;
  const output = response.content;
  const inputTokens = response.usage_metadata?.input_tokens || 0;
  const outputTokens = response.usage_metadata?.output_tokens || 0;

  recordTrace({
    agentId: agent.id,
    stepName: 'eval_case',
    model: MODEL_MAP[model] || MODEL_MAP.haiku,
    inputTokens,
    outputTokens,
    latencyMs,
    inputPreview: evalCase.input_prompt,
    outputPreview: output,
  });

  return { output, latencyMs, tokensUsed: inputTokens + outputTokens, inputTokens, outputTokens };
}

async function judgeOutput(output, expectedBehavior, scoringCriteria) {
  const judge = new ChatAnthropic({
    model: MODEL_MAP.haiku,
    maxTokens: 512,
    temperature: 0,
  });

  const prompt = `You are an evaluation judge. Score the following output against the expected behavior.

Expected behavior: ${expectedBehavior}

Output to evaluate:
${output.slice(0, 3000)}

Score each dimension from 0.0 to 1.0:
- relevance: Does it address the topic?
- accuracy: Is the information correct?
- completeness: Does it cover the expected behavior?
- format: Is it well-structured?

Respond in this exact JSON format:
{"relevance": 0.0, "accuracy": 0.0, "completeness": 0.0, "format": 0.0, "overall": 0.0, "passed": true, "reasoning": "brief explanation"}`;

  try {
    const response = await judge.invoke([new HumanMessage(prompt)]);
    const text = response.content;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        scores: { relevance: parsed.relevance, accuracy: parsed.accuracy, completeness: parsed.completeness, format: parsed.format },
        overall: parsed.overall || ((parsed.relevance + parsed.accuracy + parsed.completeness + parsed.format) / 4),
        passed: parsed.passed !== false && (parsed.overall || 0) >= 0.6,
        reasoning: parsed.reasoning || '',
      };
    }
  } catch { /* fall through */ }

  return { scores: {}, overall: 0.5, passed: false, reasoning: 'Judge failed to produce valid JSON' };
}

export async function runEvalSuite(db, suiteId, model = 'haiku') {
  const suite = db.prepare('SELECT * FROM eval_suites WHERE id = ?').get(suiteId);
  if (!suite) throw new Error(`Suite ${suiteId} not found`);

  const agent = suite.agent_id
    ? db.prepare('SELECT * FROM agents WHERE id = ?').get(suite.agent_id)
    : { id: null, name: 'General', title: 'General Assistant', system_prompt: '' };

  const cases = db.prepare('SELECT * FROM eval_cases WHERE suite_id = ? ORDER BY order_index').all(suiteId);
  if (cases.length === 0) throw new Error('Suite has no test cases');

  const runResult = db.prepare(
    `INSERT INTO eval_runs (suite_id, model, status, total_cases, started_at) VALUES (?, ?, 'running', ?, ?)`
  ).run(suiteId, model, cases.length, new Date().toISOString());
  const evalRunId = runResult.lastInsertRowid;

  let passed = 0;
  let failed = 0;
  let totalScore = 0;
  let totalCost = 0;

  for (const evalCase of cases) {
    try {
      const { output, latencyMs, tokensUsed, inputTokens, outputTokens } = await runSingleCase(agent, evalCase, model);
      const judgment = await judgeOutput(output, evalCase.expected_behavior, evalCase.scoring_criteria);

      const { calculateCost } = await import('../observability/telemetry.js');
      const caseCost = calculateCost(MODEL_MAP[model] || MODEL_MAP.haiku, inputTokens, outputTokens);

      db.prepare(`
        INSERT INTO eval_results (eval_run_id, eval_case_id, output, scores, overall_score, passed, judge_reasoning, latency_ms, tokens_used, cost_usd)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(evalRunId, evalCase.id, output, JSON.stringify(judgment.scores), judgment.overall, judgment.passed ? 1 : 0, judgment.reasoning, latencyMs, tokensUsed, caseCost);

      if (judgment.passed) passed++; else failed++;
      totalScore += judgment.overall;
      totalCost += caseCost;
    } catch (err) {
      db.prepare(`
        INSERT INTO eval_results (eval_run_id, eval_case_id, output, overall_score, passed, judge_reasoning)
        VALUES (?, ?, ?, 0, 0, ?)
      `).run(evalRunId, evalCase.id, '', `Error: ${err.message}`);
      failed++;
    }
  }

  const avgScore = cases.length > 0 ? totalScore / cases.length : 0;

  db.prepare(`
    UPDATE eval_runs SET status = 'completed', passed = ?, failed = ?, avg_score = ?, total_cost_usd = ?, finished_at = ?
    WHERE id = ?
  `).run(passed, failed, avgScore, totalCost, new Date().toISOString(), evalRunId);

  return { evalRunId, passed, failed, avgScore, totalCost };
}
