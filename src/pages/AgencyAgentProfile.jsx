import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Copy, Check, Terminal, ExternalLink, Download, Globe } from 'lucide-react';
import { downloadMarkdown } from '../utils/download';
import { copyToClipboard } from '../utils/clipboard';

export default function AgencyAgentProfile() {
  const { id } = useParams();
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showActivate, setShowActivate] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/agency/${id}`)
      .then(r => { if (!r.ok) throw new Error('Agent not found'); return r.json(); })
      .then(data => { setAgent(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [id]);

  const copyPrompt = () => {
    if (!agent?.system_prompt) return;
    copyToClipboard(agent.system_prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const generateActivation = () => {
    const lines = [
      `# ${agent.name}`,
      `> ${agent.description}`,
      '',
    ];

    if (agent.vibe) {
      lines.push(`**Vibe:** ${agent.vibe}`);
      lines.push('');
    }

    if (agent.services?.length) {
      lines.push('## Services');
      agent.services.forEach(s => {
        lines.push(`- **${s.name}**${s.url ? ` — ${s.url}` : ''}${s.tier ? ` (${s.tier})` : ''}`);
      });
      lines.push('');
    }

    lines.push('## System Prompt');
    lines.push(agent.system_prompt);

    return lines.join('\n');
  };

  const downloadActivation = () => {
    downloadMarkdown(generateActivation(), `${agent.name.toLowerCase().replace(/\s+/g, '-')}-agent.md`);
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
          <div
            className="flex-shrink-0 rounded-full flex items-center justify-center text-5xl"
            style={{
              width: 96,
              height: 96,
              backgroundColor: `${agent.color}12`,
              border: `1px solid ${agent.color}25`,
            }}
          >
            {agent.emoji || '🤖'}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h1 className="text-3xl font-bold">{agent.name}</h1>
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: agent.color }} aria-hidden="true" />
              <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 capitalize">
                {agent.category.replace('-', ' ')}
              </span>
            </div>
            {agent.vibe && (
              <p className="text-lg font-medium mb-2 italic" style={{ color: agent.color }}>{agent.vibe}</p>
            )}
            <p className="text-zinc-400 mb-4">{agent.description}</p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowActivate(true)}
                className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-lg transition-colors font-medium"
                style={{
                  backgroundColor: `${agent.color}15`,
                  color: agent.color,
                  border: `1px solid ${agent.color}30`,
                }}
              >
                <Terminal size={14} aria-hidden="true" />
                Activate in Claude Code
              </button>
              <a
                href={`https://github.com/msitarzewski/agency-agents/blob/main/${agent.source_file}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
              >
                <Globe size={14} aria-hidden="true" />
                View on GitHub
              </a>
            </div>
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
                <button onClick={downloadActivation} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition-colors">
                  <Download size={14} aria-hidden="true" />
                  Download .md
                </button>
                <button onClick={copyActivation} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors">
                  <Copy size={14} aria-hidden="true" />
                  Copy to Clipboard
                </button>
              </div>
            </div>
            <p className="text-sm text-zinc-400 mb-3">Paste this into a CLAUDE.md file or use as a system prompt:</p>
            <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-mono bg-zinc-900/80 rounded-xl p-4 leading-relaxed max-h-[50vh] overflow-y-auto">
              {generateActivation()}
            </pre>
          </div>
        </div>
      )}

      {/* Services */}
      {agent.services?.length > 0 && (
        <div className="glass rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Globe size={16} style={{ color: agent.color }} aria-hidden="true" />
            <h2 className="font-semibold">Services</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {agent.services.map((svc, i) => (
              <div key={`svc-${i}`} className="flex items-start gap-3 p-3 rounded-xl bg-zinc-800/30 border border-zinc-700/50">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${agent.color}15` }}>
                  <Globe size={14} style={{ color: agent.color }} aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-200">{svc.name}</p>
                  {svc.tier && (
                    <span className="text-xs text-zinc-500 capitalize">{svc.tier}</span>
                  )}
                </div>
                {svc.url && (
                  <a href={svc.url} target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0">
                    <ExternalLink size={12} aria-hidden="true" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* System Prompt */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">System Prompt</h2>
          <button onClick={copyPrompt} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors">
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
