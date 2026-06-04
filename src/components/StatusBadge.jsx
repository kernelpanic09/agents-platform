import { CheckCircle, XCircle, Loader, Clock, ShieldQuestion, Ban } from 'lucide-react';

// Run-status pill. Teal = in-progress (the secondary accent), green = success,
// red/orange = failed/timeout, muted = queued.
const STATUS = {
  success: { Icon: CheckCircle, label: 'success', cls: 'bg-green-500/10 text-green-300 border-green-500/25' },
  failed:  { Icon: XCircle,     label: 'failed',  cls: 'bg-red-500/10 text-red-300 border-red-500/25' },
  timeout: { Icon: XCircle,     label: 'timeout', cls: 'bg-orange-500/10 text-orange-300 border-orange-500/25' },
  running: { Icon: Loader,      label: 'running', cls: 'bg-teal-500/15 text-teal-300 border-teal-500/40', spin: true },
  queued:  { Icon: Clock,       label: 'queued',  cls: 'bg-zinc-700/40 text-zinc-300 border-white/10' },
  pending_approval: { Icon: ShieldQuestion, label: 'needs approval', cls: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
  rejected: { Icon: Ban,        label: 'rejected', cls: 'bg-zinc-700/40 text-zinc-400 border-white/10' },
};

export default function StatusBadge({ status }) {
  if (!status) return <span className="text-xs text-zinc-600">Never</span>;
  const s = STATUS[status] || STATUS.queued;
  const { Icon } = s;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium capitalize ${s.cls}`}>
      <Icon size={11} className={s.spin ? 'animate-spin' : ''} aria-hidden="true" />
      {s.label}
    </span>
  );
}
