import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle, XCircle, Loader, Clock, RotateCw, FileText, Users, Code } from 'lucide-react';
import AgentAvatar from '../components/AgentAvatar';

function StatusIcon({ status, size = 16 }) {
  const map = {
    success: { Icon: CheckCircle, color: 'text-green-400' },
    failed: { Icon: XCircle, color: 'text-red-400' },
    timeout: { Icon: XCircle, color: 'text-orange-400' },
    running: { Icon: Loader, color: 'text-teal-400 animate-spin' },
    queued: { Icon: Clock, color: 'text-zinc-400' },
  };
  const { Icon, color } = map[status] || { Icon: Clock, color: 'text-zinc-500' };
  return <Icon size={size} className={color} />;
}

function formatDuration(ms) {
  if (!ms && ms !== 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}m${s}s`;
}

// Parse meeting transcript into speaker blocks: [{ speaker, text }]
function parseMeetingTranscript(text) {
  if (!text) return [];
  // Claude -p JSON output: the `result` field is raw text. Sometimes includes the outer JSON.
  let body = text;
  try {
    const parsed = JSON.parse(text);
    body = parsed.result || text;
  } catch { /* text is already the body */ }

  const lines = body.split('\n');
  const blocks = [];
  let current = null;
  const SPEAKER_RE = /^\s*\*\*([^*:]+?)(?:\s*—[^*]*)?\*\*:\s*(.*)$/;

  for (const line of lines) {
    const m = line.match(SPEAKER_RE);
    if (m) {
      if (current) blocks.push(current);
      current = { speaker: m[1].trim(), text: m[2] };
    } else if (current) {
      current.text += '\n' + line;
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

export default function RunDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [run, setRun] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const setTab = useCallback((newTab) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', newTab);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const [rerunning, setRerunning] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/runs/${id}`)
      .then(r => r.json())
      .then(data => {
        setRun(data);
        setLoading(false);
        // Auto-refresh if still running
        if (data.status === 'running' || data.status === 'queued') {
          setTimeout(() => {
            fetch(`/api/runs/${id}`).then(r => r.json()).then(setRun);
          }, 3000);
        }
      })
      .catch(() => setLoading(false));
  }, [id]);

  const rerun = async () => {
    if (!run) return;
    setRerunning(true);
    try {
      const res = await fetch(`/api/schedules/${run.schedule_id}/run`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      navigate(`/schedules/runs/${body.run_id}`);
    } catch (err) {
      alert(`Re-run failed: ${err.message}`);
    } finally {
      setRerunning(false);
    }
  };

  if (loading || !run) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-zinc-700 border-t-violet-500 rounded-full animate-spin" />
      </div>
    );
  }

  const perAgent = run.per_agent_output || {};
  const hasPerAgent = Object.keys(perAgent).length > 0;
  const meetingBlocks = run.mode === 'meeting' ? parseMeetingTranscript(run.transcript) : [];

  const agentByName = Object.fromEntries((run.agents || []).map(a => [a.name, a]));

  // Default tab picks the most relevant view for this run's shape
  const defaultTab = hasPerAgent ? 'per-agent' : (run.mode === 'meeting' ? 'transcript' : 'raw');
  const tab = searchParams.get('tab') || defaultTab;

  return (
    <div className="animate-fade-in-up">
      <Link to="/schedules" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors mb-6">
        <ArrowLeft size={16} />
        Back to schedules
      </Link>

      {/* Header card */}
      <div className="glass rounded-2xl p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <StatusIcon status={run.status} size={20} />
              <h1 className="text-xl font-bold">{run.schedule_name || `Run #${run.id}`}</h1>
              <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 uppercase">{run.mode}</span>
            </div>
            <div className="text-sm text-zinc-400 flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
              <span>Status: <span className="text-white">{run.status}</span></span>
              <span>Duration: {formatDuration(run.duration_ms)}</span>
              <span>Started: {run.started_at ? new Date(run.started_at).toLocaleString() : '—'}</span>
              <span>Finished: {run.finished_at ? new Date(run.finished_at).toLocaleString() : '—'}</span>
            </div>
          </div>
          <button
            onClick={rerun}
            disabled={rerunning}
            className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors disabled:opacity-50"
          >
            <RotateCw size={14} className={rerunning ? 'animate-spin' : ''} />
            Re-run
          </button>
        </div>

        {/* Agent chips */}
        {(run.agents || []).length > 0 && (
          <div className="flex items-center gap-2 flex-wrap mt-4 pt-4 border-t border-white/5">
            <Users size={14} className="text-zinc-500" />
            {run.agents.map(a => (
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
        )}
      </div>

      {/* Error banner */}
      {run.error_message && (
        <div className="bg-red-950/30 border border-red-900/50 rounded-xl px-4 py-3 text-sm text-red-300 mb-6">
          <span className="font-medium">Error:</span> {run.error_message}
        </div>
      )}

      {/* Summary */}
      <div className="glass rounded-2xl p-6 mb-6">
        <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <FileText size={12} /> Summary
        </h2>
        {run.summary ? (
          <p className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed">{run.summary}</p>
        ) : (
          <p className="text-sm text-zinc-500 italic">No summary extracted.</p>
        )}
      </div>

      {/* Task prompt */}
      <details className="glass rounded-2xl p-6 mb-6">
        <summary className="text-xs font-medium text-zinc-400 uppercase tracking-wider cursor-pointer">Task prompt</summary>
        <pre className="text-sm text-zinc-300 whitespace-pre-wrap font-mono bg-zinc-900/50 rounded-lg p-3 mt-3 max-h-64 overflow-y-auto">{run.task_prompt}</pre>
      </details>

      {/* Tabs */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="flex border-b border-white/5 flex-wrap" role="tablist" aria-label="Run output views">
          {hasPerAgent && (
            <button
              role="tab"
              aria-selected={tab === 'per-agent'}
              onClick={() => setTab('per-agent')}
              className={`px-4 py-3 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-inset ${tab === 'per-agent' ? 'text-white bg-white/5' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              Per-agent output
            </button>
          )}
          {run.mode === 'meeting' && (
            <button
              role="tab"
              aria-selected={tab === 'transcript'}
              onClick={() => setTab('transcript')}
              className={`px-4 py-3 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-inset ${tab === 'transcript' ? 'text-white bg-white/5' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              Transcript
            </button>
          )}
          <button
            role="tab"
            aria-selected={tab === 'raw'}
            onClick={() => setTab('raw')}
            className={`px-4 py-3 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-inset ${tab === 'raw' ? 'text-white bg-white/5' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            <Code size={12} className="inline mr-1" /> Raw
          </button>
        </div>

        <div className="p-6">
          {tab === 'per-agent' && hasPerAgent && (
            <div className="grid gap-4 md:grid-cols-2">
              {Object.entries(perAgent).map(([name, output]) => {
                const agent = agentByName[name];
                const color = agent?.color || '#A78BFA';
                const nameColor = `color-mix(in srgb, ${color} 80%, white)`;
                return (
                  <div key={name} className="bg-zinc-900/50 border border-white/5 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3 pb-3 border-b border-white/5">
                      {agent && <AgentAvatar iconId={agent.icon_id} color={color} size={22} />}
                      <span className="font-medium" style={{ color: nameColor }}>{name}</span>
                    </div>
                    <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-mono max-h-96 overflow-y-auto leading-relaxed">
                      {typeof output === 'string' ? output : JSON.stringify(output, null, 2)}
                    </pre>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'transcript' && run.mode === 'meeting' && (
            <div className="space-y-4">
              {meetingBlocks.length === 0 ? (
                <pre className="text-xs text-zinc-400 whitespace-pre-wrap font-mono">{run.transcript}</pre>
              ) : (
                meetingBlocks.map((b, i) => {
                  const agent = agentByName[b.speaker];
                  const color = agent?.color || '#A78BFA';
                  // Blend 80% agent color with 20% white for better contrast on zinc-950
                  const nameColor = `color-mix(in srgb, ${color} 80%, white)`;
                  return (
                    <div key={i} className="flex gap-3">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-zinc-900 border border-white/5 flex items-center justify-center">
                        {agent ? <AgentAvatar iconId={agent.icon_id} color={color} size={28} /> : null}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold mb-1" style={{ color: nameColor }}>{b.speaker}</div>
                        <div className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed">
                          {b.text.trim()}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {tab === 'raw' && (
            <pre className="text-xs text-zinc-400 whitespace-pre-wrap font-mono bg-zinc-900/50 rounded-lg p-3 max-h-[600px] overflow-y-auto">
              {run.transcript || '(empty)'}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
