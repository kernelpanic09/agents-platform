import { ResponsiveContainer, LineChart, Line, YAxis, Tooltip, ReferenceLine } from 'recharts';
import { ShieldCheck } from 'lucide-react';
import { SLO_STYLE, TOOLTIP_STYLE, LABEL_STYLE, ITEM_STYLE } from './theme';

// 3 SLO mini-cards (success / p95 / daily-cost) + a 60px success-rate sparkline.
// SLO data is always platform-wide (global dashboard — no per-project scope).
export default function SloGlance({ slo, sloHistory = [] }) {
  const ov = SLO_STYLE[slo?.overall] || SLO_STYLE.nodata;
  const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(0)}%`);
  const secs = (v) => (v == null ? '—' : `${Math.round(v / 1000)}s`);
  const usd = (v) => (v == null ? '—' : `$${Number(v).toFixed(2)}`);

  const cards = [
    { key: 'successRate', label: 'Success', fmt: pct },
    { key: 'p95LatencyMs', label: 'p95', fmt: secs },
    { key: 'dailyCostUsd', label: 'Daily cost', fmt: usd },
  ];

  return (
    <div className="glass rounded-[4px] p-4 shadow-card">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck size={14} className="text-accent-400" />
        <h2 className="text-[13px] font-medium text-zinc-200">Platform SLOs</h2>
        <span className={`ml-auto inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border ${ov.cls} ${ov.text}`}>
          <span className="w-2 h-2 rounded-full" style={{ background: ov.dot }} />
          {ov.label}
        </span>
      </div>

      {!slo ? (
        <div className="text-zinc-600 text-sm py-8 text-center">Loading SLO data…</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {cards.map(({ key, label, fmt }) => {
              const st = SLO_STYLE[slo.status?.[key]] || SLO_STYLE.nodata;
              return (
                <div key={key} className={`relative p-2.5 rounded-[3px] border overflow-hidden ${st.cls}`}>
                  <span className="absolute left-0 inset-y-0 w-[2px]" style={{ background: st.dot }} />
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-0.5">{label}</div>
                  <div className={`text-lg font-semibold tabular-nums ${st.text}`}>{fmt(slo.metrics?.[key])}</div>
                </div>
              );
            })}
          </div>

          {sloHistory.length > 0 && (
            <div className="pt-1">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Success rate · {slo.window_days}d</div>
              <ResponsiveContainer width="100%" height={60}>
                <LineChart data={sloHistory} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <YAxis domain={[0, 1]} hide />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={LABEL_STYLE}
                    itemStyle={ITEM_STYLE}
                    cursor={{ stroke: 'rgb(73 78 87)', strokeDasharray: '2 4' }}
                    labelFormatter={(v) => (v ? v.slice(0, 16).replace('T', ' ') : v)}
                    formatter={(v) => (v != null ? [`${(v * 100).toFixed(0)}%`, 'Success rate'] : ['—', 'Success rate'])}
                  />
                  <ReferenceLine y={0.95} stroke="#f59e0b" strokeDasharray="3 3" strokeWidth={1} strokeOpacity={0.5} />
                  <Line type="monotone" dataKey="success_rate" stroke="#22c55e" strokeWidth={1.75} dot={false} connectNulls isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-600">
            <span className="font-mono">{slo.sample_size} runs · {slo.window_days}d</span>
          </div>
        </>
      )}
    </div>
  );
}
