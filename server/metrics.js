// Metric time-series engine for Combined Reports. Pure + unit-tested. Normalizes the
// metric strings agents already emit into numeric points, stores them per build, and
// serves grouped series. No LLM, no new tokens. See spec 2026-06-14-...-metrics-trends.

export function slugify(label) {
  return String(label || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

// "3/3" -> 100% ; "42%" -> 42% ; "14h" -> 14 hours ; "17 days" -> 17 days ;
// "109"/"16 (storage/IoT)" -> count ; "available"/"FAILED" -> bool 1/0 ;
// "54/44/35" / free text -> unparseable (null).
export function parseMetricValue(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return { value_num: null, unit: null };
  // Multi-part numeric ratio like "54/44/35" (a distribution, not a single ratio) is
  // unparseable. Anchored to the numeric prefix so a parenthetical containing a slash,
  // e.g. "34/38 (storage/IoT)", is NOT misclassified.
  if (/^\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?){2,}/.test(s)) return { value_num: null, unit: null };
  const low = s.toLowerCase();
  if (/^(available|true|ok|ready|online|healthy|pass|passing|up|yes)\b/.test(low)) return { value_num: 1, unit: 'bool' };
  if (/^(unavailable|false|failed|fail|down|offline|degraded|no)\b/.test(low)) return { value_num: 0, unit: 'bool' };
  const ratio = s.match(/^(\d+(?:\.\d+)?)(?:\s*-\s*\d+(?:\.\d+)?)?\s*\/\s*(\d+(?:\.\d+)?)/);
  if (ratio) {
    const a = parseFloat(ratio[1]), b = parseFloat(ratio[2]);
    if (b > 0) return { value_num: Math.round((a / b) * 1000) / 10, unit: '%' };
    return { value_num: null, unit: null }; // zero denominator: a ratio, but undefined — don't mislabel as count
  }
  const pct = s.match(/(-?\d+(?:\.\d+)?)\s*%/);
  if (pct) return { value_num: parseFloat(pct[1]), unit: '%' };
  const dur = s.match(/^(\d+(?:\.\d+)?)\s*(d|day|days|h|hr|hrs|hour|hours)\b/i);
  if (dur) return { value_num: parseFloat(dur[1]), unit: /^d/i.test(dur[2]) ? 'days' : 'hours' };
  const num = s.match(/^(-?\d+(?:\.\d+)?)/);
  if (num) return { value_num: parseFloat(num[1]), unit: 'count' };
  return { value_num: null, unit: null };
}

// Curated normalization map: scheduleId -> slug(label) -> {key, unit, direction}.
// This is the app-side "standardize the data" layer — no agent changes. Unknown
// labels fall back to a sched-scoped slug with neutral direction.
// Keyed by the demo schedule IDs seeded in db.js (1..10). Clean, generic infra
// metrics so the Trends charts read well out of the box. Unknown labels fall back
// to GENERIC_METRICS, then to a sched-scoped slug with neutral direction.
export const KNOWN_METRICS = {
  1: { // Nightly Infrastructure Audit
    nodes_ready:       { key: 'cluster.nodes_ready',     unit: '%',     direction: 'up_good' },
    pods_running:      { key: 'cluster.pods_running',    unit: 'count', direction: 'neutral' },
    volumes_healthy:   { key: 'cluster.volumes_healthy', unit: '%',     direction: 'up_good' },
    pvcs_bound:        { key: 'cluster.pvcs_bound',      unit: '%',     direction: 'up_good' },
  },
  2: { // Security & Compliance Sweep
    certs_valid:         { key: 'security.certs_valid',         unit: '%',     direction: 'up_good' },
    nearest_cert_expiry: { key: 'security.nearest_cert_expiry', unit: 'days',  direction: 'up_good' },
    privileged_pods:     { key: 'security.privileged_pods',     unit: 'count', direction: 'down_good' },
    exposed_secrets:     { key: 'security.exposed_secrets',     unit: 'count', direction: 'down_good' },
  },
  6: { // Backup Restore Verification Drill
    volumes_backed_up: { key: 'backup.volumes_backed_up', unit: '%',     direction: 'up_good' },
    newest_backup_age: { key: 'backup.newest_age',        unit: 'hours', direction: 'down_good' },
    restore_check:     { key: 'backup.restore_check',     unit: 'bool',  direction: 'up_good' },
  },
  7: { // Expiry & Capacity Forecast
    peak_memory:          { key: 'capacity.peak_mem',             unit: '%',     direction: 'down_good' },
    peak_cpu:             { key: 'capacity.peak_cpu',             unit: '%',     direction: 'down_good' },
    oomkills:             { key: 'capacity.oomkills',             unit: 'count', direction: 'down_good' },
    nodes_under_pressure: { key: 'capacity.nodes_under_pressure', unit: '%',     direction: 'down_good' },
  },
};

// Schedule-agnostic generic infra labels. Keyed by slug(label); consulted when a metric
// isn't in the per-schedule KNOWN_METRICS map (e.g. ad-hoc report groups). Plain
// infrastructure signals only — no environment-specific service names.
export const GENERIC_METRICS = {
  cpu_usage:        { key: 'infra.cpu_usage',        unit: '%',     direction: 'down_good' },
  memory_usage:     { key: 'infra.memory_usage',     unit: '%',     direction: 'down_good' },
  disk_usage:       { key: 'infra.disk_usage',       unit: '%',     direction: 'down_good' },
  uptime:           { key: 'infra.uptime',           unit: '%',     direction: 'up_good' },
  services_healthy: { key: 'infra.services_healthy', unit: '%',     direction: 'up_good' },
  error_rate:       { key: 'infra.error_rate',       unit: '%',     direction: 'down_good' },
  open_incidents:   { key: 'infra.open_incidents',   unit: 'count', direction: 'down_good' },
  endpoints_up:     { key: 'infra.endpoints_up',     unit: '%',     direction: 'up_good' },
};

export function resolveMetric(scheduleId, label) {
  const slug = slugify(label);
  const known = KNOWN_METRICS[scheduleId]?.[slug];
  if (known) return { ...known };
  if (GENERIC_METRICS[slug]) return { ...GENERIC_METRICS[slug] };
  return { key: `sched${scheduleId}.${slug}`, unit: null, direction: 'neutral' };
}

const VERDICT_WEIGHT = { ok: 1, attention: 0.5, critical: 0 };

export function healthScore(sections) {
  if (!sections || !sections.length) return null;
  const sum = sections.reduce((a, s) => a + (s.verdict in VERDICT_WEIGHT ? VERDICT_WEIGHT[s.verdict] : 0.5), 0);
  return Math.round((sum / sections.length) * 100);
}

export const METRIC_RETENTION_DAYS = Number(process.env.METRIC_RETENTION_DAYS || 180);

// One-time per report: if no points exist yet, extract from retained successful builds
// so the charts aren't empty on day one. Idempotent.
export function backfill(db, group) {
  const existing = db.prepare('SELECT 1 FROM report_metric_points WHERE report_id = ? LIMIT 1').get(group.id);
  if (existing) return { skipped: true };
  const builds = db.prepare(`SELECT id, content, created_at FROM report_builds
    WHERE report_id = ? AND status = 'success' ORDER BY id ASC`).all(group.id);
  let n = 0;
  for (const b of builds) {
    let doc;
    try { doc = JSON.parse(b.content); } catch { continue; }
    if (!doc || !Array.isArray(doc.sections)) continue;
    recordMetricPoints(db, group, b.id, doc, b.created_at);
    n++;
  }
  return { backfilled: n };
}

// Returns { health:[{t,v,verdict}], metrics:[{key,label,schedule_id,unit,direction,
// latest,previous,delta,points:[{t,v,raw,verdict}]}] }. Timeline is composed by the
// route (it owns buildTimeline) so this module stays free of reports.js (no cycle).
export function queryMetricSeries(db, group, days = 90) {
  const since = `-${Math.max(1, days)} days`;
  const rows = db.prepare(`SELECT schedule_id, metric_key, label, value_num, value_raw, unit, direction, verdict, created_at, source
    FROM report_metric_points WHERE report_id = ? AND created_at >= datetime('now', ?)
    ORDER BY metric_key, created_at ASC`).all(group.id, since);

  const byKey = new Map();
  const health = [];
  for (const r of rows) {
    if (r.metric_key === 'report.health_score') {
      health.push({ t: r.created_at, v: r.value_num, verdict: r.verdict });
      continue;
    }
    if (!byKey.has(r.metric_key)) {
      byKey.set(r.metric_key, { key: r.metric_key, label: r.label, schedule_id: r.schedule_id, unit: r.unit, direction: r.direction, points: [] });
    }
    const s = byKey.get(r.metric_key);
    s.label = r.label; s.unit = r.unit; s.direction = r.direction; // latest wins
    s.points.push({ t: r.created_at, v: r.value_num, raw: r.value_raw, verdict: r.verdict, source: r.source, schedule_id: r.schedule_id });
  }
  const metrics = [...byKey.values()].map(s => {
    const hasCollector = s.points.some(p => p.source === 'collector');
    const pts = hasCollector ? s.points.filter(p => p.source === 'collector') : s.points;
    const nums = pts.filter(p => p.v != null);
    const latest = nums.length ? nums[nums.length - 1].v : null;
    const previous = nums.length > 1 ? nums[nums.length - 2].v : null;
    const delta = (latest != null && previous != null) ? Math.round((latest - previous) * 10) / 10 : null;
    // schedule_id from the kept (authoritative) points — newest kept point wins — so a
    // collector-covered metric groups under the member the collector attributes it to,
    // not an older synthesis row's section.
    const schedule_id = pts.length ? pts[pts.length - 1].schedule_id : s.schedule_id;
    return { key: s.key, label: s.label, schedule_id, unit: s.unit, direction: s.direction,
             source: hasCollector ? 'collector' : 'synthesis', latest, previous, delta, points: pts };
  });
  return { health, metrics };
}

// Reverse index: metric key -> {unit, direction}. Built once from both maps. Used by the
// collector ingest path, which sends a stable key (not a label).
const _KEY_INDEX = (() => {
  const idx = {};
  for (const m of Object.values(GENERIC_METRICS)) idx[m.key] = { unit: m.unit, direction: m.direction };
  for (const sched of Object.values(KNOWN_METRICS)) for (const m of Object.values(sched)) idx[m.key] = { unit: m.unit, direction: m.direction };
  return idx;
})();

export function resolveByKey(key) {
  const hit = _KEY_INDEX[key];
  return hit ? { ...hit } : { unit: null, direction: 'neutral' };
}

function prettifyKey(key) {
  const tail = String(key || '').split('.').pop() || String(key || '');
  return tail.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Collector ingest: deterministic points pushed from an external collector (e.g. a cron
// job that scrapes infra metrics and POSTs them to /api/reports/:slug/metrics). Authoritative
// for their keys (queryMetricSeries prefers source='collector'). Never throws into the caller.
export function recordCollectorPoints(db, group, points, collectedAt) {
  const ts = collectedAt || new Date().toISOString().replace('T', ' ').slice(0, 19);
  const arr = Array.isArray(points) ? points : [];
  const ins = db.prepare(`INSERT INTO report_metric_points
    (report_id, build_id, schedule_id, metric_key, label, value_num, value_raw, unit, direction, verdict, created_at, source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?, 'collector')`);
  let inserted = 0;
  const tx = db.transaction(() => {
    for (const p of arr) {
      if (!p || !p.key || p.value == null) continue;
      const { unit, direction } = resolveByKey(p.key);
      const { value_num } = parseMetricValue(p.value);
      const sid = Number(p.schedule_id);
      ins.run(group.id, null, Number.isInteger(sid) ? sid : null,
        String(p.key).slice(0, 80), String(p.label || prettifyKey(p.key)).slice(0, 80),
        value_num, String(p.value).slice(0, 120), unit, direction, null, ts);
      inserted++;
    }
    db.prepare(`DELETE FROM report_metric_points WHERE report_id = ? AND created_at < datetime('now', ?)`)
      .run(group.id, `-${METRIC_RETENTION_DAYS} days`);
  });
  tx();
  return { inserted };
}

// Called on build success (and during backfill). Never throw into the caller's hot
// path — the caller wraps this in try/catch. builtAt = the build's created_at.
export function recordMetricPoints(db, group, buildId, doc, builtAt) {
  const ts = builtAt || new Date().toISOString().replace('T', ' ').slice(0, 19);
  const ins = db.prepare(`INSERT INTO report_metric_points
    (report_id, build_id, schedule_id, metric_key, label, value_num, value_raw, unit, direction, verdict, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  const tx = db.transaction(() => {
    for (const s of (doc.sections || [])) {
      for (const m of (s.metrics || [])) {
        if (!m || m.label == null || m.value == null) continue;
        const { key, unit: cu, direction } = resolveMetric(s.schedule_id, m.label);
        const { value_num, unit: pu } = parseMetricValue(m.value);
        ins.run(group.id, buildId, s.schedule_id, key, String(m.label).slice(0, 80),
          value_num, String(m.value).slice(0, 120), cu || pu, direction, s.verdict || null, ts);
      }
    }
    const hs = healthScore(doc.sections);
    if (hs != null) {
      ins.run(group.id, buildId, null, 'report.health_score', 'Health score',
        hs, String(hs), 'score', 'up_good', doc.overall_verdict || null, ts);
    }
    db.prepare(`DELETE FROM report_metric_points WHERE report_id = ? AND created_at < datetime('now', ?)`)
      .run(group.id, `-${METRIC_RETENTION_DAYS} days`);
  });
  tx();
}
