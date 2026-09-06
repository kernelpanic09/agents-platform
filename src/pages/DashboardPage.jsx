import { useState, useEffect, useMemo, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';

import HeroKpiStrip from '../components/dashboard/HeroKpiStrip';
import RunVolumeChart from '../components/dashboard/RunVolumeChart';
import ScheduleHealthMatrix from '../components/dashboard/ScheduleHealthMatrix';
import CostLeaderList from '../components/dashboard/CostLeaderList';
import SloGlance from '../components/dashboard/SloGlance';
import TicketsTile from '../components/dashboard/TicketsTile';
import MetricTile from '../components/dashboard/MetricTile';
import RunStatusHeatStrip from '../components/dashboard/RunStatusHeatStrip';
import ModelLatencyBar from '../components/dashboard/ModelLatencyBar';
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
  const [latency, setLatency] = useState(null);
  const [evalRuns, setEvalRuns] = useState(null);
  const [recentFails, setRecentFails] = useState(null);

  const [updatedAt, setUpdatedAt] = useState(Date.now());
  const [tick, setTick] = useState(0);
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    setSummary(null);
    setCosts(null);
    setTickets(null);
    setLatency(null);
    setEvalRuns(null);
    setRecentFails(null);

    fetch('/api/runs/summary').then((r) => r.json()).then(setSummary).catch(() => {});
    fetch('/api/observability/costs?days=7').then((r) => r.json()).then(setCosts).catch(() => {});
    fetch('/api/schedules').then((r) => r.json()).then((d) => setSchedules(Array.isArray(d) ? d : [])).catch(() => {});
    fetch('/api/observability/slo').then((r) => r.json()).then(setSlo).catch(() => {});
    fetch('/api/observability/slo/history?days=30').then((r) => r.json()).then((d) => setSloHistory(Array.isArray(d) ? d : [])).catch(() => {});
    fetch('/api/tickets/summary').then((r) => r.json()).then(setTickets).catch(() => {});
    fetch('/api/observability/latency?days=7').then((r) => r.json()).then(setLatency).catch(() => {});
    fetch('/api/eval/runs').then((r) => r.json()).then((d) => setEvalRuns(Array.isArray(d) ? d : [])).catch(() => {});
    fetch('/api/runs?status=failed&limit=3').then((r) => r.json()).then(setRecentFails).catch(() => {});

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

  // --- Metric strip derived values ---

  // Success rate tile
  const successRate = slo?.metrics?.successRate;
  const successRateValue = successRate != null ? `${Math.round(successRate * 100)}%` : null;
  const successColor = successRate == null ? null
    : successRate >= 0.95 ? 'green'
    : successRate >= 0.80 ? 'amber'
    : 'red';

  // Latency tile: calls-weighted avg across all models
  const latencyValue = useMemo(() => {
    const stats = latency?.stats;
    if (!stats || !stats.length) return null;
    const totalCalls = stats.reduce((s, r) => s + (r.calls || 0), 0);
    if (!totalCalls) return null;
    const weightedMs = stats.reduce((s, r) => s + (r.avg_ms || 0) * (r.calls || 0), 0) / totalCalls;
    return weightedMs >= 1000
      ? `${(weightedMs / 1000).toFixed(1)}s`
      : `${Math.round(weightedMs)}ms`;
  }, [latency]);

  const latencySub = useMemo(() => {
    const p95Ms = slo?.metrics?.p95LatencyMs;
    const modelCount = latency?.stats?.length ?? 0;
    const p95Str = p95Ms != null
      ? (p95Ms >= 1000 ? `p95 <${(p95Ms / 1000).toFixed(1)}s` : `p95 <${Math.round(p95Ms)}ms`)
      : null;
    const modelStr = modelCount > 0 ? `${modelCount} model${modelCount !== 1 ? 's' : ''}` : null;
    return [p95Str, modelStr].filter(Boolean).join(' · ') || null;
  }, [slo, latency]);

  // Eval pass-rate tile
  const evalValue = useMemo(() => {
    if (!evalRuns || !evalRuns.length) return null;
    const completed = evalRuns.filter((r) => r.status === 'completed' || r.status === 'success');
    if (!completed.length) return null;
    const hasCounts = completed.some((r) => r.passed != null && r.total_cases != null);
    if (hasCounts) {
      const totalPassed = completed.reduce((s, r) => s + (r.passed || 0), 0);
      const totalCases  = completed.reduce((s, r) => s + (r.total_cases || 0), 0);
      if (!totalCases) return null;
      return `${Math.round((totalPassed / totalCases) * 100)}%`;
    }
    const scores = completed.map((r) => r.avg_score).filter((v) => v != null);
    if (!scores.length) return null;
    const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
    return avg.toFixed(2);
  }, [evalRuns]);

  const evalSub = useMemo(() => {
    if (!evalRuns || !evalRuns.length) return 'no evals run';
    const completed = evalRuns.filter((r) => r.status === 'completed' || r.status === 'success');
    const suiteNames = [...new Set(completed.map((r) => r.suite_name).filter(Boolean))];
    return suiteNames.length
      ? `${completed.length} run${completed.length !== 1 ? 's' : ''} · ${suiteNames.length} suite${suiteNames.length !== 1 ? 's' : ''}`
      : `${completed.length} run${completed.length !== 1 ? 's' : ''}`;
  }, [evalRuns]);

  // Recent failures tile
  const failCount = recentFails?.total ?? null;
  const failColor = failCount == null ? null : failCount > 0 ? 'red' : 'green';
  const failValue = failCount != null ? String(failCount) : null;
  const failSub = useMemo(() => {
    const rows = recentFails?.data || [];
    return rows
      .slice(0, 3)
      .map((r) => r.schedule_name || `run #${r.id}`)
      .map((n) => (n.length > 28 ? n.slice(0, 26) + '…' : n));
  }, [recentFails]);

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

      {/* Metric tile strip: success rate / latency / eval / failures */}
      <div className="pt-5 animate-fade-in-up">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricTile
            label="Success rate"
            value={successRateValue}
            sub={slo?.sample_size != null ? `${slo.sample_size} runs · 7d` : null}
            color={successColor}
            loading={slo == null}
          />
          <MetricTile
            label="Latency"
            value={latencyValue}
            sub={latencySub}
            loading={latency == null}
          />
          <MetricTile
            label="Eval pass-rate"
            value={evalValue}
            sub={evalSub}
            loading={evalRuns == null}
          />
          <MetricTile
            label="Recent failures"
            value={failValue}
            sub={failSub.length ? failSub : (recentFails != null ? 'none' : null)}
            color={failColor}
            href="/runs"
            loading={recentFails == null}
          />
        </div>
      </div>

      {/* Run activity heat strip — 24h pulse */}
      <div className="pt-3 animate-fade-in-up min-w-0" style={{ animationDelay: '30ms' }}>
        <RunStatusHeatStrip perHour={perHour} />
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
            <div className="animate-fade-in-up" style={{ animationDelay: '80ms' }}>
              <ModelLatencyBar stats={latency?.stats || []} />
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
