import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Check, Wrench, Server, Sparkles, BookOpen, Terminal, Users, ExternalLink, FileText, Database, BarChart3, Globe, Download, Package, Clipboard, Cpu, Wand2 } from 'lucide-react';
import AgentAvatar from '../components/AgentAvatar';
import { downloadMarkdown } from '../utils/download';
import { copyToClipboard } from '../utils/clipboard';

const SOURCE_ICONS = {
  bookstack: BookOpen,
  file: FileText,
  directory: FileText,
  grafana: BarChart3,
  prometheus: Database,
  url: Globe,
};

const SOURCE_COLORS = {
  bookstack: '#E0A82E',
  file: '#C2603C',
  directory: '#9A6B3C',
  grafana: '#F97316',
  prometheus: '#B4451F',
  url: '#7E8C3F',
};

function InferenceProfile({ agent, onSaved }) {
  const cfg = agent.model_config || {};
  const [model, setModel] = useState(cfg.model || '');
  const [temp, setTemp] = useState(cfg.temperature ?? '');
  const [maxTok, setMaxTok] = useState(cfg.max_tokens ?? '');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/agents/${agent.id}/model-config`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: model || null, temperature: temp === '' ? null : temp, max_tokens: maxTok === '' ? null : maxTok }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Save failed');
      onSaved(body);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } catch (e) { alert(e.message); } finally { setSaving(false); }
  };

  const field = 'w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-violet-500';
  return (
    <div className="glass rounded-2xl p-6 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <Cpu size={16} style={{ color: agent.color }} aria-hidden="true" />
        <h2 className="font-semibold">Inference profile</h2>
        {savedFlash && <span className="ml-auto inline-flex items-center gap-1 text-xs text-green-400"><Check size={12} /> saved</span>}
      </div>
      <p className="text-xs text-zinc-500 mb-4">
        Per-agent model + sampling. <span className="text-zinc-400">Model</span> applies to both backends;{' '}
        <span className="text-zinc-400">temperature / max tokens</span> apply to the API backend.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Model</label>
          <input value={model} onChange={e => setModel(e.target.value)} placeholder="inherit (default)" className={field} />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Temperature (0–1)</label>
          <input type="number" min="0" max="1" step="0.1" value={temp} onChange={e => setTemp(e.target.value)} placeholder="default" className={field} />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Max tokens</label>
          <input type="number" min="1" value={maxTok} onChange={e => setMaxTok(e.target.value)} placeholder="default" className={field} />
        </div>
      </div>
      <button onClick={save} disabled={saving} className="mt-3 px-4 py-2 rounded-lg text-sm bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors disabled:opacity-50">
        {saving ? 'Saving…' : 'Save profile'}
      </button>
    </div>
  );
}

function SystemPromptCard({ agent, onSaved }) {
  const [prompt, setPrompt] = useState(agent.system_prompt || '');
  const [versions, setVersions] = useState([]);
  const [openV, setOpenV] = useState(null);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(false);

  const loadVersions = useCallback(() => {
    fetch(`/api/agents/${agent.id}/prompt-versions`).then(r => r.json()).then(setVersions).catch(() => {});
  }, [agent.id]);
  useEffect(() => { setPrompt(agent.system_prompt || ''); }, [agent.system_prompt]);
  useEffect(() => { loadVersions(); }, [loadVersions]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ system_prompt: prompt }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Save failed');
      onSaved(body); loadVersions(); setFlash(true); setTimeout(() => setFlash(false), 1500);
    } catch (e) { alert(e.message); } finally { setSaving(false); }
  };
  const restore = async (vid) => {
    const res = await fetch(`/api/agents/${agent.id}/prompt-versions/${vid}/restore`, { method: 'POST' });
    const body = await res.json();
    if (res.ok) { onSaved(body); setPrompt(body.system_prompt || ''); loadVersions(); }
  };

  const dirty = prompt !== (agent.system_prompt || '');
  return (
    <div className="glass rounded-2xl p-6 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <FileText size={16} style={{ color: agent.color }} aria-hidden="true" />
        <h2 className="font-semibold">System prompt</h2>
        {flash && <span className="ml-auto inline-flex items-center gap-1 text-xs text-green-400"><Check size={12} /> saved</span>}
      </div>
      <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={8}
        className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-200 font-mono leading-relaxed focus:outline-none focus:border-violet-500" />
      <div className="flex items-center gap-3 mt-2">
        <button onClick={save} disabled={!dirty || saving} className="px-4 py-2 rounded-lg text-sm bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          {saving ? 'Saving…' : 'Save prompt'}
        </button>
        <span className="text-xs text-zinc-500">{versions.length} prior version{versions.length === 1 ? '' : 's'} — snapshotted automatically on every edit</span>
      </div>
      {versions.length > 0 && (
        <div className="mt-4 border-t border-white/5 pt-3 space-y-1">
          <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1">Version history</div>
          {versions.map(v => (
            <div key={v.id} className="text-sm">
              <div className="flex items-center gap-2 py-1">
                <span className="text-zinc-400 text-xs">{v.created_at}</span>
                <span className="text-zinc-600 text-xs">{v.note}</span>
                <button onClick={() => setOpenV(openV === v.id ? null : v.id)} className="ml-auto text-xs text-teal-400 hover:text-teal-300">{openV === v.id ? 'hide' : 'view'}</button>
                <button onClick={() => restore(v.id)} className="text-xs text-violet-400 hover:text-violet-300">restore</button>
              </div>
              {openV === v.id && (
                <pre className="text-[11px] text-zinc-500 whitespace-pre-wrap font-mono bg-zinc-900/50 rounded p-2 max-h-48 overflow-y-auto">{v.system_prompt}</pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AttachedSkillsCard({ agentId, accent }) {
  const [attached, setAttached] = useState([]);
  const [attachedIds, setAttachedIds] = useState([]);
  const [library, setLibrary] = useState([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/agents/${agentId}/skills`).then(r => r.json())
      .then(d => { setAttached(d.skills || []); setAttachedIds(d.skill_ids || []); })
      .catch(() => {});
  }, [agentId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (open) fetch('/api/skills').then(r => r.json()).then(setLibrary).catch(() => {});
  }, [open]);

  const toggleId = async (sid) => {
    const next = attachedIds.includes(sid) ? attachedIds.filter(x => x !== sid) : [...attachedIds, sid];
    setSaving(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/skills`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill_ids: next }),
      });
      const d = await res.json();
      setAttached(d.skills || []);
      setAttachedIds(d.skill_ids || []);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass rounded-2xl p-6 mb-6">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Wand2 size={16} style={{ color: accent }} aria-hidden="true" />
          <h2 className="font-semibold">Skills</h2>
          <span className="text-[11px] text-zinc-500 font-mono">SKILL.md</span>
        </div>
        <button onClick={() => setOpen(o => !o)} className="text-xs px-2.5 py-1 rounded-md border border-white/10 text-zinc-300 hover:bg-white/5">
          {open ? 'Done' : 'Manage'}
        </button>
      </div>
      <p className="text-xs text-zinc-500 mb-3">Materialized into the run workspace at dispatch — loaded natively by Claude Code, inlined on API backends.</p>
      {attached.length === 0 && !open && (
        <div className="text-sm text-zinc-500">No skills attached. <Link to="/skills" className="underline hover:text-zinc-300">Browse the skill library</Link>.</div>
      )}
      {attached.length > 0 && !open && (
        <div className="flex flex-wrap gap-2">
          {attached.map(s => (
            <span key={s.id} title={s.description} className="text-sm px-3 py-1 rounded-lg" style={{ backgroundColor: `${accent}12`, color: accent, border: `1px solid ${accent}25` }}>
              {s.name}
            </span>
          ))}
        </div>
      )}
      {open && (
        <div className="space-y-1.5">
          {library.length === 0 && <div className="text-sm text-zinc-500">Library is empty — <Link to="/skills" className="underline">create or adopt skills</Link> first.</div>}
          {library.map(s => {
            const on = attachedIds.includes(s.id);
            return (
              <button key={s.id} onClick={() => toggleId(s.id)} disabled={saving}
                className={`w-full flex items-center justify-between gap-3 text-left px-3 py-2 rounded-lg border transition-colors ${on ? 'border-violet-500/40 bg-violet-500/10' : 'border-white/5 bg-zinc-950/40 hover:bg-white/5'}`}>
                <span className="min-w-0">
                  <span className="text-sm block truncate">{s.name}</span>
                  <span className="text-[11px] text-zinc-500 block truncate">{s.description}</span>
                </span>
                <span className={`text-[11px] shrink-0 ${on ? 'text-violet-300' : 'text-zinc-600'}`}>{on ? 'attached' : 'attach'}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AgentProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [agent, setAgent] = useState(null);
  const [allAgents, setAllAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [copiedTask, setCopiedTask] = useState(null);
  const [copiedMcp, setCopiedMcp] = useState(null);
  const [showActivate, setShowActivate] = useState(false);
  const [mcpRegistry, setMcpRegistry] = useState({});
  const timersRef = useRef([]);

  // Clean up all copy-feedback timers on unmount
  useEffect(() => {
    return () => timersRef.current.forEach(clearTimeout);
  }, []);

  const setTempState = useCallback((setter, value, duration = 2000) => {
    setter(value);
    const id = setTimeout(() => setter(typeof value === 'boolean' ? false : null), duration);
    timersRef.current.push(id);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`/api/agents/${id}`).then(r => { if (!r.ok) throw new Error('Agent not found'); return r.json(); }),
      fetch('/api/agents').then(r => r.json()),
      fetch('/api/mcp-servers').then(r => r.json()),
    ]).then(([agentData, agents, mcpList]) => {
      setAgent(agentData);
      setAllAgents(agents);
      const registry = {};
      mcpList.forEach(m => { registry[m.id] = m; });
      setMcpRegistry(registry);
      setLoading(false);
    }).catch(err => {
      setError(err.message);
      setLoading(false);
    });
  }, [id]);

  const copyMcpConfig = (mcpId) => {
    const mcp = mcpRegistry[mcpId];
    if (!mcp?.config) return;
    const configObj = { mcpServers: { [mcpId]: mcp.config } };
    copyToClipboard(JSON.stringify(configObj, null, 2));
    setTempState(setCopiedMcp, mcpId);
  };

  const copyPrompt = () => {
    if (!agent?.system_prompt) return;
    copyToClipboard(agent.system_prompt);
    setTempState(setCopied, true);
  };

  const copyTask = (task, idx) => {
    copyToClipboard(task.description);
    setTempState(setCopiedTask, idx);
  };

  const generateActivation = () => {
    const lines = [
      `# ${agent.name} — ${agent.title}`,
      `> ${agent.tagline}`,
      '',
    ];

    if (agent.tools?.length) {
      lines.push('## Tools');
      agent.tools.forEach(t => lines.push(`- \`${t}\``));
      lines.push('');
    }

    if (agent.mcp_servers?.length) {
      lines.push('## MCP Servers');
      agent.mcp_servers.forEach(m => {
        const meta = mcpRegistry[m];
        if (meta) {
          lines.push(`- **${meta.name}** — ${meta.description}`);
        } else {
          lines.push(`- ${m}`);
        }
      });
      lines.push('');

      // Generate config block
      const configObj = {};
      agent.mcp_servers.forEach(m => {
        const meta = mcpRegistry[m];
        if (meta?.config) configObj[m] = meta.config;
      });
      if (Object.keys(configObj).length > 0) {
        lines.push('### MCP Configuration');
        lines.push('Add to your `settings.json` or `claude_desktop_config.json`:');
        lines.push('```json');
        lines.push(JSON.stringify({ mcpServers: configObj }, null, 2));
        lines.push('```');
        lines.push('');
      }
    }

    lines.push('## System Prompt');
    lines.push(agent.system_prompt);
    lines.push('');

    if (agent.knowledge_sources?.length) {
      lines.push('## Knowledge Sources');
      agent.knowledge_sources.forEach(s => {
        if (s.path) lines.push(`- **${s.label}**: Read \`${s.path}\``);
        else if (s.url) lines.push(`- **${s.label}**: ${s.url}`);
      });
      lines.push('');
    }

    if (agent.example_tasks?.length) {
      lines.push('## Example Tasks');
      agent.example_tasks.forEach(t => {
        lines.push(`### ${t.title}`);
        lines.push(t.description);
        lines.push('');
      });
    }

    return lines.join('\n');
  };

  const downloadActivation = () => {
    downloadMarkdown(generateActivation(), `${agent.name.toLowerCase()}-agent.md`);
  };

  const copyActivation = () => {
    copyToClipboard(generateActivation());
    setShowActivate(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-zinc-700 border-t-violet-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="text-center py-20">
        <p className="text-zinc-300 mb-2">{error || 'Agent not found'}</p>
        <Link to="/" className="text-teal-400 hover:text-teal-300 transition-colors">Back to directory</Link>
      </div>
    );
  }

  const relatedAgentObjects = (agent.related_agents || [])
    .map(name => allAgents.find(a => a.name === name))
    .filter(Boolean);

  return (
    <div className="animate-fade-in-up" style={{ animationDelay: '0ms' }}>
      {/* Back button */}
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors mb-8">
        <ArrowLeft size={16} aria-hidden="true" />
        Back to directory
      </Link>

      {/* Header */}
      <div className="glass rounded-2xl p-8 mb-6">
        <div className="flex flex-col sm:flex-row items-start gap-6">
          <div className="flex-shrink-0">
            <AgentAvatar iconId={agent.icon_id} color={agent.color} size={96} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h1 className="text-3xl font-bold">{agent.name}</h1>
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: agent.color }} aria-hidden="true" />
              <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 capitalize">{agent.category}</span>
              {agent.status === 'active' && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Active</span>
              )}
            </div>
            <p className="text-lg font-medium mb-2" style={{ color: agent.color }}>{agent.title}</p>
            <p className="text-zinc-400 mb-4">{agent.tagline}</p>
            <button
              onClick={() => setShowActivate(true)}
              className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-lg transition-colors font-medium"
              style={{
                backgroundColor: `${agent.color}15`,
                color: agent.color,
                border: `1px solid ${agent.color}30`,
              }}
              aria-label={`Activate ${agent.name} in Claude Code`}
            >
              <Terminal size={14} aria-hidden="true" />
              Activate in Claude Code
            </button>
          </div>
        </div>
      </div>

      {/* Activate Modal */}
      {showActivate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80" onClick={() => setShowActivate(false)} role="dialog" aria-label={`Activate ${agent.name}`}>
          <div className="glass rounded-2xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-lg">Activate {agent.name}</h2>
              <div className="flex items-center gap-2">
                <button onClick={downloadActivation} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition-colors" aria-label="Download as markdown file">
                  <Download size={14} aria-hidden="true" />
                  Download .md
                </button>
                <button onClick={copyActivation} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors" aria-label="Copy activation prompt to clipboard">
                  <Copy size={14} aria-hidden="true" />
                  Copy to Clipboard
                </button>
              </div>
            </div>
            <p className="text-sm text-zinc-400 mb-3">Paste this into a CLAUDE.md file or use as a system prompt in Claude Code:</p>
            <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-mono bg-zinc-900/80 rounded-xl p-4 leading-relaxed max-h-[50vh] overflow-y-auto">
              {generateActivation()}
            </pre>
          </div>
        </div>
      )}

      {/* Inference profile (per-agent model + sampling) */}
      <InferenceProfile agent={agent} onSaved={setAgent} />

      {/* System prompt editor + version history */}
      <SystemPromptCard agent={agent} onSaved={setAgent} />

      {/* Skills / Tools / MCP — 3 columns */}
      {/* Attached skills (SKILL.md) — materialized into the run workspace at dispatch */}
      <AttachedSkillsCard agentId={agent.id} accent={agent.color} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="glass rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={16} style={{ color: agent.color }} aria-hidden="true" />
            <h2 className="font-semibold">Expertise</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {agent.skills.map((skill, i) => (
              <span key={`skill-${agent.id}-${i}`} className="skill-badge text-sm px-3 py-1 rounded-lg" style={{ backgroundColor: `${agent.color}12`, color: agent.color, border: `1px solid ${agent.color}25` }}>
                {skill}
              </span>
            ))}
          </div>
        </div>

        <div className="glass rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Wrench size={16} style={{ color: agent.color }} aria-hidden="true" />
            <h2 className="font-semibold">Tools</h2>
          </div>
          <div className="space-y-2">
            {agent.tools.map((tool, i) => (
              <div key={`tool-${agent.id}-${i}`} className="text-sm px-3 py-1.5 rounded-lg bg-zinc-800/50 text-zinc-300 font-mono">{tool}</div>
            ))}
          </div>
        </div>

        <div className="glass rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Server size={16} style={{ color: agent.color }} aria-hidden="true" />
            <h2 className="font-semibold">MCP Servers</h2>
          </div>
          {agent.mcp_servers.length > 0 ? (
            <div className="space-y-3">
              {agent.mcp_servers.map((mcpId, i) => {
                const meta = mcpRegistry[mcpId];
                return (
                  <div key={`mcp-${agent.id}-${i}`} className="rounded-xl p-3 group/mcp" style={{ backgroundColor: `${(meta?.color || agent.color)}08`, border: `1px solid ${(meta?.color || agent.color)}20` }}>
                    <div className="flex items-start gap-2">
                      <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: meta?.color || agent.color }} aria-hidden="true" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-medium text-zinc-200">{meta?.name || mcpId}</span>
                          {meta?.package && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 font-mono">{meta.package}</span>
                          )}
                        </div>
                        {meta?.description && (
                          <p className="text-xs text-zinc-500 leading-relaxed">{meta.description}</p>
                        )}
                      </div>
                      {meta?.config && (
                        <button
                          onClick={() => copyMcpConfig(mcpId)}
                          className="flex-shrink-0 p-1 rounded-md hover:bg-zinc-700/50 text-zinc-500 hover:text-zinc-300 transition-colors opacity-0 group-hover/mcp:opacity-100"
                          aria-label={`Copy ${meta.name} config`}
                          title="Copy MCP config"
                        >
                          {copiedMcp === mcpId ? <Check size={12} className="text-green-400" /> : <Clipboard size={12} />}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">No MCP servers configured</p>
          )}
        </div>
      </div>

      {/* Knowledge Sources */}
      {agent.knowledge_sources?.length > 0 && (
        <div className="glass rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen size={16} style={{ color: agent.color }} aria-hidden="true" />
            <h2 className="font-semibold">Knowledge Sources</h2>
            <span className="text-xs text-zinc-500 ml-auto">{agent.knowledge_sources.length} sources</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {agent.knowledge_sources.map((source, i) => {
              const Icon = SOURCE_ICONS[source.type] || Globe;
              const iconColor = SOURCE_COLORS[source.type] || agent.color;
              return (
                <div key={`source-${agent.id}-${i}`} className="flex items-start gap-3 p-3 rounded-xl bg-zinc-800/30 border border-zinc-700/50 hover:border-zinc-600/50 transition-colors">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${iconColor}15` }}>
                    <Icon size={14} style={{ color: iconColor }} aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-200 truncate">{source.label}</p>
                    <p className="text-xs text-zinc-500 truncate mt-0.5">{source.path || source.url || source.query}</p>
                  </div>
                  {source.url && (
                    <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0" aria-label={`Open ${source.label}`}>
                      <ExternalLink size={12} aria-hidden="true" />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Example Tasks */}
      {agent.example_tasks?.length > 0 && (
        <div className="glass rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Terminal size={16} style={{ color: agent.color }} aria-hidden="true" />
            <h2 className="font-semibold">Example Tasks</h2>
          </div>
          <div className="space-y-3">
            {agent.example_tasks.map((task, i) => (
              <div key={`task-${agent.id}-${i}`} className="p-4 rounded-xl bg-zinc-800/30 border border-zinc-700/50 group">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-zinc-200 mb-1">{task.title}</h3>
                    <p className="text-sm text-zinc-400 leading-relaxed">{task.description}</p>
                  </div>
                  <button
                    onClick={() => copyTask(task, i)}
                    className="flex-shrink-0 p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors opacity-0 group-hover:opacity-100"
                    aria-label={`Copy "${task.title}" task prompt`}
                  >
                    {copiedTask === i ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Related Agents */}
      {relatedAgentObjects.length > 0 && (
        <div className="glass rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Users size={16} style={{ color: agent.color }} aria-hidden="true" />
            <h2 className="font-semibold">Related Agents</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {relatedAgentObjects.map(ra => (
              <button
                key={ra.id}
                onClick={() => navigate(`/agent/${ra.id}`)}
                className="flex items-center gap-3 p-3 rounded-xl bg-zinc-800/30 border border-zinc-700/50 hover:border-zinc-600/50 transition-all hover:bg-zinc-800/50 text-left"
                aria-label={`View related agent ${ra.name}`}
              >
                <AgentAvatar iconId={ra.icon_id} color={ra.color} size={40} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-200">{ra.name}</p>
                  <p className="text-xs truncate" style={{ color: ra.color }}>{ra.title}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* System Prompt */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">System Prompt</h2>
          <button onClick={copyPrompt} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors" aria-label="Copy system prompt">
            {copied ? <><Check size={14} className="text-green-400" />Copied</> : <><Copy size={14} />Copy</>}
          </button>
        </div>
        <pre className="text-sm text-zinc-300 whitespace-pre-wrap font-mono bg-zinc-900/50 rounded-xl p-4 leading-relaxed max-h-[500px] overflow-y-auto">
          {agent.system_prompt}
        </pre>
      </div>
    </div>
  );
}
