// Small reusable stat tile for the dashboard metric strip.
// Props:
//   label    — 10px uppercase label string
//   value    — display value (string/number), shows "—" if null/undefined
//   sub      — 11px sub-line; string OR array of strings (mono, truncated)
//   color    — 'green' | 'amber' | 'red' | null  (default zinc accent dot)
//   href     — optional link; wraps the tile in an <a>
//   loading  — show skeleton shimmer while data is in-flight
import { memo } from 'react';

const COLOR_DOT = {
  green: '#22c55e',
  amber: '#f59e0b',
  red:   '#ef4444',
};
const COLOR_VALUE = {
  green: 'text-green-300',
  amber: 'text-amber-300',
  red:   'text-red-300',
};

function Inner({ label, value, sub, color, loading }) {
  const dotColor  = COLOR_DOT[color]  || '#52525b'; // zinc-600
  const valueCls  = COLOR_VALUE[color] || 'text-zinc-100';
  const subLines  = Array.isArray(sub) ? sub : (sub ? [sub] : []);

  return (
    <div className="glass rounded-[4px] p-3.5 flex flex-col gap-1 min-w-0">
      {/* Label row */}
      <span className="text-[10px] uppercase tracking-widest text-zinc-500 truncate">
        {label}
      </span>

      {/* Value row with accent dot */}
      <div className="flex items-baseline gap-1.5 min-w-0">
        {loading ? (
          <span className="h-5 w-16 rounded bg-zinc-800 animate-pulse" />
        ) : (
          <>
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0 mb-0.5 self-center"
              style={{ background: dotColor }}
            />
            <span className={`text-xl font-semibold tabular-nums leading-none truncate ${valueCls}`}>
              {value ?? '—'}
            </span>
          </>
        )}
      </div>

      {/* Sub-line(s) */}
      {!loading && subLines.length > 0 && (
        <div className="space-y-0.5 min-w-0">
          {subLines.map((line, i) => (
            <p key={i} className="text-[11px] text-zinc-500 font-mono truncate leading-tight">
              {line}
            </p>
          ))}
        </div>
      )}
      {loading && <span className="h-3 w-24 rounded bg-zinc-800/60 animate-pulse mt-0.5" />}
    </div>
  );
}

export default memo(function MetricTile({ label, value, sub, color, href, loading }) {
  if (href) {
    return (
      <a
        href={href}
        className="block hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-1 focus-visible:ring-teal-400 rounded-[4px]"
      >
        <Inner label={label} value={value} sub={sub} color={color} loading={loading} />
      </a>
    );
  }
  return <Inner label={label} value={value} sub={sub} color={color} loading={loading} />;
});
