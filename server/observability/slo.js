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

let _lastOverall = null;

/** Compute SLOs and alert to Discord when overall status transitions INTO breach. */
export function checkSloBreach(db) {
  try {
    const slo = computeSlo(db);
    if (slo.overall === 'breach' && _lastOverall !== 'breach') {
      const m = slo.metrics, t = slo.targets;
      const lines = [];
      if (slo.status.successRate === 'breach') lines.push(`success rate ${(m.successRate * 100).toFixed(0)}% < ${(t.successRate * 100).toFixed(0)}%`);
      if (slo.status.p95LatencyMs === 'breach') lines.push(`p95 latency ${Math.round(m.p95LatencyMs / 1000)}s > ${Math.round(t.p95LatencyMs / 1000)}s`);
      if (slo.status.dailyCostUsd === 'breach') lines.push(`daily cost $${m.dailyCostUsd.toFixed(2)} > $${t.dailyCostUsd}`);
      sendDiscordNotify('SLO breach', lines.join('\n') || 'A platform SLO is in breach.', 15158332).catch(() => {});
      console.log('[slo] breach:', lines.join('; '));
    }
    _lastOverall = slo.overall;
    return slo;
  } catch (err) {
    console.error('[slo] check failed:', err.message);
    return null;
  }
}
