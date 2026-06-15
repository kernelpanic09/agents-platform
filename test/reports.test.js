import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const dir = mkdtempSync(join(tmpdir(), 'reports-'));
process.env.DATA_DIR = dir;

const { initDb } = await import('../server/db.js');
const { initSettings } = await import('../server/settings.js');
const { resultText } = await import('../server/executor.js');
const {
  ensureReportTables, uniqueSlug, collectFilings, extractReportJson,
  buildTimeline, startBuild, initReportEngine, onRunFinished, _resetEngineForTests,
} = await import('../server/reports.js');

const db = initDb();
initSettings(db);
ensureReportTables(db);
after(() => { try { db.close(); } catch {} rmSync(dir, { recursive: true, force: true }); });

// ---------- fixtures ----------

function mkAgent(name) {
  return db.prepare(`INSERT INTO agents (name, title, tagline, color, icon_id) VALUES (?, 'T', 't', '#fff', 'x')`).run(name).lastInsertRowid;
}
function mkSchedule(name, agentIds) {
  return db.prepare(`
    INSERT INTO schedules (name, description, agent_ids, mode, task_prompt, cron_expression, recurring, allow_writes, status)
    VALUES (?, '', ?, 'parallel', 'check stuff', '0 0 1 1 *', 1, 0, 'active')
  `).run(name, JSON.stringify(agentIds)).lastInsertRowid;
}
function mkRun(scheduleId, { status = 'success', verdict = 'ok', summary = 's', perAgent = null, createdAt = null } = {}) {
  const id = db.prepare(`
    INSERT INTO runs (schedule_id, agent_ids, mode, task_prompt, status, summary, verdict, per_agent_output, finished_at)
    VALUES (?, '[]', 'parallel', 'x', ?, ?, ?, ?, datetime('now'))
  `).run(scheduleId, status, summary, verdict, perAgent ? JSON.stringify(perAgent) : null).lastInsertRowid;
  if (createdAt) db.prepare('UPDATE runs SET created_at = ? WHERE id = ?').run(createdAt, id);
  return id;
}
function mkGroup(name, scheduleIds, { enabled = 1 } = {}) {
  const slug = uniqueSlug(db, name);
  return db.prepare(`INSERT INTO report_groups (name, slug, schedule_ids, enabled) VALUES (?, ?, ?, ?)`)
    .run(name, slug, JSON.stringify(scheduleIds), enabled).lastInsertRowid;
}
const a1 = mkAgent('T-Bastion');
const a2 = mkAgent('T-Mirror');

// ---------- slug ----------

test('uniqueSlug: kebab-cases and uniquifies', () => {
  const s1 = uniqueSlug(db, 'Homelab Daily Brief!');
  assert.equal(s1, 'homelab-daily-brief');
  db.prepare(`INSERT INTO report_groups (name, slug, schedule_ids) VALUES ('x', ?, '[]')`).run(s1);
  const s2 = uniqueSlug(db, 'Homelab  Daily   Brief');
  assert.equal(s2, 'homelab-daily-brief-2');
});

// ---------- extractReportJson ----------

const GOOD = {
  headline: 'All good',
  overall_verdict: 'ok',
  executive_summary: 'Everything is fine.',
  sections: [{ schedule_id: 1, title: 'Backups', verdict: 'ok', summary: 'fresh', findings: ['a'], metrics: [{ label: 'vols', value: '35/38' }] }],
  cross_cutting: ['x'],
  action_items: [{ title: 'do it', priority: 'high', owner: 'Bastion' }],
};
const FILINGS = [{ schedule_id: 1, name: 'Backups' }, { schedule_id: 2, name: 'Capacity' }];

test('extractReportJson: parses clean JSON', () => {
  const doc = extractReportJson(JSON.stringify(GOOD), FILINGS);
  assert.equal(doc.headline, 'All good');
  assert.equal(doc.sections.length, 1);
});

