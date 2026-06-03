import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, Play, Calendar, Trash2, Sparkles, Loader2 } from 'lucide-react';
import AgentAvatar from '../components/AgentAvatar';
import ScheduleModal from '../components/ScheduleModal';

const TOPOLOGIES = [
  { id: 'fan', label: 'Fan', blurb: 'all agents run in parallel' },
  { id: 'chain', label: 'Chain', blurb: 'sequential, each sees prior output' },
  { id: 'roundtable', label: 'Round-table', blurb: 'one meeting transcript, 3 rounds' },
];

// Compact SVG of a crew's topology, colored by member.
function CrewTopology({ topology, members }) {
  const cols = members.map(m => m.color || '#a78bfa');
  const W = 200, H = 56;
  if (topology === 'chain') {
    const n = members.length, gap = (W - 24) / Math.max(1, n - 1);
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: H }}>
        {members.slice(0, -1).map((_, i) => <line key={i} x1={12 + i * gap} y1={H / 2} x2={12 + (i + 1) * gap} y2={H / 2} stroke="#52525b" strokeWidth="1.5" />)}
        {members.map((m, i) => <circle key={i} cx={12 + i * gap} cy={H / 2} r="7" fill={cols[i]} />)}
      </svg>
    );
  }
  if (topology === 'roundtable') {
    const cx = W / 2, cy = H / 2, r = 20;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: H }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#52525b" strokeWidth="1.5" />
        {members.map((m, i) => {
          const a = (i / members.length) * Math.PI * 2 - Math.PI / 2;
          return <circle key={i} cx={cx + r * Math.cos(a)} cy={cy + r * Math.sin(a)} r="6" fill={cols[i]} />;
        })}
      </svg>
    );
  }
  // fan
  const hx = 20, hy = H / 2, n = members.length, gap = H / (n + 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: H }}>
      {members.map((_, i) => <line key={i} x1={hx} y1={hy} x2={W - 24} y2={gap * (i + 1)} stroke="#52525b" strokeWidth="1.5" />)}
      <circle cx={hx} cy={hy} r="8" fill="#a78bfa" />
      {members.map((m, i) => <circle key={i} cx={W - 24} cy={gap * (i + 1)} r="6" fill={cols[i]} />)}
    </svg>
  );
}

