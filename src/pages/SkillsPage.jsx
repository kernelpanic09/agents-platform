import { useState, useEffect, useCallback } from 'react';
import { Wand2, Plus, X, Trash2, Pencil, Download, RefreshCw, ExternalLink, Check, Globe } from 'lucide-react';

const SOURCE_STYLES = {
  custom: 'bg-zinc-800 text-zinc-300 border-white/10',
  'anthropics/skills': 'bg-amber-500/10 text-amber-300 border-amber-500/20',
};

function sourceChip(source) {
  const style = SOURCE_STYLES[source] || 'bg-teal-500/10 text-teal-300 border-teal-500/20';
  return (
    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${style}`}>
      {source}
    </span>
  );
}

function SkillEditor({ skill, onClose, onSaved }) {
  const [name, setName] = useState(skill?.name || '');
  const [description, setDescription] = useState(skill?.description || '');
  const [body, setBody] = useState(() => {
    if (!skill?.content) return '';
    const m = skill.content.match(/^---\s*\n[\s\S]*?\n---\s*\n?([\s\S]*)$/);
    return m ? m[1].trim() : skill.content;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = { name, description, body };
      const res = await fetch(skill ? `/api/skills/${skill.id}` : '/api/skills', {
        method: skill ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'save failed');
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg">{skill ? 'Edit skill' : 'New skill'}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={18} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-zinc-400 uppercase tracking-wider">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="K8s Health Report"
              className="mt-1 w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500/50" />
          </div>
          <div>
            <label className="text-xs text-zinc-400 uppercase tracking-wider">Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="When and how this skill should be used (the model reads this to decide relevance)"
              className="mt-1 w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500/50" />
          </div>
          <div>
            <label className="text-xs text-zinc-400 uppercase tracking-wider">Instructions (markdown body)</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={14} spellCheck={false}
              placeholder={'# Steps\n1. ...\n2. ...'}
              className="mt-1 w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono leading-relaxed focus:outline-none focus:border-violet-500/50" />
          </div>
          {error && <div className="text-sm text-red-400 bg-red-950/30 border border-red-900/50 rounded-lg px-3 py-2">{error}</div>}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg text-zinc-400 hover:text-white hover:bg-white/5">Cancel</button>
            <button onClick={save} disabled={saving || !name.trim() || !description.trim()}
              className="px-4 py-2 text-sm rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed font-medium">
              {saving ? 'Saving…' : 'Save skill'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CatalogPanel({ librarySlugs, onImported }) {
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/skills/catalog${refresh ? '?refresh=1' : ''}`);
      setCatalog(await res.json());
    } catch {
      setCatalog(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const adopt = async (entry) => {
    setImporting(entry.id);
    setError(null);
    try {
      const res = await fetch('/api/skills/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: entry.raw_url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'import failed');
      onImported();
    } catch (err) {
      setError(`${entry.id}: ${err.message}`);
    } finally {
      setImporting(null);
    }
  };

  return (
    <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-wider flex items-center gap-2">
          <Globe size={13} /> Public catalog — anthropics/skills
          {catalog?.source === 'fallback' && <span className="text-[10px] text-amber-400 normal-case tracking-normal">(offline list)</span>}
        </h2>
        <button onClick={() => load(true)} disabled={loading} className="text-zinc-500 hover:text-white" title="Refresh catalog">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      {error && <div className="text-xs text-red-400 mb-2">{error}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {(catalog?.entries || []).map((e) => {
          const slug = e.id.split('/').pop().toLowerCase().replace(/[^a-z0-9]+/g, '-');
          const inLibrary = librarySlugs.has(slug) || librarySlugs.has(e.name?.toLowerCase());
          return (
            <div key={e.id} className="flex items-center justify-between gap-2 bg-zinc-950/60 border border-white/5 rounded-lg px-3 py-2">
              <div className="min-w-0">
                <div className="text-sm truncate">{e.name}</div>
                <div className="text-[11px] text-zinc-500 font-mono truncate">{e.path}</div>
              </div>
              {inLibrary ? (
                <span className="text-[11px] text-emerald-400 flex items-center gap-1 shrink-0"><Check size={12} /> in library</span>
              ) : (
                <button onClick={() => adopt(e)} disabled={importing === e.id}
                  className="text-[11px] px-2 py-1 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20 hover:bg-amber-500/20 shrink-0 flex items-center gap-1 disabled:opacity-50">
                  <Download size={11} /> {importing === e.id ? 'Adopting…' : 'Adopt'}
                </button>
              )}
            </div>
          );
        })}
        {!loading && !(catalog?.entries || []).length && (
          <div className="text-sm text-zinc-500 col-span-full">Catalog unavailable.</div>
        )}
      </div>
    </div>
  );
}

export default function SkillsPage() {
  const [skills, setSkills] = useState([]);
  const [editor, setEditor] = useState(null); // null | {skill|undefined}
  const [importUrl, setImportUrl] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState(null);

  const load = useCallback(() => {
    fetch('/api/skills').then((r) => r.json()).then(setSkills).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const importFromUrl = async () => {
    if (!importUrl.trim()) return;
    setImportBusy(true);
    setImportError(null);
    try {
      const res = await fetch('/api/skills/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'import failed');
      setImportUrl('');
      load();
    } catch (err) {
      setImportError(err.message);
    } finally {
      setImportBusy(false);
    }
  };

  const toggle = async (s) => {
    await fetch(`/api/skills/${s.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !s.enabled }),
    });
    load();
  };

  const remove = async (s) => {
    if (!window.confirm(`Delete skill "${s.name}"? It will be detached from ${s.attached} agent(s).`)) return;
    await fetch(`/api/skills/${s.id}`, { method: 'DELETE' });
    load();
  };

  const librarySlugs = new Set(skills.map((s) => s.slug));

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2.5">
            <Wand2 className="text-violet-400" size={22} /> Skills
          </h1>
          <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
            Reusable capabilities in the open <span className="font-mono text-zinc-300">SKILL.md</span> format.
            Attach skills to agents and they are materialized into the run workspace at dispatch —
            Claude Code loads them natively; API backends get them inlined.
          </p>
        </div>
        <button onClick={() => setEditor({})}
          className="flex items-center gap-1.5 px-3.5 py-2 text-sm rounded-lg bg-violet-600 hover:bg-violet-500 font-medium shrink-0">
          <Plus size={15} /> New skill
        </button>
      </div>

      <div className="flex gap-2 mb-6">
        <input value={importUrl} onChange={(e) => setImportUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && importFromUrl()}
          placeholder="Import from URL — paste a SKILL.md GitHub or raw link"
          className="flex-1 bg-zinc-900/70 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500/50" />
        <button onClick={importFromUrl} disabled={importBusy || !importUrl.trim()}
          className="flex items-center gap-1.5 px-3.5 py-2 text-sm rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-white/10 disabled:opacity-40">
          <Download size={14} /> {importBusy ? 'Importing…' : 'Import'}
        </button>
      </div>
      {importError && <div className="text-sm text-red-400 mb-4 -mt-3">{importError}</div>}

      {skills.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
          {skills.map((s) => (
            <div key={s.id} className={`bg-zinc-900/50 border border-white/5 rounded-xl p-4 flex flex-col ${s.enabled ? '' : 'opacity-50'}`}>
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <h3 className="font-medium leading-tight">{s.name}</h3>
                {sourceChip(s.source)}
              </div>
              <div className="text-[11px] font-mono text-zinc-500 mb-2">{s.slug}</div>
              <p className="text-sm text-zinc-400 leading-relaxed flex-1 line-clamp-3">{s.description}</p>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                <span className="text-[11px] text-zinc-500">{s.attached} agent{s.attached === 1 ? '' : 's'}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => toggle(s)} title={s.enabled ? 'Disable' : 'Enable'}
                    className={`text-[11px] px-2 py-1 rounded-md border ${s.enabled ? 'text-emerald-300 border-emerald-500/20 bg-emerald-500/10' : 'text-zinc-400 border-white/10 bg-zinc-800'}`}>
                    {s.enabled ? 'enabled' : 'disabled'}
                  </button>
                  <button onClick={() => setEditor({ skill: s })} className="p-1.5 text-zinc-500 hover:text-white" title="Edit"><Pencil size={13} /></button>
                  <button onClick={() => remove(s)} className="p-1.5 text-zinc-500 hover:text-red-400" title="Delete"><Trash2 size={13} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {skills.length === 0 && (
        <div className="text-center text-zinc-500 text-sm border border-dashed border-white/10 rounded-xl py-10 mb-8">
          No skills yet — create one, import from a URL, or adopt from the catalog below.
        </div>
      )}

      <CatalogPanel librarySlugs={librarySlugs} onImported={load} />

      <div className="mt-6 text-[11px] text-zinc-600 flex items-center gap-1.5">
        <ExternalLink size={11} />
        Spec: <a href="https://github.com/anthropics/skills" target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-400">anthropics/skills</a>
      </div>

      {editor && <SkillEditor skill={editor.skill} onClose={() => setEditor(null)} onSaved={load} />}
    </div>
  );
}
