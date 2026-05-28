export const IS_DEMO = process.env.DEMO_MODE === 'true';

export function seedDemoData(db) {
  if (!IS_DEMO) return;

  const traceCount = db.prepare('SELECT COUNT(*) as count FROM traces').get();
  if (traceCount.count > 0) return;

  console.log('[demo] Seeding sample trace data...');

  const now = new Date();
  const models = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6-20250514'];
  const steps = ['rag_chat', 'langgraph_rag_respond', 'eval_case', 'rag_search'];

  for (let i = 0; i < 30; i++) {
    const date = new Date(now - (29 - i) * 86400000);
    const callsPerDay = 2 + Math.floor(Math.random() * 5);
    for (let j = 0; j < callsPerDay; j++) {
      const model = models[Math.floor(Math.random() * models.length)];
      const step = steps[Math.floor(Math.random() * steps.length)];
      const inputTokens = 200 + Math.floor(Math.random() * 800);
      const outputTokens = 100 + Math.floor(Math.random() * 400);
      const isHaiku = model.includes('haiku');
      const costUsd = ((inputTokens * (isHaiku ? 0.80 : 3.00)) + (outputTokens * (isHaiku ? 4.00 : 15.00))) / 1000000;
      const latencyMs = isHaiku ? 200 + Math.floor(Math.random() * 500) : 500 + Math.floor(Math.random() * 2000);

      db.prepare(`
        INSERT INTO traces (agent_id, step_name, model, input_tokens, output_tokens, latency_ms, cost_usd, status, input_preview, output_preview, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'success', ?, ?, ?)
      `).run(
        1 + Math.floor(Math.random() * 5),
        step,
        model,
        inputTokens,
        outputTokens,
        latencyMs,
        costUsd,
        'Sample query for demo purposes',
        'Sample response for demo purposes',
        date.toISOString()
      );
    }
  }

  // Seed a sample eval suite
  const suiteCount = db.prepare('SELECT COUNT(*) as count FROM eval_suites').get();
  if (suiteCount.count === 0) {
    console.log('[demo] Seeding sample eval suite...');
    const suiteResult = db.prepare('INSERT INTO eval_suites (name, agent_id, description) VALUES (?, ?, ?)').run('Atlas Health Check', 1, 'Test infrastructure knowledge');

    const cases = [
      { prompt: 'How do I check if a Kubernetes pod is healthy?', expected: 'Mention kubectl get pods, describe pod, and readiness/liveness probes' },
      { prompt: 'What causes OOMKilled in Kubernetes?', expected: 'Explain memory limits, resource requests, and how to increase them' },
      { prompt: 'How do I debug a CrashLoopBackOff?', expected: 'Mention checking logs, events, container exit codes' },
    ];

    for (let i = 0; i < cases.length; i++) {
      db.prepare('INSERT INTO eval_cases (suite_id, input_prompt, expected_behavior, order_index) VALUES (?, ?, ?, ?)').run(suiteResult.lastInsertRowid, cases[i].prompt, cases[i].expected, i + 1);
    }
  }

  console.log('[demo] Sample data seeded');
}
