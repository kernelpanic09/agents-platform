import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Calendar, Save, Play, Pause, Trash2, Users, FolderGit2, Cpu,
  FileText, Clock, AlertCircle, CheckCircle, XCircle, Loader, History, RotateCw, Webhook,
} from 'lucide-react';
import AgentAvatar from '../components/AgentAvatar';
import CronBuilder from '../components/CronBuilder';

function Webhooks({ scheduleId }) {
  const [hooks, setHooks] = useState([]);
  const [label, setLabel] = useState('');
  const load = useCallback(() => {
    fetch(`/api/webhooks?schedule_id=${scheduleId}`).then(r => r.json()).then(setHooks).catch(() => {});
  }, [scheduleId]);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    const res = await fetch('/api/webhooks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schedule_id: Number(scheduleId), label }),
    });
    if (res.ok) { setLabel(''); load(); }
  };
  const del = async (hid) => { await fetch(`/api/webhooks/${hid}`, { method: 'DELETE' }); load(); };
  const copy = (txt) => navigator.clipboard?.writeText(txt);
  const base = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="glass rounded-2xl p-6 mb-6">
      <h2 className="text-sm font-medium text-zinc-300 uppercase tracking-wider flex items-center gap-2 mb-1">
        <Webhook size={14} className="text-teal-400" /> Webhook triggers
      </h2>
      <p className="text-xs text-zinc-500 mb-4">
        POST to a tokenized URL to fire this schedule on demand (Prometheus, GitHub Actions, n8n). The token is the credential.
        Use <code className="text-zinc-300">{'{{payload.field}}'}</code> in the task prompt to inject values from the JSON body.
      </p>
      <div className="space-y-2 mb-4">
        {hooks.length === 0 && <div className="text-sm text-zinc-600">No webhooks yet.</div>}
        {hooks.map(h => {
          const url = `${base}/api/webhooks/${h.token}`;
          return (
            <div key={h.id} className="py-2 border-b border-white/5 last:border-0">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-zinc-200">{h.label || 'webhook'}</span>
                <span className="text-[10px] text-zinc-500 ml-auto">fired {h.trigger_count}×</span>
                <button onClick={() => copy(url)} className="text-xs text-teal-400 hover:text-teal-300">copy URL</button>
                <button onClick={() => del(h.id)} className="text-xs text-red-400 hover:text-red-300">delete</button>
              </div>
              <code className="block mt-1 text-xs text-zinc-500 font-mono break-all">{url}</code>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <input value={label} onChange={e => setLabel(e.target.value)} placeholder="label (e.g. prometheus-alert)"
          className="flex-1 bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500" />
        <button onClick={create} className="px-3 py-2 rounded-lg text-sm bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors">Add webhook</button>
      </div>
    </div>
  );
}

const MODE_INFO = {
  parallel: 'All agents run the same task simultaneously.',
  sequential: 'Agents run in order. Each sees prior output.',
  meeting: 'One transcript with all agents speaking in turn.',
};

const MODELS = [
  { id: 'haiku', label: 'Haiku', hint: 'fast · cheap' },
  { id: 'sonnet', label: 'Sonnet', hint: 'balanced' },
  { id: 'opus', label: 'Opus', hint: 'deep' },
];

function formatDuration(ms) {
  if (!ms && ms !== 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}m${s}s`;
}

function RunStatusBadge({ status }) {
  const map = {
    success: { Icon: CheckCircle, color: 'text-green-400' },
    failed: { Icon: XCircle, color: 'text-red-400' },
    timeout: { Icon: XCircle, color: 'text-orange-400' },
    running: { Icon: Loader, color: 'text-teal-400 animate-spin' },
    queued: { Icon: Clock, color: 'text-zinc-400' },
  };
  const { Icon, color } = map[status] || { Icon: Clock, color: 'text-zinc-500' };
  return <span className={`inline-flex items-center gap-1 text-xs ${color}`}><Icon size={12} /> {status || 'never'}</span>;
}

export default function ScheduleDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [schedule, setSchedule] = useState(null);
  const [agentsList, setAgentsList] = useState([]);
  const [appsList, setAppsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saveToast, setSaveToast] = useState(false);

  // Editable fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState('parallel');
  const [taskPrompt, setTaskPrompt] = useState('');
  const [cronExpression, setCronExpression] = useState('0 9 * * *');
  const [recurring, setRecurring] = useState(true);
  const [appDirectory, setAppDirectory] = useState('');
  const [model, setModel] = useState('');
  const [selectedAgentIds, setSelectedAgentIds] = useState([]);
  const [recentRuns, setRecentRuns] = useState([]);

  const hydrate = useCallback((s) => {
    setSchedule(s);
    setName(s.name);
    setDescription(s.description || '');
    setMode(s.mode);
    setTaskPrompt(s.task_prompt);
    setCronExpression(s.cron_expression);
    setRecurring(!!s.recurring);
    setAppDirectory(s.app_directory || '');
    setModel(s.model || '');
    setSelectedAgentIds(Array.isArray(s.agent_ids) ? s.agent_ids : []);
    setRecentRuns(s.recent_runs || []);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sched, agts, apps] = await Promise.all([
        fetch(`/api/schedules/${id}`).then(r => r.ok ? r.json() : Promise.reject(r)),
        fetch('/api/agents').then(r => r.ok ? r.json() : []),
        fetch('/api/apps').then(r => r.ok ? r.json() : []).catch(() => []),
      ]);
      hydrate(sched);
      setAgentsList(Array.isArray(agts) ? agts : []);
      setAppsList(Array.isArray(apps) ? apps : []);
    } catch (e) {
      setError('Schedule not found');
    } finally {
      setLoading(false);
    }
  }, [id, hydrate]);

  useEffect(() => { load(); }, [load]);

  const toggleAgent = (aid) => {
    setSelectedAgentIds(prev =>
      prev.includes(aid) ? prev.filter(x => x !== aid) : [...prev, aid]
    );
  };

  const save = async () => {
    setError(null);
    if (!name.trim()) return setError('Name is required');
    if (!taskPrompt.trim()) return setError('Task prompt is required');
    if (selectedAgentIds.length === 0) return setError('Select at least one agent');

    setSaving(true);
    try {
      const res = await fetch(`/api/schedules/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          agent_ids: selectedAgentIds,
          mode,
          task_prompt: taskPrompt.trim(),
          cron_expression: cronExpression,
          recurring,
          app_directory: appDirectory || null,
          model: model || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Save failed');
      hydrate({ ...body, recent_runs: recentRuns }); // body has no recent_runs
      setSaveToast(true);
      setTimeout(() => setSaveToast(false), 2000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    const res = await fetch(`/api/schedules/${id}/run`, { method: 'POST' });
    const body = await res.json();
    if (!res.ok) return alert(`Run failed: ${body.error || res.statusText}`);
    navigate(`/schedules/runs/${body.run_id}`);
  };

  const togglePause = async () => {
    const action = schedule.status === 'paused' ? 'resume' : 'pause';
    await fetch(`/api/schedules/${id}/${action}`, { method: 'POST' });
    load();
  };

  const del = async () => {
    const msg = schedule.status === 'completed'
      ? `Permanently delete "${schedule.name}" and its run history?`
      : recentRuns.length > 0
        ? `Delete "${schedule.name}"? It will be marked completed and its run history preserved. Delete again to remove permanently.`
        : `Delete "${schedule.name}"?`;
    if (!confirm(msg)) return;
    const res = await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
    if (!res.ok) return alert('Delete failed');
    const body = await res.json();
    if (body.mode === 'hard') navigate('/schedules');
    else load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-zinc-700 border-t-violet-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!schedule) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-400 mb-4">{error || 'Schedule not found.'}</p>
        <Link to="/schedules" className="text-sm text-teal-400 hover:text-teal-300">← Back to schedules</Link>
      </div>
    );
  }

  const isCompleted = schedule.status === 'completed';
  const isPaused = schedule.status === 'paused';

  return (
    <div className="animate-fade-in-up">
      <Link to="/schedules" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors mb-6">
        <ArrowLeft size={16} />
        Back to schedules
      </Link>

      {/* Header card */}
      <div className="glass rounded-2xl p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Calendar size={20} className="text-violet-400" />
            <div>
              <h1 className="text-xl font-bold">{schedule.name}</h1>
              <div className="flex items-center gap-3 text-xs text-zinc-500 mt-0.5">
                <span>Status: <span className="text-zinc-300">{schedule.status}</span></span>
                <span>Created: {new Date(schedule.created_at + 'Z').toLocaleString()}</span>
                {schedule.last_run_at && <span>Last run: {new Date(schedule.last_run_at).toLocaleString()}</span>}
                {schedule.next_run_at && schedule.status === 'active' && <span>Next: {new Date(schedule.next_run_at).toLocaleString()}</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isCompleted && (
              <>
                <button
                  onClick={runNow}
                  className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-green-600/20 border border-green-600/30 text-green-300 hover:bg-green-600/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                >
                  <Play size={14} />
                  Run now
                </button>
                <button
                  onClick={togglePause}
                  className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-yellow-600/20 border border-yellow-600/30 text-yellow-300 hover:bg-yellow-600/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                >
                  <Pause size={14} />
                  {isPaused ? 'Resume' : 'Pause'}
                </button>
              </>
            )}
            <button
              onClick={del}
              className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-red-600/20 border border-red-600/30 text-red-300 hover:bg-red-600/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Edit form */}
      <div className="glass rounded-2xl p-6 mb-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-300 uppercase tracking-wider">Edit schedule</h2>
          {saveToast && <span className="text-xs text-green-400">Saved ✓</span>}
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 focus:border-violet-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">Description</label>
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 focus:border-violet-500"
          />
        </div>

        {/* Agents */}
        <div>
          <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
            <Users size={12} className="inline mr-1" />
            Agents ({selectedAgentIds.length})
          </label>
          <div className="min-h-[120px] max-h-48 overflow-y-auto bg-zinc-900 border border-white/10 rounded-lg p-2 space-y-0.5">
            {agentsList.map(a => (
              <label key={a.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedAgentIds.includes(a.id)}
                  onChange={() => toggleAgent(a.id)}
                  className="accent-violet-500"
                />
                <AgentAvatar iconId={a.icon_id} color={a.color} size={20} />
                <span className="text-sm text-zinc-200">{a.name}</span>
                <span className="text-xs text-zinc-500">— {a.title}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Mode */}
        <div>
          <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">Mode</label>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(MODE_INFO).map(([id, blurb]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={`text-left px-3 py-2 rounded-lg transition-colors border ${
                  mode === id
                    ? 'bg-violet-600/20 border-violet-500 text-white'
                    : 'bg-zinc-900 border-white/10 text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                <div className="text-sm font-medium capitalize">{id}</div>
              </button>
            ))}
          </div>
          <p className="text-xs text-zinc-500 mt-2">{MODE_INFO[mode]}</p>
        </div>

        {/* App scope + Model */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
              <FolderGit2 size={12} className="inline mr-1" />
              Scope to app
            </label>
            <select
              value={appDirectory}
              onChange={e => setAppDirectory(e.target.value)}
              className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 focus:border-violet-500"
            >
              <option value="">— unscoped (/tmp) —</option>
              {appsList.map(a => (
                <option key={a.path} value={a.path}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
              <Cpu size={12} className="inline mr-1" />
              Model
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {MODELS.map(({ id: mid, label, hint }) => (
                <button
                  key={mid}
                  type="button"
                  onClick={() => setModel(model === mid ? '' : mid)}
                  className={`text-left px-2.5 py-1.5 rounded-lg transition-colors border ${
                    model === mid
                      ? 'bg-violet-600/20 border-violet-500 text-white'
                      : 'bg-zinc-900 border-white/10 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <div className="text-xs font-medium">{label}</div>
                  <div className="text-[10px] text-zinc-500">{hint}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Task prompt */}
        <div>
          <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
            <FileText size={12} className="inline mr-1" />
            Task Prompt
          </label>
          <textarea
            value={taskPrompt}
            onChange={e => setTaskPrompt(e.target.value)}
            rows={6}
            className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 focus:border-violet-500"
          />
        </div>

        {/* Schedule */}
        <div>
          <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">Schedule</label>
          <CronBuilder
            value={cronExpression}
            onChange={setCronExpression}
            recurring={recurring}
            onRecurringChange={setRecurring}
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-950/30 border border-red-900/50 rounded-lg px-3 py-2 text-sm text-red-300">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
          >
            <Save size={14} />
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      {/* Webhook triggers */}
      {!isCompleted && <Webhooks scheduleId={id} />}

      {/* Recent runs */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-zinc-300 uppercase tracking-wider flex items-center gap-2">
            <History size={14} className="text-violet-400" />
            Recent runs
          </h2>
          {recentRuns.length > 0 && (
            <Link to={`/runs?schedule_id=${id}`} className="text-xs text-zinc-400 hover:text-white transition-colors">
              View all →
            </Link>
          )}
        </div>
        {recentRuns.length === 0 ? (
          <p className="text-sm text-zinc-500 italic">No runs yet. Click "Run now" above to trigger one.</p>
        ) : (
          <ul className="space-y-2">
            {recentRuns.map(r => (
              <li key={r.id}>
                <Link
                  to={`/schedules/runs/${r.id}`}
                  className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-zinc-900/40 border border-white/5 hover:bg-zinc-900/70 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <RunStatusBadge status={r.status} />
                    <span className="text-xs text-zinc-400 font-mono">
                      {new Date((r.started_at || r.created_at) + (r.started_at ? '' : 'Z')).toLocaleString()}
                    </span>
                    <span className="text-xs text-zinc-300 truncate">{r.summary || r.error_message || ''}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-zinc-500 shrink-0">
                    <span>{formatDuration(r.duration_ms)}</span>
                    <RotateCw size={12} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
