import { ResponsiveContainer, AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceArea } from 'recharts';
import { Pane, TrendRow, LegendDot, STATE_HEX, NO_RUN } from '../components/reportUI';

const fmtDay = (t) => String(t || '').slice(5, 10); // MM-DD from "YYYY-MM-DD HH:MM:SS"

function RangeToggle({ range, setRange }) {
  return (
    <div className="flex items-center gap-1 text-[11px]">
      {[30, 90].map(d => (
        <button key={d} onClick={() => setRange(d)}
          className={`px-2 py-0.5 rounded ${range === d ? 'bg-teal-500/15 text-teal-300' : 'text-zinc-500 hover:text-zinc-300'}`}>
          {d}d
        </button>
      ))}
    </div>
  );
}

function HealthScoreChart({ health }) {
  if (!health?.length) return <div className="text-zinc-600 text-sm py-10 text-center">No health-score history yet.</div>;
  const data = health.map(h => ({ t: h.t, v: h.v }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="hs" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3AAEA3" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#3AAEA3" stopOpacity={0} />
          </linearGradient>
        </defs>
        <ReferenceArea y1={75} y2={100} fill="#22c55e" fillOpacity={0.04} />
        <ReferenceArea y1={50} y2={75} fill="#f59e0b" fillOpacity={0.04} />
        <ReferenceArea y1={0} y2={50} fill="#ef4444" fillOpacity={0.04} />
        <XAxis dataKey="t" tick={{ fill: '#71717a', fontSize: 10 }} tickFormatter={fmtDay} minTickGap={24} />
        <YAxis domain={[0, 100]} tick={{ fill: '#71717a', fontSize: 10 }} width={32} />
        <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }} labelStyle={{ color: '#a1a1aa' }}
          labelFormatter={fmtDay} formatter={(v) => [`${v}/100`, 'Health']} />
        <Area type="monotone" dataKey="v" stroke="#3AAEA3" strokeWidth={2} fill="url(#hs)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function MiniMetric({ m }) {
  const numericPts = m.points.filter(p => p.v != null).map(p => ({ t: p.t, v: p.v }));
  const charted = numericPts.length >= 2;
  const last = m.points[m.points.length - 1];
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] text-zinc-300 truncate" title={m.label}>{m.label}</span>
        <span className="font-mono text-[12px] text-zinc-200">{last?.raw ?? '—'}</span>
      </div>
      {charted ? (
        <ResponsiveContainer width="100%" height={56}>
          <LineChart data={numericPts} margin={{ top: 6, right: 2, left: 2, bottom: 0 }}>
            <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }} labelStyle={{ color: '#a1a1aa' }}
              labelFormatter={(t) => String(t).slice(5, 10)} formatter={(v) => [v + (m.unit && m.unit !== 'count' && m.unit !== 'bool' ? (m.unit === '%' ? '%' : ` ${m.unit}`) : ''), m.label]} />
            <Line type="monotone" dataKey="v" stroke="#3AAEA3" strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[56px] flex items-center text-[11px] text-zinc-600">not charted (single value)</div>
      )}
    </div>
  );
}

function MetricHistory({ metrics, membersById }) {
  const groups = {};
  for (const m of metrics) (groups[m.schedule_id] ??= []).push(m);
  const ids = Object.keys(groups);
  if (!ids.length) return <div className="text-zinc-600 text-sm py-10 text-center">No metric history yet.</div>;
  return (
    <div className="space-y-5">
      {ids.map(sid => (
        <div key={sid}>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">
            {membersById?.[sid]?.name || `schedule #${sid}`}
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {groups[sid].map(m => <MiniMetric key={m.key} m={m} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ReportTrends({ data, metrics, range, setRange }) {
  if (!metrics) return <div className="text-zinc-500 text-sm py-8 text-center">Loading trends…</div>;
  const membersById = Object.fromEntries((data?.members || []).map(m => [String(m.schedule_id), m]));
  const charted = (metrics.metrics || []).filter(m => m.points.filter(p => p.v != null).length >= 2).length;
  const total = (metrics.metrics || []).length;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end"><RangeToggle range={range} setRange={setRange} /></div>
      <Pane title="Health score">
        <div className="mt-2"><HealthScoreChart health={metrics.health} /></div>
      </Pane>
      <Pane title={`${range}-day verdict trend`}>
        <div className="space-y-2 mt-1">
          {(metrics.timeline || []).map(row => <TrendRow key={row.schedule_id} row={row} />)}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3.5 text-[10.5px] text-zinc-500">
          <LegendDot color={STATE_HEX.ok} label="ok" />
          <LegendDot color={STATE_HEX.attention} label="attention" />
          <LegendDot color={STATE_HEX.critical} label="critical" />
          <LegendDot color={STATE_HEX.failed} ring label="failed" />
          <LegendDot color={NO_RUN} label="no run" />
        </div>
      </Pane>
      <Pane title="Metric history">
        <p className="text-[11px] text-zinc-500 mt-0.5 mb-3">{charted} of {total} metrics charted · the rest are single-valued or non-numeric</p>
        <MetricHistory metrics={metrics.metrics || []} membersById={membersById} />
      </Pane>
    </div>
  );
}
