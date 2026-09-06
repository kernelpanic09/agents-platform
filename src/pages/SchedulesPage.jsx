import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Plus, Play, Pause, Trash2, Ticket } from 'lucide-react';
import AgentAvatar from '../components/AgentAvatar';
import ScheduleModal from '../components/ScheduleModal';
import StatusBadge from '../components/StatusBadge';

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'paused', label: 'Paused' },
  { id: 'completed', label: 'Completed' },
];

function StatusDot({ status }) {
  const colors = {
    active: 'bg-green-500',
    paused: 'bg-yellow-500',
    completed: 'bg-zinc-500',
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status] || 'bg-zinc-600'}`} />;
}


function formatNext(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = d.getTime() - Date.now();
  const mins = Math.round(diff / 60000);
  if (mins < 0) return 'soon';
  if (mins < 60) return `in ${mins}m`;
  if (mins < 60 * 24) return `in ${Math.round(mins / 60)}h`;
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [agentsById, setAgentsById] = useState({});
  const [schedulerStats, setSchedulerStats] = useState(null);

  const loadSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const [schedRes, agentsRes, statsRes] = await Promise.all([
        fetch('/api/schedules').then(r => r.json()),
        fetch('/api/agents').then(r => r.json()),
        fetch('/api/schedules/_/stats').then(r => r.json()).catch(() => null),
      ]);
      setSchedules(schedRes);
      const map = {};
      for (const a of agentsRes) map[a.id] = a;
      setAgentsById(map);
      setSchedulerStats(statsRes);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSchedules(); }, [loadSchedules]);

  const filtered = filter === 'all' ? schedules : schedules.filter(s => s.status === filter);

  const runNow = async (id) => {
    try {
      const res = await fetch(`/api/schedules/${id}/run`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      loadSchedules();
    } catch (err) {
      alert(`Run failed: ${err.message}`);
    }
  };

  const togglePause = async (s) => {
    const action = s.status === 'paused' ? 'resume' : 'pause';
    await fetch(`/api/schedules/${s.id}/${action}`, { method: 'POST' });
    loadSchedules();
  };

  const del = async (s) => {
    let message;
    if (s.status === 'completed') {
      message = `Permanently delete "${s.name}" and its run history?`;
    } else if (s.last_run_id) {
      message = `Delete "${s.name}"? It will be marked completed and its run history preserved. Delete again to remove permanently.`;
    } else {
      message = `Delete "${s.name}"?`;
    }
    if (!confirm(message)) return;
    const res = await fetch(`/api/schedules/${s.id}`, { method: 'DELETE' });
    if (!res.ok) {
      alert('Delete failed');
      return;
    }
    loadSchedules();
  };

  return (
    <div className="animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Calendar size={22} className="text-violet-400" />
          <h1 className="text-2xl font-bold">Schedules</h1>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors"
        >
          <Plus size={14} />
          New Schedule
        </button>
      </div>

      {/* Scheduler banner */}
      {schedulerStats && !schedulerStats.enabled && (
        <div className="bg-yellow-950/30 border border-yellow-900/50 rounded-xl px-4 py-2.5 text-sm text-yellow-300 mb-4">
          Scheduler is idle (ENABLE_SCHEDULER is not set). You can manage schedules, but they will not fire.
        </div>
      )}

      {/* Filter pills */}
      <div className="flex items-center gap-2 mb-6">
        {STATUS_FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`text-sm px-3 py-1.5 rounded-full transition-colors ${
              filter === f.id
                ? 'bg-violet-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
            }`}
          >
            {f.label}
          </button>
        ))}
        <Link
          to="/runs"
          className="ml-auto text-sm px-3 py-1.5 rounded-full text-zinc-400 hover:text-white transition-colors"
        >
          View all runs →
        </Link>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-zinc-700 border-t-violet-500 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <Calendar size={32} className="text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400 mb-4">
            {filter === 'all' ? 'No schedules yet.' : `No ${filter} schedules.`}
          </p>
          {filter === 'all' ? (
            <button
              onClick={() => setModalOpen(true)}
              className="text-sm text-teal-400 hover:text-teal-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 rounded px-1"
            >
              Create your first schedule →
            </button>
          ) : (
            <button
              onClick={() => setFilter('all')}
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Show all schedules
            </button>
          )}
        </div>
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-white/5 text-xs text-zinc-500 uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Mode</th>
                <th className="text-left px-4 py-3 font-medium">Agents</th>
                <th className="text-left px-4 py-3 font-medium">Next run</th>
                <th className="text-left px-4 py-3 font-medium">Last run</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const agents = (s.agent_ids || []).map(id => agentsById[id]).filter(Boolean);
                const isCompleted = s.status === 'completed';
                return (
                  <tr
                    key={s.id}
                    className={`border-b border-white/5 last:border-0 transition-colors hover:bg-teal-500/[0.04] ${isCompleted ? 'opacity-60' : ''} ${s.last_run_status === 'running' || s.last_run_status === 'queued' ? 'bg-teal-500/[0.05]' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <Link to={`/schedules/${s.id}`} className="flex items-center gap-2 text-zinc-200 hover:text-white">
                        <StatusDot status={s.status} />
                        <span className="font-medium">{s.name}</span>
                        {!!s.works_tickets && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/25 text-violet-300 text-[10px] font-medium"
                            title="Offers up to 3 in-progress tickets to each run"
                          >
                            <Ticket size={9} /> tickets
                          </span>
                        )}
                      </Link>
                      {s.description && (
                        <div className="text-xs text-zinc-500 mt-0.5 pl-4">{s.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{s.mode}</td>
                    <td className="px-4 py-3">
                      <div className="flex -space-x-2">
                        {agents.slice(0, 5).map(a => (
                          <div
                            key={a.id}
                            title={a.name}
                            className="w-7 h-7 rounded-full border-2 border-zinc-950 bg-zinc-900 flex items-center justify-center"
                            style={{ borderColor: '#09090B' }}
                          >
                            <AgentAvatar iconId={a.icon_id} color={a.color} size={22} />
                          </div>
                        ))}
                        {agents.length > 5 && (
                          <div className="w-7 h-7 rounded-full border-2 border-zinc-950 bg-zinc-800 text-[10px] text-zinc-400 flex items-center justify-center">
                            +{agents.length - 5}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">
                      {s.status === 'active' ? formatNext(s.next_run_at) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {s.last_run_id ? (
                        <Link to={`/schedules/runs/${s.last_run_id}`} className="hover:underline">
                          <StatusBadge status={s.last_run_status} />
                        </Link>
                      ) : <StatusBadge status={null} />}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {!isCompleted && (
                          <>
                            <button
                              onClick={() => runNow(s.id)}
                              title="Run now"
                              aria-label={`Run ${s.name} now`}
                              className="p-1.5 rounded text-zinc-400 hover:text-green-400 hover:bg-green-400/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
                            >
                              <Play size={14} />
                            </button>
                            <button
                              onClick={() => togglePause(s)}
                              title={s.status === 'paused' ? 'Resume' : 'Pause'}
                              aria-label={s.status === 'paused' ? `Resume ${s.name}` : `Pause ${s.name}`}
                              className="p-1.5 rounded text-zinc-400 hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
                            >
                              <Pause size={14} />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => del(s)}
                          title={isCompleted ? 'Permanently delete' : 'Delete'}
                          aria-label={`Delete ${s.name}`}
                          className="p-1.5 rounded text-zinc-400 hover:text-red-400 hover:bg-red-400/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <ScheduleModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => { setModalOpen(false); loadSchedules(); }}
      />
    </div>
  );
}
