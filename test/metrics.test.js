import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, parseMetricValue, resolveMetric, healthScore, recordMetricPoints, METRIC_RETENTION_DAYS, backfill, queryMetricSeries, resolveByKey, recordCollectorPoints } from '../server/metrics.js';

test('slugify: lowercases and underscores non-alphanumerics', () => {
  assert.equal(slugify('Nodes Ready'), 'nodes_ready');
  assert.equal(slugify('cert-manager Certs Ready'), 'cert_manager_certs_ready');
  assert.equal(slugify('node-1 Free'), 'node_1_free');
});

test('parseMetricValue: ratios become percentages', () => {
  assert.deepEqual(parseMetricValue('3/3'), { value_num: 100, unit: '%' });
  assert.deepEqual(parseMetricValue('34/38'), { value_num: 89.5, unit: '%' });
  assert.deepEqual(parseMetricValue('55-56/56'), { value_num: 98.2, unit: '%' });
  assert.deepEqual(parseMetricValue('0/3'), { value_num: 0, unit: '%' });
});

test('parseMetricValue: percentages, durations, counts, bools', () => {
  assert.deepEqual(parseMetricValue('42% (node-1)'), { value_num: 42, unit: '%' });
  assert.deepEqual(parseMetricValue('14h'), { value_num: 14, unit: 'hours' });
  assert.deepEqual(parseMetricValue('17 days'), { value_num: 17, unit: 'days' });
  assert.deepEqual(parseMetricValue('109'), { value_num: 109, unit: 'count' });
  assert.deepEqual(parseMetricValue('16 (storage/IoT)'), { value_num: 16, unit: 'count' });
  assert.deepEqual(parseMetricValue('3 minor (EOL)'), { value_num: 3, unit: 'count' });
  assert.deepEqual(parseMetricValue('available'), { value_num: 1, unit: 'bool' });
  assert.deepEqual(parseMetricValue('FAILED'), { value_num: 0, unit: 'bool' });
});

test('parseMetricValue: multi-value and free text are unparseable', () => {
  assert.deepEqual(parseMetricValue('54/44/35'), { value_num: null, unit: null });
  assert.deepEqual(parseMetricValue('could not verify'), { value_num: null, unit: null });
  assert.deepEqual(parseMetricValue(''), { value_num: null, unit: null });
});

test('parseMetricValue: ratio with slash-containing parenthetical still parses', () => {
  assert.deepEqual(parseMetricValue('34/38 (storage/IoT)'), { value_num: 89.5, unit: '%' });
});

test('parseMetricValue: zero-denominator ratio is unparseable, not a count', () => {
  assert.deepEqual(parseMetricValue('5/0'), { value_num: null, unit: null });
});

import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { after } from 'node:test';

const dir = mkdtempSync(join(tmpdir(), 'metrics-'));
process.env.DATA_DIR = dir;
const { initDb } = await import('../server/db.js');
const { ensureReportTables } = await import('../server/reports.js');
const db = initDb();
ensureReportTables(db);
after(() => { try { db.close(); } catch {} rmSync(dir, { recursive: true, force: true }); });

test('report_metric_points table exists with expected columns', () => {
  const cols = db.prepare(`PRAGMA table_info(report_metric_points)`).all().map(c => c.name);
  for (const c of ['report_id', 'build_id', 'schedule_id', 'metric_key', 'label', 'value_num', 'value_raw', 'unit', 'direction', 'verdict', 'created_at']) {
    assert.ok(cols.includes(c), `missing column ${c}`);
  }
});

test('resolveMetric: curated per-schedule entries supply key/unit/direction', () => {
  assert.deepEqual(resolveMetric(1, 'Nodes Ready'), { key: 'cluster.nodes_ready', unit: '%', direction: 'up_good' });
  assert.deepEqual(resolveMetric(7, 'Peak Memory'), { key: 'capacity.peak_mem', unit: '%', direction: 'down_good' });
  assert.deepEqual(resolveMetric(2, 'Nearest Cert Expiry'), { key: 'security.nearest_cert_expiry', unit: 'days', direction: 'up_good' });
});

