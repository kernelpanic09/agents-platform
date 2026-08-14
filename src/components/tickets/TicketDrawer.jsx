import { useState, useEffect, useRef } from 'react';
import { X, Trash2, RotateCcw, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getTicket, patchTicket, commentTicket, deleteTicket } from '../../lib/ticketsApi';
import { PRIORITY_CLS, PRIORITIES, SIZES, TYPES, STATUSES } from './ticketMeta';

const STATUS_LABELS = {
  backlog: 'Backlog', triaged: 'Triaged', in_progress: 'In Progress',
  in_review: 'In Review', done: 'Done',
};

function relTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts + 'Z').getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function EventRow({ ev }) {
  const label = {
    created:         '✦ Created',
    status_change:   `Status → ${ev.to_value?.replace(/_/g, ' ')}`,
    priority_change: `Priority → ${ev.to_value}`,
    assigned:        `Assigned → ${ev.to_value || 'unassigned'}`,
    occurrence:      '↑ Recurred',
    comment:         `💬 ${ev.actor}`,
  }[ev.event_type] || ev.event_type;

  return (
    <div className="flex items-start gap-2 text-[11px]">
      <span className="text-zinc-600 shrink-0 mt-0.5 w-20 text-right">{relTime(ev.created_at)}</span>
      <div className="flex-1 min-w-0">
        <span className="text-zinc-400">{label}</span>
        {ev.note && <p className="text-zinc-500 mt-0.5 text-[11px] whitespace-pre-wrap">{ev.note}</p>}
      </div>
    </div>
  );
}

function ProvenanceLine({ ticket }) {
  if (!ticket?.source_type || ticket.source_type === 'manual') return null;
  const ref = ticket.source_ref || {};

  if (ticket.source_type === 'critical_verdict') {
    return (
      <div className="text-[11px] text-zinc-500 flex items-center gap-1">
        <span className="text-red-400 font-medium">CRITICAL</span>
        <span>verdict ·</span>
        {ref.run_id ? (
          <Link to={`/schedules/runs/${ref.run_id}`} className="text-accent-400 hover:underline">
            run #{ref.run_id}
          </Link>
        ) : (
          <span>schedule #{ref.schedule_id}</span>
        )}
      </div>
    );
  }

  if (ticket.source_type === 'report_action_item') {
    return (
      <div className="text-[11px] text-zinc-500">
        Promoted from report · <span className="text-accent-400">{ref.item_key}</span>
      </div>
    );
  }

  if (ticket.source_type === 'agent') {
    return <div className="text-[11px] text-zinc-500">Filed by agent</div>;
  }

  return null;
}

