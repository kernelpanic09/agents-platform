import { Link } from 'react-router-dom';

export const VERDICT_HEX = { ok: '#22c55e', attention: '#f59e0b', critical: '#ef4444' };
export const STATE_HEX = { ok: '#22c55e', attention: '#f59e0b', critical: '#ef4444', failed: '#574F45' };
export const TEAL = '#3AAEA3';
export const GAUGE_EMPTY = '#3A352C';
export const NO_RUN = '#232019';

export function Pane({ title, icon: Icon, color = TEAL, dot, className = '', children }) {
  return (
    <div className={`relative glass rounded-xl px-4 pt-5 pb-4 ${className}`}>
      <span
        className="absolute -top-2 left-4 bg-surface px-2 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider"
        style={{ color }}
      >
        {dot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />}
        {Icon && <Icon size={11} />}
        {title}
      </span>
      {children}
    </div>
  );
}

export function TrendRow({ row }) {
  return (
    <div className="grid grid-cols-[10.5rem_1fr] items-center gap-3">
      <span className="text-[12px] text-zinc-400 truncate" title={row.name}>{row.name}</span>
      <div className="flex gap-1 flex-wrap">
        {row.days.map(d => {
          const cell = (
            <span
              key={d.date}
              title={`${d.date} — ${d.state || 'no run'}`}
              className="w-3.5 h-3.5 rounded-[3px] inline-block align-middle"
              style={d.state === 'failed'
                ? { background: STATE_HEX.failed, boxShadow: 'inset 0 0 0 1.5px rgba(239,68,68,.6)' }
                : { background: d.state ? STATE_HEX[d.state] : NO_RUN }}
            />
          );
          return d.run_id ? <Link key={d.date} to={`/schedules/runs/${d.run_id}`} className="leading-none">{cell}</Link> : cell;
        })}
      </div>
    </div>
  );
}

export function LegendDot({ color, ring, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-[3px]" style={ring ? { background: color, boxShadow: 'inset 0 0 0 1.5px rgba(239,68,68,.6)' } : { background: color }} />
      {label}
    </span>
  );
}
