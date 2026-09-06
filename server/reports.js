import { runClaude, parseClaudeJson, sendDiscordNotify } from './executor.js';
import { recordMetricPoints } from './metrics.js';
import { autoPromoteActionItems } from './tickets.js';

// Combined Reports: a report group = a named set of schedules. When members
// finish runs, their latest findings are synthesized (one meeting-framed
// dispatch) into a structured JSON briefing rendered natively at /reports/:slug.
// Narrative comes from the LLM; timelines/provenance stay deterministic (runs table).

const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3001';
const VERDICTS = ['ok', 'attention', 'critical'];
const VERDICT_RANK = { critical: 4, failed: 3, attention: 2, ok: 1 };
const VERDICT_COLOR = { ok: 3066993, attention: 15105570, critical: 15158332 };
const MAX_BUILDS_KEPT = 30;

export function ensureReportTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS report_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      schedule_ids TEXT NOT NULL DEFAULT '[]',
      model TEXT DEFAULT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS report_builds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL REFERENCES report_groups(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'building',
      content TEXT,
      source_runs TEXT,
      error_message TEXT,
      duration_ms INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_report_builds_report ON report_builds(report_id, id DESC);
    CREATE TABLE IF NOT EXISTS report_metric_points (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id   INTEGER NOT NULL REFERENCES report_groups(id) ON DELETE CASCADE,
      build_id    INTEGER,
      schedule_id INTEGER,
      metric_key  TEXT NOT NULL,
      label       TEXT NOT NULL,
      value_num   REAL,
      value_raw   TEXT NOT NULL,
      unit        TEXT,
      direction   TEXT,
      verdict     TEXT,
      created_at  TEXT NOT NULL,
      source      TEXT NOT NULL DEFAULT 'synthesis'
    );
    CREATE INDEX IF NOT EXISTS idx_metric_points_series ON report_metric_points(report_id, metric_key, created_at);
    CREATE INDEX IF NOT EXISTS idx_metric_points_build ON report_metric_points(build_id);
  `);
  const mpCols = new Set(db.prepare(`PRAGMA table_info(report_metric_points)`).all().map(c => c.name));
  if (!mpCols.has('source')) {
    db.exec(`ALTER TABLE report_metric_points ADD COLUMN source TEXT NOT NULL DEFAULT 'synthesis'`);
  }
}

// ---------- slug ----------

export function uniqueSlug(db, name) {
  const base = String(name || 'report').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'report';
  let slug = base;
  for (let i = 2; db.prepare('SELECT 1 FROM report_groups WHERE slug = ?').get(slug); i++) {
    slug = `${base}-${i}`;
  }
  return slug;
}

// ---------- filings (synthesis inputs) ----------

const SUMMARY_CAP = 2000;
const OUTPUT_CAP = 3000;
const FILING_CAP = 6000;

function stripNdjsonLines(text) {
  return String(text || '').split('\n').filter(l => !/^\s*\{"type"\s*:/.test(l)).join('\n');
}

const TRUNC_MARK = ' …[truncated]';
function clip(text, n) {
  const t = String(text || '');
  return t.length > n ? t.slice(0, Math.max(0, n - TRUNC_MARK.length)) + TRUNC_MARK : t;
}

export function collectFilings(db, group) {
  const ids = JSON.parse(group.schedule_ids || '[]');
  return ids.map((sid) => {
    const sched = db.prepare('SELECT id, name, agent_ids FROM schedules WHERE id = ?').get(sid);
    if (!sched) return { schedule_id: sid, missing: true, name: `schedule #${sid}`, note: 'schedule no longer exists' };

    const agentIds = JSON.parse(sched.agent_ids || '[]');
    const ph = agentIds.map(() => '?').join(',') || 'NULL';
    const agents = agentIds.length
      ? db.prepare(`SELECT name FROM agents WHERE id IN (${ph})`).all(...agentIds).map(a => a.name)
      : [];

    const run = db.prepare(`
      SELECT id, verdict, summary, per_agent_output, finished_at, created_at
      FROM runs WHERE schedule_id = ? AND status = 'success'
      ORDER BY created_at DESC, id DESC LIMIT 1
    `).get(sid);

    if (!run) {
      return { schedule_id: sid, name: sched.name, agents, run_id: null, verdict: null, note: 'no successful run yet' };
    }

    let outputs = null;
    if (run.per_agent_output) {
      try {
        const parsed = JSON.parse(run.per_agent_output);
        outputs = {};
        let budget = FILING_CAP;
        for (const [k, v] of Object.entries(parsed)) {
          const cleaned = clip(stripNdjsonLines(v), Math.min(OUTPUT_CAP, Math.max(0, budget)));
          outputs[k] = cleaned;
          budget -= cleaned.length;
        }
      } catch { outputs = null; }
    }

    return {
      schedule_id: sid,
      name: sched.name,
      agents,
      run_id: run.id,
      verdict: run.verdict || null,
      finished_at: run.finished_at,
      summary: clip(stripNdjsonLines(run.summary), SUMMARY_CAP),
      outputs,
    };
  });
}

