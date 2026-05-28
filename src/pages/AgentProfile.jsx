import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Check, Wrench, Server, Sparkles, BookOpen, Terminal, Users, ExternalLink, FileText, Database, BarChart3, Globe, Download, Package, Clipboard } from 'lucide-react';
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
  bookstack: '#F59E0B',
  file: '#8B5CF6',
  directory: '#8B5CF6',
  grafana: '#F97316',
  prometheus: '#EF4444',
  url: '#3B82F6',
};

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
        <Link to="/" className="text-violet-400 hover:text-violet-300 transition-colors">Back to directory</Link>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowActivate(false)} role="dialog" aria-label={`Activate ${agent.name}`}>
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

      {/* Skills / Tools / MCP — 3 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="glass rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={16} style={{ color: agent.color }} aria-hidden="true" />
            <h2 className="font-semibold">Skills</h2>
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
