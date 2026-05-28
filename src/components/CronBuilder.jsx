import { useState, useEffect, useMemo } from 'react';
import { Clock, AlertCircle } from 'lucide-react';
import cronstrue from 'cronstrue';

// Compile friendly-picker values into a cron expression.
function buildCron({ frequency, time, dayOfWeek, dayOfMonth }) {
  const [hh, mm] = (time || '09:00').split(':').map(s => parseInt(s, 10));
  switch (frequency) {
    case 'hourly':
      return `${mm} * * * *`;
    case 'daily':
      return `${mm} ${hh} * * *`;
    case 'weekly':
      return `${mm} ${hh} * * ${dayOfWeek ?? 1}`;
    case 'monthly':
      return `${mm} ${hh} ${dayOfMonth ?? 1} * *`;
    default:
      return `${mm} ${hh} * * *`;
  }
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CronBuilder({ value, onChange, recurring = true, onRecurringChange }) {
  const [mode, setMode] = useState('daily'); // daily | hourly | weekly | monthly | once | custom
  const [time, setTime] = useState('09:00');
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [customCron, setCustomCron] = useState('0 9 * * *');
  const [onceDate, setOnceDate] = useState(() => {
    const d = new Date(Date.now() + 10 * 60 * 1000); // 10 min from now default
    return d.toISOString().slice(0, 16);
  });

  const [preview, setPreview] = useState([]);
  const [previewError, setPreviewError] = useState(null);

  const effectiveCron = useMemo(() => {
    if (mode === 'custom') return customCron;
    if (mode === 'once') {
      const d = new Date(onceDate);
      if (isNaN(d.getTime())) return '';
      return `${d.getMinutes()} ${d.getHours()} ${d.getDate()} ${d.getMonth() + 1} *`;
    }
    return buildCron({ frequency: mode, time, dayOfWeek, dayOfMonth });
  }, [mode, time, dayOfWeek, dayOfMonth, customCron, onceDate]);

  useEffect(() => {
    onChange?.(effectiveCron);
    const shouldRecur = mode !== 'once';
    if (onRecurringChange && shouldRecur !== recurring) {
      onRecurringChange(shouldRecur);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveCron, mode]);

  // Load preview whenever effective cron changes
  useEffect(() => {
    if (!effectiveCron) {
      setPreview([]);
      setPreviewError('empty');
      return;
    }
    let aborted = false;
    const url = `/api/schedules/preview?cron=${encodeURIComponent(effectiveCron)}&count=3`;
    fetch(url)
      .then(r => r.json().then(body => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (aborted) return;
        if (!ok) { setPreview([]); setPreviewError(body.error || 'invalid'); }
        else { setPreview(body.next || []); setPreviewError(null); }
      })
      .catch(() => { if (!aborted) setPreviewError('network error'); });
    return () => { aborted = true; };
  }, [effectiveCron]);

  // Initialize from incoming `value` prop on first render only
  useEffect(() => {
    if (value && mode === 'daily' && value !== effectiveCron) {
      setMode('custom');
      setCustomCron(value);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      {/* Frequency picker */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
          Frequency
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {[
            { id: 'once', label: 'Once' },
            { id: 'hourly', label: 'Hourly' },
            { id: 'daily', label: 'Daily' },
            { id: 'weekly', label: 'Weekly' },
            { id: 'monthly', label: 'Monthly' },
            { id: 'custom', label: 'Custom' },
          ].map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setMode(opt.id)}
              className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
                mode === opt.id
                  ? 'bg-violet-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mode-specific inputs */}
      {mode === 'once' && (
        <div>
          <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
            Date &amp; Time
          </label>
          <input
            type="datetime-local"
            value={onceDate}
            onChange={e => setOnceDate(e.target.value)}
            className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 focus:border-violet-500"
          />
          <p className="text-xs text-zinc-500 mt-1">Fires once at this time, then the schedule is marked completed.</p>
        </div>
      )}

      {(mode === 'daily' || mode === 'weekly' || mode === 'monthly') && (
        <div>
          <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
            Time (server local)
          </label>
          <input
            type="time"
            value={time}
            onChange={e => setTime(e.target.value)}
            className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 focus:border-violet-500"
          />
        </div>
      )}

      {mode === 'hourly' && (
        <p className="text-xs text-zinc-500">Fires every hour at minute {time.split(':')[1] || '00'}.</p>
      )}

      {mode === 'weekly' && (
        <div>
          <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
            Day of Week
          </label>
          <div className="grid grid-cols-7 gap-2">
            {DAY_NAMES.map((name, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setDayOfWeek(idx)}
                className={`text-xs px-2 py-2 rounded-lg transition-colors ${
                  dayOfWeek === idx
                    ? 'bg-violet-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === 'monthly' && (
        <div>
          <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
            Day of Month (1-28)
          </label>
          <input
            type="number"
            min={1}
            max={28}
            value={dayOfMonth}
            onChange={e => setDayOfMonth(Math.max(1, Math.min(28, parseInt(e.target.value, 10) || 1)))}
            className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 focus:border-violet-500"
          />
        </div>
      )}

      {mode === 'custom' && (
        <div>
          <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
            Cron Expression
          </label>
          <input
            type="text"
            value={customCron}
            onChange={e => setCustomCron(e.target.value)}
            placeholder="* * * * *"
            className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 focus:border-violet-500"
          />
          <p className="text-xs text-zinc-500 mt-1">Format: minute hour day-of-month month day-of-week</p>
        </div>
      )}

      {/* Preview */}
      <div className="bg-zinc-900/50 border border-white/5 rounded-lg p-3">
        <div className="flex items-center gap-2 text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
          <Clock size={12} />
          Next 3 runs
        </div>
        {previewError ? (
          <div className="flex items-center gap-2 text-xs text-red-400">
            <AlertCircle size={12} />
            Invalid cron: {previewError}
          </div>
        ) : preview.length === 0 ? (
          <div className="text-xs text-zinc-500">…</div>
        ) : (
          <ul className="text-xs text-zinc-300 space-y-1 font-mono">
            {preview.map((iso, i) => {
              const d = new Date(iso);
              return (
                <li key={i}>
                  {d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                  <span className="text-zinc-600"> · {iso}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 text-xs text-zinc-500 font-mono">
        <span>cron: <span className="text-zinc-300">{effectiveCron || '—'}</span></span>
        <span className="text-zinc-400 font-sans italic truncate">
          {(() => {
            if (!effectiveCron || typeof effectiveCron !== 'string') return '';
            if (effectiveCron.trim().split(/\s+/).length !== 5) return '';
            try { return cronstrue.toString(effectiveCron); } catch { return ''; }
          })()}
        </span>
      </div>
    </div>
  );
}
