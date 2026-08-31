// Shared constants for ticket UI components

export const COLUMNS = [
  { key: 'backlog',      label: 'Backlog' },
  { key: 'triaged',     label: 'Triaged' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'in_review',   label: 'In Review' },
  { key: 'done',        label: 'Done' },
];

export const PRIORITY_CLS = {
  critical: 'text-red-300 border-red-500/40 bg-red-500/10',
  high:     'text-amber-300 border-amber-500/40 bg-amber-500/10',
  medium:   'text-sky-300 border-sky-500/30 bg-sky-500/10',
  low:      'text-zinc-400 border-white/10 bg-white/5',
};

export const TYPE_LABEL = { finding: 'Finding', bug: 'Bug', feature: 'Feature', task: 'Task' };
export const SIZES      = ['S', 'M', 'L', 'XL'];
export const PRIORITIES = ['critical', 'high', 'medium', 'low'];
export const TYPES      = ['finding', 'bug', 'feature', 'task'];
export const STATUSES   = ['backlog', 'triaged', 'in_progress', 'in_review', 'done'];

// Relative-time formatter for ticket timestamps (SQLite datetime strings).
export function relTime(ts) {
  if (!ts) return '—';
  const diff = Date.now() - new Date(ts + 'Z').getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
