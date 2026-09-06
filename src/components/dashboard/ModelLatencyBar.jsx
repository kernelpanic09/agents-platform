import { Gauge } from 'lucide-react';

// Format milliseconds into a terse human string: ≥1000ms → Xs.x, else Xms.
function fmtMs(ms) {
  if (ms == null) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

// Top-6 model latency as div-based horizontal micro-bars (model | bar | avg_ms).
// No recharts. Props: { stats: [{model, calls, avg_ms, min_ms, max_ms}] }
export default function ModelLatencyBar({ stats = [] }) {
  // Sort desc by avg_ms, cap at 6.
  const top = [...(stats || [])]
    .sort((a, b) => (b.avg_ms || 0) - (a.avg_ms || 0))
    .slice(0, 6);

  const max = top.reduce((m, r) => Math.max(m, r.avg_ms || 0), 0) || 1;

  return (
    <div className="glass rounded-[4px] p-4 shadow-card">
      <div className="flex items-center gap-2 mb-3">
        <Gauge size={14} className="text-accent-400 shrink-0" />
        <h2 className="text-[13px] font-medium text-zinc-200">Latency by model</h2>
        <span className="text-[11px] text-zinc-600 ml-auto font-mono shrink-0">7d</span>
      </div>

      {top.length === 0 ? (
        <div className="text-zinc-600 text-sm py-4 text-center">No latency data</div>
      ) : (
        <div className="space-y-2">
          {top.map((r, i) => {
            const pct = Math.max(3, Math.round(((r.avg_ms || 0) / max) * 100));
            const leader = i === 0;
            // Strip provider prefix for brevity: "anthropic.claude-sonnet-4-5" → "claude-sonnet-4-5"
            const label = (r.model || 'unknown').replace(/^[^/]+\//, '').replace(/^anthropic\./, '');
            return (
              <div
                key={r.model}
                className="flex items-center gap-2.5 min-w-0"
                title={`${r.model} · avg ${fmtMs(r.avg_ms)} · min ${fmtMs(r.min_ms)} · max ${fmtMs(r.max_ms)} · ${r.calls ?? '?'} calls`}
              >
                {/* Model name */}
                <span
                  className={`min-w-0 flex-1 text-[11px] truncate ${leader ? 'text-zinc-200 font-medium' : 'text-zinc-400'}`}
                  title={r.model}
                >
                  {label}
                </span>
                {/* Bar */}
                <div className="w-20 shrink-0 h-2 rounded-[2px] bg-zinc-800/80 overflow-hidden">
                  <div
                    className="h-full rounded-[2px] transition-[width] duration-500 ease-out"
                    style={{
                      width: `${pct}%`,
                      background: leader ? 'rgba(46,158,146,0.70)' : 'rgba(46,158,146,0.35)',
                    }}
                  />
                </div>
                {/* Value */}
                <span className="font-mono text-[11px] text-zinc-300 w-12 text-right shrink-0 tabular-nums">
                  {fmtMs(r.avg_ms)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
