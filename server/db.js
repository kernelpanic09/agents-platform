import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { seedAgents } from './seed.js';

export function initDb() {
  const dataDir = process.env.DATA_DIR || '.';

  if (dataDir !== '.' && !existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = join(dataDir, 'agents.db');
  const db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      tagline TEXT NOT NULL,
      color TEXT NOT NULL,
      icon_id TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'infrastructure',
      status TEXT NOT NULL DEFAULT 'active',
      skills TEXT NOT NULL DEFAULT '[]',
      tools TEXT NOT NULL DEFAULT '[]',
      mcp_servers TEXT NOT NULL DEFAULT '[]',
      knowledge_sources TEXT NOT NULL DEFAULT '[]',
      example_tasks TEXT NOT NULL DEFAULT '[]',
      related_agents TEXT NOT NULL DEFAULT '[]',
      system_prompt TEXT NOT NULL DEFAULT '',
      prompt_file TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_agents_category ON agents(category);
    CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);

    CREATE TABLE IF NOT EXISTS agency_agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '#8B5CF6',
      emoji TEXT NOT NULL DEFAULT '',
      vibe TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'general',
      source_file TEXT NOT NULL UNIQUE,
      services TEXT NOT NULL DEFAULT '[]',
      system_prompt TEXT NOT NULL DEFAULT '',
      synced_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_agency_agents_category ON agency_agents(category);

    CREATE TABLE IF NOT EXISTS schedules (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      name             TEXT NOT NULL,
      description      TEXT DEFAULT '',
      agent_ids        TEXT NOT NULL,
      mode             TEXT NOT NULL,
      task_prompt      TEXT NOT NULL,
      cron_expression  TEXT NOT NULL,
      recurring        INTEGER NOT NULL DEFAULT 1,
      allow_writes     INTEGER NOT NULL DEFAULT 0,
      app_directory    TEXT DEFAULT NULL,
      model            TEXT DEFAULT NULL,
      execution_backend TEXT DEFAULT NULL,
      status           TEXT NOT NULL DEFAULT 'active',
      next_run_at      TEXT,
      last_run_at      TEXT,
      created_at       TEXT DEFAULT (datetime('now')),
      updated_at       TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_schedules_status ON schedules(status);

    CREATE TABLE IF NOT EXISTS runs (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id      INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
      agent_ids        TEXT NOT NULL,
      mode             TEXT NOT NULL,
      task_prompt      TEXT NOT NULL,
      status           TEXT NOT NULL,
      started_at       TEXT,
      finished_at      TEXT,
      duration_ms      INTEGER,
      summary          TEXT,
      transcript       TEXT,
      per_agent_output TEXT,
      exit_code        INTEGER,
      error_message    TEXT,
      created_at       TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_runs_schedule ON runs(schedule_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_type TEXT NOT NULL,
      source_path TEXT NOT NULL,
      agent_id INTEGER REFERENCES agents(id),
      chunk_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      metadata TEXT DEFAULT '{}',
      ingested_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_documents_agent ON documents(agent_id);
    CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);

    CREATE TABLE IF NOT EXISTS traces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER REFERENCES runs(id),
      agent_id INTEGER REFERENCES agents(id),
      step_name TEXT,
      model TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      latency_ms INTEGER,
      cost_usd REAL,
      status TEXT NOT NULL DEFAULT 'success',
      source TEXT DEFAULT 'api',
      input_preview TEXT,
      output_preview TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_traces_run ON traces(run_id);
    CREATE INDEX IF NOT EXISTS idx_traces_agent ON traces(agent_id);
    CREATE INDEX IF NOT EXISTS idx_traces_created ON traces(created_at);

    CREATE TABLE IF NOT EXISTS cost_budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL,
      scope_id INTEGER,
      daily_limit_usd REAL,
      monthly_limit_usd REAL,
      alert_threshold REAL DEFAULT 0.8,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS eval_suites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      agent_id INTEGER REFERENCES agents(id),
      description TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS eval_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      suite_id INTEGER NOT NULL REFERENCES eval_suites(id) ON DELETE CASCADE,
      input_prompt TEXT NOT NULL,
      expected_behavior TEXT NOT NULL,
      scoring_criteria TEXT DEFAULT '{}',
      order_index INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS eval_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      suite_id INTEGER NOT NULL REFERENCES eval_suites(id) ON DELETE CASCADE,
      model TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      total_cases INTEGER DEFAULT 0,
      passed INTEGER DEFAULT 0,
      failed INTEGER DEFAULT 0,
      avg_score REAL,
      total_cost_usd REAL,
      started_at TEXT,
      finished_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS eval_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      eval_run_id INTEGER NOT NULL REFERENCES eval_runs(id) ON DELETE CASCADE,
      eval_case_id INTEGER NOT NULL REFERENCES eval_cases(id),
      output TEXT,
      scores TEXT DEFAULT '{}',
      overall_score REAL,
      passed INTEGER,
      judge_reasoning TEXT,
      latency_ms INTEGER,
      tokens_used INTEGER,
      cost_usd REAL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_eval_results_run ON eval_results(eval_run_id);
  `);

  // Idempotent migrations for existing deployments that predate new columns.
  const schedCols = new Set(db.prepare(`PRAGMA table_info(schedules)`).all().map(c => c.name));
  if (!schedCols.has('app_directory')) {
    db.exec(`ALTER TABLE schedules ADD COLUMN app_directory TEXT DEFAULT NULL`);
    console.log('[db] migrated: schedules.app_directory added');
  }
  if (!schedCols.has('model')) {
    db.exec(`ALTER TABLE schedules ADD COLUMN model TEXT DEFAULT NULL`);
    console.log('[db] migrated: schedules.model added');
  }
  if (!schedCols.has('execution_backend')) {
    db.exec(`ALTER TABLE schedules ADD COLUMN execution_backend TEXT DEFAULT NULL`);
    console.log('[db] migrated: schedules.execution_backend added');
  }
  if (!schedCols.has('safety_tier')) {
    db.exec(`ALTER TABLE schedules ADD COLUMN safety_tier TEXT DEFAULT NULL`);
    console.log('[db] migrated: schedules.safety_tier added');
  }
  if (!schedCols.has('max_turns')) {
    db.exec(`ALTER TABLE schedules ADD COLUMN max_turns INTEGER DEFAULT NULL`);
    console.log('[db] migrated: schedules.max_turns added');
  }
  const traceCols = new Set(db.prepare(`PRAGMA table_info(traces)`).all().map(c => c.name));
  if (!traceCols.has('source')) {
    db.exec(`ALTER TABLE traces ADD COLUMN source TEXT DEFAULT 'api'`);
    console.log('[db] migrated: traces.source added');
  }
  // Step-level timeline parsed from stream-json dispatch (JSON array)
  if (!traceCols.has('steps')) {
    db.exec(`ALTER TABLE traces ADD COLUMN steps TEXT DEFAULT NULL`);
    console.log('[db] migrated: traces.steps added');
  }
  const agentCols = new Set(db.prepare(`PRAGMA table_info(agents)`).all().map(c => c.name));
  if (!agentCols.has('model_config')) {
    db.exec(`ALTER TABLE agents ADD COLUMN model_config TEXT DEFAULT NULL`);
    console.log('[db] migrated: agents.model_config added');
  }
  // P5: provenance tag for agents brought in via pack import or agency adoption.
  if (!agentCols.has('source_pack')) {
    db.exec(`ALTER TABLE agents ADD COLUMN source_pack TEXT DEFAULT NULL`);
    console.log('[db] migrated: agents.source_pack added');
  }
  // Structured run verdicts (parsed STATUS: ok|attention|critical line)
  const runCols0 = new Set(db.prepare(`PRAGMA table_info(runs)`).all().map(c => c.name));
  if (!runCols0.has('verdict')) {
    db.exec(`ALTER TABLE runs ADD COLUMN verdict TEXT DEFAULT NULL`);
    console.log('[db] migrated: runs.verdict added');
  }
  // What each agent's declarations provisioned into its dispatch
  // (JSON: { agentName: { mcp: [ids], skills: [slugs] } })
  if (!runCols0.has('provisioning')) {
    db.exec(`ALTER TABLE runs ADD COLUMN provisioning TEXT DEFAULT NULL`);
    console.log('[db] migrated: runs.provisioning added');
  }

  // Durable job queue + retry/backoff (P3)
  const runCols = new Set(db.prepare(`PRAGMA table_info(runs)`).all().map(c => c.name));
  for (const [col, def] of [['attempt', 'INTEGER NOT NULL DEFAULT 0'], ['max_attempts', 'INTEGER NOT NULL DEFAULT 1'], ['next_attempt_at', 'TEXT']]) {
    if (!runCols.has(col)) {
      db.exec(`ALTER TABLE runs ADD COLUMN ${col} ${def}`);
      console.log(`[db] migrated: runs.${col} added`);
    }
  }

  // Prompt version history (P4) — snapshot an agent's prior system_prompt on every edit.
  db.exec(`CREATE TABLE IF NOT EXISTS prompt_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    system_prompt TEXT NOT NULL,
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // Agent Pipeline Builder (P5) — a DAG of agent nodes with conditional edges,
  // executed through LangGraph. Runs get their own table (keeps the runs/FK schema
  // untouched) and reuse the SSE run-stream registry, keyed `pipeline-run:<id>`.
  db.exec(`
    CREATE TABLE IF NOT EXISTS pipelines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      graph TEXT NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
      last_run_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pipeline_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pipeline_id INTEGER NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
      task TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      node_states TEXT DEFAULT '{}',
      outputs TEXT DEFAULT '{}',
      summary TEXT,
      started_at TEXT,
      finished_at TEXT,
      duration_ms INTEGER,
      error_message TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_pipeline_runs_pipeline ON pipeline_runs(pipeline_id, created_at DESC);
  `);

  // Pipeline lifecycle (post-P5): cron scheduling + webhook triggers.
  const pipeCols = new Set(db.prepare(`PRAGMA table_info(pipelines)`).all().map(c => c.name));
  for (const [col, def] of [['cron_expression', 'TEXT DEFAULT NULL'], ['schedule_status', "TEXT NOT NULL DEFAULT 'manual'"], ['next_run_at', 'TEXT DEFAULT NULL']]) {
    if (!pipeCols.has(col)) {
      db.exec(`ALTER TABLE pipelines ADD COLUMN ${col} ${def}`);
      console.log(`[db] migrated: pipelines.${col} added`);
    }
  }
  db.exec(`CREATE TABLE IF NOT EXISTS pipeline_webhooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pipeline_id INTEGER NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    label TEXT DEFAULT '',
    last_triggered_at TEXT,
    trigger_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // Saved Crews (P5) — named reusable agent teams with a topology
  // (fan=parallel, chain=sequential, roundtable=meeting). Running/scheduling a
  // crew delegates to the existing schedule machinery (full run history + Live
  // Run Theater for free).
  db.exec(`
    CREATE TABLE IF NOT EXISTS crews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      agent_ids TEXT NOT NULL DEFAULT '[]',
      topology TEXT NOT NULL DEFAULT 'fan',
      task TEXT DEFAULT '',
      source TEXT DEFAULT 'manual',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Agent Skills (SKILL.md open standard) — stored verbatim, attached to
  // agents via a join table, materialized into the run workspace at dispatch.
  db.exec(`
    CREATE TABLE IF NOT EXISTS skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      source TEXT DEFAULT 'custom',
      license TEXT DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS agent_skills (
      agent_id INTEGER NOT NULL,
      skill_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (agent_id, skill_id)
    );
  `);

  // Per-agent episodic memory: distilled post-run, injected at the next
  // dispatch (pinned first, then newest). Pinned memories survive pruning.
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      kind TEXT DEFAULT 'learning',
      source_run_id INTEGER,
      pinned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_agent_memories_agent ON agent_memories(agent_id);
  `);

  // Seed if empty
  const count = db.prepare('SELECT COUNT(*) as count FROM agents').get();
  if (count.count === 0) {
    console.log('Seeding starter agents...');
    const insert = db.prepare(`
      INSERT INTO agents (name, title, tagline, color, icon_id, category, status, skills, tools, mcp_servers, knowledge_sources, example_tasks, related_agents, system_prompt, prompt_file)
      VALUES (@name, @title, @tagline, @color, @icon_id, @category, @status, @skills, @tools, @mcp_servers, @knowledge_sources, @example_tasks, @related_agents, @system_prompt, @prompt_file)
    `);

    const insertMany = db.transaction((agents) => {
      for (const agent of agents) {
        insert.run(agent);
      }
    });

    insertMany(seedAgents);
    console.log(`Seeded ${seedAgents.length} agents`);
  }

  // Seed the 10 production schedule templates on a fresh DB so the app isn't
  // empty on first boot. Seeded as 'paused' so they appear in the UI but never
  // auto-fire without an operator explicitly resuming them.
  const schedCount = db.prepare('SELECT COUNT(*) as count FROM schedules').get();
  if (schedCount.count === 0) {
    const nameToId = new Map(db.prepare('SELECT id, name FROM agents').all().map(a => [a.name, a.id]));
    const ids = (names) => JSON.stringify(names.map(n => nameToId.get(n)).filter(Boolean));
    const SEED_SCHEDULES = [
      ['Nightly Infrastructure Audit', 'parallel', '0 2 * * *', ['Atlas', 'Sentinel', 'Bastion', 'Patch'], 'Walk the cluster top to bottom; flag any node over 80% CPU or with disk pressure and verify last night’s backups.'],
      ['Security & Compliance Sweep', 'sequential', '0 3 * * 1', ['Vault', 'Cipher', 'Sentinel', 'Relay'], 'Weekly security sweep: scan for exposed secrets, TLS expiry, and unauthorized changes; report to Discord.'],
      ['Incident Response Drill', 'meeting', '0 14 * * 5', ['Atlas', 'Mirror', 'Bastion', 'Sentinel', 'Relay'], 'Tabletop incident: a worker node fails — coordinate detection, failover, and recovery end to end.'],
      ['Release Readiness Pipeline', 'sequential', '0 9 * * 1-5', ['Tempo', 'Dock', 'Flux', 'Proxy'], 'Pre-release gate: build integrity, image scan, manifest diff, and ingress checks before promotion.'],
      ['Cost & Performance Review', 'parallel', '0 8 * * 1', ['Scout', 'Sentinel', 'Oracle', 'Ledger'], 'Weekly efficiency review: surface cost, latency, and optimization opportunities across the stack.'],
      ['Backup Restore Verification Drill', 'sequential', '17 4 * * 2', ['Bastion', 'Mirror', 'Ledger', 'Relay'], 'Test-restore a Longhorn volume and a DB dump; measure RTO and verify data integrity.'],
      ['Expiry & Capacity Forecast', 'parallel', '23 7 * * 4', ['Cipher', 'Proxy', 'Atlas', 'Sentinel'], 'Forward-looking sweep of certificate expiry, MetalLB IP-pool exhaustion, and node/disk capacity.'],
      ['Dependency & CVE Patch Triage', 'sequential', '47 5 * * 3', ['Dock', 'Patch', 'Vault', 'Flux'], 'Triage pending OS/security updates and image CVEs; flag anything that needs a reboot.'],
      ['Observability Coverage Audit', 'meeting', '47 13 * * 3', ['Sentinel', 'Scout', 'Relay', 'Oracle'], 'Review dashboards, alert rules, and notification routing for blind spots and noisy alerts.'],
      ['Data Pipeline & Ingestion Health Check', 'parallel', '17 6 * * *', ['Scout', 'Oracle', 'Sentinel', 'Relay'], 'Daily verification that data pipelines, scrapers, and ingestion jobs are flowing and fresh.'],
    ];
    const insertSched = db.prepare(`
      INSERT INTO schedules (name, description, agent_ids, mode, task_prompt, cron_expression, recurring, allow_writes, status, next_run_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, 0, 'paused', NULL)
    `);
    const insertScheds = db.transaction((rows) => {
      for (const [name, mode, cron, agents, prompt] of rows) {
        insertSched.run(name, prompt.slice(0, 120), ids(agents), mode, prompt, cron);
      }
    });
    insertScheds(SEED_SCHEDULES);
    console.log(`Seeded ${SEED_SCHEDULES.length} schedule templates (paused)`);
  }

  return db;
}
