import { useState, useEffect } from 'react';
import { getGantt } from '../../lib/ticketsApi';
import { PRIORITY_CLS } from './ticketMeta';

const PRIORITY_BAR = {
  critical: 'bg-red-500/60 border-red-500/40',
  high:     'bg-amber-500/60 border-amber-500/40',
  medium:   'bg-sky-500/50 border-sky-500/30',
  low:      'bg-zinc-600/60 border-white/10',
};

function toMs(dateStr) {
  if (!dateStr) return null;
  const s = dateStr.replace(' ', 'T');
  return new Date(s.includes('T') ? s : s + 'T00:00:00Z').getTime();
}

function fmtDate(ms) {
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function TicketGantt({ onOpen, reloadKey }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    getGantt().then(setData).catch(() => setData({ scheduled: [], unscheduled: [] }));
  }, [reloadKey]);

  if (!data) {
    return <div className="glass rounded-xl p-6 animate-pulse h-64" />;
  }

  const { scheduled = [], unscheduled = [] } = data;

  if (scheduled.length === 0 && unscheduled.length === 0) {
    return (
      <div className="glass rounded-xl p-8 text-center text-zinc-600 text-sm">
        No tickets to display
      </div>
    );
  }

  // Compute date range
  let minMs = Infinity, maxMs = -Infinity;
  for (const t of scheduled) {
    const s = toMs(t.start); const e = toMs(t.end);
    if (s) minMs = Math.min(minMs, s);
    if (e) maxMs = Math.max(maxMs, e);
  }
  if (!isFinite(minMs)) minMs = Date.now();
  if (!isFinite(maxMs)) maxMs = minMs + 7 * 86400000;
  minMs -= 86400000;
  maxMs += 86400000;
  const span = maxMs - minMs || 1;

  // Generate day ticks (~weekly)
  const ticks = [];
  const tickInterval = Math.max(1, Math.round(span / 86400000 / 7)) * 86400000;
  for (let t = minMs; t <= maxMs; t += tickInterval) ticks.push(t);

  return (
    <div className="glass rounded-xl overflow-hidden">
      {/* Header: date axis */}
      <div className="relative border-b border-zinc-800 px-4 py-2 h-8 select-none">
        {ticks.map((t) => {
          const pct = ((t - minMs) / span) * 100;
          return (
            <span
              key={t}
              className="absolute text-[10px] text-zinc-600 -translate-x-1/2"
              style={{ left: `${pct}%` }}
            >
              {fmtDate(t)}
            </span>
          );
        })}
      </div>

      {/* Bars */}
      <div className="p-4 space-y-2">
        {scheduled.map(t => {
          const startMs = toMs(t.start) || minMs;
          const endMs   = toMs(t.end)   || startMs + 86400000;
          const left  = ((Math.max(startMs, minMs) - minMs) / span) * 100;
          const right = ((Math.min(endMs,   maxMs) - minMs) / span) * 100;
          const width = Math.max(right - left, 1.5);

          return (
            <div key={t.id} className="flex items-center gap-3">
              <div className="w-48 shrink-0 text-[11px] text-zinc-400 truncate" title={t.title}>
                <span className="font-mono text-zinc-600 mr-1.5 text-[10px]">{t.key}</span>
                {t.title}
              </div>
              <div className="relative flex-1 h-6">
                <div
                  className={`absolute top-0 h-full rounded border cursor-pointer hover:brightness-125 transition-all ${PRIORITY_BAR[t.priority] || PRIORITY_BAR.low}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  onClick={() => onOpen(t.id)}
                  title={`${t.key}: ${t.title}`}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Unscheduled tray */}
      {unscheduled.length > 0 && (
        <div className="border-t border-zinc-800 px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-2">
            No schedule
          </div>
          <div className="flex flex-wrap gap-2">
            {unscheduled.map(t => (
              <button
                key={t.id}
                onClick={() => onOpen(t.id)}
                className="text-[11px] px-2 py-1 rounded glass border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <span className="font-mono text-zinc-600 mr-1 text-[10px]">{t.key}</span>
                {t.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
