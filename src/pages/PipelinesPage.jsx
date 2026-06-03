import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Waypoints, Plus, Trash2, Loader2 } from 'lucide-react';

function timeAgo(iso) {
  if (!iso) return 'never run';
  const diff = Date.now() - new Date(iso + 'Z').getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
}

export default function PipelinesPage() {
  const [pipelines, setPipelines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setPipelines(await fetch('/api/pipelines').then(r => r.json())); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await fetch('/api/pipelines', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      });
      setName(''); setDescription('');
      await load();
    } finally { setCreating(false); }
  };

  const remove = async (id) => {
    if (!confirm('Delete this pipeline and its run history?')) return;
    await fetch(`/api/pipelines/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <Waypoints size={24} className="text-violet-400" />
        <div>
          <h1 className="text-xl font-semibold text-white">Pipelines</h1>
          <p className="text-sm text-zinc-500">DAG orchestration — agents route to each other based on prior output, executed through LangGraph.</p>
        </div>
      </div>

      <div className="mt-6 p-4 rounded-xl glass border border-white/10">
        <h3 className="text-sm font-medium text-zinc-300 mb-3">New pipeline</h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Pipeline name (e.g. Incident Triage)"
            className="flex-1 px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500" />
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Default task / description (optional)"
            className="flex-1 px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500" />
          <button onClick={create} disabled={creating || !name.trim()}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-sm text-white font-medium transition-colors">
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create
          </button>
        </div>
      </div>

      <div className="mt-6 space-y-2">
        {loading && <div className="text-sm text-zinc-500">Loading…</div>}
        {!loading && pipelines.length === 0 && (
          <div className="text-sm text-zinc-600 text-center py-10 border border-dashed border-white/10 rounded-xl">
            No pipelines yet. Create one above, then add agent nodes and conditional edges.
          </div>
        )}
        {pipelines.map(p => (
          <div key={p.id} className="flex items-center gap-4 p-4 rounded-xl glass border border-white/10 hover:border-white/20 transition-colors">
            <Link to={`/pipelines/${p.id}`} className="flex-1 min-w-0">
              <div className="font-medium text-zinc-100 truncate">{p.name}</div>
              <div className="text-xs text-zinc-500 truncate">{p.description || 'No description'}</div>
              <div className="text-xs text-zinc-600 mt-1">
                {p.node_count} node{p.node_count === 1 ? '' : 's'} · {p.edge_count} edge{p.edge_count === 1 ? '' : 's'} · {timeAgo(p.last_run_at)}
              </div>
            </Link>
            <Link to={`/pipelines/${p.id}`} className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-zinc-300 transition-colors">Open</Link>
            <button onClick={() => remove(p.id)} className="p-2 rounded-lg text-zinc-500 hover:text-red-300 hover:bg-red-500/10 transition-colors" title="Delete">
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