export default function TicketDrawer({ ticketId, onClose, onChanged }) {
  const [ticket, setTicket] = useState(null);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const drawerRef = useRef(null);

  async function load() {
    if (!ticketId) return;
    try {
      const t = await getTicket(ticketId);
      setTicket(t);
    } catch { /* ignore */ }
  }

  useEffect(() => { load(); }, [ticketId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  async function patch(field, value) {
    if (!ticket) return;
    try {
      const updated = await patchTicket(ticket.id, { [field]: value });
      setTicket(updated);
      onChanged();
    } catch { /* ignore */ }
  }

  async function handleBlurField(field, value) {
    if (!ticket || String(ticket[field] ?? '') === String(value ?? '')) return;
    await patch(field, value);
  }

  async function sendComment() {
    if (!comment.trim() || !ticket) return;
    setSending(true);
    try {
      const updated = await commentTicket(ticket.id, comment.trim());
      setTicket(updated);
      setComment('');
      onChanged();
    } finally { setSending(false); }
  }

  async function handleReopen() {
    await patch('status', 'triaged');
  }

  async function handleDelete() {
    if (!ticket) return;
    if (!window.confirm(`Delete ${ticket.key}? This cannot be undone.`)) return;
    await deleteTicket(ticket.id);
    onChanged();
    onClose();
  }

  const isDone = ticket?.status === 'done';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        className="fixed inset-y-0 right-0 z-50 w-full max-w-lg flex flex-col bg-surface-raised border-l border-zinc-800 shadow-2xl overflow-hidden animate-fade-in-up"
        style={{ animationDuration: '0.2s' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 shrink-0">
          {ticket ? (
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-zinc-500">{ticket.key}</span>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border capitalize ${PRIORITY_CLS[ticket.priority] || ''}`}>
                {ticket.priority}
              </span>
            </div>
          ) : (
            <span className="text-sm text-zinc-600">Loading…</span>
          )}
          <button onClick={onClose} className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors">
            <X size={16} />
          </button>
        </div>

        {!ticket ? (
          <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">Loading…</div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {/* Provenance */}
            <ProvenanceLine ticket={ticket} />

            {/* Title (editable) */}
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-1">Title</label>
              <input
                key={ticket.id + '-title'}
                defaultValue={ticket.title}
                onBlur={e => handleBlurField('title', e.target.value)}
                className="w-full bg-transparent text-zinc-100 text-sm font-medium border-b border-zinc-700 focus:border-accent-400 outline-none pb-1 transition-colors"
              />
            </div>

            {/* Metadata grid */}
            <div className="grid grid-cols-2 gap-3">
              {/* Status */}
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-1">Status</label>
                <select
                  value={ticket.status}
                  onChange={e => patch('status', e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:border-accent-400 outline-none"
                >
                  {STATUSES.map(s => (
                    <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>
                  ))}
                </select>
              </div>

              {/* Priority */}
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-1">Priority</label>
                <select
                  value={ticket.priority}
                  onChange={e => patch('priority', e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:border-accent-400 outline-none"
                >
                  {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              {/* Size */}
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-1">Size</label>
                <select
                  value={ticket.size || ''}
                  onChange={e => patch('size', e.target.value || null)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:border-accent-400 outline-none"
                >
                  <option value="">—</option>
                  {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* Type */}
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-1">Type</label>
                <select
                  value={ticket.type}
                  onChange={e => patch('type', e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:border-accent-400 outline-none"
                >
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* Assignee */}
              <div className="col-span-2">
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-1">Assignee</label>
                <input
                  key={ticket.id + '-assignee'}
                  defaultValue={ticket.assignee || ''}
                  onBlur={e => handleBlurField('assignee', e.target.value || null)}
                  placeholder="Unassigned"
                  className="w-full bg-transparent text-zinc-200 text-sm border-b border-zinc-700 focus:border-accent-400 outline-none pb-1 transition-colors placeholder:text-zinc-700"
                />
              </div>
            </div>

            {/* Description (editable) */}
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-1">Description</label>
              <textarea
                key={ticket.id + '-desc'}
                defaultValue={ticket.description || ''}
                onBlur={e => handleBlurField('description', e.target.value)}
                rows={4}
                placeholder="Add description…"
                className="w-full bg-zinc-800/50 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-300 focus:border-accent-400 outline-none resize-none placeholder:text-zinc-700 transition-colors"
              />
            </div>

            {/* Activity log */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-2">Activity</div>
              <div className="space-y-2.5">
                {(ticket.events || []).slice().reverse().map(ev => (
                  <EventRow key={ev.id} ev={ev} />
                ))}
                {!ticket.events?.length && (
                  <span className="text-[11px] text-zinc-700">No events yet</span>
                )}
              </div>
            </div>

            {/* Comment box */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-2">Add comment</div>
              <div className="flex gap-2">
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendComment(); }}
                  rows={2}
                  placeholder="Write a comment… (⌘↵ to send)"
                  className="flex-1 bg-zinc-800/50 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-300 focus:border-accent-400 outline-none resize-none placeholder:text-zinc-700 transition-colors"
                />
                <button
                  onClick={sendComment}
                  disabled={!comment.trim() || sending}
                  className="self-end px-3 py-2 rounded bg-accent-400/20 border border-accent-400/30 text-accent-300 hover:bg-accent-400/30 transition-colors disabled:opacity-40"
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer actions */}
        {ticket && (
          <div className="px-5 py-3 border-t border-zinc-800 flex items-center gap-3 shrink-0">
            {isDone ? (
              <button
                onClick={handleReopen}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded border border-accent-400/30 text-accent-300 hover:bg-accent-400/10 transition-colors"
              >
                <RotateCcw size={13} /> Reopen
              </button>
            ) : (
              <button
                onClick={() => patch('status', 'done')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded border border-green-500/30 text-green-300 hover:bg-green-500/10 transition-colors"
              >
                ✓ Mark done
              </button>
            )}
            <button
              onClick={handleDelete}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-sm rounded border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 size={13} /> Delete
            </button>
          </div>
        )}
      </div>
    </>
  );
}
