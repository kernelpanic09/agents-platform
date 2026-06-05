import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Waypoints, Plus, Trash2, Save, Play, Loader2, ArrowLeft, CheckCircle, AlertTriangle } from 'lucide-react';
import PipelineGraph from '../components/PipelineGraph';
import StatusBadge from '../components/StatusBadge';

let _uid = 0;
const newNodeId = () => `n${Date.now().toString(36)}${(_uid++).toString(36)}`;

export default function PipelineDetailPage() {
  const { id } = useParams();
  const [pipeline, setPipeline] = useState(null);
  const [agents, setAgents] = useState([]);
  const [graph, setGraph] = useState({ nodes: [], edges: [] });
  const [validation, setValidation] = useState({ ok: true, errors: [] });
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [task, setTask] = useState('');
  const [runId, setRunId] = useState(null);
  const [nodeStates, setNodeStates] = useState({});
  const [events, setEvents] = useState([]);
  const [runStatus, setRunStatus] = useState(null);
  const [history, setHistory] = useState([]);
  const esRef = useRef(null);

  const agentName = useCallback((aid) => agents.find(a => a.id === aid)?.name || `Agent ${aid}`, [agents]);

  const load = useCallback(async () => {
    const [p, ag, runs] = await Promise.all([
      fetch(`/api/pipelines/${id}`).then(r => r.json()),
      fetch('/api/agents').then(r => r.json()),
      fetch(`/api/pipelines/${id}/runs`).then(r => r.json()).catch(() => []),
    ]);
    setPipeline(p);
    setAgents(ag);
    setGraph(p.graph && p.graph.nodes ? p.graph : { nodes: [], edges: [] });
    setTask(p.description || '');
    setHistory(runs);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  // Re-validate on every edit via the server (single source of truth).
  useEffect(() => {
    if (graph.nodes.length === 0) { setValidation({ ok: false, errors: ['Pipeline has no nodes.'] }); return; }
    const t = setTimeout(() => {
      fetch(`/api/pipelines/${id}/validate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ graph }),
      }).then(r => r.json()).then(setValidation).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [graph, id]);

  useEffect(() => () => { if (esRef.current) esRef.current.close(); }, []);

  // --- builder mutations ---
  const addNode = () => {
    const first = agents[0];
    if (!first) return;
    const node = { id: newNodeId(), agent_id: first.id, label: first.name, model: '' };
    setGraph(g => ({ ...g, nodes: [...g.nodes, node] })); setDirty(true);
  };
  const updateNode = (nid, patch) => {
    setGraph(g => ({ ...g, nodes: g.nodes.map(n => n.id === nid ? { ...n, ...patch } : n) })); setDirty(true);
  };
  const removeNode = (nid) => {
    setGraph(g => ({ nodes: g.nodes.filter(n => n.id !== nid), edges: g.edges.filter(e => e.from !== nid && e.to !== nid) })); setDirty(true);
  };
  const addEdge = () => {
    if (graph.nodes.length < 2) return;
    setGraph(g => ({ ...g, edges: [...g.edges, { from: g.nodes[0].id, to: g.nodes[1].id, condition: '' }] })); setDirty(true);
  };
  const updateEdge = (i, patch) => {
    setGraph(g => ({ ...g, edges: g.edges.map((e, idx) => idx === i ? { ...e, ...patch } : e) })); setDirty(true);
  };
  const removeEdge = (i) => { setGraph(g => ({ ...g, edges: g.edges.filter((_, idx) => idx !== i) })); setDirty(true); };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/pipelines/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: pipeline.name, description: pipeline.description, graph }),
      });
      if (res.ok) setDirty(false);
    } finally { setSaving(false); }
  };

  // Cron scheduling for the pipeline (manual | active | paused)
  const saveScheduling = async (patch) => {
    const res = await fetch(`/api/pipelines/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) setPipeline(await res.json());
    else alert((await res.json().catch(() => ({}))).error || 'Save failed');
  };

  // --- run + live overlay ---
  const run = async () => {
    if (dirty) await save();
    const res = await fetch(`/api/pipelines/${id}/run`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task }),
    });
    const body = await res.json();
    if (!res.ok) { alert(body.error + (body.details ? `\n- ${body.details.join('\n- ')}` : '')); return; }
    openStream(body.run_id, true);
    fetch(`/api/pipelines/${id}/runs`).then(r => r.json()).then(setHistory).catch(() => {});
  };

  const openStream = (rid, reset) => {
    if (esRef.current) esRef.current.close();
    setRunId(rid);
    if (reset) { setEvents([]); setRunStatus('running'); }
    const init = {};
    graph.nodes.forEach(n => { init[n.id] = { status: 'pending', label: n.label }; });
    if (reset) setNodeStates(init);

    const es = new EventSource(`/api/pipelines/runs/${rid}/stream`);
    esRef.current = es;
    es.onmessage = (m) => {
      let ev; try { ev = JSON.parse(m.data); } catch { return; }
      setEvents(prev => [...prev, ev]);
      if (ev.type === 'replay' && ev.node_states) setNodeStates(ev.node_states);
      if (ev.type === 'run_start') {
        const s = {}; (ev.nodes || []).forEach(n => { s[n.id] = { status: 'pending', label: n.label }; }); setNodeStates(s);
      }
      if (ev.type === 'agent_start' && ev.node) setNodeStates(p => ({ ...p, [ev.node]: { ...p[ev.node], status: 'running' } }));
      if (ev.type === 'agent_done' && ev.node) setNodeStates(p => ({ ...p, [ev.node]: { ...p[ev.node], status: ev.status, summary: ev.summary } }));
      if (ev.type === 'done') { setRunStatus(ev.status); es.close(); }
    };
    es.onerror = () => { es.close(); };
  };

  const viewRun = async (rid) => {
    const r = await fetch(`/api/pipelines/runs/${rid}`).then(r => r.json());
    setNodeStates(r.node_states || {});
    setRunStatus(r.status);
    setRunId(rid);
    if (['success', 'failed', 'timeout'].includes(r.status)) { if (esRef.current) esRef.current.close(); }
    else openStream(rid, false);
  };

  if (!pipeline) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-zinc-600" /></div>;

  const nodeLabel = (nid) => graph.nodes.find(n => n.id === nid)?.label || nid;

  return (
    <div className="max-w-6xl mx-auto">
      <Link to="/pipelines" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 mb-4"><ArrowLeft size={14} /> Pipelines</Link>

      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3 min-w-0">
          <Waypoints size={22} className="text-violet-400 shrink-0" />
          <input value={pipeline.name} onChange={e => { setPipeline(p => ({ ...p, name: e.target.value })); setDirty(true); }}
            className="bg-transparent text-xl font-semibold text-white focus:outline-none border-b border-transparent focus:border-violet-500 min-w-0" />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={save} disabled={saving || !dirty}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-40 text-sm text-zinc-200 transition-colors">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {dirty ? 'Save' : 'Saved'}
          </button>
        </div>
      </div>

      {/* Graph preview / live overlay */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-zinc-300">{runId ? `Run #${runId}` : 'Graph'}</h3>
          {runStatus && <StatusBadge status={runStatus === 'success' || runStatus === 'failed' || runStatus === 'timeout' ? runStatus : 'running'} />}
        </div>
        <PipelineGraph graph={graph} nodeStates={nodeStates} />
      </div>

      {/* Validation */}
      <div className={`mb-5 flex items-start gap-2 text-sm px-3 py-2 rounded-lg border ${validation.ok ? 'bg-green-500/5 border-green-500/20 text-green-300' : 'bg-orange-500/5 border-orange-500/20 text-orange-300'}`}>
        {validation.ok ? <CheckCircle size={15} className="mt-0.5" /> : <AlertTriangle size={15} className="mt-0.5" />}
        <div>{validation.ok ? 'Valid DAG — ready to run.' : (validation.errors || []).join(' ')}</div>
      </div>

      {/* Run */}
      <div className="mb-6 p-4 rounded-xl glass border border-white/10">
        <h3 className="text-sm font-medium text-zinc-300 mb-2">Run pipeline</h3>
        <textarea value={task} onChange={e => setTask(e.target.value)} rows={2} placeholder="Task prompt fed to the start node(s)…"
          className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500 resize-y" />
        <button onClick={run} disabled={!validation.ok}
          className="mt-2 flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-sm text-white font-medium transition-colors">
          <Play size={14} /> Run
        </button>
      </div>

      {/* Scheduling */}
      <div className="mb-6 p-4 rounded-xl glass border border-white/10">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-sm font-medium text-zinc-300 shrink-0">Schedule</h3>
          <input
            value={pipeline.cron_expression || ''}
            onChange={e => setPipeline(p => ({ ...p, cron_expression: e.target.value }))}
            onBlur={e => saveScheduling({ cron_expression: e.target.value || null })}
            placeholder="cron, e.g. 0 7 * * 1-5"
            className="w-44 px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/10 text-sm font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500"
          />
          <div className="flex rounded-lg overflow-hidden border border-white/10">
            {['manual', 'active', 'paused'].map(st => (
              <button key={st} onClick={() => saveScheduling({ schedule_status: st })}
                className={`px-3 py-1.5 text-xs capitalize transition-colors ${pipeline.schedule_status === st ? 'bg-violet-600/30 text-violet-100' : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'}`}>
                {st}
              </button>
            ))}
          </div>
          <span className="text-xs text-zinc-600">
            {pipeline.schedule_status === 'active' && pipeline.next_run_at
              ? `next run ${new Date(pipeline.next_run_at).toLocaleString()}`
              : pipeline.schedule_status === 'active'
              ? 'cron required to activate'
              : 'fires only on Run or webhook'}
          </span>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Nodes */}
        <div className="p-4 rounded-xl glass border border-white/10">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-zinc-300">Nodes</h3>
            <button onClick={addNode} disabled={!agents.length} className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-violet-600/20 text-violet-200 hover:bg-violet-600/30 transition-colors"><Plus size={12} /> Add</button>
          </div>
          <div className="space-y-2">
            {graph.nodes.length === 0 && <div className="text-xs text-zinc-600">No nodes. Add an agent to start.</div>}
            {graph.nodes.map(n => (
              <div key={n.id} className="flex items-center gap-2 p-2 rounded-lg bg-black/20 border border-white/5">
                <select value={n.agent_id} onChange={e => { const aid = Number(e.target.value); updateNode(n.id, { agent_id: aid, label: agentName(aid) }); }}
                  className="flex-1 px-2 py-1 rounded bg-zinc-900 border border-white/10 text-xs text-zinc-200">
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name} — {a.title}</option>)}
                </select>
                <select value={n.model || ''} onChange={e => updateNode(n.id, { model: e.target.value })}
                  className="px-2 py-1 rounded bg-zinc-900 border border-white/10 text-xs text-zinc-400" title="Model override">
                  <option value="">default</option>
                  <option value="haiku">haiku</option>
                  <option value="sonnet">sonnet</option>
                  <option value="opus">opus</option>
                </select>
                <button onClick={() => removeNode(n.id)} className="p-1 text-zinc-500 hover:text-red-300"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        </div>

        {/* Edges */}
        <div className="p-4 rounded-xl glass border border-white/10">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-zinc-300">Edges <span className="text-zinc-600 font-normal">(condition routes on prior output)</span></h3>
            <button onClick={addEdge} disabled={graph.nodes.length < 2} className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-violet-600/20 text-violet-200 hover:bg-violet-600/30 disabled:opacity-40 transition-colors"><Plus size={12} /> Add</button>
          </div>
          <div className="space-y-2">
            {graph.edges.length === 0 && <div className="text-xs text-zinc-600">No edges — each node is a leaf. Add edges to route between agents.</div>}
            {graph.edges.map((e, i) => (
              <div key={i} className="p-2 rounded-lg bg-black/20 border border-white/5 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <select value={e.from} onChange={ev => updateEdge(i, { from: ev.target.value })} className="flex-1 px-2 py-1 rounded bg-zinc-900 border border-white/10 text-xs text-zinc-200">
                    {graph.nodes.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
                  </select>
                  <span className="text-zinc-600 text-xs">→</span>
                  <select value={e.to} onChange={ev => updateEdge(i, { to: ev.target.value })} className="flex-1 px-2 py-1 rounded bg-zinc-900 border border-white/10 text-xs text-zinc-200">
                    {graph.nodes.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
                  </select>
                  <button onClick={() => removeEdge(i)} className="p-1 text-zinc-500 hover:text-red-300"><Trash2 size={13} /></button>
                </div>
                <input value={e.condition || ''} onChange={ev => updateEdge(i, { condition: ev.target.value })}
                  placeholder="condition (blank = always), e.g. verdict === 'critical' or output.includes('OOM')"
                  className="w-full px-2 py-1 rounded bg-zinc-900 border border-white/10 text-xs font-mono text-violet-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Event log + history */}
      <div className="grid md:grid-cols-2 gap-5 mt-5">
        {events.length > 0 && (
          <div className="p-4 rounded-xl glass border border-white/10">
            <h3 className="text-sm font-medium text-zinc-300 mb-2">Live events</h3>
            <div className="space-y-1 max-h-56 overflow-auto font-mono text-xs">
              {events.map((ev, i) => (
                <div key={i} className="text-zinc-400">
                  <span className="text-zinc-600">{ev.type}</span>
                  {ev.node && <span className="text-violet-300"> {nodeLabel(ev.node)}</span>}
                  {ev.status && <span className={ev.status === 'success' ? ' text-green-400' : ' text-red-400'}> {ev.status}</span>}
                  {ev.summary && <span className="text-zinc-500"> — {ev.summary.slice(0, 80)}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="p-4 rounded-xl glass border border-white/10">
          <h3 className="text-sm font-medium text-zinc-300 mb-2">Run history</h3>
          <div className="space-y-1 max-h-56 overflow-auto">
            {history.length === 0 && <div className="text-xs text-zinc-600">No runs yet.</div>}
            {history.map(r => (
              <button key={r.id} onClick={() => viewRun(r.id)} className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 text-left transition-colors">
                <span className="text-xs text-zinc-400 truncate">#{r.id} · {r.task?.slice(0, 40)}</span>
                <StatusBadge status={['success', 'failed', 'timeout'].includes(r.status) ? r.status : 'running'} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
