import { useState, useEffect, useMemo } from 'react';
import { Calendar, Clock, FolderGit2, Cpu, Users, FileText, Zap } from 'lucide-react';
import cronstrue from 'cronstrue';
import AgentAvatar from './AgentAvatar';

// Build the exact prompt each agent receives, matching server/executor.js
// buildAgentPrompt so the user sees what Claude will see.
function composePerAgentPrompt(safetyPreamble, agent, taskPrompt, mode) {
  const parts = [safetyPreamble];
  parts.push(`# You are ${agent.name} — ${agent.title}\n`);
  parts.push(agent.system_prompt || agent.tagline || '');
  parts.push('\n\n---\n\n# Task\n');
  parts.push(taskPrompt);
  parts.push('\n\nEnd your response with a single line starting with "SUMMARY:".');
  return parts.join('');
}

function composeMeetingPrompt(safetyPreamble, agents, taskPrompt) {
  const names = agents.map(a => a.name).join(', ');
  const parts = [safetyPreamble];
  parts.push('# Roundtable Meeting\n\n');
  parts.push(`You are facilitating a roundtable between these personas. Voice each one in turn, staying faithful to their distinct system prompts. Run 3 full rounds with speaker order: ${names}.\n\n`);
  parts.push('## Personas\n\n');
  for (const a of agents) {
    parts.push(`### ${a.name} — ${a.title}\n`);
    parts.push(a.system_prompt || a.tagline || '');
    parts.push('\n\n');
  }
  parts.push('## Topic\n\n');
  parts.push(taskPrompt);
  parts.push('\n\n## Output Format\n\n');
  parts.push('Produce the full meeting transcript. Each contribution on its own lines in the form:\n\n');
  parts.push('**{Name}:** their message\n\n');
  parts.push('End the transcript with a single line starting with "SUMMARY:" naming the decisions reached and any follow-up actions.');
  return parts.join('');
}

