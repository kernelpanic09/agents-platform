import { Link } from 'react-router-dom';
import { KanbanSquare } from 'lucide-react';
import { PRIORITY_CLS } from './theme';

// Open-tickets big number (links to /tickets) + priority breakdown micro-bars.
// Global view — no project scope applied.
export default function TicketsTile({ tickets, ticketsHref = '/tickets' }) {
  return (
    <div className="glass rounded-[4px] p-4 shadow-card">
      <div className="flex items-center gap-2 mb-3">
        <KanbanSquare size={14} className="text-amber-400" />
        <h2 className="text-[13px] font-medium text-zinc-200">Open tickets</h2>
      </div>

      {!tickets ? (
        <div className="text-zinc-600 text-sm py-8 text-center">Loading…</div>
      ) : (
        <>
          <Link to={ticketsHref} className="group flex items-baseline gap-2 mb-4 hover:opacity-90 transition-opacity">
            <div className={`text-4xl font-semibold tabular-nums leading-none ${(tickets.open ?? 0) > 0 ? 'text-amber-300' : 'text-zinc-100'}`}>
              {tickets.open ?? 0}
            </div>
            <div className="text-[11px] text-zinc-500">open of {tickets.total ?? 0} total</div>
          </Link>

          {tickets.total === 0 ? (
            <div className="text-zinc-600 text-sm py-2 text-center">No tickets yet</div>
          ) : (
            <div className="space-y-2">
              {Object.entries(tickets.byPriority || {}).map(([pri, n]) => {
                if (!n) return null;
                const cls = PRIORITY_CLS[pri] || 'bg-zinc-700/50';
                const pct = tickets.total ? Math.max(3, Math.round((n / tickets.total) * 100)) : 0;
                return (
                  <div key={pri} className="flex items-center gap-2">
                    <span className="text-[11px] text-zinc-500 w-14 shrink-0 capitalize">{pri}</span>
                    <div className="flex-1 h-2 rounded-[2px] bg-zinc-800 overflow-hidden">
                      <div className={`h-full rounded-[2px] transition-[width] duration-500 ease-out ${cls}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[11px] text-zinc-400 w-5 text-right tabular-nums">{n}</span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
