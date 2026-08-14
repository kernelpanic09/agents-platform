import { useState } from 'react';
import { X } from 'lucide-react';
import { createTicket } from '../../lib/ticketsApi';
import { PRIORITIES, SIZES, TYPES } from './ticketMeta';

export default function NewTicketModal({ onClose, onCreated }) {
  const [fields, setFields] = useState({
    title: '',
    description: '',
    priority: 'medium',
    size: '',
    type: 'task',
    assignee: '',
    start_date: '',
    due_date: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function set(k, v) {
    setFields(f => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!fields.title.trim()) { setError('Title is required'); return; }
    setSubmitting(true);
    setError('');
    try {
      const body = {
        title:       fields.title.trim(),
        description: fields.description,
        priority:    fields.priority,
        type:        fields.type,
        assignee:    fields.assignee.trim() || null,
        size:        fields.size || null,
        start_date:  fields.start_date || null,
        due_date:    fields.due_date || null,
      };
      const ticket = await createTicket(body);
      onCreated(ticket);
    } catch (err) {
      setError(err.message || 'Failed to create ticket');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="relative w-full max-w-lg bg-surface-raised border border-zinc-800 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800">
          <span className="text-sm font-semibold text-zinc-200">New Ticket</span>
          <button onClick={onClose} className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-1.5">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              autoFocus
              value={fields.title}
              onChange={e => set('title', e.target.value)}
              placeholder="Short, actionable description"
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-accent-400 outline-none transition-colors"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-1.5">Description</label>
            <textarea
              value={fields.description}
              onChange={e => set('description', e.target.value)}
              rows={3}
              placeholder="Context, steps to reproduce, links…"
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600 focus:border-accent-400 outline-none resize-none transition-colors"
            />
          </div>

          {/* Priority / Type / Size row */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-1.5">Priority</label>
              <select
                value={fields.priority}
                onChange={e => set('priority', e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:border-accent-400 outline-none"
              >
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-1.5">Type</label>
              <select
                value={fields.type}
                onChange={e => set('type', e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:border-accent-400 outline-none"
              >
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-1.5">Size</label>
              <select
                value={fields.size}
                onChange={e => set('size', e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:border-accent-400 outline-none"
              >
                <option value="">—</option>
                {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Assignee */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-1.5">Assignee</label>
            <input
              value={fields.assignee}
              onChange={e => set('assignee', e.target.value)}
              placeholder="Agent name or person"
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-accent-400 outline-none transition-colors"
            />
          </div>

          {/* Dates row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-1.5">Start date</label>
              <input
                type="date"
                value={fields.start_date}
                onChange={e => set('start_date', e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:border-accent-400 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-1.5">Due date</label>
              <input
                type="date"
                value={fields.due_date}
                onChange={e => set('due_date', e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:border-accent-400 outline-none transition-colors"
              />
            </div>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !fields.title.trim()}
              className="px-4 py-1.5 text-sm rounded bg-accent-400 text-white font-medium hover:bg-accent-500 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
