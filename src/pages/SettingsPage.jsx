import { useState, useEffect, useCallback } from 'react';
import { Settings as SettingsIcon, RotateCcw, Check, Key, Download, Upload, Package, Plug, Plus, Trash2, Wifi, Loader2 } from 'lucide-react';

const ALL_SCOPES = ['read', 'trigger', 'write', 'admin'];

const PACK_SECTIONS = ['agents', 'crews', 'schedules', 'pipelines'];

// Import / Export of portable agent packs (versioned YAML).
function ImportExport() {
  const [include, setInclude] = useState(new Set(PACK_SECTIONS));
  const [yamlText, setYamlText] = useState('');
  const [result, setResult] = useState(null);
  const [importing, setImporting] = useState(false);

  const toggle = (s) => setInclude(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });

  const exportPack = () => {
    const qs = [...include].join(',');
    window.open(`/api/packs/export?include=${encodeURIComponent(qs)}`, '_blank');
  };

  const importPack = async () => {
    if (!yamlText.trim()) return;
    setImporting(true); setResult(null);
    try {
      const res = await fetch('/api/packs/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ yaml: yamlText }),
      });
      const body = await res.json();
      setResult(res.ok ? body : { error: body.error || 'Import failed' });
    } catch (e) { setResult({ error: e.message }); }
    finally { setImporting(false); }
  };

  const onFile = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setYamlText(String(reader.result || ''));
    reader.readAsText(f);
  };

  return (
    <div className="glass rounded-2xl p-6 mb-5">
      <div className="flex items-center gap-2 mb-1">
        <Package size={16} className="text-violet-400" />
        <h2 className="font-semibold">Import / Export (agent packs)</h2>
      </div>
      <p className="text-sm text-zinc-500 mb-4">
        Portable, versioned YAML of your agents, crews, schedules, and pipelines. References are by agent name, so a pack moves cleanly between deployments.
      </p>

      <div className="mb-4">
        <div className="text-xs text-zinc-400 mb-2">Sections</div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {PACK_SECTIONS.map(s => (
            <button key={s} onClick={() => toggle(s)}
              className={`text-xs px-2.5 py-1 rounded-lg border capitalize transition-colors ${include.has(s) ? 'border-violet-500 bg-violet-600/20 text-violet-100' : 'border-white/10 bg-black/20 text-zinc-400 hover:border-white/20'}`}>
              {s}
            </button>
          ))}
        </div>
        <button onClick={exportPack} disabled={include.size === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-sm text-white font-medium transition-colors">
          <Download size={14} /> Export pack (.yaml)
        </button>
      </div>

      <div className="border-t border-white/5 pt-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs text-zinc-400">Import a pack</div>
          <label className="text-xs text-teal-300 hover:text-teal-200 cursor-pointer">
            choose file…<input type="file" accept=".yaml,.yml,.txt" onChange={onFile} className="hidden" />
          </label>
        </div>
        <textarea value={yamlText} onChange={e => setYamlText(e.target.value)} rows={5} placeholder="Paste pack YAML here, or choose a file…"
          className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500 resize-y mb-2" />
        <button onClick={importPack} disabled={importing || !yamlText.trim()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-40 text-sm text-zinc-200 transition-colors">
          <Upload size={14} /> {importing ? 'Importing…' : 'Import'}
        </button>
        {result && (
          <div className={`mt-3 text-xs rounded-lg p-3 border ${result.error ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-green-500/30 bg-green-500/10 text-green-200'}`}>
            {result.error ? result.error : (
              <div>
                <div className="font-medium mb-1">Imported.</div>
                <div>Created — agents: {result.created.agents}, crews: {result.created.crews}, schedules: {result.created.schedules}, pipelines: {result.created.pipelines}</div>
                {(result.skipped.agents > 0) && <div className="text-zinc-400">Skipped {result.skipped.agents} existing agent(s).</div>}
                {result.warnings?.length > 0 && <ul className="mt-1 text-amber-300 list-disc list-inside">{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ApiKeys() {
  const [keys, setKeys] = useState([]);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState(['trigger']);
  const [created, setCreated] = useState(null);

  const load = () => fetch('/api/keys').then(r => r.json()).then(setKeys).catch(() => {});
  useEffect(() => { load(); }, []);

  const toggle = (s) => setScopes(p => (p.includes(s) ? p.filter(x => x !== s) : [...p, s]));
  const create = async () => {
    const res = await fetch('/api/keys', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name || 'key', scopes }),
    });
    const body = await res.json();
    if (!res.ok) { alert(body.error || 'Create failed'); return; }
    setCreated(body); setName(''); load();
  };
  const revoke = async (id) => { await fetch(`/api/keys/${id}`, { method: 'DELETE' }); load(); };

  return (
    <div className="glass rounded-2xl p-6 mb-5">
      <div className="flex items-center gap-2 mb-1">
        <Key size={16} className="text-violet-400" />
        <h2 className="font-semibold">API keys</h2>
      </div>
      <p className="text-xs text-zinc-500 mb-4">
        For the <code className="text-zinc-300">/claude</code> proxy and inbound webhooks. The full key is shown once on creation — copy it then.
      </p>

      {created && (
        <div className="mb-4 p-3 rounded-lg border border-violet-500/30 bg-violet-500/10">
          <div className="text-xs text-zinc-400 mb-1">New key <span className="text-amber-400">(copy now — it won't be shown again)</span>:</div>
          <code className="text-sm text-violet-200 font-mono break-all">{created.key}</code>
        </div>
      )}

      <div className="space-y-1 mb-4">
        {keys.length === 0 && <div className="text-sm text-zinc-600">No keys yet.</div>}
        {keys.map(k => (
          <div key={k.id} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0 text-sm">
            <span className={k.revoked ? 'text-zinc-600 line-through' : 'text-zinc-200'}>{k.name}</span>
            <code className="text-xs text-zinc-500">{k.key_prefix}…</code>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-500/15 text-teal-300 border border-teal-500/30">{k.scopes.join(', ')}</span>
            <span className="text-[10px] text-zinc-600 ml-auto">{k.last_used_at ? 'used' : 'never used'}</span>
            {!k.revoked && <button onClick={() => revoke(k.id)} className="text-xs text-red-400 hover:text-red-300">revoke</button>}
            {k.revoked && <span className="text-xs text-zinc-600">revoked</span>}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="key name"
          className="bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500" />
        <div className="flex items-center gap-2">
          {ALL_SCOPES.map(s => (
            <label key={s} className="flex items-center gap-1 text-xs text-zinc-300 cursor-pointer">
              <input type="checkbox" checked={scopes.includes(s)} onChange={() => toggle(s)} className="accent-violet-500" /> {s}
            </label>
          ))}
        </div>
        <button onClick={create} className="px-3 py-2 rounded-lg text-sm bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors">Create key</button>
      </div>
    </div>
  );
}

const SOURCE_BADGE = {
  db: { label: 'override', cls: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
  env: { label: 'env', cls: 'bg-teal-500/15 text-teal-300 border-teal-500/30' },
  default: { label: 'default', cls: 'bg-zinc-700/40 text-zinc-400 border-white/10' },
};

function SettingRow({ s, onSave, onReset }) {
  const [val, setVal] = useState(s.value);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  useEffect(() => { setVal(s.value); }, [s.value]);

  const dirty = String(val) !== String(s.value);
  const commit = async () => {
    setSaving(true);
    await onSave(s.key, val);
    setSaving(false);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };
  const badge = SOURCE_BADGE[s.source] || SOURCE_BADGE.default;

  return (
    <div className="py-4 border-b border-white/5 last:border-0">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-medium text-zinc-200">{s.label}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${badge.cls}`}>{badge.label}</span>
        {!s.editableLive && <span className="text-[10px] text-amber-400/80">needs restart</span>}
        {savedFlash && <span className="ml-auto inline-flex items-center gap-1 text-xs text-green-400"><Check size={12} /> saved</span>}
      </div>
      {s.description && <p className="text-xs text-zinc-500 mb-2">{s.description}</p>}
      <div className="flex items-start gap-2">
        {s.type === 'enum' ? (
          <select value={val} onChange={e => setVal(e.target.value)}
            className="flex-1 bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500">
            {(s.options || []).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : s.type === 'text' ? (
          <textarea value={val} onChange={e => setVal(e.target.value)} rows={6}
            className="flex-1 bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-200 font-mono focus:outline-none focus:border-violet-500" />
        ) : (
          <input
            type={s.type === 'number' ? 'number' : 'text'}
            value={val}
            onChange={e => setVal(s.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
            className="flex-1 bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-violet-500" />
        )}
        <button onClick={commit} disabled={!dirty || saving}
          className="px-3 py-2 rounded-lg text-sm bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          {saving ? 'Saving…' : 'Save'}
        </button>
        {s.source === 'db' && (
          <button onClick={() => onReset(s.key)} title="Reset to env/default"
            className="px-2 py-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors">
            <RotateCcw size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

// DB-backed MCP registry: editable at runtime, with env validation + connection test.
function McpRegistry() {
  const [servers, setServers] = useState([]);
  const [checks, setChecks] = useState({});
  const [tests, setTests] = useState({});
  const [testing, setTesting] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ id: '', name: '', command: 'npx', package: '', env: '' });

  const load = useCallback(async () => {
    const list = await fetch('/api/mcp-servers').then(r => r.json());
    setServers(list);
    const entries = await Promise.all(list.map(s => fetch(`/api/mcp-servers/${s.id}/check`).then(r => r.json()).then(c => [s.id, c]).catch(() => [s.id, null])));
    setChecks(Object.fromEntries(entries));
  }, []);
  useEffect(() => { load(); }, [load]);

  const test = async (id) => {
    setTesting(id);
    try {
      const r = await fetch(`/api/mcp-servers/${id}/test`, { method: 'POST' }).then(r => r.json());
      setTests(t => ({ ...t, [id]: r }));
    } finally { setTesting(null); }
  };

  const add = async () => {
    if (!form.id.trim() || !form.name.trim()) return;
    const envKeys = form.env.split(',').map(s => s.trim()).filter(Boolean);
    const config = {
      command: form.command || 'npx',
      args: form.package ? ['-y', form.package] : [],
      ...(envKeys.length ? { env: Object.fromEntries(envKeys.map(k => [k, `<set ${k}>`])) } : {}),
    };
    const res = await fetch('/api/mcp-servers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: form.id, name: form.name, package: form.package, category: 'other', config }),
    });
    if (res.ok) { setForm({ id: '', name: '', command: 'npx', package: '', env: '' }); setAdding(false); load(); }
    else alert((await res.json()).error || 'Failed to add');
  };

  const remove = async (id) => {
    if (!confirm(`Delete MCP server "${id}"?`)) return;
    await fetch(`/api/mcp-servers/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="glass rounded-2xl p-6 mb-5">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Plug size={16} className="text-violet-400" />
          <h2 className="font-semibold">MCP registry <span className="text-zinc-500 font-normal text-sm">({servers.length})</span></h2>
        </div>
        <button onClick={() => setAdding(a => !a)} className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-violet-600/20 text-violet-200 hover:bg-violet-600/30 transition-colors"><Plus size={12} /> Add</button>
      </div>
      <p className="text-sm text-zinc-500 mb-4">Editable at runtime — no redeploy. Each server shows whether its required env vars are present, plus a remote connection test.</p>

      {adding && (
        <div className="mb-4 p-3 rounded-lg border border-violet-500/30 bg-violet-500/5 grid grid-cols-2 gap-2">
          <input value={form.id} onChange={e => setForm(f => ({ ...f, id: e.target.value }))} placeholder="id (slug)" className="px-2 py-1.5 rounded bg-zinc-900 border border-white/10 text-xs text-zinc-200" />
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Name" className="px-2 py-1.5 rounded bg-zinc-900 border border-white/10 text-xs text-zinc-200" />
          <input value={form.command} onChange={e => setForm(f => ({ ...f, command: e.target.value }))} placeholder="command (npx)" className="px-2 py-1.5 rounded bg-zinc-900 border border-white/10 text-xs text-zinc-200" />
          <input value={form.package} onChange={e => setForm(f => ({ ...f, package: e.target.value }))} placeholder="package (@scope/pkg)" className="px-2 py-1.5 rounded bg-zinc-900 border border-white/10 text-xs text-zinc-200" />
          <input value={form.env} onChange={e => setForm(f => ({ ...f, env: e.target.value }))} placeholder="env vars (comma-separated)" className="col-span-2 px-2 py-1.5 rounded bg-zinc-900 border border-white/10 text-xs text-zinc-200" />
          <button onClick={add} className="col-span-2 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-sm text-white font-medium transition-colors">Add server</button>
        </div>
      )}

      <div className="space-y-1.5 max-h-96 overflow-auto">
        {servers.map(s => {
          const c = checks[s.id];
          const t = tests[s.id];
          return (
            <div key={s.id} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-white/5 border-b border-white/5 last:border-0">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
              <div className="min-w-0 flex-1">
                <div className="text-sm text-zinc-200 truncate">{s.name} <span className="text-zinc-600 text-xs">{s.id}</span></div>
                <div className="text-xs text-zinc-600 truncate">{s.description}</div>
              </div>
              {c && (c.required.length === 0
                ? <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-zinc-700/40 text-zinc-400 border border-white/10 shrink-0">no env</span>
                : c.ok
                  ? <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-300 border border-green-500/25 shrink-0">env ✓</span>
                  : <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/25 shrink-0" title={c.missing.join(', ')}>needs {c.missing.length}</span>)}
              {t && <span className={`text-[11px] px-1.5 py-0.5 rounded-full border shrink-0 ${t.reachable ? 'bg-teal-500/10 text-teal-300 border-teal-500/25' : 'bg-red-500/10 text-red-300 border-red-500/25'}`} title={t.detail}>{t.reachable ? 'reachable' : 'unreachable'}</span>}
              <button onClick={() => test(s.id)} disabled={testing === s.id} className="p-1.5 rounded-lg text-zinc-500 hover:text-teal-300 hover:bg-teal-500/10 shrink-0" title="Connection test">
                {testing === s.id ? <Loader2 size={14} className="animate-spin" /> : <Wifi size={14} />}
              </button>
              <button onClick={() => remove(s.id)} className="p-1.5 rounded-lg text-zinc-500 hover:text-red-300 hover:bg-red-500/10 shrink-0" title="Delete"><Trash2 size={14} /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [groups, setGroups] = useState({});

  const load = useCallback(() => {
    fetch('/api/settings').then(r => r.json()).then(d => setGroups(d.groups || {})).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const onSave = async (key, value) => {
    const res = await fetch(`/api/settings/${encodeURIComponent(key)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value }),
    });
    if (!res.ok) { const b = await res.json().catch(() => ({})); alert(b.error || 'Save failed'); }
    load();
  };
  const onReset = async (key) => {
    await fetch(`/api/settings/${encodeURIComponent(key)}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 animate-fade-in-up">
      <div className="flex items-center gap-3 mb-2">
        <SettingsIcon size={22} className="text-violet-400" />
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>
      <p className="text-sm text-zinc-500 mb-6">
        Live platform settings. <span className="text-teal-300">env</span> values seed defaults; saving creates a DB
        <span className="text-violet-300"> override</span> that takes effect on the next run — no redeploy. Secrets stay in the environment.
      </p>

      {Object.entries(groups).map(([group, items]) => (
        <div key={group} className="glass rounded-2xl p-6 mb-5">
          <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">{group}</h2>
          {items.map(s => <SettingRow key={s.key} s={s} onSave={onSave} onReset={onReset} />)}
        </div>
      ))}

      <ApiKeys />
      <McpRegistry />
      <ImportExport />
    </div>
  );
}
