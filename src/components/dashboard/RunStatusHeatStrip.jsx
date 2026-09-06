// Heat strip: 24 hourly cells, teal opacity ramp by run count, zinc for zero.
// Props: { perHour: [{hour, c}] }  (from /api/runs/summary — already fetched in DashboardPage)
// No recharts — pure div/Tailwind.

function padHours(perHour) {
  // Ensure exactly 24 buckets h=0..23; fill missing with 0.
  const map = new Map((perHour || []).map((b) => [Number(b.hour), b.c || 0]));
  return Array.from({ length: 24 }, (_, h) => ({ hour: h, c: map.get(h) || 0 }));
}

// Opacity ramp: 0 → zinc, 1 → faint teal, max → full teal.
function cellStyle(c, max) {
  if (c === 0 || max === 0) return { background: 'rgba(39,39,42,0.6)' }; // zinc-800/60
  const t = Math.min(1, c / max);
  // Interpolate opacity 0.18 → 0.85 on teal.
  const alpha = 0.18 + t * 0.67;
  return { background: `rgba(46,158,146,${alpha.toFixed(2)})` };
}

// Show hour label under every 6th cell (0, 6, 12, 18).
function hourLabel(h) {
  if (h % 6 !== 0) return null;
  const ampm = h < 12 ? `${h === 0 ? 12 : h}am` : `${h === 12 ? 12 : h - 12}pm`;
  return ampm;
}

export default function RunStatusHeatStrip({ perHour = [] }) {
  const cells = padHours(perHour);
  const max = cells.reduce((m, b) => Math.max(m, b.c), 0);
  const total = cells.reduce((s, b) => s + b.c, 0);

  return (
    <div className="glass rounded-[4px] p-4 shadow-card min-w-0">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 min-w-0">
        <h2 className="text-[13px] font-medium text-zinc-200 truncate">Run activity · 24h</h2>
        <div className="ml-auto flex items-center gap-3 shrink-0">
          {total > 0 && (
            <span className="font-mono text-[11px] text-zinc-400 tabular-nums">
              {total} total
            </span>
          )}
          {max > 0 && (
            <span className="font-mono text-[11px] text-zinc-600 tabular-nums">
              peak {max}
            </span>
          )}
        </div>
      </div>

      {/* Cell strip + hour labels */}
      <div className="min-w-0 overflow-hidden">
        {/* Cells */}
        <div className="flex gap-px min-w-0">
          {cells.map(({ hour, c }) => (
            <div
              key={hour}
              className="flex-1 min-w-0 h-6 rounded-[2px] transition-colors duration-300"
              style={cellStyle(c, max)}
              title={`${hour}:00 · ${c} run${c !== 1 ? 's' : ''}`}
            />
          ))}
        </div>
        {/* Hour labels */}
        <div className="flex gap-px mt-1 min-w-0">
          {cells.map(({ hour }) => {
            const label = hourLabel(hour);
            return (
              <div
                key={hour}
                className="flex-1 min-w-0 flex justify-start"
              >
                {label && (
                  <span className="font-mono text-[9px] text-zinc-600 whitespace-nowrap tabular-nums leading-none">
                    {label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
