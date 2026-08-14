import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock } from 'lucide-react';
import { GRID_STATUS, gridCls } from './theme';

// Derive a cluster label from a schedule name: the leading token before the first
// separator (space / — / – / : / ·). Falls back to the whole trimmed name.
function prefixOf(name = '') {
  const m = name.trim().match(/^([^\s—–:·|]+)/);
  const p = (m ? m[1] : name).trim();
  return p || 'other';
}

// Dot matrix of schedule last_run_status, grouped into labeled clusters by name
// prefix. Enlarged w-5 h-5 dots; per-status legend counts. Dots link to the schedule.
// Global view — no scope/project filter applied.
export default function ScheduleHealthMatrix({ schedules = [] }) {
  const clusters = useMemo(() => {
    const map = new Map();
    for (const s of schedules) {
      const key = prefixOf(s.name);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    }
    // Largest clusters first for a stable, dense layout.
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [schedules]);

  const legend = useMemo(() => {
    const entries = Object.keys(GRID_STATUS)
      .map((st) => [st, schedules.filter((s) => s.last_run_status === st).length])
      .filter(([, n]) => n > 0);
    const never = schedules.filter((s) => !s.last_run_status).length;
    return { entries, never };
  }, [schedules]);

  return (
    <div className="glass rounded-[4px] p-4 shadow-card">
      <div className="flex items-center gap-2 mb-3">
        <CalendarClock size={14} className="text-accent-400" />
        <h2 className="text-[13px] font-medium text-zinc-200">Schedule health</h2>
        <span className="text-[11px] text-zinc-600 ml-auto font-mono">{schedules.length} schedules</span>
      </div>

      {schedules.length === 0 ? (
        <div className="text-zinc-600 text-sm py-6 text-center">No schedules configured yet</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-6 gap-y-3.5">
            {clusters.map(([label, items]) => (
              <div key={label} className="min-w-0">
                <div className="flex items-baseline gap-1.5 mb-1.5">
                  <span className="text-[10px] uppercase tracking-wide text-zinc-500 truncate max-w-[120px]" title={label}>{label}</span>
                  <span className="font-mono text-[10px] text-zinc-600 tabular-nums">{items.length}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {items.map((s) => (
                    <Link
                      key={s.id}
                      to={`/schedules/${s.id}`}
                      title={`${s.name} · ${s.last_run_status || 'no runs'}`}
                      className={`w-5 h-5 rounded-[2px] transition-all duration-150 hover:scale-110 hover:ring-1 hover:ring-white/20 ${gridCls(s.last_run_status)}`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1.5 pt-3 border-t border-zinc-800">
            {legend.entries.map(([st, n]) => (
              <span key={st} className="flex items-center gap-1 text-[11px] text-zinc-500">
                <span className={`w-2.5 h-2.5 rounded-[2px] ${GRID_STATUS[st]}`} />
                {n} {st.replace('_', ' ')}
              </span>
            ))}
            {legend.never > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                <span className="w-2.5 h-2.5 rounded-[2px] bg-zinc-800/60" />
                {legend.never} never run
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
