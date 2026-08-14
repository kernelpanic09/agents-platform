// Platform SLOs (P5) — success rate, p95 run latency, and daily cost measured
// against live-configurable targets, with green/warning/breach status and
// transition-to-breach alerting to Discord.
import { getSetting } from '../settings.js';
import { sendDiscordNotify } from '../executor.js';

const RANK = { breach: 3, warn: 2, ok: 1, nodata: 0 };
const WINDOW_DAYS = 7;

function rate(value, target, warnBand = 0.05) {
  // higher-is-better metric
  if (value == null) return 'nodata';
  if (value >= target) return 'ok';
  if (value >= target - warnBand) return 'warn';
  return 'breach';
}
function ceiling(value, target, warnFactor = 1.25) {
  // lower-is-better metric; warn band is a factor above target
  if (value == null) return 'nodata';
  if (value <= target) return 'ok';
  if (value <= target * warnFactor) return 'warn';
  return 'breach';
}

/** Compute current SLO metrics + status. Pure read; safe to call anywhere. */
export function computeSlo(db) {
  const runs = db.prepare(
    `SELECT status, duration_ms FROM runs WHERE created_at >= datetime('now', ?) AND status IN ('success','failed','timeout')`
  ).all(`-${WINDOW_DAYS} days`);
  const total = runs.length;
  const succeeded = runs.filter(r => r.status === 'success').length;
  const successRate = total ? succeeded / total : null;

  const durations = runs.map(r => r.duration_ms).filter(d => d != null).sort((a, b) => a - b);
  const p95LatencyMs = durations.length ? durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))] : null;

  const dailyCostUsd = db.prepare(`SELECT COALESCE(SUM(cost_usd), 0) AS c FROM traces WHERE created_at >= datetime('now', '-1 day')`).get().c || 0;

  const targets = {
    successRate: getSetting('slo_success_rate'),
    p95LatencyMs: getSetting('slo_p95_latency_ms'),
    dailyCostUsd: getSetting('slo_daily_cost_usd'),
  };
  const status = {
    successRate: rate(successRate, targets.successRate),
    p95LatencyMs: ceiling(p95LatencyMs, targets.p95LatencyMs),
    // cost: ok well under target, warn approaching, breach over
    dailyCostUsd: dailyCostUsd <= targets.dailyCostUsd * 0.8 ? 'ok' : dailyCostUsd <= targets.dailyCostUsd ? 'warn' : 'breach',
  };
  const overall = Object.values(status).reduce((acc, s) => (RANK[s] > RANK[acc] ? s : acc), 'ok');

  return { window_days: WINDOW_DAYS, sample_size: total, metrics: { successRate, p95LatencyMs, dailyCostUsd }, targets, status, overall };
}

// Metrics that can raise a Discord alert. Cost is intentionally excluded: we run on a
// flat-rate subscription, so daily cost is notional — it is still computed/collected in
// computeSlo() for the dashboard, but it must never trigger an alert.
const ALERTING_METRICS = ['successRate', 'p95LatencyMs'];

/** Pure: decide whether an SLO state warrants a Discord alert and build the alert lines.
 *  Returns { overall, lines } where `overall` is the worst status across ALERTING_METRICS. */
export function sloAlert(slo) {
  const m = slo.metrics, t = slo.targets;
  const overall = ALERTING_METRICS.reduce((acc, k) => (RANK[slo.status[k]] > RANK[acc] ? slo.status[k] : acc), 'ok');
  const lines = [];
  if (slo.status.successRate === 'breach') lines.push(`success rate ${(m.successRate * 100).toFixed(0)}% < ${(t.successRate * 100).toFixed(0)}%`);
  if (slo.status.p95LatencyMs === 'breach') lines.push(`p95 latency ${Math.round(m.p95LatencyMs / 1000)}s > ${Math.round(t.p95LatencyMs / 1000)}s`);
  return { overall, lines };
}

/** Ensure the slo_history table + index exist (idempotent). */
export function ensureSloHistory(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS slo_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      checked_at TEXT NOT NULL DEFAULT (datetime('now')),
      success_rate REAL,
      p95_latency_ms INTEGER,
      daily_cost_usd REAL,
      overall TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_slo_history_checked ON slo_history(checked_at);
  `);
}

/** Insert a sample row and prune rows older than 90 days. */
export function recordSloSample(db, slo) {
  const m = slo.metrics || {};
  db.prepare(`INSERT INTO slo_history (success_rate, p95_latency_ms, daily_cost_usd, overall) VALUES (?,?,?,?)`)
    .run(m.successRate ?? null, m.p95LatencyMs ?? null, m.dailyCostUsd ?? null, slo.overall || null);
  db.prepare(`DELETE FROM slo_history WHERE checked_at < datetime('now','-90 days')`).run();
}

/** Return rows within the window, ordered by checked_at ascending. */
export function getSloHistory(db, days = 30) {
  return db.prepare(`SELECT * FROM slo_history WHERE checked_at >= datetime('now', ?) ORDER BY checked_at`)
    .all(`-${days} days`);
}

let _lastOverall = null;

/** Compute SLOs and alert to Discord when an alertable SLO transitions INTO breach.
 *  Cost breaches never alert (flat subscription); cost data is still collected by computeSlo(). */
export function checkSloBreach(db) {
  try {
    ensureSloHistory(db);
    const slo = computeSlo(db);
    recordSloSample(db, slo);

    // Make alert state restart-safe: if this is the first call after a redeploy
    // (i.e., _lastOverall is still null), seed it from the most recent persisted
    // row so we don't re-fire an already-known breach.
    if (_lastOverall === null) {
      try {
        const latest = db.prepare(`SELECT overall FROM slo_history ORDER BY id DESC LIMIT 1`).get();
        if (latest?.overall) _lastOverall = latest.overall;
      } catch { /* table may not have rows yet — ignore */ }
    }

    const { overall, lines } = sloAlert(slo);
    if (overall === 'breach' && _lastOverall !== 'breach') {
      sendDiscordNotify('SLO breach', lines.join('\n') || 'A platform SLO is in breach.', 15158332).catch(() => {});
      console.log('[slo] breach:', lines.join('; '));
    }
    _lastOverall = overall;
    return slo;
  } catch (err) {
    console.error('[slo] check failed:', err.message);
    return null;
  }
}
