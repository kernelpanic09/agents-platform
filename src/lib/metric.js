// Shared metric helpers for the report pages (mirrors server/metrics.js parsing for
// the live-gauge fill; the Trends/drill-in numbers come pre-computed from /metrics).
const VERDICT_WEIGHT = { ok: 1, attention: 0.5, critical: 0 };

// Parse a metric string to a 0-100 fill, or null when it isn't a ratio/percentage.
export function parseMetric(value) {
  const s = String(value ?? '').trim();
  if ((s.match(/\//g) || []).length >= 2) return null;
  const ratio = s.match(/^(\d+(?:\.\d+)?)(?:\s*-\s*\d+(?:\.\d+)?)?\s*\/\s*(\d+(?:\.\d+)?)/);
  if (ratio) { const a = parseFloat(ratio[1]), b = parseFloat(ratio[2]); if (b > 0) return Math.max(0, Math.min(100, (a / b) * 100)); }
  const pct = s.match(/(-?\d+(?:\.\d+)?)\s*%/);
  if (pct) return Math.max(0, Math.min(100, parseFloat(pct[1])));
  return null;
}

export function healthScore(sections) {
  if (!sections?.length) return null;
  const sum = sections.reduce((a, s) => a + (s.verdict in VERDICT_WEIGHT ? VERDICT_WEIGHT[s.verdict] : 0.5), 0);
  return Math.round((sum / sections.length) * 100);
}

// Given a metric's direction, is a delta good/bad/flat? Drives the arrow color.
export function deltaSense(direction, delta) {
  if (delta == null || delta === 0) return 'flat';
  if (direction === 'up_good') return delta > 0 ? 'good' : 'bad';
  if (direction === 'down_good') return delta < 0 ? 'good' : 'bad';
  return 'flat';
}
