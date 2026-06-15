import { seedDemoRuns, seedDemoReport, seedDemoMemories } from './demo-content.js';

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

  // Example of the agency-adoption pattern: a catalog agent copied into the
  // runnable roster (source_pack provenance), then composed with the built-in
  // personas in a schedule and a crew. Mirrors what the Adopt button produces.
  const adoptedName = 'Code Reviewer';
  if (!db.prepare('SELECT id FROM agents WHERE name = ?').get(adoptedName)) {
    console.log('[demo] Seeding adopted-agent example (schedule + crew)...');
    const adopted = db.prepare(`INSERT INTO agents
      (name, title, tagline, color, icon_id, category, status, skills, tools, mcp_servers, knowledge_sources, example_tasks, related_agents, system_prompt, source_pack)
      VALUES (?, ?, ?, ?, 'imported', 'development', 'active', ?, '[]', '[]', '[]', '[]', ?, ?, ?)`)
      .run(
        adoptedName,
        'Engineering Specialist',
        'Reviews diffs and recent commits for correctness, security, and maintainability risks.',
        '#14B8A6',
        JSON.stringify(['code review', 'security analysis', 'best practices']),
        JSON.stringify(['Forge', 'Tempo']),
        'You are a rigorous senior code reviewer. Examine recent changes for correctness bugs, security issues, and maintainability problems. Be specific: cite files and lines. Rank findings by severity and end with an overall assessment.',
        'agency:engineering/code-reviewer.md',
      );
    const adoptedId = adopted.lastInsertRowid;
    const idOf = (name) => db.prepare('SELECT id FROM agents WHERE name = ?').get(name)?.id;
    const team = [adoptedId, idOf('Forge'), idOf('Tempo')].filter(Boolean);

    db.prepare(`INSERT INTO schedules (name, description, agent_ids, mode, task_prompt, cron_expression, recurring, allow_writes, safety_tier, status, next_run_at)
      VALUES (?, ?, ?, 'sequential', ?, '0 8 * * 1-5', 1, 0, 'read_only', 'paused', NULL)`)
      .run(
        'Daily Code Review Sweep',
        'Adopted catalog reviewer + Forge + Tempo walk recent commits before the workday.',
        JSON.stringify(team),
        'Review the most recent commits across the active app repositories. Flag correctness, security, and maintainability issues with file references. Keep it actionable.',
      );

    db.prepare(`INSERT INTO crews (name, description, agent_ids, topology, task, source)
      VALUES (?, ?, ?, 'chain', ?, 'manual')`)
      .run(
        'Review Board',
        'Catalog-adopted Code Reviewer chained with Forge and Tempo for pre-merge review.',
        JSON.stringify(team),
        'Walk the latest diff as a three-stage review: correctness, then architecture, then release readiness.',
      );
  }

  // Seed example skills (SKILL.md) so the Skills page and agent attach flow
  // are demonstrable without network access.
  const skillCount = db.prepare('SELECT COUNT(*) as count FROM skills').get();
  if (skillCount.count === 0) {
    console.log('[demo] Seeding example skills...');
    const ins = db.prepare(`INSERT INTO skills (slug, name, description, content, source, license) VALUES (?, ?, ?, ?, 'custom', '')`);
    const k8s = ins.run(
      'k8s-health-report',
      'K8s Health Report',
      'Produce a structured cluster health report. Use whenever asked about cluster, node, or workload health.',
      `---\nname: K8s Health Report\ndescription: Produce a structured cluster health report. Use whenever asked about cluster, node, or workload health.\n---\n\n# K8s Health Report\n\nStructure every health report with exactly these sections:\n\n1. **Nodes** - capacity, pressure conditions, anything NotReady\n2. **Workloads** - crashloops, restart counts, failed jobs\n3. **Storage** - volume health, capacity, degraded replicas\n\nEnd with a one-line triage call: healthy / degraded / critical.\n`,
    );
    const runbook = ins.run(
      'runbook-writer',
      'Runbook Writer',
      'Write operational runbooks in a consistent, on-call-friendly format. Use when asked to document a procedure.',
      `---\nname: Runbook Writer\ndescription: Write operational runbooks in a consistent, on-call-friendly format. Use when asked to document a procedure.\n---\n\n# Runbook Writer\n\nEvery runbook has five sections, in order:\n\n1. **Context** - what the system does, why this procedure exists\n2. **Preconditions** - access, tools, and state required before starting\n3. **Steps** - numbered, copy-pasteable commands with expected output\n4. **Verification** - how to prove the procedure worked\n5. **Rollback** - how to undo it safely\n\nWrite for a tired on-call engineer at 3am: no ambiguity, no cleverness.\n`,
    );
    const attach = db.prepare('INSERT OR IGNORE INTO agent_skills (agent_id, skill_id) VALUES (?, ?)');
    attach.run(1, k8s.lastInsertRowid);      // Atlas
    attach.run(2, k8s.lastInsertRowid);      // Sentinel
    attach.run(6, runbook.lastInsertRowid);  // Forge
  }

  // Rich, fabricated operating history so a fresh clone looks lived-in:
  // completed runs with tool-call timelines, a Combined Report with metric
  // trends, and agent memories. Each is idempotent (no-ops if data exists).
  try { seedDemoRuns(db); } catch (e) { console.error('[demo] seedDemoRuns:', e.message); }
  try { seedDemoReport(db); } catch (e) { console.error('[demo] seedDemoReport:', e.message); }
  try { seedDemoMemories(db); } catch (e) { console.error('[demo] seedDemoMemories:', e.message); }

  console.log('[demo] Sample data seeded');
}
