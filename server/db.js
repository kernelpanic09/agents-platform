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

  return db;
}