// ---------- synthesis prompt ----------

function ageOf(iso) {
  if (!iso) return 'unknown age';
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso + (iso.endsWith('Z') ? '' : 'Z')).getTime()) / 60000));
  if (mins < 90) return `${mins}m ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

export function buildPrompt(group, filings) {
  const parts = [];
  parts.push(`You are facilitating the joint operations briefing "${group.name}" for a homelab. Each member team has filed its latest report below. Synthesize them into ONE combined briefing.`);
  parts.push(`\nRespond with ONLY a single JSON object — no markdown fences, no commentary, no tool use. Schema:
{
  "headline": "<one sentence, the state of the world>",
  "overall_verdict": "ok|attention|critical",
  "executive_summary": "<2-4 sentences for a busy operator>",
  "sections": [{ "schedule_id": <int, from the filing header>, "title": "<short>", "verdict": "ok|attention|critical",
                 "summary": "<2-3 sentences>", "findings": ["<specific finding>", "... max 6"],
                 "metrics": [{"label": "<short>", "value": "<short>"}] }],
  "cross_cutting": ["<insight that spans 2+ filings, omit if none>"],
  "action_items": [{"title": "<imperative>", "priority": "high|medium|low", "owner": "<agent name>"}]
}
Rules: one section per filing, keyed by its schedule_id. Metrics must be copied from filings verbatim — never invented. overall_verdict = worst section verdict. A filing with no data gets verdict from what IS known (absence of data is attention-worthy, not critical). action_items: max 5, deduplicated across filings, only genuinely actionable items.`);
  for (const f of filings) {
    if (f.missing) { parts.push(`\n=== FILING schedule_id=${f.schedule_id}: ${f.name} ===\n(${f.note})`); continue; }
    const head = `\n=== FILING schedule_id=${f.schedule_id}: ${f.name} (agents: ${f.agents.join(', ') || 'n/a'}; verdict: ${f.verdict || 'none'}; ${f.run_id ? `run #${f.run_id}, ${ageOf(f.finished_at)}` : 'NO DATA'}) ===`;
    if (!f.run_id) { parts.push(`${head}\n(${f.note})`); continue; }
    parts.push(`${head}\nSummary: ${f.summary}`);
    if (f.outputs) {
      for (const [agent, out] of Object.entries(f.outputs)) {
        if (out && out.trim()) parts.push(`--- ${agent}'s report ---\n${out}`);
      }
    }
  }
  return parts.join('\n');
}

// ---------- report JSON extraction / validation ----------

function coerceVerdict(v) {
  const c = String(v || '').toLowerCase().replace(/[^a-z]/g, '');
  return VERDICTS.includes(c) ? c : null;
}

function worstOf(verdicts) {
  let worst = null;
  for (const v of verdicts) {
    if (v && (!worst || (VERDICT_RANK[v] || 0) > (VERDICT_RANK[worst] || 0))) worst = v;
  }
  return worst;
}

function str(v, cap) { return clip(typeof v === 'string' ? v : v == null ? '' : String(v), cap); }