test('extractReportJson: strips markdown fences and surrounding prose', () => {
  const doc = extractReportJson('Here you go:\n```json\n' + JSON.stringify(GOOD) + '\n```\nDone!', FILINGS);
  assert.equal(doc.overall_verdict, 'ok');
});

test('extractReportJson: coerces bad verdicts, derives overall from sections', () => {
  const bad = { ...GOOD, overall_verdict: 'AMAZING', sections: [
    { schedule_id: 1, title: 'A', verdict: 'CRITICAL!!', summary: 's' },
    { schedule_id: 2, title: 'B', verdict: 'ok', summary: 's' },
  ] };
  const doc = extractReportJson(JSON.stringify(bad), FILINGS);
  assert.equal(doc.sections[0].verdict, 'critical');
  assert.equal(doc.overall_verdict, 'critical'); // worst of sections
});

test('extractReportJson: caps arrays and drops unknown-schedule sections', () => {
  const big = { ...GOOD, sections: [
    { schedule_id: 1, title: 'A', verdict: 'ok', summary: 's', findings: Array(20).fill('f'), metrics: Array(9).fill({ label: 'l', value: 'v' }) },
    { schedule_id: 99, title: 'ghost', verdict: 'ok', summary: 's' },
  ], action_items: Array(12).fill({ title: 't', priority: 'wat' }) };
  const doc = extractReportJson(JSON.stringify(big), FILINGS);
  assert.equal(doc.sections.length, 1);
  assert.ok(doc.sections[0].findings.length <= 6);
  assert.ok(doc.sections[0].metrics.length <= 8);
  assert.ok(doc.action_items.length <= 5);
  assert.equal(doc.action_items[0].priority, 'medium'); // coerced
});

test('extractReportJson: throws on garbage', () => {
  assert.throws(() => extractReportJson('no json here at all', FILINGS));
  assert.throws(() => extractReportJson(JSON.stringify({ headline: 'x', sections: [] }), FILINGS));
});

// ---------- collectFilings ----------

test('collectFilings: picks latest successful run, strips NDJSON, truncates, notes missing', () => {
  const s1 = mkSchedule('Backups', [a1, a2]);
  const s2 = mkSchedule('Never Ran', [a1]);
  mkRun(s1, { verdict: 'attention', summary: 'old', createdAt: '2026-06-01 00:00:00' });
  const big = 'X'.repeat(5000);
  mkRun(s1, { verdict: 'ok', summary: 'fresh one\n{"type":"result","noise":1}\nend', perAgent: { 'T-Bastion': big } });
  mkRun(s1, { status: 'failed', verdict: null, summary: 'broken', createdAt: '2026-06-20 00:00:00' }); // failed: ignored even if newer

  const group = { schedule_ids: JSON.stringify([s1, s2, 4242]) };
  const filings = collectFilings(db, group);
  assert.equal(filings.length, 3);
  const f1 = filings[0];
  assert.equal(f1.verdict, 'ok');
  assert.ok(f1.summary.includes('fresh one'));
  assert.ok(!f1.summary.includes('"type"'), 'NDJSON lines stripped');
  assert.ok(f1.outputs['T-Bastion'].length <= 3000, 'outputs truncated');
  assert.ok(f1.agents.includes('T-Bastion'));
  assert.equal(filings[1].run_id, null);
  assert.match(filings[1].note, /no successful run/i);
  assert.equal(filings[2].missing, true);
});

// ---------- timeline ----------

test('buildTimeline: worst verdict per day, failed days marked, gaps null', () => {
  const s = mkSchedule('TL', [a1]);
  const today = new Date().toISOString().slice(0, 10);
  mkRun(s, { verdict: 'ok' });
  mkRun(s, { verdict: 'critical' });
  mkRun(s, { status: 'failed', verdict: null });
  const tl = buildTimeline(db, { schedule_ids: JSON.stringify([s]) }, 14);
  assert.equal(tl.length, 1);
  assert.equal(tl[0].days.length, 14);
  const todayCell = tl[0].days.find(d => d.date === today);
  assert.equal(todayCell.state, 'critical'); // worst of the day beats ok and failed
  assert.equal(tl[0].days[0].state, null);   // 13 days ago: no runs
});

