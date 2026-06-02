import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Calendar, Users, Sparkles, AlertCircle, FolderGit2, Cpu, ArrowLeft, Eye, Shield } from 'lucide-react';
import cronstrue from 'cronstrue';
import AgentAvatar from './AgentAvatar';
import CronBuilder from './CronBuilder';
import SchedulePreview from './SchedulePreview';

const MODE_INFO = {
  parallel: {
    label: 'Parallel',
    blurb: 'All agents run the same task simultaneously. Best for maintenance: "everyone check your domain and report".',
  },
  sequential: {
    label: 'Sequential',
    blurb: 'Agents run in order. Each sees prior output. Best for pipelines: Sentinel → Bastion → Patch.',
  },
  meeting: {
    label: 'Meeting',
    blurb: 'One transcript with all agents speaking in turn for 3 rounds. Best for brainstorms.',
  },
};

export default function ScheduleModal({ open, onClose, onCreated, preselectedAgents = [], allAgents = null }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState('parallel');
  const [taskPrompt, setTaskPrompt] = useState('');
  const [cronExpression, setCronExpression] = useState('0 9 * * *');
  const [recurring, setRecurring] = useState(true);
  const preSel = Array.isArray(preselectedAgents) ? preselectedAgents : [];
  const [selectedAgentIds, setSelectedAgentIds] = useState(() => preSel.map(a => a.id));
  const [agents, setAgents] = useState(preSel);
  const [agentsList, setAgentsList] = useState(allAgents || []);
  const [appDirectory, setAppDirectory] = useState('');
  const [model, setModel] = useState('');
  const [executionBackend, setExecutionBackend] = useState('');
  const [safetyTier, setSafetyTier] = useState('read_only');
  const [appsList, setAppsList] = useState([]);
  const [previewStep, setPreviewStep] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Load full agents list if we need picker
  useEffect(() => {
    if (!open) return;
    if (allAgents) {
      setAgentsList(allAgents);
      return;
    }
    fetch('/api/agents')
      .then(r => r.ok ? r.json() : [])
      .then(data => setAgentsList(Array.isArray(data) ? data : []))
      .catch(() => setAgentsList([]));
  }, [open, allAgents]);

  // Reset selection when the modal transitions closed → open. NOT on every
  // parent render: `preselectedAgents = []` creates a new array each render,
  // which would otherwise wipe the user's checkbox picks on every re-render.
  useEffect(() => {
    if (!open) return;
    const safe = Array.isArray(preselectedAgents) ? preselectedAgents : [];
    setSelectedAgentIds(safe.map(a => a.id));
    setAgents(safe);
    setPreviewStep(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Load the list of apps for the "Scope to app" dropdown once when modal opens.
  // Guard against non-array responses (e.g. 500 body {error:"..."}) — if the
  // server returns anything other than an array we silently fall back to [].
  useEffect(() => {
    if (!open) return;
    fetch('/api/apps')
      .then(r => r.ok ? r.json() : [])
      .then(data => setAppsList(Array.isArray(data) ? data : []))
      .catch(() => setAppsList([]));
  }, [open]);

  // Close on Escape + lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const selectedAgents = agentsList.length
    ? agentsList.filter(a => selectedAgentIds.includes(a.id))
    : agents;

  const exampleTasks = selectedAgents.flatMap(a =>
    (a.example_tasks || []).map(t => ({ ...t, agent: a.name }))
  );

  const toggleAgent = (id) => {
    setSelectedAgentIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const validateForm = () => {
    if (!name.trim()) return 'Name is required';
    if (!taskPrompt.trim()) return 'Task prompt is required';
    if (selectedAgentIds.length === 0) return 'Select at least one agent';
    if (!cronExpression) return 'Invalid schedule';
    return null;
  };

  // Step 1 → Step 2 transition. Validates before showing preview.
  const handlePreview = (e) => {
    e.preventDefault();
    setError(null);
    const err = validateForm();
    if (err) return setError(err);
    setPreviewStep(true);
  };

  // Final submit from the preview step.
  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/schedules', {
        method: 'POST',
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
          execution_backend: executionBackend || null,
          safety_tier: safetyTier,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Request failed');
      onCreated?.(body);
      // Reset form
      setName('');
      setDescription('');
      setTaskPrompt('');
      setMode('parallel');
      setCronExpression('0 9 * * *');
      setRecurring(true);
      setAppDirectory('');
      setModel('');
      setExecutionBackend('');
      setSafetyTier('read_only');
      setPreviewStep(false);
      onClose?.();
    } catch (err) {
      setError(err.message);
      setPreviewStep(false); // back to form to fix the issue
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal((
    <div
      className="fixed inset-0 z-[100] bg-black/85 overflow-y-auto"
      onClick={onClose}
    >
      <div className="min-h-screen flex items-start sm:items-center justify-center p-4 sm:py-10">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="schedule-modal-title"
          className="relative bg-zinc-950 border border-white/10 rounded-2xl w-full max-w-3xl shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-violet-400" />
            <h2 id="schedule-modal-title" className="text-lg font-semibold">New Schedule</h2>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {previewStep ? (
          <SchedulePreview
            schedule={{
              name: name.trim(),
              description: description.trim(),
              mode,
              task_prompt: taskPrompt.trim(),
              cron_expression: cronExpression,
              recurring,
              app_directory: appDirectory || null,
              model: model || null,
              execution_backend: executionBackend || null,
              safety_tier: safetyTier,
            }}
            agents={selectedAgents}
          />
        ) : (
        <form onSubmit={handlePreview} className="px-6 py-5 space-y-5">
          {/* Name + Description */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Weekly cluster audit"
              required
              className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 focus:border-violet-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Short description for the schedules page"
              className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 focus:border-violet-500"
            />
          </div>

          {/* Agent selector — only shown when no preselection provided */}
          {preSel.length === 0 && (
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
          )}

          {/* Agent chips when preselected */}
          {preSel.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
                <Users size={12} className="inline mr-1" />
                Agents
              </label>
              <div className="flex flex-wrap gap-2">
                {preSel.map(a => (
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
          )}

          {/* Mode */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">Mode</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(MODE_INFO).map(([id, info]) => (
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
                  <div className="text-sm font-medium">{info.label}</div>
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-500 mt-2">{MODE_INFO[mode].blurb}</p>
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
              <p className="text-xs text-zinc-500 mt-1">
                {appDirectory
                  ? <>Agents will <code className="text-zinc-300">cd {appDirectory}</code> and see that app's <code className="text-zinc-300">CLAUDE.md</code>.</>
                  : 'No app context — agents start in /tmp.'}
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
                <Cpu size={12} className="inline mr-1" />
                Model
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'haiku', label: 'Haiku', hint: 'fast · cheap' },
                  { id: 'sonnet', label: 'Sonnet', hint: 'balanced' },
                  { id: 'opus', label: 'Opus', hint: 'deep' },
                ].map(({ id, label, hint }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setModel(model === id ? '' : id)}
                    className={`text-left px-2.5 py-1.5 rounded-lg transition-colors border ${
                      model === id
                        ? 'bg-violet-600/20 border-violet-500 text-white'
                        : 'bg-zinc-900 border-white/10 text-zinc-300 hover:bg-zinc-800'
                    }`}
                  >
                    <div className="text-xs font-medium">{label}</div>
                    <div className="text-[10px] text-zinc-500">{hint}</div>
                  </button>
                ))}
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                {model ? `Override: ${model}` : 'Default (inherits CLAUDE_MODEL env)'}
              </p>
            </div>
          </div>

          {/* Execution backend */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
              <Cpu size={12} className="inline mr-1" />
              Execution backend
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: '', label: 'Default', hint: 'platform setting' },
                { id: 'subscription', label: 'Subscription', hint: 'SSH · no API cost' },
                { id: 'api', label: 'Anthropic API', hint: 'pay-per-token' },
              ].map(({ id, label, hint }) => (
                <button
                  key={id || 'default'}
                  type="button"
                  onClick={() => setExecutionBackend(id)}
                  className={`text-left px-2.5 py-1.5 rounded-lg transition-colors border ${
                    executionBackend === id
                      ? 'bg-violet-600/20 border-violet-500 text-white'
                      : 'bg-zinc-900 border-white/10 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <div className="text-xs font-medium">{label}</div>
                  <div className="text-[10px] text-zinc-500">{hint}</div>
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              {executionBackend === 'api'
                ? 'Runs call the Anthropic API directly (requires ANTHROPIC_API_KEY).'
                : executionBackend === 'subscription'
                ? 'Runs dispatch over SSH to `claude -p` — uses subscription tokens, no API cost.'
                : 'Inherit the platform default (the EXECUTION_BACKEND env var).'}
            </p>
          </div>

          {/* Safety tier */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
              <Shield size={12} className="inline mr-1" />
              Safety tier
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'read_only', label: 'Read-only', hint: 'investigate only' },
                { id: 'controlled_write', label: 'Controlled', hint: 'scoped writes' },
                { id: 'supervised', label: 'Supervised', hint: 'broad + oversight' },
              ].map(({ id, label, hint }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSafetyTier(id)}
                  className={`text-left px-3 py-2 rounded-lg transition-colors border ${
                    safetyTier === id ? 'bg-violet-600/20 border-violet-500 text-white' : 'bg-zinc-900 border-white/10 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <div className="text-sm font-medium">{label}</div>
                  <div className="text-[10px] text-zinc-500">{hint}</div>
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              {safetyTier === 'read_only'
                ? 'Agents may only investigate — no writes (the default guardrail).'
                : safetyTier === 'controlled_write'
                ? 'Scoped, reversible writes allowed; destructive commands stay blocked.'
                : 'Broad changes under human oversight; mass/irreversible destruction stays blocked.'}
            </p>
          </div>

          {/* Task prompt */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">Task Prompt</label>
            <textarea
              value={taskPrompt}
              onChange={e => setTaskPrompt(e.target.value)}
              rows={5}
              placeholder="Describe the task in plain English. e.g. &quot;Check cluster health; report any node with CPU &gt; 80% or disk pressure.&quot;"
              required
              className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 focus:border-violet-500 font-mono"
            />
            {exampleTasks.length > 0 && (
              <details className="mt-2">
                <summary className="text-xs text-zinc-400 cursor-pointer hover:text-zinc-200 inline-flex items-center gap-1">
                  <Sparkles size={12} />
                  Quick fill from agent examples ({exampleTasks.length})
                </summary>
                <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                  {exampleTasks.map((t, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setTaskPrompt(t.description || t.title)}
                      className="w-full text-left px-2 py-1.5 rounded text-xs bg-zinc-900/50 hover:bg-zinc-800 text-zinc-300"
                    >
                      <span className="text-violet-400">{t.agent}:</span> {t.title}
                    </button>
                  ))}
                </div>
              </details>
            )}
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

          {/* Hidden submit button preserves Enter-to-submit from text inputs */}
          <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1}>submit</button>
        </form>
        )}

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-white/10 bg-zinc-950/95 rounded-b-2xl">
          {previewStep ? (
            <>
              <button
                type="button"
                onClick={() => setPreviewStep(false)}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-white transition-colors"
              >
                <ArrowLeft size={14} />
                Back to edit
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={submitting}
                className="px-4 py-2 rounded-lg text-sm bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Creating…' : 'Create Schedule'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-white transition-colors"
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePreview}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Eye size={14} />
                Preview
              </button>
            </>
          )}
        </div>
        </div>
      </div>
    </div>
  ), document.body);
}