test('resolveMetric: unknown labels fall back to sched-scoped slug, neutral', () => {
  assert.deepEqual(resolveMetric(99, 'Some New Thing'), { key: 'sched99.some_new_thing', unit: null, direction: 'neutral' });
});

test('resolveMetric: GENERIC_METRICS resolves generic infra labels regardless of schedule_id', () => {
  assert.deepEqual(resolveMetric(777, 'CPU Usage'), { key: 'infra.cpu_usage', unit: '%', direction: 'down_good' });
  assert.deepEqual(resolveMetric(888, 'Uptime'), { key: 'infra.uptime', unit: '%', direction: 'up_good' });
  assert.deepEqual(resolveMetric(999, 'Open Incidents'), { key: 'infra.open_incidents', unit: 'count', direction: 'down_good' });
  assert.deepEqual(resolveMetric(123, 'Disk Usage'), { key: 'infra.disk_usage', unit: '%', direction: 'down_good' });
});

test('resolveMetric: per-schedule KNOWN_METRICS still wins over GENERIC_METRICS', () => {
  assert.deepEqual(resolveMetric(1, 'Nodes Ready'), { key: 'cluster.nodes_ready', unit: '%', direction: 'up_good' });
});

test('healthScore: verdict-weighted mean × 100', () => {
  assert.equal(healthScore([{ verdict: 'ok' }, { verdict: 'ok' }]), 100);
  assert.equal(healthScore([{ verdict: 'ok' }, { verdict: 'critical' }]), 50);
  assert.equal(healthScore([{ verdict: 'attention' }]), 50);
  assert.equal(healthScore([{ verdict: null }]), 50); // unknown ≈ attention
  assert.equal(healthScore([]), null);
});

function mkGroupRow(scheduleIds) {
  const id = db.prepare(`INSERT INTO report_groups (name, slug, schedule_ids) VALUES ('G', 'g-' || abs(random()), ?)`)
    .run(JSON.stringify(scheduleIds)).lastInsertRowid;
  return db.prepare('SELECT * FROM report_groups WHERE id = ?').get(id);
}

test('recordMetricPoints: writes one row per metric plus report.health_score', () => {
  const g = mkGroupRow([1]);
  const doc = {
    overall_verdict: 'ok',
    sections: [{ schedule_id: 1, verdict: 'ok', metrics: [
      { label: 'Nodes Ready', value: '3/3' },
      { label: 'Pod Distribution', value: '54/44/35' }, // unparseable -> value_num null, still stored
    ] }],
  };
  recordMetricPoints(db, g, 1, doc, '2026-06-14 07:00:00');
  const rows = db.prepare('SELECT * FROM report_metric_points WHERE report_id = ? ORDER BY metric_key').all(g.id);
  assert.equal(rows.length, 3); // 2 metrics + health_score
  const nodes = rows.find(r => r.metric_key === 'cluster.nodes_ready');
  assert.equal(nodes.value_num, 100);
  assert.equal(nodes.unit, '%');
  assert.equal(nodes.direction, 'up_good');
  assert.equal(nodes.value_raw, '3/3');
  const dist = rows.find(r => r.metric_key.endsWith('pod_distribution'));
  assert.equal(dist.value_num, null);
  assert.equal(dist.value_raw, '54/44/35');
  const hs = rows.find(r => r.metric_key === 'report.health_score');
  assert.equal(hs.value_num, 100);
  assert.equal(hs.schedule_id, null);
});

test('recordMetricPoints: prunes points older than retention', () => {
  const g = mkGroupRow([1]);
  const doc = { overall_verdict: 'ok', sections: [{ schedule_id: 1, verdict: 'ok', metrics: [{ label: 'Nodes Ready', value: '3/3' }] }] };
  db.prepare(`INSERT INTO report_metric_points (report_id, build_id, schedule_id, metric_key, label, value_num, value_raw, unit, direction, created_at)
              VALUES (?, 1, 1, 'cluster.nodes_ready', 'Nodes Ready', 100, '3/3', '%', 'up_good', datetime('now','-400 days'))`).run(g.id);
  recordMetricPoints(db, g, 2, doc, '2026-06-14 07:00:00');
  const old = db.prepare(`SELECT COUNT(*) c FROM report_metric_points WHERE report_id = ? AND created_at < datetime('now', '-200 days')`).get(g.id);
  assert.equal(old.c, 0);
  assert.ok(METRIC_RETENTION_DAYS >= 1);
});

