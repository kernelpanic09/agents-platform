import { memo } from 'react';
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area,
} from 'recharts';

// Chromeless mini sparkline — no axes, no grid, no tooltip, no entry animation.
// Shared by HeroKpiStrip chips. When `area`, fills with a per-instance SVG gradient
// keyed by `gradientId` so multiple cards don't collide.
function KpiSparkline({ data = [], dataKey = 'c', color = '#2E9E92', area = false, gradientId, height = 44 }) {
  const flat = !data || data.length === 0 || data.every((d) => !d?.[dataKey]);
  if (flat) {
    // Dormant: a faint dashed baseline so the chip still reads as "a chart, at zero".
    return (
      <div style={{ height }} className="flex items-center">
        <div className="w-full border-t border-dashed border-zinc-800" />
      </div>
    );
  }
  const gid = gradientId || `sparkfill-${dataKey}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      {area ? (
        <AreaChart data={data} margin={{ top: 3, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.14} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5}
            fill={`url(#${gid})`} isAnimationActive={false} dot={false}
          />
        </AreaChart>
      ) : (
        <LineChart data={data} margin={{ top: 3, right: 0, bottom: 0, left: 0 }}>
          <Line
            type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5}
            dot={false} isAnimationActive={false}
          />
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}

export default memo(KpiSparkline);