export function extractReportJson(text, filings) {
  let t = String(text || '').replace(/```[a-zA-Z]*\n?/g, '');
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('no JSON object in synthesis output');
  let doc;
  try { doc = JSON.parse(t.slice(a, b + 1)); } catch (e) { throw new Error(`synthesis JSON parse failed: ${e.message}`); }
  if (!doc || typeof doc !== 'object') throw new Error('synthesis output is not an object');

  const known = new Set(filings.map(f => Number(f.schedule_id)));
  const sections = (Array.isArray(doc.sections) ? doc.sections : [])
    .filter(s => s && known.has(Number(s.schedule_id)))
    .slice(0, filings.length)
    .map(s => ({
      schedule_id: Number(s.schedule_id),
      title: str(s.title, 80) || 'Untitled',
      verdict: coerceVerdict(s.verdict),
      summary: str(s.summary, 1000),
      findings: (Array.isArray(s.findings) ? s.findings : []).slice(0, 6).map(f => str(f, 300)).filter(Boolean),
      metrics: (Array.isArray(s.metrics) ? s.metrics : []).slice(0, 8)
        .map(m => ({ label: str(m?.label, 80), value: str(m?.value, 80) }))
        .filter(m => m.label && m.value),
    }));
  if (!sections.length) throw new Error('synthesis output has no usable sections');

  const overall = coerceVerdict(doc.overall_verdict) || worstOf(sections.map(s => s.verdict)) || 'attention';
  return {
    headline: str(doc.headline, 200) || str(doc.executive_summary, 140) || 'Combined report',
    overall_verdict: overall,
    executive_summary: str(doc.executive_summary, 1200),
    sections,
    cross_cutting: (Array.isArray(doc.cross_cutting) ? doc.cross_cutting : []).slice(0, 5).map(c => str(c, 300)).filter(Boolean),
    action_items: (Array.isArray(doc.action_items) ? doc.action_items : []).slice(0, 5)
      .filter(i => i && i.title)
      .map(i => ({
        title: str(i.title, 200),
        priority: ['high', 'medium', 'low'].includes(String(i.priority || '').toLowerCase()) ? String(i.priority).toLowerCase() : 'medium',
        owner: str(i.owner, 40),
      })),
  };
}

// ---------- deterministic timeline ----------

export function buildTimeline(db, group, days = 14) {
  const ids = JSON.parse(group.schedule_ids || '[]');
  const dates = [];
  for (let i = days - 1; i >= 0; i--) {
    dates.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
  }
  return ids.map((sid) => {
    const sched = db.prepare('SELECT name FROM schedules WHERE id = ?').get(sid);
    const rows = db.prepare(`
      SELECT id, verdict, status, date(created_at) AS d FROM runs
      WHERE schedule_id = ? AND created_at >= datetime('now', ?)
    `).all(sid, `-${days} days`);
    const byDay = new Map();
    for (const r of rows) {
      const state = r.status === 'success' ? (r.verdict || 'ok') : 'failed';
      const cur = byDay.get(r.d);
      if (!cur || (VERDICT_RANK[state] || 0) > (VERDICT_RANK[cur.state] || 0)) byDay.set(r.d, { state, run_id: r.id });
    }
    return {
      schedule_id: sid,
      name: sched?.name || `schedule #${sid}`,
      days: dates.map(date => ({ date, state: byDay.get(date)?.state ?? null, run_id: byDay.get(date)?.run_id ?? null })),
    };
  });
}

// ---------- build ----------

