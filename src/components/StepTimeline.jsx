import { Terminal, FileText, Globe, Server, Wand2, Cpu, MessageSquare, Flag, Search, Play } from 'lucide-react';

// Icon by tool name (steps come from claude's stream-json tool_use events).
function iconFor(step) {
  if (step.kind === 'init') return Play;
  if (step.kind === 'result') return Flag;
  if (step.kind === 'text') return MessageSquare;
  const n = (step.name || '').toLowerCase();
  if (n.startsWith('mcp__')) return Server;
  if (n === 'bash') return Terminal;
  if (n === 'skill') return Wand2;
  if (['read', 'write', 'edit', 'multiedit', 'notebookedit'].includes(n)) return FileText;
  if (['grep', 'glob'].includes(n)) return Search;
  if (['webfetch', 'websearch'].includes(n)) return Globe;
  return Cpu;
}

const KIND_COLORS = {
  init: 'text-zinc-500',
  text: 'text-zinc-400',
  result: 'text-emerald-400',
};

function toolColor(step) {
  if (KIND_COLORS[step.kind]) return KIND_COLORS[step.kind];
  const n = (step.name || '').toLowerCase();
  if (n.startsWith('mcp__')) return 'text-sky-300';
  if (n === 'skill') return 'text-violet-300';
  return 'text-amber-300';
}

function fmtOffset(ms) {
  if (ms == null) return '';
  return `+${(ms / 1000).toFixed(1)}s`;
}

/**
 * Vertical step timeline for one agent's dispatch: every tool call (Bash,
 * Read, mcp__*, Skill, ...) as it happened, with wall-clock offsets.
 * Used live (steps streamed over SSE) and post-hoc (steps persisted on the
 * trace).
 */
export default function StepTimeline({ steps = [], compact = false }) {
  if (!steps.length) return null;
  return (
    <ol className={`space-y-0.5 ${compact ? '' : 'mt-2'}`}>
      {steps.map((s, i) => {
        const Icon = iconFor(s);
        return (
          <li key={i} className="flex items-center gap-2 text-[12px] leading-relaxed min-w-0">
            <span className="text-[10px] font-mono text-zinc-600 w-12 shrink-0 text-right">{fmtOffset(s.atMs)}</span>
            <Icon size={12} className={`shrink-0 ${toolColor(s)}`} aria-hidden="true" />
            <span className={`font-mono shrink-0 ${toolColor(s)}`}>{s.kind === 'text' ? '·' : (s.name || s.kind)}</span>
            <span className="text-zinc-500 font-mono truncate">{s.detail}</span>
          </li>
        );
      })}
    </ol>
  );
}
