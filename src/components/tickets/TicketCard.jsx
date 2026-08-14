import { PRIORITY_CLS, TYPE_LABEL } from './ticketMeta';

export default function TicketCard({ ticket, onOpen }) {
  const priCls = PRIORITY_CLS[ticket.priority] || PRIORITY_CLS.low;

  function handleDragStart(e) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/ticket', String(ticket.id));
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={() => onOpen(ticket.id)}
      className="glass rounded-lg p-3 cursor-pointer hover:bg-zinc-800/60 transition-colors select-none"
    >
      {/* top row: key + priority chip */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="font-mono text-[10px] text-zinc-500 shrink-0">{ticket.key}</span>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border leading-none capitalize ${priCls}`}>
          {ticket.priority}
        </span>
      </div>

      {/* title — 2-line clamp */}
      <p className="text-[13px] text-zinc-100 leading-snug line-clamp-2 mb-2">{ticket.title}</p>

      {/* footer: type, size, assignee */}
      <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
        <span className="text-zinc-600">{TYPE_LABEL[ticket.type] || ticket.type}</span>
        {ticket.size && (
          <>
            <span className="text-zinc-700">·</span>
            <span className="font-mono">{ticket.size}</span>
          </>
        )}
        {ticket.assignee && (
          <span className="ml-auto text-zinc-400 truncate max-w-[80px]" title={ticket.assignee}>
            {ticket.assignee}
          </span>
        )}
      </div>
    </div>
  );
}
