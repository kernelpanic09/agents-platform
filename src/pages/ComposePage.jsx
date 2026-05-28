import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Check, Download, Users, Calendar } from 'lucide-react';
import AgentAvatar from '../components/AgentAvatar';
import ScheduleModal from '../components/ScheduleModal';
import { useSelection } from '../context/SelectionContext';
import { downloadMarkdown } from '../utils/download';
import { copyToClipboard } from '../utils/clipboard';

function mergeAgents(agents) {
  const toolSet = new Set();
  const mcpSet = new Set();
  const sourceMap = new Map();
  const allTasks = [];

  agents.forEach(agent => {
    (agent.tools || []).forEach(t => toolSet.add(t));
    (agent.mcp_servers || []).forEach(m => mcpSet.add(m));
    (agent.knowledge_sources || []).forEach(s => {
      const key = `${s.label}::${s.path || s.url || s.query || ''}`;
      if (!sourceMap.has(key)) sourceMap.set(key, s);
    });
    (agent.example_tasks || []).forEach(t => {
      allTasks.push({ ...t, agent: agent.name });
    });
  });

  const names = agents.map(a => a.name).join(' + ');
  const lines = [`# Task Force: ${names}`, ''];

  // Tools
  if (toolSet.size > 0) {
    lines.push('## Tools');
    [...toolSet].sort().forEach(t => lines.push(`- \`${t}\``));
    lines.push('');
  }

  // MCP Servers
  if (mcpSet.size > 0) {
    lines.push('## MCP Servers');
    [...mcpSet].sort().forEach(m => lines.push(`- ${m}`));
    lines.push('');
  }

  // Knowledge Sources
  if (sourceMap.size > 0) {
    lines.push('## Knowledge Sources');
    [...sourceMap.values()].forEach(s => {
      if (s.path) lines.push(`- **${s.label}**: Read \`${s.path}\``);
      else if (s.url) lines.push(`- **${s.label}**: ${s.url}`);
    });
    lines.push('');
  }

  // Per-agent system prompts
  agents.forEach(agent => {
    lines.push(`## ${agent.name} — ${agent.title}`);
    lines.push(`> ${agent.tagline}`);
    lines.push('');
    lines.push(agent.system_prompt || '_No system prompt defined._');
    lines.push('');
  });

  // Combined example tasks
  if (allTasks.length > 0) {
    lines.push('## Example Tasks');
    allTasks.forEach(t => {
      lines.push(`### ${t.title} (${t.agent})`);
      lines.push(t.description);
      lines.push('');
    });
  }

  // Coordination guidelines
  lines.push('## Coordination Guidelines');
  lines.push(`This task force combines ${agents.length} specialized agents. When handling a request:`);
  lines.push(`1. Identify which agent's expertise is most relevant for each sub-task`);
  lines.push(`2. Use the combined tool set — don't limit yourself to one agent's tools`);
  lines.push(`3. Cross-reference knowledge sources from all agents for comprehensive answers`);
  lines.push(`4. Delegate sub-tasks to the appropriate specialist's approach`);
  lines.push('');

  return lines.join('\n');
}

export default function ComposePage() {
  const { selectedIds, clear } = useSelection();
  const navigate = useNavigate();
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  useEffect(() => {
    if (selectedIds.size < 2) {
      navigate('/');
      return;
    }

    const ids = [...selectedIds];
    Promise.all(ids.map(id => fetch(`/api/agents/${id}`).then(r => r.json())))
      .then(data => {
        setAgents(data);
        setLoading(false);
      })
      .catch(() => {
        navigate('/');
      });
  }, [selectedIds, navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-zinc-700 border-t-violet-500 rounded-full animate-spin" />
      </div>
    );
  }

  const merged = mergeAgents(agents);

  const copyMerged = () => {
    copyToClipboard(merged);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadMerged = () => {
    const names = agents.map(a => a.name.toLowerCase()).join('-');
    downloadMarkdown(merged, `taskforce-${names}.md`);
  };

  const handleBack = () => {
    navigate('/');
  };

  return (
    <div className="animate-fade-in-up" style={{ animationDelay: '0ms' }}>
      <button onClick={handleBack} className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors mb-8">
        <ArrowLeft size={16} />
        Back to directory
      </button>

      {/* Header */}
      <div className="glass rounded-2xl p-8 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Users size={20} className="text-violet-400" />
          <h1 className="text-2xl font-bold">Task Force</h1>
        </div>
        <p className="text-zinc-400 mb-6">
          Composed from {agents.length} agents with de-duplicated tools, MCP servers, and knowledge sources.
        </p>

        {/* Agent chips */}
        <div className="flex flex-wrap gap-3 mb-6">
          {agents.map(a => (
            <div
              key={a.id}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
              style={{
                backgroundColor: `${a.color}12`,
                border: `1px solid ${a.color}25`,
              }}
            >
              <AgentAvatar iconId={a.icon_id} color={a.color} size={24} />
              <span className="text-sm font-medium" style={{ color: a.color }}>{a.name}</span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={copyMerged}
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy to Clipboard'}
          </button>
          <button
            onClick={downloadMerged}
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition-colors"
          >
            <Download size={14} />
            Download .md
          </button>
          <button
            onClick={() => setScheduleOpen(true)}
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition-colors"
          >
            <Calendar size={14} />
            Schedule Task Force
          </button>
          <button
            onClick={() => { clear(); navigate('/'); }}
            className="text-sm px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors"
          >
            Clear Selection
          </button>
        </div>
      </div>

      <ScheduleModal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        onCreated={() => { setScheduleOpen(false); navigate('/schedules'); }}
        preselectedAgents={agents}
      />

      {/* Merged output preview */}
      <div className="glass rounded-2xl p-6">
        <h2 className="font-semibold mb-4">Merged Output</h2>
        <pre className="text-sm text-zinc-300 whitespace-pre-wrap font-mono bg-zinc-900/50 rounded-xl p-4 leading-relaxed max-h-[600px] overflow-y-auto">
          {merged}
        </pre>
      </div>
    </div>
  );
}
