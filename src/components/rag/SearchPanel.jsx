import { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';

export default function SearchPanel({ agentId }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);

  async function handleSearch() {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch('/api/rag/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), agent_id: agentId || null, limit: 10 }),
      });
      const data = await res.json();
      setResults(data.results);
    } catch (err) {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search ingested documents..." className="flex-1 px-3 py-2 rounded bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500" onKeyDown={e => e.key === 'Enter' && handleSearch()} />
        <button onClick={handleSearch} disabled={searching || !query.trim()} className="flex items-center gap-2 px-4 py-2 rounded bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-sm text-white transition-colors">
          {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          Search
        </button>
      </div>

      {results && results.length === 0 && (
        <div className="text-zinc-500 text-sm py-4">No results found.</div>
      )}

      {results && results.length > 0 && (
        <div className="space-y-3">
          {results.map((r, i) => (
            <div key={i} className="p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-zinc-500">{r.source_type}: {r.source_path}</span>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `rgba(139,92,246,${Math.max(0.1, r.score)})`, color: r.score > 0.7 ? '#E9D5FF' : '#A1A1AA' }}>
                  {(r.score * 100).toFixed(1)}%
                </span>
              </div>
              <p className="text-sm text-zinc-300 whitespace-pre-wrap line-clamp-4">{r.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
