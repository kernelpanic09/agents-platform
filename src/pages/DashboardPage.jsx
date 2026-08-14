import { useState, useEffect, useMemo, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';

import HeroKpiStrip from '../components/dashboard/HeroKpiStrip';
import RunVolumeChart from '../components/dashboard/RunVolumeChart';
import ScheduleHealthMatrix from '../components/dashboard/ScheduleHealthMatrix';
import CostLeaderList from '../components/dashboard/CostLeaderList';
import SloGlance from '../components/dashboard/SloGlance';
import TicketsTile from '../components/dashboard/TicketsTile';
import { TEAL_SERIES } from '../components/dashboard/theme';

// Split a costs.daily array into (today's, yesterday's) cost for a delta badge.
function costDelta(daily) {
  if (!daily || daily.length < 2) return null;
  const today = Number(daily[daily.length - 1]?.cost || 0);
  const yest = Number(daily[daily.length - 2]?.cost || 0);
  const d = today - yest;
  const cents = Math.round(d * 100);
  return cents === 0 ? 0 : cents / 100;
}

// Global platform operations dashboard — no project scope selector.
// Fetches platform-wide data: run summary, costs, schedules, SLOs, tickets.
export default function DashboardPage() {
  const [summary, setSummary] = useState(null);
  const [costs, setCosts] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [slo, setSlo] = useState(null);
  const [sloHistory, setSloHistory] = useState([]);
  const [tickets, setTickets] = useState(null);

  const [updatedAt, setUpdatedAt] = useState(Date.now());
  const [tick, setTick] = useState(0);
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    setSummary(null);
    setCosts(null);
    setTickets(null);

    fetch('/api/runs/summary').then((r) => r.json()).then(setSummary).catch(() => {});
    fetch('/api/observability/costs?days=7').then((r) => r.json()).then(setCosts).catch(() => {});
    fetch('/api/schedules').then((r) => r.json()).then((d) => setSchedules(Array.isArray(d) ? d : [])).catch(() => {});
    fetch('/api/observability/slo').then((r) => r.json()).then(setSlo).catch(() => {});
    fetch('/api/observability/slo/history?days=30').then((r) => r.json()).then((d) => setSloHistory(Array.isArray(d) ? d : [])).catch(() => {});
    fetch('/api/tickets/summary').then((r) => r.json()).then(setTickets).catch(() => {});

    setUpdatedAt(Date.now());
  }, [tick]);

  // "updated Xs ago" ticker (1s)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const agoSec = Math.max(0, Math.floor((now - updatedAt) / 1000));

  // Derived values
  const byStatus = summary?.byStatus || {};
  const perHour = summary?.perHour || [];
  const costTotal7d = costs?.total ?? 0;
  const agentCosts = costs?.byAgent || [];

  const deltas = useMemo(() => ({ cost: costDelta(costs?.daily) }), [costs]);
  const sparkData = useMemo(() => ({
    running: perHour,
    cost: (costs?.daily || []).map((d) => ({ cost: d.cost })),
  }), [perHour, costs]);

  return (
    <div>
      {/* Command strip — sticky, full-bleed, hero KPI strip */}
      <div className="-mx-5 sm:-mx-6 lg:-mx-8 -mt-8 sticky top-14 md:top-0 z-30 bg-surface-raised border-b border-zinc-800 shadow-card">
        <div className="px-5 sm:px-6 lg:px-8 min-h-14 py-2.5 flex items-center flex-wrap gap-y-2">
          <div className="w-full xl:w-auto xl:flex-1">
            <HeroKpiStrip
              byStatus={byStatus}
              costTotal7d={costTotal7d}
              deltas={deltas}
              sparkData={sparkData}
            />
          </div>

          <div className="flex items-center gap-2 ml-auto pl-4">
            <span className="font-mono text-[11px] text-zinc-600 whitespace-nowrap tabular-nums">
              updated {agoSec}s ago
            </span>
            <button
              type="button"
              onClick={refresh}
              aria-label="Refresh"
              title="Refresh"
              className="group p-1.5 rounded-[3px] text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors active:scale-90"
            >
              <RefreshCw size={14} className="transition-transform duration-300 group-hover:rotate-180" />
            </button>
          </div>
        </div>
      </div>

      {/* Run volume hero chart */}
      <div className="pt-7 animate-fade-in-up">
        <RunVolumeChart perHour={perHour} color={TEAL_SERIES} title="Run volume — platform" />
      </div>

      {/* Section header */}
      <div className="pt-7 pb-4">
        <div className="flex items-center mb-4">
          <span className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Platform operations</span>
        </div>

        {/* Tile grid: 2-wide left + 1-wide right */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Wide region: schedule matrix + cost leaders */}
          <div className="lg:col-span-2 space-y-4">
            <div className="animate-fade-in-up">
              <ScheduleHealthMatrix schedules={schedules} />
            </div>
            <div className="animate-fade-in-up" style={{ animationDelay: '50ms' }}>
              <CostLeaderList agents={agentCosts} />
            </div>
          </div>

          {/* Narrow region: SLO + tickets */}
          <div className="lg:col-span-1 space-y-4">
            <div className="animate-fade-in-up" style={{ animationDelay: '100ms' }}>
              <SloGlance slo={slo} sloHistory={sloHistory} />
            </div>
            <div className="animate-fade-in-up" style={{ animationDelay: '150ms' }}>
              <TicketsTile tickets={tickets} ticketsHref="/tickets" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
