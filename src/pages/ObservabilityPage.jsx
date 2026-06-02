import { useState, useEffect } from 'react';
import { Activity, DollarSign, Clock, Zap } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#E0A82E', '#2FA39A', '#C2603C', '#7E8C3F', '#B4451F', '#9A6B3C'];

export default function ObservabilityPage() {
  const [costs, setCosts] = useState(null);
  const [latency, setLatency] = useState(null);
  const [traces, setTraces] = useState([]);
  const [days, setDays] = useState(30);

  useEffect(() => {
    fetch(`/api/observability/costs?days=${days}`).then(r => r.json()).then(setCosts).catch(() => {});
    fetch(`/api/observability/latency?days=${days}`).then(r => r.json()).then(setLatency).catch(() => {});
    fetch('/api/observability/traces?limit=20').then(r => r.json()).then(setTraces).catch(() => {});
  }, [days]);

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Activity size={24} className="text-emerald-400" />
          <div>
            <h1 className="text-xl font-semibold text-white">Observability</h1>
            <p className="text-sm text-zinc-500">Cost tracking, latency metrics, and traces</p>
          </div>
        </div>
        <select value={days} onChange={e => setDays(parseInt(e.target.value, 10))} className="px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-sm text-zinc-200">
          <option value={7}>7 days</option>
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
        </select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { icon: DollarSign, label: 'API Spend', value: costs ? `$${(costs.savings?.apiSpend ?? costs.total ?? 0).toFixed(4)}` : '--', color: '#10B981' },
          { icon: Zap, label: 'API Calls', value: costs?.byModel?.reduce((a, m) => a + m.calls, 0) || '--', color: '#2FA39A' },
          { icon: Clock, label: 'Avg Latency', value: latency?.stats?.[0] ? `${latency.stats[0].avg_ms}ms` : '--', color: '#F59E0B' },
          { icon: Activity, label: 'Models Used', value: costs?.byModel?.length || '--', color: '#7E8C3F' },
        ].map((card, i) => {
          const Icon = card.icon;
          return (
            <div key={i} className="p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-2 mb-1">
                <Icon size={14} style={{ color: card.color }} />
                <span className="text-xs text-zinc-500">{card.label}</span>
              </div>
              <div className="text-lg font-semibold text-white">{card.value}</div>
            </div>
          );
        })}
      </div>

      {/* Backend cost split — subscription runs are billed to the Claude subscription
          (cost_usd is the *notional* API price = savings); API runs are real spend. */}
      {costs?.savings && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="p-4 rounded-lg" style={{ background: 'rgba(47,163,154,0.06)', border: '1px solid rgba(47,163,154,0.25)' }}>
            <div className="text-xs text-zinc-500 mb-1">Subscription runs (SSH)</div>
            <div className="text-lg font-semibold" style={{ color: '#3AAEA3' }}>
              {costs.savings.subscriptionRuns} runs · {(costs.savings.subscriptionTokens || 0).toLocaleString()} tokens
            </div>
            <div className="text-xs text-zinc-500 mt-1">$0 actual — billed to the Claude subscription</div>
          </div>
          <div className="p-4 rounded-lg" style={{ background: 'rgba(224,168,46,0.07)', border: '1px solid rgba(224,168,46,0.3)' }}>
            <div className="text-xs text-zinc-500 mb-1">Saved vs the API</div>
            <div className="text-2xl font-bold" style={{ color: '#E0A82E' }}>
              ${(costs.savings.subscriptionEquivalent || 0).toFixed(2)}
            </div>
            <div className="text-xs text-zinc-500 mt-1">notional API price of those runs</div>
          </div>
          <div className="p-4 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="text-xs text-zinc-500 mb-1">Actual API spend</div>
            <div className="text-2xl font-bold text-white">${(costs.savings.apiSpend || 0).toFixed(4)}</div>
            <div className="text-xs text-zinc-500 mt-1">opt-in API-backend runs only</div>
          </div>
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Daily cost chart */}
        <div className="p-4 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 className="text-sm font-medium text-zinc-300 mb-3">Daily Cost</h3>
          {costs?.daily?.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={costs.daily}>
                <XAxis dataKey="day" tick={{ fill: '#71717a', fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fill: '#71717a', fontSize: 10 }} tickFormatter={v => `$${v.toFixed(3)}`} />
                <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }} labelStyle={{ color: '#a1a1aa' }} formatter={v => [`$${v.toFixed(4)}`, 'Cost']} />
                <Bar dataKey="cost" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="text-zinc-600 text-sm py-12 text-center">No data yet</div>}
        </div>

        {/* Model distribution */}
        <div className="p-4 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 className="text-sm font-medium text-zinc-300 mb-3">Cost by Model</h3>
          {costs?.byModel?.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={200}>
                <PieChart>
                  <Pie data={costs.byModel} dataKey="cost" nameKey="model" cx="50%" cy="50%" outerRadius={70} strokeWidth={0}>
                    {costs.byModel.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }} formatter={v => `$${v.toFixed(4)}`} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {costs.byModel.map((m, i) => (
                  <div key={m.model} className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-zinc-400">{m.model}</span>
                    <span className="text-zinc-600">{m.calls} calls</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <div className="text-zinc-600 text-sm py-12 text-center">No data yet</div>}
        </div>
      </div>

      {/* Recent traces */}
      <div className="p-4 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 className="text-sm font-medium text-zinc-300 mb-3">Recent Traces</h3>
        {traces.length === 0 ? (
          <div className="text-zinc-600 text-sm py-4 text-center">No traces yet. Use RAG chat or run a workflow to generate traces.</div>
        ) : (
          <div className="space-y-2">
            {traces.map(t => (
              <div key={t.id} className="flex items-center justify-between py-2 border-b border-zinc-800/50 last:border-0">
                <div className="flex items-center gap-3">
                  <span className={`w-1.5 h-1.5 rounded-full ${t.status === 'success' ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="text-sm text-zinc-300">{t.step_name}</span>
                  <span className="text-xs text-zinc-600">{t.model}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-zinc-500">
                  <span>{(t.input_tokens || 0) + (t.output_tokens || 0)} tokens</span>
                  <span>{t.latency_ms}ms</span>
                  <span className="text-emerald-500">${t.cost_usd?.toFixed(4) || '0.0000'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
