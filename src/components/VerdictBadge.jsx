// Structured run verdict (parsed from the agent's STATUS line).
const STYLES = {
  ok:        { dot: '#22c55e', cls: 'bg-green-500/10 text-green-300 border-green-500/25' },
  attention: { dot: '#f59e0b', cls: 'bg-amber-500/10 text-amber-300 border-amber-500/25' },
  critical:  { dot: '#ef4444', cls: 'bg-red-500/10 text-red-300 border-red-500/25' },
};

export default function VerdictBadge({ verdict }) {
  if (!verdict || !STYLES[verdict]) return null;
  const s = STYLES[verdict];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium ${s.cls}`} title="Agent-reported assessment (STATUS line)">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
      {verdict}
    </span>
  );
}
