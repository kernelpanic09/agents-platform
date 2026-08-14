import { useState, useEffect, useCallback } from 'react';
import { getBoard, patchTicket } from '../../lib/ticketsApi';
import { COLUMNS } from './ticketMeta';
import TicketCard from './TicketCard';

export default function TicketBoard({ onOpen, reloadKey }) {
  const [cols, setCols] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const load = useCallback(() => {
    getBoard()
      .then(setCols)
      .catch(() => setCols({}));
  }, []);

  useEffect(() => { load(); }, [load, reloadKey]);

  function handleDragOver(e, colKey) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(colKey);
  }

  function handleDragLeave() {
    setDragOver(null);
  }

  async function handleDrop(e, colKey) {
    e.preventDefault();
    setDragOver(null);
    const rawId = e.dataTransfer.getData('text/ticket');
    const id = parseInt(rawId, 10);
    if (!id) return;

    // Optimistic update
    setCols(prev => {
      if (!prev) return prev;
      const next = {};
      let moved = null;
      for (const col of COLUMNS) {
        next[col.key] = (prev[col.key] || []).filter(t => {
          if (t.id === id) { moved = t; return false; }
          return true;
        });
      }
      if (moved) next[colKey] = [...(next[colKey] || []), { ...moved, status: colKey }];
      return next;
    });

    try {
      await patchTicket(id, { status: colKey });
    } catch { /* revert handled by reload */ }
    load();
  }

  if (!cols) {
    return (
      <div className="grid grid-cols-5 gap-3 h-96">
        {COLUMNS.map(col => (
          <div key={col.key} className="glass rounded-xl p-3 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-5 gap-3 min-h-[60vh]">
      {COLUMNS.map(col => {
        const cards = cols[col.key] || [];
        const isOver = dragOver === col.key;
        return (
          <div
            key={col.key}
            onDragOver={(e) => handleDragOver(e, col.key)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, col.key)}
            className={`flex flex-col rounded-xl p-3 transition-colors ${
              isOver ? 'bg-accent-400/10 border border-accent-400/30' : 'glass border-transparent'
            }`}
          >
            {/* Column header */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                {col.label}
              </span>
              <span className="text-[11px] text-zinc-600 tabular-nums">{cards.length}</span>
            </div>

            {/* Cards */}
            <div className="flex flex-col gap-2 flex-1">
              {cards.map(t => (
                <TicketCard key={t.id} ticket={t} onOpen={onOpen} />
              ))}
              {cards.length === 0 && (
                <div className="flex-1 flex items-center justify-center">
                  <span className="text-[11px] text-zinc-700">Empty</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
