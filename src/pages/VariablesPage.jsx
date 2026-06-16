import { useState, useEffect, useCallback } from 'react';
import { Variable, Plus, Trash2, FileText, Table } from 'lucide-react';

export default function VariablesPage() {
  const [vars, setVars] = useState([]);
  const [bulk, setBulk] = useState(false);
  const [envText, setEnvText] = useState('');
  const [draft, setDraft] = useState({ key: '', value: '', description: '' });
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    fetch('/api/variables').then(r => r.json()).then(setVars).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setEnvText(vars.map(v => `${v.key}=${v.value}`).join('\n')); }, [vars]);

  const add = async () => {
    setError(null);
    const res = await fetch('/api/variables', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft),
    });
    if (!res.ok) { setError((await res.json()).error); return; }
    setDraft({ key: '', value: '', description: '' });
    load();
  };

  const save = async (key, patch) => {
    await fetch(`/api/variables/${key}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    });
    load();
  };

  const remove = async (key) => {
    if (!window.confirm(`Delete {{${key}}}?`)) return;
    await fetch(`/api/variables/${key}`, { method: 'DELETE' });
    load();
  };

  const saveBulk = async () => {
    setError(null);
    const res = await fetch('/api/variables', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ env: envText }),
    });
    if (!res.ok) { setError((await res.json()).error); return; }
    setBulk(false);
    load();
  };

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2.5">
            <Variable className="text-violet-400" size={22} /> Variables
          </h1>
          <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
            Your environment's "master sheet". Reference any variable in an agent's system prompt
            or a task with <code className="text-zinc-300">{'{{KEY}}'}</code> - it's substituted at dispatch.
            Non-secret values only (keep keys/tokens in env/secrets).
          </p>
        </div>
        <button onClick={() => setBulk(b => !b)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-white/10 text-zinc-300 hover:bg-white/5">
          {bulk ? <><Table size={15} /> Table</> : <><FileText size={15} /> Bulk edit (.env)</>}
        </button>
      </div>

      {error && <div className="text-sm text-red-400 bg-red-950/30 border border-red-900/50 rounded-lg px-3 py-2 mb-4">{error}</div>}

      {bulk ? (
        <div>
          <textarea value={envText} onChange={(e) => setEnvText(e.target.value)} rows={14} spellCheck={false}
            placeholder={'CLUSTER_NAME=prod-1\nPRIMARY_DOMAIN=example.com'}
            className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-violet-500/50" />
          <p className="text-xs text-zinc-500 mt-1">One <code>KEY=value</code> per line. Keys are UPPER_SNAKE. Saving replaces the whole set.</p>
          <button onClick={saveBulk} className="mt-3 px-4 py-2 text-sm rounded-lg bg-violet-600 hover:bg-violet-500 font-medium">Save sheet</button>
        </div>
      ) : (
        <div className="space-y-2">
          {vars.map(v => (
            <div key={v.key} className="flex items-center gap-2 bg-zinc-900/50 border border-white/5 rounded-lg px-3 py-2">
              <code className="text-sm text-violet-300 font-mono w-48 shrink-0">{v.key}</code>
              <input defaultValue={v.value} onBlur={(e) => e.target.value !== v.value && save(v.key, { value: e.target.value })}
                className="flex-1 bg-zinc-950/60 border border-white/10 rounded px-2 py-1 text-sm" />
              <input defaultValue={v.description} placeholder="description"
                onBlur={(e) => e.target.value !== v.description && save(v.key, { description: e.target.value })}
                className="flex-1 bg-zinc-950/60 border border-white/10 rounded px-2 py-1 text-sm text-zinc-400" />
              <button onClick={() => remove(v.key)} className="p-1.5 text-zinc-500 hover:text-red-400"><Trash2 size={14} /></button>
            </div>
          ))}
          {vars.length === 0 && <div className="text-sm text-zinc-500 border border-dashed border-white/10 rounded-xl py-8 text-center">No variables yet.</div>}

          <div className="flex items-center gap-2 pt-3 border-t border-white/5 mt-3">
            <input value={draft.key} onChange={(e) => setDraft({ ...draft, key: e.target.value.toUpperCase() })} placeholder="NEW_KEY"
              className="w-48 shrink-0 bg-zinc-950 border border-white/10 rounded px-2 py-1 text-sm font-mono" />
            <input value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} placeholder="value"
              className="flex-1 bg-zinc-950 border border-white/10 rounded px-2 py-1 text-sm" />
            <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="description"
              className="flex-1 bg-zinc-950 border border-white/10 rounded px-2 py-1 text-sm" />
            <button onClick={add} disabled={!draft.key} className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-zinc-800 border border-white/10 hover:bg-zinc-700 disabled:opacity-40"><Plus size={14} /> Add</button>
          </div>
        </div>
      )}
    </div>
  );
}
