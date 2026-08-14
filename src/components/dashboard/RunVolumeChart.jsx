import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid,
} from 'recharts';
import { Activity } from 'lucide-react';
import { TOOLTIP_STYLE, LABEL_STYLE, ITEM_STYLE, AXIS_TICK, GRID_STROKE, TEAL_SERIES } from './theme';

// Feature area chart of runs/hour over the last 24h. Gradient fill, a faint horizontal
// grid, a dashed ReferenceLine at the hourly average, custom tooltip + active dot.
// Page's hero chart — global run volume across all schedules.
export default function RunVolumeChart({ perHour = [], color = TEAL_SERIES, title = 'Run volume', meta = 'last 24h', height = 180 }) {
  const data = perHour || [];
  const total = data.reduce((a, d) => a + (d.c || 0), 0);
  const peak = data.reduce((m, d) => Math.max(m, d.c || 0), 0);
  const avg = data.length ? total / data.length : 0;
  const gid = `runvol-${title.replace(/\s+/g, '')}`;

  return (
    <div className="glass rounded-[4px] p-4 shadow-card">
      <div className="flex items-center gap-2 mb-3.5">
        <Activity size={14} style={{ color }} />
        <h2 className="text-[13px] font-medium text-zinc-200">{title}</h2>
        <span className="text-[11px] text-zinc-600 ml-auto font-mono tabular-nums">
          {total} runs{peak > 0 ? ` · peak ${peak}/h` : ''} · {meta}
        </span>
      </div>
      {total === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1.5 text-center" style={{ height }}>
          <Activity size={18} className="text-zinc-700" />
          <span className="text-zinc-600 text-[13px]">No run activity in the last 24h</span>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.22} />
                <stop offset="70%" stopColor={color} stopOpacity={0.04} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeOpacity={0.6} />
            <XAxis dataKey="hour" tick={AXIS_TICK} interval={5} tickLine={false} axisLine={{ stroke: GRID_STROKE }} dy={2} />
            <YAxis tick={AXIS_TICK} allowDecimals={false} width={28} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={LABEL_STYLE}
              itemStyle={ITEM_STYLE}
              cursor={{ stroke: 'rgb(73 78 87)', strokeDasharray: '2 4' }}
              formatter={(v) => [v, 'Runs']}
            />
            {avg > 0 && (
              <ReferenceLine
                y={avg}
                stroke="rgb(73 78 87)"
                strokeDasharray="2 4"
                strokeWidth={1}
                label={{ value: `avg ${avg.toFixed(1)}`, position: 'insideTopLeft', fill: 'rgb(102 107 116)', fontSize: 9, dy: -2 }}
              />
            )}
            <Area
              type="monotone" dataKey="c" stroke={color} strokeWidth={2}
              fill={`url(#${gid})`} isAnimationActive={false} dot={false}
              activeDot={{ r: 3, fill: color, stroke: 'rgb(35 38 44)', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
