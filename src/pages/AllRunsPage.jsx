import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { History, ArrowLeft } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import VerdictBadge from '../components/VerdictBadge';

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'success', label: 'Success' },
  { id: 'failed', label: 'Failed' },
  { id: 'timeout', label: 'Timeout' },
  { id: 'running', label: 'Running' },
  { id: 'queued', label: 'Queued' },
  { id: 'pending_approval', label: 'Needs approval' },
];

function formatDuration(ms) {
  if (!ms && ms !== 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}m${s}s`;
}

function relativeTime(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function AllRunsPage() {
  const [runs, setRuns] = useState([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = filter === 'all' ? '' : `?status=${filter}`;
    const body = await fetch(`/api/runs${qs}`).then(r => r.json());
    setRuns(body.data || []);
    setTotal(body.total || 0);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);
  // Auto-refresh while any run is queued/running
  useEffect(() => {
    const anyActive = runs.some(r => r.status === 'running' || r.status === 'queued');
    if (!anyActive) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [runs, load]);

  return (
    <div className="animate-fade-in-up">
      <Link to="/schedules" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors mb-6">
        <ArrowLeft size={16} />
        Back to schedules
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <History size={22} className="text-violet-400" />
          <h1 className="text-2xl font-bold">Run History</h1>
          <span className="text-sm text-zinc-500">({total})</span>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-6 flex-wrap">
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
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-zinc-700 border-t-violet-500 rounded-full animate-spin" />
        </div>
      ) : runs.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <History size={32} className="text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400 mb-4">
            {filter === 'all' ? 'No runs yet.' : `No ${filter} runs.`}
          </p>
          {filter === 'all' ? (
            <Link
              to="/schedules"
              className="text-sm text-teal-400 hover:text-teal-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 rounded px-1"
            >
              Create a schedule →
            </Link>
          ) : (
            <button
              onClick={() => setFilter('all')}
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Show all runs
            </button>
          )}
        </div>
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-white/5 text-xs text-zinc-500 uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Schedule</th>
                <th className="text-left px-4 py-3 font-medium">Mode</th>
                <th className="text-left px-4 py-3 font-medium">Summary</th>
                <th className="text-left px-4 py-3 font-medium">Duration</th>
                <th className="text-right px-4 py-3 font-medium">Started</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(r => (
                <tr key={r.id} className={`border-b border-white/5 last:border-0 transition-colors hover:bg-teal-500/[0.04] ${r.status === 'running' || r.status === 'queued' ? 'bg-teal-500/[0.05]' : ''}`}>
                  <td className="px-4 py-3">
                    <Link to={`/schedules/runs/${r.id}`}>
                      <span className="inline-flex items-center gap-1.5"><StatusBadge status={r.status} /><VerdictBadge verdict={r.verdict} /></span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-200">
                    <Link to={`/schedules/runs/${r.id}`} className="hover:underline">
                      {r.schedule_name || `#${r.schedule_id}`}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">{r.mode}</td>
                  <td className="px-4 py-3 text-zinc-400 max-w-md">
                    <div className="truncate">{r.summary || r.error_message || '—'}</div>
                  </td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">{formatDuration(r.duration_ms)}</td>
                  <td className="px-4 py-3 text-zinc-500 text-xs text-right">{relativeTime(r.started_at || r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
