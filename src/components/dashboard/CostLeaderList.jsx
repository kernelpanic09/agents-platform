import { DollarSign } from 'lucide-react';

// Top-5 agent cost as div-based horizontal micro-bars (name | bar to %-of-max | $).
// No recharts — crisper at this small size. Global view across all agents.
export default function CostLeaderList({ agents = [] }) {
  const top = (agents || []).slice(0, 5);
  const max = top.reduce((m, a) => Math.max(m, a.cost || 0), 0) || 1;

  return (
    <div className="glass rounded-[4px] p-4 shadow-card">
      <div className="flex items-center gap-2 mb-3">
        <DollarSign size={14} className="text-amber-400" />
        <h2 className="text-[13px] font-medium text-zinc-200">Cost leaders</h2>
        <span className="text-[11px] text-zinc-600 ml-auto font-mono">top 5 · 7d</span>
      </div>

      {top.length === 0 ? (
        <div className="text-zinc-600 text-sm py-6 text-center">No cost data yet</div>
      ) : (
        <div className="space-y-2">
          {top.map((a, i) => {
            const pct = Math.max(2, Math.round(((a.cost || 0) / max) * 100));
            const leader = i === 0;
            return (
              <div key={a.agent_id ?? a.agent_name} className="flex items-center gap-2.5 group">
                <span className="font-mono text-[10px] text-zinc-600 w-3 text-right shrink-0 tabular-nums">{i + 1}</span>
                <span
                  className={`text-[12px] w-20 shrink-0 truncate ${leader ? 'text-zinc-200 font-medium' : 'text-zinc-400'}`}
                  title={a.agent_name}
                >
                  {a.agent_name || 'unknown'}
                </span>
                <div className="flex-1 h-2 rounded-[2px] bg-zinc-800/80 overflow-hidden">
                  <div
                    className="h-full rounded-[2px] transition-[width] duration-500 ease-out"
                    style={{ width: `${pct}%`, background: leader ? 'rgba(224,168,46,0.55)' : 'rgba(224,168,46,0.28)' }}
                  />
                </div>
                <span className="font-mono text-[11px] text-zinc-300 w-14 text-right shrink-0 tabular-nums">
                  ${Number(a.cost || 0).toFixed(4)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
