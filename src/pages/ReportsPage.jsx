import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Newspaper, Trash2, Loader2 } from 'lucide-react';
import VerdictBadge from '../components/VerdictBadge';

export function timeAgo(ts) {
  if (!ts) return '—';
  const iso = ts.includes('T') ? ts : ts.replace(' ', 'T');
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z');
  const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 90) return `${mins}m ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

export default function ReportsPage() {
  const [reports, setReports] = useState(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/reports').then(r => r.json()).catch(() => []);
    setReports(Array.isArray(res) ? res : []);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  const del = async (e, r) => {
    e.preventDefault();
    if (!confirm(`Delete report "${r.name}" and its build history? The member schedules are not affected.`)) return;
    await fetch(`/api/reports/${r.id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="animate-fade-in-up">
      <div className="flex items-center gap-3 mb-6">
        <Newspaper size={22} className="text-violet-400" />
        <h1 className="text-2xl font-bold">Reports</h1>
        <span className="text-sm text-zinc-500">combined briefings synthesized from schedule findings</span>
      </div>

      {reports === null ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-zinc-700 border-t-violet-500 rounded-full animate-spin" />
        </div>
      ) : reports.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <Newspaper size={32} className="text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400 mb-2">No combined reports yet.</p>
          <p className="text-sm text-zinc-500 mb-4">Select schedules on the Schedules page and hit "Combine into report".</p>
          <Link to="/schedules" className="text-sm text-violet-400 hover:text-violet-300">Go to Schedules →</Link>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {reports.map(r => (
            <Link key={r.id} to={`/reports/${r.slug}`} className="group glass rounded-2xl p-5 hover:border-violet-500/30 border border-transparent transition-colors">
              <div className="flex items-start justify-between gap-3 mb-2">
                <h2 className="font-semibold text-lg leading-tight">{r.name}</h2>
                <div className="flex items-center gap-2 shrink-0">
                  {r.building && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/25 text-violet-300">
                      <Loader2 size={10} className="animate-spin" /> building
                    </span>
                  )}
                  {r.latest?.overall_verdict && <VerdictBadge verdict={r.latest.overall_verdict} />}
                  <button onClick={(e) => del(e, r)} className="p-1 rounded text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity" aria-label={`Delete ${r.name}`}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              {r.latest?.headline && <p className="text-sm text-zinc-400 mb-3 line-clamp-2">{r.latest.headline}</p>}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {r.members.map(m => (
                  <span key={m.schedule_id} className="px-2 py-0.5 rounded-full bg-zinc-800/80 border border-white/10 text-[11px] text-zinc-400">{m.name}</span>
                ))}
              </div>
              <div className="text-xs text-zinc-500">
                {r.latest ? `built ${timeAgo(r.latest.built_at)}` : r.last_build_status === 'failed' ? 'last build failed' : 'no build yet'}
                {r.last_build_status === 'failed' && r.latest && <span className="text-amber-400/80"> · last rebuild failed</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
