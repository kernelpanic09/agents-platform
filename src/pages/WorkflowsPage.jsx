import { useState, useEffect } from 'react';
import { GitBranch, Play, Loader2 } from 'lucide-react';
import GraphView from '../components/workflows/GraphView';

export default function WorkflowsPage() {
  const [types, setTypes] = useState([]);
  const [testTask, setTestTask] = useState('');
  const [routeResult, setRouteResult] = useState(null);
  const [routing, setRouting] = useState(false);
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState('');

  useEffect(() => {
    fetch('/api/workflows/types').then(r => r.json()).then(d => setTypes(d.types)).catch(() => {});
    fetch('/api/agents').then(r => r.json()).then(setAgents).catch(() => {});
  }, []);

  async function handleRoute() {
    if (!testTask.trim()) return;
    setRouting(true);
    try {
      const res = await fetch('/api/workflows/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: testTask, agent_id: selectedAgent || null }),
      });
      const data = await res.json();
      setRouteResult(data);
    } catch { setRouteResult({ error: 'Failed to route' }); }
    finally { setRouting(false); }
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="flex items-center gap-3 mb-6">
        <GitBranch size={24} className="text-orange-400" />
        <div>
          <h1 className="text-xl font-semibold text-white">Workflows</h1>
          <p className="text-sm text-zinc-500">LangGraph-powered task routing and execution</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-8">
        {types.map(t => (
          <div key={t.id} className="p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="text-sm font-medium text-zinc-200">{t.name}</div>
            <div className="text-xs text-zinc-500 mt-1">{t.description}</div>
          </div>
        ))}
      </div>

      <div className="p-4 rounded-lg mb-6" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 className="text-sm font-medium text-zinc-300 mb-3">Test Task Router</h3>
        <div className="space-y-3">
          <select value={selectedAgent} onChange={e => setSelectedAgent(e.target.value)} className="w-full px-3 py-2 rounded bg-zinc-800 border border-zinc-700 text-sm text-zinc-200">
            <option value="">General Agent</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name} - {a.title}</option>)}
          </select>
          <input type="text" value={testTask} onChange={e => setTestTask(e.target.value)} placeholder="Describe a task to route..." className="w-full px-3 py-2 rounded bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-orange-500" onKeyDown={e => e.key === 'Enter' && handleRoute()} />
          <button onClick={handleRoute} disabled={routing || !testTask.trim()} className="flex items-center gap-2 px-4 py-2 rounded bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-sm text-white transition-colors">
            {routing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            Route
          </button>
        </div>
        {routeResult && !routeResult.error && (
          <div className="mt-3">
            <GraphView route={routeResult.route} task={routeResult.task} agent={routeResult.agent} />
          </div>
        )}
      </div>
    </div>
  );
}
