import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import KpiSparkline from './KpiSparkline';
import { TEAL_SERIES } from './theme';

// Delta arrow badge — up=green, down=red, flat=zinc. `invert` flips the good/bad
// sense (a rising FAILED count is bad, so it uses red for up).
function Delta({ value, invert = false }) {
  if (value == null || Number.isNaN(value)) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] font-medium px-1 py-0.5 rounded-[3px] bg-zinc-800 text-zinc-500">
        <Minus size={10} />
      </span>
    );
  }
  const flat = value === 0;
  const up = value > 0;
  const good = flat ? null : (invert ? !up : up);
  const cls = flat
    ? 'bg-zinc-800 text-zinc-500'
    : good
      ? 'bg-green-500/10 text-green-300'
      : 'bg-red-500/10 text-red-300';
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  const mag = flat ? '' : `${Math.abs(value)}`;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium px-1 py-0.5 rounded-[3px] ${cls}`}>
      <Icon size={10} />
      {mag}
    </span>
  );
}

// One KPI chip: micro-label, big tabular number + delta, 44px sparkline. `accent` is
// the dot/value hue (a live signal-color the eye can scan the strip by).
function Kpi({ label, value, valueCls = 'text-zinc-100', accent, delta, invertDelta, spark, sparkColor, area, sparkKey }) {
  return (
    <div className="group flex flex-col justify-between px-4 first:pl-0 min-w-[124px] flex-1">
      <div className="flex items-center gap-1.5">
        {accent && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: accent }} />}
        <span className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5 mt-0.5">
        <span className={`text-2xl font-semibold tabular-nums leading-none ${valueCls}`}>{value}</span>
        {delta !== undefined && <Delta value={delta} invert={invertDelta} />}
      </div>
      <div className="mt-1.5 h-11 opacity-90 transition-opacity group-hover:opacity-100">
        {spark ? (
          <KpiSparkline data={spark} dataKey={sparkKey || 'c'} color={sparkColor} area={area} gradientId={`kpi-${label}`} height={44} />
        ) : (
          <div className="h-11 flex items-center"><div className="w-full border-t border-dashed border-zinc-800" /></div>
        )}
      </div>
    </div>
  );
}

// 5 fused KPI chips (RUNNING / QUEUED / PENDING / FAILED TODAY / COST 7D).
export default function HeroKpiStrip({ byStatus = {}, costTotal7d = 0, deltas = {}, sparkData = {} }) {
  const num = (n) => (n == null ? '0' : String(n));
  return (
    <div className="flex items-stretch flex-wrap divide-x divide-zinc-800">
      <Kpi
        label="Running"
        value={num(byStatus.running)}
        valueCls="text-teal-300"
        accent={TEAL_SERIES}
        spark={sparkData.running}
        sparkKey="c"
        sparkColor={TEAL_SERIES}
        area
      />
      <Kpi label="Queued" value={num(byStatus.queued)} valueCls="text-zinc-100" accent="#8a8f98" />
      <Kpi label="Pending" value={num(byStatus.pending_approval)} valueCls="text-amber-300" accent="#f59e0b" />
      <Kpi
        label="Failed Today"
        value={num((byStatus.failed || 0) + (byStatus.timeout || 0))}
        valueCls="text-red-300"
        accent="#ef4444"
        invertDelta
      />
      <Kpi
        label="Cost 7d"
        value={`$${Number(costTotal7d || 0).toFixed(2)}`}
        valueCls="text-zinc-100"
        accent="#E0A82E"
        delta={deltas.cost}
        invertDelta
        spark={sparkData.cost}
        sparkKey="cost"
        sparkColor="#E0A82E"
        area
      />
    </div>
  );
}
