import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, MousePointerClick, RefreshCw, Users, Globe } from 'lucide-react';
import AgentCard from '../components/AgentCard';
import AgencyAgentCard from '../components/AgencyAgentCard';
import ComposeBar from '../components/ComposeBar';
import QuickTasks from '../components/QuickTasks';
import { useSelection } from '../context/SelectionContext';

const HOMELAB_CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'infrastructure', label: 'Infrastructure' },
  { key: 'development', label: 'Development' },
  { key: 'security', label: 'Security' },
  { key: 'media', label: 'Media' },
  { key: 'automation', label: 'Automation' },
];

const AGENCY_CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'academic', label: 'Academic' },
  { key: 'design', label: 'Design' },
  { key: 'engineering', label: 'Engineering' },
  { key: 'game-development', label: 'Game Dev' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'paid-media', label: 'Paid Media' },
  { key: 'product', label: 'Product' },
  { key: 'project-management', label: 'Project Mgmt' },
  { key: 'sales', label: 'Sales' },
  { key: 'spatial-computing', label: 'Spatial' },
  { key: 'specialized', label: 'Specialized' },
  { key: 'strategy', label: 'Strategy' },
  { key: 'support', label: 'Support' },
  { key: 'testing', label: 'Testing' },
];

export default function Home() {
  const [tab, setTab] = useState('homelab');
  const [agents, setAgents] = useState([]);
  const [agencyAgents, setAgencyAgents] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [agencyLoading, setAgencyLoading] = useState(false);
  const [agencyLoaded, setAgencyLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [agentStats, setAgentStats] = useState({});
  const [platform, setPlatform] = useState(null);
  const { selectMode, toggleSelectMode } = useSelection();

  // Per-agent dispatch telemetry + platform overview (best-effort; cards degrade gracefully)
  useEffect(() => {
    fetch('/api/agents/stats').then(r => r.ok ? r.json() : {}).then(setAgentStats).catch(() => {});
    Promise.all([
      fetch('/api/schedules').then(r => r.ok ? r.json() : []),
      fetch('/api/observability/slo').then(r => r.ok ? r.json() : null),
    ]).then(([schedules, slo]) => {
      setPlatform({
        activeSchedules: Array.isArray(schedules) ? schedules.filter(s => s.status === 'active').length : 0,
        totalSchedules: Array.isArray(schedules) ? schedules.length : 0,
        runs7d: slo?.sample_size ?? null,
        successRate: slo?.metrics?.successRate ?? null,
      });
    }).catch(() => {});
  }, []);

  // Fetch homelab agents on mount
  useEffect(() => {
    fetch('/api/agents')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load agents');
        return res.json();
      })
      .then(data => {
        setAgents(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // Fetch agency agents when tab is first switched
  useEffect(() => {
    if (tab === 'agency' && !agencyLoaded) {
      setAgencyLoading(true);
      fetch('/api/agency')
        .then(res => {
          if (!res.ok) throw new Error('Failed to load agency agents');
          return res.json();
        })
        .then(data => {
          setAgencyAgents(data);
          setAgencyLoaded(true);
          setAgencyLoading(false);
        })
        .catch(err => {
          setError(err.message);
          setAgencyLoading(false);
        });
    }
  }, [tab, agencyLoaded]);

  // Reset category when switching tabs
  useEffect(() => {
    setCategory('all');
    setSearch('');
  }, [tab]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/agency/sync', { method: 'POST' });
      if (!res.ok) throw new Error('Sync failed');
      // Refresh the list
      const listRes = await fetch('/api/agency');
      const data = await listRes.json();
      setAgencyAgents(data);
    } catch (err) {
      console.error('Sync failed:', err);
    } finally {
      setSyncing(false);
    }
  };

  const rosterNames = useMemo(() => new Set(agents.map(a => a.name.toLowerCase())), [agents]);

  const handleAdopt = useCallback(async (agencyAgent) => {
    const res = await fetch(`/api/agency/${agencyAgent.id}/adopt`, { method: 'POST' });
    if (res.ok || res.status === 409) {
      const fresh = await fetch('/api/agents').then(r => r.json()).catch(() => null);
      if (Array.isArray(fresh)) setAgents(fresh);
    } else {
      const b = await res.json().catch(() => ({}));
      alert(b.error || 'Adopt failed');
    }
  }, []);

  const currentAgents = tab === 'homelab' ? agents : agencyAgents;
  const categories = tab === 'homelab' ? HOMELAB_CATEGORIES : AGENCY_CATEGORIES;

  const categoryCounts = useMemo(() => {
    const counts = { all: currentAgents.length };
    for (const a of currentAgents) {
      counts[a.category] = (counts[a.category] || 0) + 1;
    }
    return counts;
  }, [currentAgents]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return currentAgents.filter(a => {
      const matchesSearch = !q ||
        a.name.toLowerCase().includes(q) ||
        (a.title || '').toLowerCase().includes(q) ||
        (a.tagline || a.description || '').toLowerCase().includes(q) ||
        (a.vibe || '').toLowerCase().includes(q);
      const matchesCategory = category === 'all' || a.category === category;
      return matchesSearch && matchesCategory;
    });
  }, [currentAgents, search, category]);

  const isLoading = tab === 'homelab' ? loading : agencyLoading;

  return (
    <div>
      {/* Hero */}
      <div className="text-center mb-6">
        <h1 className="text-3xl sm:text-4xl font-bold mb-2.5 tracking-tight gradient-text">
          Agent Directory
        </h1>
        <p className="text-zinc-400 text-[15px] max-w-xl mx-auto leading-relaxed">
          Agent roster for scheduled infrastructure operations. Each agent defines a system prompt, inference profile, and knowledge sources.
        </p>
      </div>

      {/* Platform overview */}
      <div className="flex items-center justify-center mb-8" aria-label="Platform overview">
        <div className="inline-flex items-stretch divide-x divide-white/5 rounded-xl glass px-1 py-2.5">
          {[
            { label: 'agents', value: agents.length || '—' },
            { label: 'active schedules', value: platform ? `${platform.activeSchedules}/${platform.totalSchedules}` : '—' },
            { label: 'runs · 7d', value: platform?.runs7d ?? '—' },
            { label: 'success · 7d', value: platform?.successRate != null ? `${Math.round(platform.successRate * 100)}%` : '—' },
          ].map(st => (
            <div key={st.label} className="px-5 text-center">
              <div className="text-base font-semibold tabular-nums text-zinc-100 leading-none mb-1">{st.value}</div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-600 leading-none">{st.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex items-center justify-center gap-2 mb-8">
        <button
          onClick={() => setTab('homelab')}
          className={`flex items-center gap-2 text-sm px-5 py-2.5 rounded-xl transition-all font-medium ${
            tab === 'homelab'
              ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/20'
              : 'glass text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
          }`}
        >
          <Users size={16} />
          Homelab Agents
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
            tab === 'homelab' ? 'bg-violet-500/50 text-violet-100' : 'bg-zinc-700 text-zinc-500'
          }`}>
            {agents.length}
          </span>
        </button>
        <button
          onClick={() => setTab('agency')}
          className={`flex items-center gap-2 text-sm px-5 py-2.5 rounded-xl transition-all font-medium ${
            tab === 'agency'
              ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/20'
              : 'glass text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
          }`}
        >
          <Globe size={16} />
          Agency Agents
          {agencyLoaded && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
              tab === 'agency' ? 'bg-violet-500/50 text-violet-100' : 'bg-zinc-700 text-zinc-500'
            }`}>
              {agencyAgents.length}
            </span>
          )}
        </button>
      </div>

      {/* Search + Filters */}
      <div className="max-w-2xl mx-auto mb-10 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" aria-hidden="true" />
          <label htmlFor="agent-search" className="sr-only">Search agents</label>
          <input
            id="agent-search"
            type="text"
            placeholder={tab === 'homelab' ? 'Search agents...' : 'Search agency agents...'}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl glass border border-white/10 bg-transparent text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/25 transition-all"
          />
        </div>

        {/* Category filters */}
        <div className="flex items-center justify-center gap-2 flex-wrap" role="group" aria-label="Filter by category">
          {categories.map(cat => (
            <button
              key={cat.key}
              onClick={() => setCategory(cat.key)}
              aria-pressed={category === cat.key}
              className={`text-sm px-3 py-1.5 rounded-lg transition-all ${
                category === cat.key
                  ? 'bg-violet-600 text-white'
                  : 'bg-zinc-800/50 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              }`}
            >
              {cat.label}
              <span className={`ml-1.5 text-xs ${category === cat.key ? 'text-violet-200' : 'text-zinc-500'}`}>
                {categoryCounts[cat.key] || 0}
              </span>
            </button>
          ))}

          {/* Homelab tab extras: select mode + divider */}
          {tab === 'homelab' && (
            <>
              <div className="w-px h-5 bg-zinc-700 mx-1" />
              <button
                onClick={toggleSelectMode}
                aria-pressed={selectMode}
                className={`text-sm px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  selectMode
                    ? 'bg-violet-600 text-white'
                    : 'bg-zinc-800/50 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                }`}
              >
                <MousePointerClick size={14} />
                Select
              </button>
            </>
          )}

          {/* Agency tab extras: sync button */}
          {tab === 'agency' && agencyLoaded && (
            <>
              <div className="w-px h-5 bg-zinc-700 mx-1" />
              <button
                onClick={handleSync}
                disabled={syncing}
                className="text-sm px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 bg-zinc-800/50 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
              >
                <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                {syncing ? 'Syncing...' : 'Sync'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Quick Tasks (homelab only) */}
      {tab === 'homelab' && !selectMode && <QuickTasks agents={agents} />}

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="w-8 h-8 border-2 border-zinc-700 border-t-violet-500 rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-20">
          <p className="text-zinc-400 mb-2">Failed to load agents</p>
          <p className="text-sm text-zinc-500 mb-4">{error}</p>
          <button onClick={() => window.location.reload()} className="text-sm px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors">
            Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-zinc-500">
          {search || category !== 'all'
            ? 'No agents match your filters.'
            : tab === 'agency' && agencyAgents.length === 0
              ? (
                <div>
                  <p className="mb-4">No agency agents synced yet.</p>
                  <button
                    onClick={handleSync}
                    disabled={syncing}
                    className="text-sm px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-50"
                  >
                    {syncing ? 'Syncing...' : 'Sync from GitHub'}
                  </button>
                </div>
              )
              : 'No agents found.'}
        </div>
      ) : (
        <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 ${selectMode && tab === 'homelab' ? 'pb-20' : ''}`}>
          {filtered.map((agent, i) =>
            tab === 'homelab'
              ? <AgentCard key={agent.id} agent={agent} index={i} stats={agentStats[agent.id]} />
              : <AgencyAgentCard key={agent.id} agent={agent} index={i} adopted={rosterNames.has(agent.name.toLowerCase())} onAdopt={handleAdopt} />
          )}
        </div>
      )}

      {/* Compose Bar (homelab only) */}
      {selectMode && tab === 'homelab' && <ComposeBar agents={agents} />}
    </div>
  );
}
