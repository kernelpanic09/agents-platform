import { useState, useEffect, useCallback } from 'react';
import { Settings as SettingsIcon, RotateCcw, Check, Key } from 'lucide-react';

const ALL_SCOPES = ['read', 'trigger', 'write', 'admin'];

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
    </div>
  );
}