export default function CrewsPage() {
  const navigate = useNavigate();
  const [crews, setCrews] = useState([]);
  const [suggested, setSuggested] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scheduleAgents, setScheduleAgents] = useState(null);
  const [busy, setBusy] = useState(null);

  // create form
  const [name, setName] = useState('');
  const [topology, setTopology] = useState('fan');
  const [task, setTask] = useState('');
  const [picked, setPicked] = useState(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, s, a] = await Promise.all([
        fetch('/api/crews').then(r => r.json()),
        fetch('/api/crews/suggested').then(r => r.json()).catch(() => []),
        fetch('/api/agents').then(r => r.json()),
      ]);
      setCrews(c); setSuggested(s); setAgents(a);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const togglePick = (id) => setPicked(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const create = async () => {
    if (!name.trim() || picked.size < 2) return;
    await fetch('/api/crews', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, topology, task, agent_ids: [...picked] }),
    });
    setName(''); setTask(''); setPicked(new Set()); setTopology('fan');
    load();
  };

  const saveSuggested = async (s) => {
    await fetch('/api/crews', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: s.name, description: s.description, topology: s.topology, agent_ids: s.agent_ids, source: 'suggested' }),
    });
    load();
  };

  const runCrew = async (crew) => {
    setBusy(crew.id);
    try {
      const res = await fetch(`/api/crews/${crew.id}/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const body = await res.json();
      if (res.ok) navigate(`/schedules/runs/${body.run_id}`);
      else alert(body.error || 'Failed to run crew');
    } finally { setBusy(null); }
  };

  const remove = async (id) => {
    if (!confirm('Delete this crew?')) return;
    await fetch(`/api/crews/${id}`, { method: 'DELETE' });
    load();
  };

  const savedKeys = new Set(crews.map(c => [...c.agent_ids].sort((a, b) => a - b).join(',')));

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Users size={24} className="text-violet-400" />
        <div>
          <h1 className="text-xl font-semibold text-white">Crews</h1>
          <p className="text-sm text-zinc-500">Saved, reusable agent teams. Run or schedule a whole crew in one click.</p>
        </div>
      </div>

      {/* Create */}
      <div className="p-4 rounded-xl glass border border-white/10 mb-6">
        <h3 className="text-sm font-medium text-zinc-300 mb-3">New crew</h3>
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Crew name"
            className="flex-1 px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500" />
          <select value={topology} onChange={e => setTopology(e.target.value)} className="px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-sm text-zinc-300">
            {TOPOLOGIES.map(t => <option key={t.id} value={t.id}>{t.label} — {t.blurb}</option>)}
          </select>
        </div>
        <input value={task} onChange={e => setTask(e.target.value)} placeholder="Default task (optional)"
          className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500 mb-3" />
        <div className="text-xs text-zinc-500 mb-1">Members ({picked.size} selected, min 2)</div>
        <div className="flex flex-wrap gap-1.5 max-h-40 overflow-auto mb-3">
          {agents.map(a => (
            <button key={a.id} onClick={() => togglePick(a.id)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs transition-colors ${picked.has(a.id) ? 'border-violet-500 bg-violet-600/20 text-violet-100' : 'border-white/10 bg-black/20 text-zinc-400 hover:border-white/20'}`}>
              <AgentAvatar iconId={a.icon_id} color={a.color} size={16} /> {a.name}
            </button>
          ))}
        </div>
        <button onClick={create} disabled={!name.trim() || picked.size < 2}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-sm text-white font-medium transition-colors">
          <Plus size={14} /> Create crew
        </button>
      </div>

      {/* Your crews */}
      {loading && <div className="text-sm text-zinc-500">Loading…</div>}
      {!loading && crews.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-3 mb-8">
          {crews.map(c => (
            <div key={c.id} className="p-4 rounded-xl glass border border-white/10">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="font-medium text-zinc-100 truncate">{c.name}</div>
                  <div className="text-xs text-zinc-500 capitalize">{c.topology} · {c.members.length} agents</div>
                </div>
                <button onClick={() => remove(c.id)} className="p-1.5 rounded-lg text-zinc-500 hover:text-red-300 hover:bg-red-500/10 shrink-0"><Trash2 size={14} /></button>
              </div>
              <CrewTopology topology={c.topology} members={c.members} />
              <div className="flex flex-wrap gap-1 my-2">
                {c.members.map(m => <span key={m.id} className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: `${m.color}1a`, color: m.color }}>{m.name}</span>)}
              </div>
              <div className="flex gap-2 mt-2">
                <button onClick={() => runCrew(c)} disabled={busy === c.id}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-sm text-white font-medium transition-colors">
                  {busy === c.id ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Run
                </button>
                <button onClick={() => setScheduleAgents(c.members)}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-zinc-300 transition-colors">
                  <Calendar size={13} /> Schedule
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Suggested */}
      {suggested.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-teal-400" />
            <h2 className="text-sm font-medium text-zinc-300">Suggested crews <span className="text-zinc-600 font-normal">from the related-agents graph</span></h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {suggested.filter(s => !savedKeys.has([...s.agent_ids].sort((a, b) => a - b).join(','))).map((s, i) => (
              <div key={i} className="p-4 rounded-xl border border-dashed border-white/10 bg-black/10">
                <div className="font-medium text-zinc-200 mb-1">{s.name}</div>
                <div className="text-xs text-zinc-500 mb-2">{s.description}</div>
                <CrewTopology topology={s.topology} members={s.members} />
                <button onClick={() => saveSuggested(s)} className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-zinc-300 transition-colors">
                  <Plus size={13} /> Save crew
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <ScheduleModal
        open={!!scheduleAgents}
        onClose={() => setScheduleAgents(null)}
        onCreated={() => { setScheduleAgents(null); navigate('/schedules'); }}
        preselectedAgents={scheduleAgents || []}
      />
    </div>
  );
}
