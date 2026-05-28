import { useState } from 'react';
import { Upload, FolderOpen, Loader2 } from 'lucide-react';
import SourceList from './SourceList';

const SOURCE_TYPES = [
  { value: 'markdown', label: 'Markdown (.md)' },
  { value: 'yaml', label: 'YAML (.yaml/.yml)' },
  { value: 'terraform', label: 'Terraform (.tf)' },
  { value: 'url', label: 'URL (web page)' },
  { value: 'transcript', label: 'Run Transcript (by ID)' },
];

export default function IngestPanel({ agentId }) {
  const [sourceType, setSourceType] = useState('markdown');
  const [sourcePath, setSourcePath] = useState('');
  const [ingesting, setIngesting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  async function handleIngest() {
    if (!sourcePath.trim()) return;
    setIngesting(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch('/api/rag/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_type: sourceType,
          source_path: sourcePath.trim(),
          agent_id: agentId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
      setSourcePath('');
      setRefreshKey(k => k + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setIngesting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 className="text-sm font-medium text-zinc-300 mb-3">Ingest Document</h3>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Source Type</label>
            <select value={sourceType} onChange={e => setSourceType(e.target.value)} className="w-full px-3 py-2 rounded bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 focus:outline-none focus:border-violet-500">
              {SOURCE_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1">
              {sourceType === 'url' ? 'URL' : sourceType === 'transcript' ? 'Run ID' : 'File Path'}
            </label>
            <input type="text" value={sourcePath} onChange={e => setSourcePath(e.target.value)} placeholder={sourceType === 'url' ? 'https://example.com/docs' : sourceType === 'transcript' ? '42' : '/home/ubuntu/apps/agents/prompts/cluster-health.md'} className="w-full px-3 py-2 rounded bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500" onKeyDown={e => e.key === 'Enter' && handleIngest()} />
          </div>

          <button onClick={handleIngest} disabled={ingesting || !sourcePath.trim()} className="flex items-center gap-2 px-4 py-2 rounded bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm text-white transition-colors">
            {ingesting ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {ingesting ? 'Ingesting...' : 'Ingest'}
          </button>
        </div>

        {result && (
          <div className="mt-3 p-2 rounded bg-green-900/20 border border-green-800/30 text-sm text-green-400">
            Ingested {result.chunks} chunks into {result.collection}
          </div>
        )}
        {error && (
          <div className="mt-3 p-2 rounded bg-red-900/20 border border-red-800/30 text-sm text-red-400">
            {error}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-medium text-zinc-300 mb-3">Ingested Sources</h3>
        <SourceList agentId={agentId} refreshKey={refreshKey} />
      </div>
    </div>
  );
}
