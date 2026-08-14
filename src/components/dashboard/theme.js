// Shared visual tokens for the dashboard — sharp variant of the app's recharts/style
// idiom. Colors mirror StatusBadge / index.css exactly; teal (#2E9E92 accent-400) is
// the real brand accent.

export const TEAL = '#2E9E92';       // accent-400 (brand)
export const TEAL_SERIES = '#2FA39A'; // chart-series teal (matches ObservabilityPage)
export const AMBER = '#E0A82E';

// Recharts chrome — sharp (4px) tooltip on the OVERLAY surface (sits above the raised
// panel it floats over), hairline border + one flat drop shadow, zinc-500 ticks.
export const TOOLTIP_STYLE = {
  background: 'rgb(46 49 56)',
  border: '1px solid rgb(54 58 66)',
  borderRadius: 4,
  fontSize: 11,
  padding: '6px 9px',
  boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
};
export const ITEM_STYLE = { color: 'rgb(211 213 217)', padding: 0 };
export const LABEL_STYLE = { color: 'rgb(138 143 152)', fontSize: 10, marginBottom: 2 };
export const AXIS_TICK = { fill: 'rgb(102 107 116)', fontSize: 10 };
export const GRID_STROKE = 'rgb(43 47 55)';

// SLO / health traffic-light styling. Card class + dot + text + label.
export const SLO_STYLE = {
  ok:     { dot: '#22c55e', cls: 'border-green-500/25 bg-green-500/5', text: 'text-green-300', label: 'on target' },
  warn:   { dot: '#f59e0b', cls: 'border-amber-500/25 bg-amber-500/5', text: 'text-amber-300', label: 'warning' },
  breach: { dot: '#ef4444', cls: 'border-red-500/25 bg-red-500/5', text: 'text-red-300', label: 'breach' },
  nodata: { dot: '#71717a', cls: 'border-zinc-800 bg-zinc-800/20', text: 'text-zinc-500', label: 'no data' },
};

// Schedule-health dot colors (mirror StatusBadge classes).
export const GRID_STATUS = {
  success: 'bg-green-500/60',
  failed:  'bg-red-500/60',
  timeout: 'bg-orange-500/60',
  running: 'bg-teal-500/60',
  queued:  'bg-zinc-600/60',
  pending_approval: 'bg-amber-500/60',
  rejected: 'bg-zinc-700/60',
};
export function gridCls(status) {
  return GRID_STATUS[status] || 'bg-zinc-800/60';
}

// Ticket-priority bar colors.
export const PRIORITY_CLS = {
  critical: 'bg-red-500/60',
  high: 'bg-amber-500/60',
  medium: 'bg-sky-500/50',
  low: 'bg-zinc-600/50',
};

// Relative-time formatter for "last run" cells (machine-ish, terse).
export function relTime(iso) {
  if (!iso) return '—';
  const t = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T')).getTime();
  if (Number.isNaN(t)) return '—';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export const usd = (v) => (v == null ? '—' : `$${Number(v).toFixed(2)}`);