export function startBuild(db, group, { dispatch = runClaude } = {}) {
  const inflight = db.prepare(`
    SELECT id FROM report_builds
    WHERE report_id = ? AND status = 'building' AND created_at > datetime('now', '-5 minutes')
  `).get(group.id);
  if (inflight) return { skipped: 'building', buildId: inflight.id };

  const buildId = db.prepare(`INSERT INTO report_builds (report_id, status) VALUES (?, 'building')`).run(group.id).lastInsertRowid;
  const started = Date.now();

  const promise = (async () => {
    const errors = [];
    try {
      const filings = collectFilings(db, group);
      const prompt = buildPrompt(group, filings);
      const primary = group.model || 'haiku';
      const attempts = primary === 'sonnet' ? ['sonnet', 'sonnet'] : [primary, 'sonnet'];

      for (const model of attempts) {
        try {
          const res = await dispatch(prompt, { model, maxTurns: 3, tier: 'read_only' });
          if (res.timedOut) throw new Error('synthesis dispatch timed out');
          if (res.exitCode !== 0) throw new Error(`synthesis dispatch exited ${res.exitCode}`);
          const parsed = parseClaudeJson(res.stdout);
          if (parsed.errorSubtype) throw new Error(`synthesis result ${parsed.errorSubtype}`);
          const doc = extractReportJson(parsed.result, filings);

          const sourceRuns = filings.filter(f => f.run_id)
            .map(f => ({ schedule_id: f.schedule_id, run_id: f.run_id, verdict: f.verdict, finished_at: f.finished_at }));
          db.prepare(`
            UPDATE report_builds SET status='success', content=?, source_runs=?, duration_ms=?, error_message=NULL WHERE id=?
          `).run(JSON.stringify(doc), JSON.stringify(sourceRuns), Date.now() - started, buildId);
          db.prepare(`
            DELETE FROM report_builds WHERE report_id = ? AND id NOT IN (
              SELECT id FROM report_builds WHERE report_id = ? ORDER BY id DESC LIMIT ${MAX_BUILDS_KEPT})
          `).run(group.id, group.id);
          db.prepare(`UPDATE report_groups SET updated_at = datetime('now') WHERE id = ?`).run(group.id);

          try {
            const builtAt = db.prepare('SELECT created_at FROM report_builds WHERE id = ?').get(buildId)?.created_at;
            recordMetricPoints(db, group, buildId, doc, builtAt);
          } catch (e) {
            console.error(`[reports] metric extraction failed for build ${buildId}: ${e.message}`);
          }

          try {
            autoPromoteActionItems(db, group, doc, buildId);
          } catch (e) {
            console.error(`[tickets] auto-promote failed for build ${buildId}: ${e.message}`);
          }

          sendDiscordNotify(
            `Report updated: ${group.name} — ${doc.overall_verdict.toUpperCase()}`,
            `${doc.headline}\nView: ${APP_BASE_URL}/reports/${group.slug}`,
            VERDICT_COLOR[doc.overall_verdict] || 3447003,
          ).catch(() => {});
          return { buildId, status: 'success' };
        } catch (err) {
          errors.push(`${model}: ${err.message}`);
        }
      }
      throw new Error(errors.join(' | '));
    } catch (err) {
      db.prepare(`UPDATE report_builds SET status='failed', error_message=?, duration_ms=? WHERE id=?`)
        .run(String(err.message).slice(0, 1000), Date.now() - started, buildId);
      console.error(`[reports] build ${buildId} (${group.slug}) failed: ${err.message}`);
      return { buildId, status: 'failed' };
    }
  })();

  return { buildId, promise };
}

// ---------- event-driven trigger (debounced) ----------

let engine = null;

export function initReportEngine(db, { debounceMs = 90000, buildFn = null } = {}) {
  ensureReportTables(db);
  engine = {
    db,
    debounceMs,
    buildFn: buildFn || ((group) => startBuild(db, group).promise),
    timers: new Map(),
  };
  return engine;
}

// Fire-and-forget: called after a run completes. Debounce per group so a burst
// of member completions produces one rebuild.
export function onRunFinished(scheduleId) {
  if (!engine) return;
  let groups;
  try {
    groups = engine.db.prepare(`SELECT * FROM report_groups WHERE enabled = 1`).all()
      .filter(g => { try { return JSON.parse(g.schedule_ids).includes(scheduleId); } catch { return false; } });
  } catch { return; }
  for (const g of groups) {
    const existing = engine.timers.get(g.id);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      engine.timers.delete(g.id);
      Promise.resolve(engine.buildFn(g)).catch(() => {});
    }, engine.debounceMs);
    if (t.unref) t.unref();
    engine.timers.set(g.id, t);
  }
}

export function _resetEngineForTests() {
  if (engine) for (const t of engine.timers.values()) clearTimeout(t);
  engine = null;
}