export default function SchedulePreview({ schedule = {}, agents = [] }) {
  const safeAgents = Array.isArray(agents) ? agents : [];
  const [safetyPreamble, setSafetyPreamble] = useState('');
  const [nextRuns, setNextRuns] = useState([]);
  const [fullAgents, setFullAgents] = useState(safeAgents);

  useEffect(() => {
    fetch('/api/apps/safety-preamble')
      .then(r => r.text())
      .then(setSafetyPreamble)
      .catch(() => setSafetyPreamble(''));
  }, []);

  // Agents from the list endpoint lack `system_prompt`. Fetch per-agent detail
  // so the preview shows the exact prompt Claude will receive.
  useEffect(() => {
    let cancelled = false;
    const needsFetch = safeAgents.some(a => !a.system_prompt);
    if (!needsFetch) { setFullAgents(safeAgents); return; }
    Promise.all(safeAgents.map(a =>
      a.system_prompt ? a : fetch(`/api/agents/${a.id}`).then(r => r.json()).catch(() => a)
    )).then(resolved => {
      if (!cancelled) setFullAgents(resolved);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents]);

  useEffect(() => {
    if (!schedule.cron_expression) return;
    fetch(`/api/schedules/preview?cron=${encodeURIComponent(schedule.cron_expression)}&count=3`)
      .then(r => r.json())
      .then(d => setNextRuns(d.next || []))
      .catch(() => setNextRuns([]));
  }, [schedule.cron_expression]);

  const cronHuman = useMemo(() => {
    const expr = schedule.cron_expression;
    if (!expr || typeof expr !== 'string' || expr.trim().split(/\s+/).length !== 5) return '';
    try { return cronstrue.toString(expr); } catch { return ''; }
  }, [schedule.cron_expression]);

  const totalCalls = schedule.mode === 'meeting' ? 1 : fullAgents.length;

  return (
    <div className="px-6 py-5 space-y-5">
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <Zap size={14} className="text-violet-400" />
        Review what will be created. This is exactly what Claude sees at run time.
      </div>

      {/* Summary card */}
      <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-4 space-y-3">
        <div>
          <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-1">Name</div>
          <div className="text-sm text-white">{schedule.name}</div>
          {schedule.description && <div className="text-xs text-zinc-400 mt-0.5">{schedule.description}</div>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-1">Mode</div>
            <div className="text-sm text-white capitalize">{schedule.mode}</div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-1">
              <Cpu size={10} className="inline mr-1" /> Model
            </div>
            <div className="text-sm text-white">{schedule.model || 'default (env)'}</div>
          </div>
        </div>

        <div>
          <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-1">
            <FolderGit2 size={10} className="inline mr-1" /> Working directory
          </div>
          <code className="text-xs text-zinc-300 font-mono">
            {schedule.app_directory || '/tmp (unscoped)'}
          </code>
        </div>
      </div>

      {/* Agents */}
      <div>
        <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
          <Users size={12} className="inline mr-1" />
          {fullAgents.length} {fullAgents.length === 1 ? 'agent' : 'agents'} → {totalCalls} claude call{totalCalls === 1 ? '' : 's'}
        </div>
        <div className="flex flex-wrap gap-2">
          {fullAgents.map(a => (
            <div
              key={a.id}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs"
              style={{ backgroundColor: `${a.color}15`, color: a.color, border: `1px solid ${a.color}30` }}
            >
              <AgentAvatar iconId={a.icon_id} color={a.color} size={18} />
              {a.name}
            </div>
          ))}
        </div>
      </div>

      {/* Task prompt */}
      <div>
        <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
          <FileText size={12} className="inline mr-1" />
          Task prompt
        </div>
        <div className="bg-zinc-900/50 border border-white/5 rounded-lg p-3">
          <pre className="text-sm text-zinc-200 whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">
            {schedule.task_prompt || <span className="italic text-zinc-500">(empty)</span>}
          </pre>
        </div>
      </div>

      {/* Schedule */}
      <div>
        <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
          <Clock size={12} className="inline mr-1" />
          Schedule
        </div>
        <div className="bg-zinc-900/50 border border-white/5 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-500 font-mono">{schedule.cron_expression}</span>
            <span className="text-zinc-300 italic">{cronHuman}</span>
          </div>
          {nextRuns.length > 0 && (
            <ul className="text-xs text-zinc-300 space-y-0.5">
              {nextRuns.map((iso, i) => (
                <li key={i} className="flex items-baseline gap-2">
                  <span className="text-zinc-500 w-4">{i + 1}.</span>
                  <span>{new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  <span className="text-zinc-600 font-mono">· {iso}</span>
                </li>
              ))}
            </ul>
          )}
          {!schedule.recurring && <div className="text-xs text-yellow-400/80">One-shot — fires once then auto-completes.</div>}
        </div>
      </div>

      {/* Compiled prompts */}
      <div>
        <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
          <FileText size={12} className="inline mr-1" />
          Compiled prompt{schedule.mode === 'meeting' ? '' : 's'}
        </div>
        {schedule.mode === 'meeting' ? (
          <details className="bg-zinc-900/50 border border-white/5 rounded-lg">
            <summary className="cursor-pointer px-3 py-2 text-sm text-zinc-200 hover:bg-white/5">
              Roundtable coordinator prompt ({fullAgents.length} personas)
            </summary>
            <pre className="px-3 pb-3 text-xs text-zinc-400 whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">
              {composeMeetingPrompt(safetyPreamble, fullAgents, schedule.task_prompt)}
            </pre>
          </details>
        ) : (
          <div className="space-y-1.5">
            {fullAgents.map(a => (
              <details key={a.id} className="bg-zinc-900/50 border border-white/5 rounded-lg">
                <summary className="cursor-pointer px-3 py-2 text-sm flex items-center gap-2 hover:bg-white/5">
                  <AgentAvatar iconId={a.icon_id} color={a.color} size={18} />
                  <span style={{ color: `color-mix(in srgb, ${a.color} 80%, white)` }} className="font-medium">{a.name}</span>
                  <span className="text-zinc-500 text-xs">— {a.title}</span>
                </summary>
                <pre className="px-3 pb-3 text-xs text-zinc-400 whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">
                  {composePerAgentPrompt(safetyPreamble, a, schedule.task_prompt, schedule.mode)}
                </pre>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
