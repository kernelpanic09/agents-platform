import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { KanbanSquare, Plus, Table2, Calendar } from 'lucide-react';
import TicketBoard from '../components/tickets/TicketBoard';
import TicketTable from '../components/tickets/TicketTable';
import TicketGantt from '../components/tickets/TicketGantt';
import TicketDrawer from '../components/tickets/TicketDrawer';
import NewTicketModal from '../components/tickets/NewTicketModal';

const VIEWS = [
  { key: 'table',  label: 'Table',  Icon: Table2 },
  { key: 'kanban', label: 'Kanban', Icon: KanbanSquare },
  { key: 'gantt',  label: 'Gantt',  Icon: Calendar },
];

export default function TicketsPage() {
  const { id: routeId } = useParams(); // /tickets/:id → pre-open drawer

  const [view, setView] = useState('kanban');
  const [selectedTicketId, setSelectedTicketId] = useState(routeId ? Number(routeId) : null);
  const [showNew, setShowNew] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  function bump() { setReloadKey(k => k + 1); }
  function handleOpen(id) { setSelectedTicketId(id); }
  function handleCloseDrawer() { setSelectedTicketId(null); }
  function handleChanged() { bump(); }
  function handleCreated() { setShowNew(false); bump(); }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <KanbanSquare size={22} className="text-accent-400" />
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">Tickets</h1>
            <p className="text-xs text-zinc-500">Agent findings, bugs, and action items</p>
          </div>
        </div>

        {/* View toggle + new button */}
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg glass overflow-hidden border border-zinc-800">
            {VIEWS.map(v => {
              const active = view === v.key;
              const Icon = v.Icon;
              return (
                <button
                  key={v.key}
                  onClick={() => setView(v.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium transition-colors ${
                    active
                      ? 'bg-accent-400/15 text-accent-300'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60'
                  }`}
                >
                  <Icon size={13} />
                  {v.label}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-accent-400/20 border border-accent-400/30 text-accent-300 hover:bg-accent-400/30 transition-colors font-medium"
          >
            <Plus size={14} />
            New
          </button>
        </div>
      </div>

      {/* View body */}
      {view === 'kanban' && (
        <TicketBoard onOpen={handleOpen} reloadKey={reloadKey} />
      )}
      {view === 'table' && (
        <TicketTable onOpen={handleOpen} reloadKey={reloadKey} />
      )}
      {view === 'gantt' && (
        <TicketGantt onOpen={handleOpen} reloadKey={reloadKey} />
      )}

      {/* Ticket drawer */}
      {selectedTicketId != null && (
        <TicketDrawer
          ticketId={selectedTicketId}
          onClose={handleCloseDrawer}
          onChanged={handleChanged}
        />
      )}

      {/* New ticket modal */}
      {showNew && (
        <NewTicketModal
          onClose={() => setShowNew(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
