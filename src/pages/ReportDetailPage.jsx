import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ResponsiveContainer, LineChart, Line } from 'recharts';
import ReportTrends from './ReportTrends';
import { RefreshCw, Loader2, Lightbulb, CheckSquare, ArrowLeft, AlertTriangle, Terminal, ChevronRight } from 'lucide-react';
import VerdictBadge from '../components/VerdictBadge';
import AgentAvatar from '../components/AgentAvatar';
import { timeAgo } from './ReportsPage';
import { parseMetric, healthScore, deltaSense } from '../lib/metric';
import { Pane, TrendRow, LegendDot, VERDICT_HEX, STATE_HEX, TEAL, GAUGE_EMPTY, NO_RUN } from '../components/reportUI';

// "Terminal deck" dashboard: framed panes, block-char gauges, a verdict trend, and a
// stat strip — all derived from the report build + deterministic timeline. No fabricated
// numbers: gauges visualize ratios/percentages the agents already reported.
const GAUGE_CELLS = 10;

const slugifyClient = (label) => String(label || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const PRIORITY_CLS = {
  high: 'bg-red-500/10 text-red-300 border-red-500/25',
  medium: 'bg-amber-500/10 text-amber-300 border-amber-500/25',
  low: 'bg-zinc-700/40 text-zinc-400 border-white/10',
};

const shortAge = (ts) => timeAgo(ts).replace(' ago', '');

// ---------- presentational pieces ----------

function StatCell({ label, value, unit, sub, color }) {
  return (
    <div className="glass rounded-xl px-4 py-3.5">
      <div className="text-[9.5px] uppercase tracking-wider text-zinc-500 font-semibold">{label}</div>
      <div className="text-2xl font-bold leading-none mt-1.5" style={{ color: color || 'white' }}>
        {value}{unit && <span className="text-[13px] text-zinc-500 font-semibold">{unit}</span>}
      </div>
      {sub && <div className="text-[11px] text-zinc-400 mt-1.5">{sub}</div>}
    </div>
  );
}

function MetricRow({ m, color, series }) {
  const pct = parseMetric(m.value);
  const filled = pct == null ? 0 : Math.max(0, Math.min(GAUGE_CELLS, Math.round((pct / 100) * GAUGE_CELLS)));
  const pts = (series?.points || []).filter(p => p.v != null).slice(-14).map(p => ({ v: p.v }));
  const delta = series?.delta ?? null;
  const sense = deltaSense(series?.direction, delta);
  const deltaColor = sense === 'good' ? '#22c55e' : sense === 'bad' ? '#ef4444' : '#71717a';
  const arrow = delta == null || delta === 0 ? '' : delta > 0 ? '▲' : '▼';
  return (
    <div className="grid grid-cols-[5.25rem_1fr_auto] items-center gap-2.5">
      <span className="text-[11.5px] text-zinc-400 truncate" title={m.label}>{m.label}</span>
      {pct == null ? <span /> : (
        <span className="font-mono text-[13px] leading-none tracking-tight whitespace-nowrap overflow-hidden">
          <span style={{ color }}>{'█'.repeat(filled)}</span>
          <span style={{ color: GAUGE_EMPTY }}>{'█'.repeat(GAUGE_CELLS - filled)}</span>
        </span>
      )}
      <span className="flex items-center gap-1.5 justify-end">
        {pts.length >= 2 && (
          <span className="w-12 h-4 inline-block opacity-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={pts}><Line type="monotone" dataKey="v" stroke={color} strokeWidth={1} dot={false} isAnimationActive={false} /></LineChart>
            </ResponsiveContainer>
          </span>
        )}
        {arrow && <span className="font-mono text-[10px]" style={{ color: deltaColor }} title={`Δ ${delta} vs previous build`}>{arrow}{Math.abs(delta)}</span>}
        <span className="font-mono font-semibold text-[11px] text-right tabular-nums truncate max-w-[7.5rem]" title={m.value} style={{ color: pct == null ? '#C2BAA9' : color }}>{m.value}</span>
      </span>
    </div>
  );
}

// Member section: glanceable by default (verdict + gauges), prose tucked behind "Details".
function MemberPane({ s, member, agents, src, seriesByKey = {}, slug }) {
  const [open, setOpen] = useState(false);
  const [runExcerpt, setRunExcerpt] = useState(null);
  useEffect(() => {
    if (!open || !src?.run_id || runExcerpt !== null) return;
    fetch(`/api/runs/${src.run_id}`).then(r => r.json()).then(run => {
      const out = run.per_agent_output || {};
      const text = Object.entries(out).map(([a, t]) => `▸ ${a}\n${String(t).slice(0, 600)}`).join('\n\n');
      setRunExcerpt(text || 'No per-agent output recorded for this run.');
    }).catch(() => setRunExcerpt('Could not load run output.'));
  }, [open, src, runExcerpt]);
  const vcolor = VERDICT_HEX[s.verdict] || TEAL;
  const hasMetrics = s.metrics?.length > 0;
  const hasDetails = !!(s.summary || s.findings?.length);

  return (
    <Pane title={s.title} color={vcolor} dot={vcolor} className="flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex -space-x-1.5">
          {agents.slice(0, 4).map(a => (
            <div key={a.id} title={a.name} className="w-6 h-6 rounded-full bg-surface border border-[#2A261F] flex items-center justify-center">
              <AgentAvatar iconId={a.icon_id} color={a.color} size={18} />
            </div>
          ))}
        </div>
        <VerdictBadge verdict={s.verdict} />
      </div>

      {hasMetrics && (
        <div className="space-y-1.5">
          {s.metrics.map((m, i) => {
            const series = seriesByKey[`sched${s.schedule_id}.${slugifyClient(m.label)}`]
              || Object.values(seriesByKey).find(x => x.schedule_id === s.schedule_id && x.label === m.label);
            return <MetricRow key={i} m={m} color={vcolor} series={series} />;
          })}
        </div>
      )}

      {/* No gauges to glance at → a one-line teaser so the pane isn't empty when collapsed */}
      {!hasMetrics && !open && s.summary && (
        <p className="text-[12.5px] text-zinc-400 leading-relaxed line-clamp-1">{s.summary}</p>
      )}

      {open && (
        <div className="mt-3 space-y-2.5">
          {s.summary && <p className="text-[12.5px] text-zinc-300 leading-relaxed">{s.summary}</p>}
          {s.findings?.length > 0 && (
            <ul className="space-y-1">
              {s.findings.map((f, i) => (
                <li key={i} className="text-[12px] text-zinc-400 flex gap-2">
                  <span className="text-zinc-600 shrink-0">▸</span><span>{f}</span>
                </li>
              ))}
            </ul>
          )}
          {runExcerpt && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Source run output</div>
              <pre className="text-[11px] text-zinc-400 bg-black/20 rounded-md p-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono leading-relaxed">{runExcerpt}</pre>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            {src && <Link to={`/schedules/runs/${src.run_id}`} className="text-zinc-400 hover:text-teal-300">open run →</Link>}
            <Link to={`/schedules/${s.schedule_id}`} className="text-zinc-400 hover:text-teal-300">schedule →</Link>
            <Link to={`/reports/${slug}?tab=trends`} className="text-zinc-400 hover:text-teal-300">metric history →</Link>
          </div>
        </div>
      )}

      <div className="mt-auto pt-2.5 flex items-center justify-between gap-2 border-t border-white/5">
        {hasDetails ? (
          <button
            onClick={() => setOpen(o => !o)}
            className="text-[11px] text-zinc-500 hover:text-zinc-200 inline-flex items-center gap-1 transition-colors"
            aria-expanded={open}
          >
            <ChevronRight size={12} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
            {open ? 'Hide details' : `Details${s.findings?.length ? ` · ${s.findings.length}` : ''}`}
          </button>
        ) : <span />}
        <span className="text-[11px] text-zinc-500 truncate min-w-0">
          {src
            ? <Link to={`/schedules/runs/${src.run_id}`} className="hover:text-violet-300">run #{src.run_id} · {timeAgo(src.finished_at)} →</Link>
            : 'no source run'}
        </span>
      </div>
    </Pane>
  );
}

// ---------- page ----------

export default function ReportDetailPage() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [agentsById, setAgentsById] = useState({});
  const [notFound, setNotFound] = useState(false);
  const buildingRef = useRef(false);

  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') === 'trends' ? 'trends' : 'briefing';
  const setTab = (t) => setSp(prev => {
    const n = new URLSearchParams(prev);
    if (t === 'trends') n.set('tab', 'trends'); else n.delete('tab');
    return n;
  }, { replace: true });

  const [metrics, setMetrics] = useState(null);
  const [range, setRange] = useState(30);
  const loadMetrics = useCallback(() => {
    fetch(`/api/reports/${slug}/metrics?days=${range}`).then(r => r.json()).then(setMetrics).catch(() => {});
  }, [slug, range]);
  useEffect(() => { loadMetrics(); }, [loadMetrics]);
  // Re-fetch the metric series whenever a new build lands (via Build now or a background
  // rebuild picked up by the poll) so sparklines/Trends stay in sync with the Briefing.
  const latestBuildId = data?.latest?.id;
  useEffect(() => { if (latestBuildId) loadMetrics(); }, [latestBuildId, loadMetrics]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/reports/${slug}`);
    if (res.status === 404) { setNotFound(true); return; }
    const body = await res.json();
    buildingRef.current = !!body.building;
    setData(body);
  }, [slug]);

  useEffect(() => {
    load();
    fetch('/api/agents').then(r => r.json()).then(list => {
      const map = {}; for (const a of list) map[a.id] = a; setAgentsById(map);
    }).catch(() => {});
  }, [load]);

  // Poll: every 60s normally, every 5s while a build is in flight.
  useEffect(() => {
    const slow = setInterval(() => { if (!buildingRef.current) load(); }, 60000);
    const fast = setInterval(() => { if (buildingRef.current) load(); }, 5000);
    return () => { clearInterval(slow); clearInterval(fast); };
  }, [load]);

  const buildNow = async () => {
    const res = await fetch(`/api/reports/${slug}/build`, { method: 'POST' });
    if (res.ok || res.status === 409) { buildingRef.current = true; load(); }
  };

  if (notFound) {
    return (
      <div className="glass rounded-2xl p-12 text-center">
        <p className="text-zinc-400">Report not found.</p>
        <Link to="/reports" className="text-sm text-violet-400 hover:text-violet-300">← All reports</Link>
      </div>
    );
  }
  if (!data) {
    return <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-2 border-zinc-700 border-t-violet-500 rounded-full animate-spin" /></div>;
  }

  const c = data.latest?.content || null;
  const sections = c?.sections || [];
  const sourceRuns = data.latest?.source_runs || [];
  const membersById = Object.fromEntries(data.members.map(m => [m.schedule_id, m]));
  const newestSource = sourceRuns.reduce((acc, r) => (!acc || r.finished_at > acc ? r.finished_at : acc), null);
  const oldestSource = sourceRuns.reduce((acc, r) => (!acc || r.finished_at < acc ? r.finished_at : acc), null);

  const score = c ? healthScore(sections) : null;
  const scoreColor = score == null ? 'white' : score >= 75 ? VERDICT_HEX.ok : score >= 50 ? VERDICT_HEX.attention : VERDICT_HEX.critical;
  const counts = sections.reduce((a, s) => { if (s.verdict) a[s.verdict] = (a[s.verdict] || 0) + 1; return a; }, {});
  const actions = c?.action_items || [];
  const highActions = actions.filter(a => a.priority === 'high').length;
  const medActions = actions.filter(a => a.priority === 'medium').length;

  return (
    <div className="animate-fade-in-up space-y-4">
      <Link to="/reports" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-white transition-colors">
        <ArrowLeft size={14} /> Reports
      </Link>

      {/* Failure banner (previous good build still shown below) */}
      {data.last_build?.status === 'failed' && (
        <div className="flex items-center gap-2 bg-amber-950/30 border border-amber-900/50 rounded-xl px-4 py-2.5 text-sm text-amber-300">
          <AlertTriangle size={15} className="shrink-0" />
          Last rebuild failed{data.last_build.error_message ? `: ${data.last_build.error_message.slice(0, 160)}` : ''}.
          {c ? ' Showing the previous successful build.' : ''}
        </div>
      )}

      {/* Briefing */}
      <Pane title="Briefing" icon={Terminal}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold">{data.name}</h1>
              {c && <VerdictBadge verdict={c.overall_verdict} />}
              {data.building && (
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/25 text-violet-300">
                  <Loader2 size={11} className="animate-spin" /> building…
                </span>
              )}
            </div>
            {c && <p className="text-[15px] text-zinc-200 leading-snug mt-2">{c.headline}</p>}
          </div>
          <button
            onClick={buildNow}
            disabled={data.building}
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-medium transition-colors shrink-0"
          >
            <RefreshCw size={14} className={data.building ? 'animate-spin' : ''} />
            {data.building ? 'Building…' : 'Build now'}
          </button>
        </div>
        {c && <p className="text-[13px] text-zinc-300 leading-relaxed mt-3">{c.executive_summary}</p>}
        <p className="text-[11px] text-zinc-500 mt-3 font-mono">
          {data.latest
            ? <>built {timeAgo(data.latest.created_at)} · {sourceRuns.length} source run{sourceRuns.length === 1 ? '' : 's'}{newestSource ? ` · newest ${timeAgo(newestSource)}` : ''} · synthesized in {Math.round((data.latest.duration_ms || 0) / 1000)}s{data.model ? ` · model ${data.model}` : ''}</>
            : 'no successful build yet'}
        </p>
      </Pane>

      {!c ? (
        <div className="glass rounded-2xl p-12 text-center text-zinc-400">
          {data.building ? 'First build in progress — the agents are meeting…' : 'Hit "Build now" to generate the first briefing from the members\' latest runs.'}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1 border-b border-white/5">
            {[['briefing', 'Briefing'], ['trends', 'Trends']].map(([t, lbl]) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t ? 'border-teal-400 text-teal-300' : 'border-transparent text-zinc-500 hover:text-zinc-200'}`}>
                {lbl}
              </button>
            ))}
          </div>

          {tab === 'trends' ? (
            <ReportTrends data={data} metrics={metrics} range={range} setRange={setRange} />
          ) : (
            <>
              {/* Stat strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCell
                  label="Health score" value={score} unit="/100" color={scoreColor}
                  sub={`${counts.ok || 0} ok · ${counts.attention || 0} attention · ${counts.critical || 0} critical`}
                />
                <StatCell
                  label="Probes" value={sourceRuns.length} unit={`/${data.members.length}`}
                  sub={sourceRuns.length === data.members.length ? 'all teams reporting' : 'teams reporting'}
                />
                <StatCell
                  label="Open actions" value={actions.length} color={highActions ? VERDICT_HEX.critical : actions.length ? VERDICT_HEX.attention : VERDICT_HEX.ok}
                  sub={actions.length ? `${highActions} high · ${medActions} medium` : 'none open'}
                />
                <StatCell
                  label="Freshest data" value={newestSource ? shortAge(newestSource) : '—'}
                  sub={oldestSource ? `oldest ${timeAgo(oldestSource)}` : 'no source runs'}
                />
              </div>

              {/* Member panes — glanceable by default; summary + findings behind "Details" (2-up) */}
              <div className="grid md:grid-cols-2 gap-3 items-start">
                {(() => {
                  const seriesByKey = Object.fromEntries((metrics?.metrics || []).map(m => [m.key, m]));
                  return sections.map(s => {
                    const member = membersById[s.schedule_id];
                    const agents = (member?.agent_ids || []).map(id => agentsById[id]).filter(Boolean);
                    const src = sourceRuns.find(r => r.schedule_id === s.schedule_id);
                    return <MemberPane key={s.schedule_id} s={s} member={member} agents={agents} src={src} seriesByKey={seriesByKey} slug={slug} />;
                  });
                })()}
              </div>

              {/* 14-day verdict trend */}
              <Pane title="14-day verdict trend">
                <div className="space-y-2 mt-1">
                  {data.timeline.map(row => <TrendRow key={row.schedule_id} row={row} />)}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3.5 text-[10.5px] text-zinc-500">
                  <LegendDot color={STATE_HEX.ok} label="ok" />
                  <LegendDot color={STATE_HEX.attention} label="attention" />
                  <LegendDot color={STATE_HEX.critical} label="critical" />
                  <LegendDot color={STATE_HEX.failed} ring label="failed" />
                  <LegendDot color={NO_RUN} label="no run" />
                  <span className="ml-auto text-zinc-600">click a cell → open that run</span>
                </div>
              </Pane>

              {/* Action items + cross-cutting */}
              {(actions.length > 0 || c.cross_cutting.length > 0) && (
                <div className="grid md:grid-cols-2 gap-3">
                  {actions.length > 0 && (
                    <Pane title="Action items" icon={CheckSquare}>
                      <ul className="space-y-1.5 mt-1">
                        {actions.map((a, i) => (
                          <li key={i} className="flex items-center gap-2 text-[13px] py-1 border-b border-white/5 last:border-0">
                            <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium uppercase shrink-0 ${PRIORITY_CLS[a.priority]}`}>{a.priority}</span>
                            <span className="text-zinc-200">{a.title}</span>
                            {a.owner && <span className="text-xs text-zinc-500 ml-auto shrink-0">{a.owner}</span>}
                          </li>
                        ))}
                      </ul>
                    </Pane>
                  )}
                  {c.cross_cutting.length > 0 && (
                    <Pane title="Cross-cutting" icon={Lightbulb}>
                      <ul className="space-y-1.5 mt-1">
                        {c.cross_cutting.map((x, i) => (
                          <li key={i} className="text-[12.5px] text-zinc-300 flex gap-2 py-1 border-b border-white/5 last:border-0">
                            <span className="text-violet-400 shrink-0">◆</span><span>{x}</span>
                          </li>
                        ))}
                      </ul>
                    </Pane>
                  )}
                </div>
              )}

              <p className="text-[11px] text-zinc-600 font-mono text-center pt-0.5">
                {data.members.length} probes · rebuilt on member completion
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
