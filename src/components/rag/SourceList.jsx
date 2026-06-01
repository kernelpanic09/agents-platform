import { useState, useEffect } from 'react';
import { FileText, Trash2, Globe, Terminal, RefreshCw } from 'lucide-react';

const typeIcons = {
  markdown: FileText,
  yaml: FileText,
  terraform: FileText,
  url: Globe,
  transcript: Terminal,
};

const typeColors = {
  markdown: '#E0A82E',
  yaml: '#7E8C3F',
  terraform: '#C2603C',
  url: '#9A6B3C',
  transcript: '#B4451F',
};

export default function SourceList({ agentId, refreshKey }) {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSources();
  }, [agentId, refreshKey]);

  async function fetchSources() {
    setLoading(true);
    const params = new URLSearchParams();
    if (agentId) params.set('agent_id', agentId);
    const res = await fetch(`/api/rag/sources?${params}`);
    const data = await res.json();
    setSources(data);
    setLoading(false);
  }

  async function handleDelete(id) {
    if (!confirm('Remove this source and all its vectors?')) return;
    await fetch(`/api/rag/sources/${id}`, { method: 'DELETE' });
    fetchSources();
  }

  if (loading) {
    return <div className="text-zinc-500 text-sm py-4">Loading sources...</div>;
  }

  if (sources.length === 0) {
    return <div className="text-zinc-500 text-sm py-4">No documents ingested yet.</div>;
  }

  return (
    <div className="space-y-2">
      {sources.map(source => {
        const Icon = typeIcons[source.source_type] || FileText;
        const color = typeColors[source.source_type] || '#71717A';
        const statusColor = source.status === 'ready' ? '#4ADE80' : source.status === 'failed' ? '#EF4444' : '#F59E0B';

        return (
          <div key={source.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center gap-3 min-w-0">
              <Icon size={16} style={{ color, flexShrink: 0 }} />
              <div className="min-w-0">
                <div className="text-sm text-zinc-200 truncate">{source.source_path}</div>
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span>{source.source_type}</span>
                  <span style={{ color: statusColor }}>{source.status}</span>
                  <span>{source.chunk_count} chunks</span>
                </div>
              </div>
            </div>
            <button onClick={() => handleDelete(source.id)} className="p-1.5 rounded hover:bg-zinc-700/50 text-zinc-500 hover:text-red-400 transition-colors" title="Remove source">
              <Trash2 size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
