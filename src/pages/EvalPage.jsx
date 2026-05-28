import { useState, useEffect } from 'react';
import { FlaskConical, Plus, Play, Loader2, Trash2, ChevronDown, ChevronRight } from 'lucide-react';

export default function EvalPage() {
  const [suites, setSuites] = useState([]);
  const [agents, setAgents] = useState([]);
  const [newSuite, setNewSuite] = useState({ name: '', agent_id: '', description: '' });
  const [creating, setCreating] = useState(false);
  const [expandedSuite, setExpandedSuite] = useState(null);
  const [cases, setCases] = useState({});
  const [runs, setRuns] = useState({});
  const [runResults, setRunResults] = useState({});
  const [newCase, setNewCase] = useState({ input_prompt: '', expected_behavior: '' });
  const [addingCase, setAddingCase] = useState(null);
  const [runningModel, setRunningModel] = useState({});

  useEffect(() => {
    fetchSuites();
    fetch('/api/agents').then(r => r.json()).then(setAgents).catch(() => {});
  }, []);

  function fetchSuites() {
    fetch('/api/eval/suites').then(r => r.json()).then(setSuites).catch(() => {});
  }

  async function createSuite() {
    if (!newSuite.name.trim()) return;
    setCreating(true);
    await fetch('/api/eval/suites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newSuite) });
    setNewSuite({ name: '', agent_id: '', description: '' });
    setCreating(false);
    fetchSuites();
  }

  async function toggleSuite(id) {
    if (expandedSuite === id) { setExpandedSuite(null); return; }
    setExpandedSuite(id);
    const [c, r] = await Promise.all([
      fetch(`/api/eval/suites/${id}/cases`).then(r => r.json()),
      fetch(`/api/eval/runs?suite_id=${id}`).then(r => r.json()),
    ]);
    setCases(prev => ({ ...prev, [id]: c }));
    setRuns(prev => ({ ...prev, [id]: r }));
  }

  async function addCase(suiteId) {
    if (!newCase.input_prompt.trim() || !newCase.expected_behavior.trim()) return;
    await fetch(`/api/eval/suites/${suiteId}/cases`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newCase) });
    setNewCase({ input_prompt: '', expected_behavior: '' });
    setAddingCase(null);
    const c = await fetch(`/api/eval/suites/${suiteId}/cases`).then(r => r.json());
    setCases(prev => ({ ...prev, [suiteId]: c }));
    fetchSuites();
  }

  async function runSuite(suiteId, model) {
    setRunningModel(prev => ({ ...prev, [suiteId]: model }));
    try {
      await fetch(`/api/eval/suites/${suiteId}/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model }) });
      const r = await fetch(`/api/eval/runs?suite_id=${suiteId}`).then(r => r.json());
      setRuns(prev => ({ ...prev, [suiteId]: r }));
    } catch {}
    setRunningModel(prev => ({ ...prev, [suiteId]: null }));
  }

  async function viewResults(runId) {
    if (runResults[runId]) { setRunResults(prev => { const n = { ...prev }; delete n[runId]; return n; }); return; }
    const r = await fetch(`/api/eval/runs/${runId}/results`).then(r => r.json());
    setRunResults(prev => ({ ...prev, [runId]: r }));
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <div className="flex items-center gap-3 mb-6">
        <FlaskConical size={24} className="text-purple-400" />
        <div>
          <h1 className="text-xl font-semibold text-white">Evaluation</h1>
          <p className="text-sm text-zinc-500">Test agent quality across models</p>
        </div>
      </div>

      {/* Create suite */}
      <div className="p-4 rounded-lg mb-6" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 className="text-sm font-medium text-zinc-300 mb-3">New Test Suite</h3>
        <div className="flex gap-2">
          <input type="text" value={newSuite.name} onChange={e => setNewSuite({ ...newSuite, name: e.target.value })} placeholder="Suite name" className="flex-1 px-3 py-2 rounded bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 placeholder-zinc-600" />
          <select value={newSuite.agent_id} onChange={e => setNewSuite({ ...newSuite, agent_id: e.target.value })} className="px-3 py-2 rounded bg-zinc-800 border border-zinc-700 text-sm text-zinc-200">
            <option value="">No agent</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button onClick={createSuite} disabled={creating || !newSuite.name.trim()} className="flex items-center gap-1 px-3 py-2 rounded bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-sm text-white">
            <Plus size={14} /> Create
          </button>
        </div>
      </div>

      {/* Suites list */}
      <div className="space-y-3">
        {suites.map(suite => (
          <div key={suite.id} className="rounded-lg overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-zinc-800/30" onClick={() => toggleSuite(suite.id)}>
              <div className="flex items-center gap-2">
                {expandedSuite === suite.id ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
                <span className="text-sm font-medium text-zinc-200">{suite.name}</span>
                {suite.agent_name && <span className="text-xs text-zinc-500">{suite.agent_name}</span>}
              </div>
              <div className="flex items-center gap-3 text-xs text-zinc-500">
                <span>{suite.case_count} cases</span>
                <span>{suite.run_count} runs</span>
              </div>
            </div>

            {expandedSuite === suite.id && (
              <div className="border-t border-zinc-800/50 p-3 space-y-3">
                {/* Cases */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-zinc-500 uppercase">Test Cases</span>
                    <button onClick={() => setAddingCase(addingCase === suite.id ? null : suite.id)} className="text-xs text-purple-400 hover:text-purple-300">
                      {addingCase === suite.id ? 'Cancel' : '+ Add Case'}
                    </button>
                  </div>
                  {addingCase === suite.id && (
                    <div className="space-y-2 mb-3 p-2 rounded bg-zinc-800/50">
                      <input type="text" value={newCase.input_prompt} onChange={e => setNewCase({ ...newCase, input_prompt: e.target.value })} placeholder="Input prompt" className="w-full px-2 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 placeholder-zinc-600" />
                      <input type="text" value={newCase.expected_behavior} onChange={e => setNewCase({ ...newCase, expected_behavior: e.target.value })} placeholder="Expected behavior" className="w-full px-2 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 placeholder-zinc-600" />
                      <button onClick={() => addCase(suite.id)} className="px-2 py-1 rounded bg-purple-600 text-xs text-white">Add</button>
                    </div>
                  )}
                  {(cases[suite.id] || []).map(c => (
                    <div key={c.id} className="py-1.5 text-xs border-b border-zinc-800/30 last:border-0">
                      <div className="text-zinc-300">{c.input_prompt}</div>
                      <div className="text-zinc-600 mt-0.5">Expected: {c.expected_behavior}</div>
                    </div>
                  ))}
                </div>

                {/* Run buttons */}
                <div className="flex gap-2">
                  {['haiku', 'sonnet'].map(m => (
                    <button key={m} onClick={() => runSuite(suite.id, m)} disabled={!!runningModel[suite.id]} className="flex items-center gap-1 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-xs text-zinc-300">
                      {runningModel[suite.id] === m ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                      Run {m}
                    </button>
                  ))}
                </div>

                {/* Past runs */}
                {(runs[suite.id] || []).map(run => (
                  <div key={run.id} className="rounded bg-zinc-800/30 p-2">
                    <div className="flex items-center justify-between cursor-pointer" onClick={() => viewResults(run.id)}>
                      <div className="flex items-center gap-2 text-xs">
                        <span className={`w-1.5 h-1.5 rounded-full ${run.status === 'completed' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                        <span className="text-zinc-300">{run.model}</span>
                        <span className="text-zinc-500">{run.passed}/{run.total_cases} passed</span>
                        {run.avg_score != null && <span className="text-zinc-500">avg: {run.avg_score.toFixed(2)}</span>}
                      </div>
                      <span className="text-xs text-zinc-600">{run.created_at?.slice(0, 16)}</span>
                    </div>
                    {runResults[run.id] && (
                      <div className="mt-2 space-y-1.5 border-t border-zinc-700/50 pt-2">
                        {runResults[run.id].map(r => (
                          <div key={r.id} className="text-xs p-1.5 rounded bg-zinc-800/50">
                            <div className="flex justify-between">
                              <span className="text-zinc-400 truncate max-w-[60%]">{r.input_prompt}</span>
                              <span className={r.passed ? 'text-green-400' : 'text-red-400'}>{r.overall_score?.toFixed(2)} {r.passed ? 'PASS' : 'FAIL'}</span>
                            </div>
                            {r.judge_reasoning && <div className="text-zinc-600 mt-0.5">{r.judge_reasoning}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {suites.length === 0 && <div className="text-zinc-500 text-sm text-center py-8">No test suites yet. Create one above.</div>}
      </div>
    </div>
  );
}