test('backfill: extracts points from retained builds, idempotent', () => {
  const g = mkGroupRow([1]);
  const content = JSON.stringify({ overall_verdict: 'ok', sections: [{ schedule_id: 1, verdict: 'ok', metrics: [{ label: 'Nodes Ready', value: '3/3' }] }] });
  db.prepare(`INSERT INTO report_builds (report_id, status, content, created_at) VALUES (?, 'success', ?, '2026-06-10 07:00:00')`).run(g.id, content);
  db.prepare(`INSERT INTO report_builds (report_id, status, content, created_at) VALUES (?, 'success', ?, '2026-06-11 07:00:00')`).run(g.id, content);

  const r1 = backfill(db, g);
  assert.equal(r1.backfilled, 2);
  const after1 = db.prepare('SELECT COUNT(*) c FROM report_metric_points WHERE report_id = ?').get(g.id).c;

  const r2 = backfill(db, g); // second call must no-op (points already exist)
  assert.equal(r2.skipped, true);
  const after2 = db.prepare('SELECT COUNT(*) c FROM report_metric_points WHERE report_id = ?').get(g.id).c;
  assert.equal(after1, after2);
});

test('queryMetricSeries: groups by key, computes latest/previous/delta, splits health', () => {
  const g = mkGroupRow([7]);
  const mk = (val, ts) => recordMetricPoints(db, g, 1,
    { overall_verdict: 'ok', sections: [{ schedule_id: 7, verdict: 'ok', metrics: [{ label: 'Peak Memory', value: val }] }] }, ts);
  mk('40%', '2026-06-12 07:00:00');
  mk('46%', '2026-06-13 07:00:00');

  const out = queryMetricSeries(db, g, 90);
  assert.ok(Array.isArray(out.health));
  assert.ok(out.health.length >= 2);            // a health_score point per record call
  const mem = out.metrics.find(m => m.key === 'capacity.peak_mem');
  assert.equal(mem.latest, 46);
  assert.equal(mem.previous, 40);
  assert.equal(mem.delta, 6);
  assert.equal(mem.direction, 'down_good');
  assert.equal(mem.points.length, 2);
});

test('startBuild success writes metric points via the hook', async () => {
  const { startBuild } = await import('../server/reports.js');
  const sid = db.prepare(`INSERT INTO schedules (name, description, agent_ids, mode, task_prompt, cron_expression, recurring, allow_writes, status)
    VALUES ('M', '', '[]', 'parallel', 'x', '0 0 1 1 *', 1, 0, 'active')`).run().lastInsertRowid;
  db.prepare(`INSERT INTO runs (schedule_id, agent_ids, mode, task_prompt, status, summary, verdict, finished_at)
    VALUES (?, '[]', 'parallel', 'x', 'success', 's', 'ok', datetime('now'))`).run(sid);
  const g = mkGroupRow([sid]);
  const doc = { headline: 'h', overall_verdict: 'ok', executive_summary: 'e',
    sections: [{ schedule_id: sid, title: 'M', verdict: 'ok', summary: 's', findings: [], metrics: [{ label: 'Nodes Ready', value: '3/3' }] }],
    cross_cutting: [], action_items: [] };
  const dispatch = async () => ({ stdout: JSON.stringify({ type: 'result', subtype: 'success', result: JSON.stringify(doc) }), stderr: '', exitCode: 0, timedOut: false });
  const { promise } = startBuild(db, g, { dispatch });
  await promise;
  const pts = db.prepare(`SELECT COUNT(*) c FROM report_metric_points WHERE report_id = ?`).get(g.id).c;
  assert.ok(pts >= 2, 'expected metric + health_score points');
});