// ---------- build guard + happy path ----------

function dispatchReturning(doc) {
  return async () => ({
    stdout: JSON.stringify({ type: 'result', subtype: 'success', result: JSON.stringify(doc) }),
    stderr: '', exitCode: 0, timedOut: false,
  });
}

test('startBuild: happy path stores content + provenance; guard blocks concurrent build', async () => {
  const s = mkSchedule('Solo', [a1]);
  mkRun(s, { verdict: 'ok', summary: 'all fine' });
  const gid = mkGroup('Build Test', [s]);
  const group = db.prepare('SELECT * FROM report_groups WHERE id = ?').get(gid);

  const doc = { ...GOOD, sections: [{ schedule_id: s, title: 'Solo', verdict: 'ok', summary: 'fine' }] };
  const { buildId, promise } = startBuild(db, group, { dispatch: dispatchReturning(doc) });
  assert.ok(buildId);
  const guard = startBuild(db, group, { dispatch: dispatchReturning(doc) });
  assert.equal(guard.skipped, 'building');
  await promise;
  const row = db.prepare('SELECT * FROM report_builds WHERE id = ?').get(buildId);
  assert.equal(row.status, 'success');
  const content = JSON.parse(row.content);
  assert.equal(content.sections[0].schedule_id, s);
  const prov = JSON.parse(row.source_runs);
  assert.equal(prov.length, 1);
  assert.equal(prov[0].schedule_id, s);
});

test('startBuild: marks failed when all attempts unparseable', async () => {
  const s = mkSchedule('Fail Case', [a1]);
  mkRun(s, {});
  const gid = mkGroup('Fail Test', [s]);
  const group = db.prepare('SELECT * FROM report_groups WHERE id = ?').get(gid);
  const badDispatch = async () => ({ stdout: JSON.stringify({ type: 'result', subtype: 'success', result: 'not json' }), stderr: '', exitCode: 0, timedOut: false });
  const { buildId, promise } = startBuild(db, group, { dispatch: badDispatch });
  await promise;
  const row = db.prepare('SELECT * FROM report_builds WHERE id = ?').get(buildId);
  assert.equal(row.status, 'failed');
  assert.ok(row.error_message);
});

// ---------- debounce engine ----------

test('engine: burst of member completions triggers exactly one debounced build', async () => {
  _resetEngineForTests();
  const s1 = mkSchedule('Member', [a1]);
  const s2 = mkSchedule('NonMember', [a1]);
  const gid = mkGroup('Debounce', [s1]);
  const calls = [];
  initReportEngine(db, { debounceMs: 40, buildFn: (g) => { calls.push(g.id); } });
  onRunFinished(s1); onRunFinished(s1); onRunFinished(s1);
  onRunFinished(s2); // not a member of any group → no build
  await new Promise(r => setTimeout(r, 150));
  assert.deepEqual(calls, [gid]);
});

test('engine: disabled groups are not rebuilt', async () => {
  _resetEngineForTests();
  const s = mkSchedule('DisabledMember', [a1]);
  mkGroup('Disabled Group', [s], { enabled: 0 });
  const calls = [];
  initReportEngine(db, { debounceMs: 30, buildFn: (g) => calls.push(g.id) });
  onRunFinished(s);
  await new Promise(r => setTimeout(r, 100));
  assert.equal(calls.length, 0);
});

// ---------- empty-result fallback regression (run #351) ----------

test('resultText: stream-parsed empty result falls back to empty string, never raw NDJSON', () => {
  assert.equal(resultText({ result: '', steps: [] }, '{"type":"result"}\n{"type":"x"}'), '');
  assert.equal(resultText({ result: 'text', steps: [] }, 'raw'), 'text');
  // legacy single-JSON format (no steps): raw stdout fallback preserved
  assert.equal(resultText({ result: '' }, 'plain legacy output'), 'plain legacy output');
});