test('report_metric_points has a source column defaulting to synthesis', () => {
  const cols = db.prepare(`PRAGMA table_info(report_metric_points)`).all();
  const src = cols.find(c => c.name === 'source');
  assert.ok(src, 'source column exists');
  assert.equal(src.dflt_value?.replace(/'/g, ''), 'synthesis');
});

test('resolveByKey: reverse-resolves unit/direction from a metric key', () => {
  assert.deepEqual(resolveByKey('infra.cpu_usage'), { unit: '%', direction: 'down_good' });    // GENERIC_METRICS
  assert.deepEqual(resolveByKey('cluster.nodes_ready'), { unit: '%', direction: 'up_good' });   // KNOWN_METRICS
  assert.deepEqual(resolveByKey('infra.disk_usage'), { unit: '%', direction: 'down_good' });
  assert.deepEqual(resolveByKey('totally.unknown'), { unit: null, direction: 'neutral' });
});

test('recordCollectorPoints: inserts source=collector with resolved unit/direction', () => {
  const g = mkGroupRow([52]);
  const out = recordCollectorPoints(db, g, [
    { key: 'infra.disk_usage', value: '80%', schedule_id: 52 },
    { key: 'infra.uptime', value: '7/7', schedule_id: 52 },
    { key: 'bogus' }, // no value -> skipped, no crash
  ], '2026-06-15 10:00:00');
  assert.ok(out.inserted >= 2);
  const fp = db.prepare(`SELECT * FROM report_metric_points WHERE report_id=? AND metric_key='infra.disk_usage'`).get(g.id);
  assert.equal(fp.source, 'collector');
  assert.equal(fp.value_num, 80);
  assert.equal(fp.unit, '%');
  assert.equal(fp.direction, 'down_good');
  assert.equal(fp.value_raw, '80%');
  assert.equal(fp.schedule_id, 52);
  assert.equal(fp.created_at, '2026-06-15 10:00:00');
});

test('queryMetricSeries: collector points win over synthesis for the same key', () => {
  const g = mkGroupRow([52]);
  recordMetricPoints(db, g, 1, { overall_verdict: 'ok', sections: [
    { schedule_id: 52, verdict: 'ok', metrics: [{ label: 'Disk Usage', value: '70%' }] }]}, '2026-06-15 08:00:00');
  recordCollectorPoints(db, g, [
    { key: 'infra.disk_usage', value: '79%', schedule_id: 52 },
    { key: 'infra.disk_usage', value: '80%', schedule_id: 52 },
  ], '2026-06-15 10:00:00');
  const out = queryMetricSeries(db, g, 90);
  const fp = out.metrics.find(m => m.key === 'infra.disk_usage');
  assert.equal(fp.source, 'collector');
  assert.ok(fp.points.every(p => p.raw !== '70%'), 'synthesis point dropped for a collector-covered key');
  assert.equal(fp.latest, 80);
});

test('queryMetricSeries: collector-less keys still return synthesis', () => {
  const g = mkGroupRow([7]);
  recordMetricPoints(db, g, 1, { overall_verdict: 'ok', sections: [
    { schedule_id: 7, verdict: 'ok', metrics: [{ label: 'OOMKills', value: '0' }] }]}, '2026-06-15 08:00:00');
  const out = queryMetricSeries(db, g, 90);
  const k = out.metrics.find(m => m.key === 'capacity.oomkills');
  assert.equal(k.source, 'synthesis');
});

test('queryMetricSeries: collector-covered series groups under the collector schedule_id', () => {
  const g = mkGroupRow([52, 54]);
  // older synthesis row attributes the metric to section 54
  recordMetricPoints(db, g, 1, { overall_verdict: 'ok', sections: [
    { schedule_id: 54, verdict: 'ok', metrics: [{ label: 'Endpoints Up', value: '9/9' }] }]}, '2026-06-15 08:00:00');
  // collector attributes it to 52 (authoritative, newer)
  recordCollectorPoints(db, g, [{ key: 'infra.endpoints_up', value: '12/12', schedule_id: 52 }], '2026-06-15 10:00:00');
  const s = queryMetricSeries(db, g, 90).metrics.find(m => m.key === 'infra.endpoints_up');
  assert.equal(s.source, 'collector');
  assert.equal(s.schedule_id, 52);
});
