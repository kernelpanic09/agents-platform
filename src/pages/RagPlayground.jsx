import { useState, useEffect } from 'react';
import { Database, Search, MessageSquare, Upload } from 'lucide-react';
import IngestPanel from '../components/rag/IngestPanel';
import SearchPanel from '../components/rag/SearchPanel';
import ChatPanel from '../components/rag/ChatPanel';

const TABS = [
  { id: 'ingest', label: 'Ingest', icon: Upload },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
];

export default function RagPlayground() {
  const [activeTab, setActiveTab] = useState('ingest');
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);

  useEffect(() => {
    fetch('/api/agents')
      .then(r => r.json())
      .then(setAgents)
      .catch(() => {});
  }, []);

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="flex items-center gap-3 mb-6">
        <Database size={24} className="text-violet-400" />
        <div>
          <h1 className="text-xl font-semibold text-white">RAG Playground</h1>
          <p className="text-sm text-zinc-500">Ingest documents, search, and chat with your knowledge base</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <label className="text-xs text-zinc-500">Scope:</label>
        <select value={selectedAgent || ''} onChange={e => setSelectedAgent(e.target.value ? parseInt(e.target.value, 10) : null)} className="px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 focus:outline-none focus:border-violet-500">
          <option value="">All Agents (Global)</option>
          {agents.map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-1 mb-6 p-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-4 py-2 rounded text-sm transition-colors ${activeTab === tab.id ? 'bg-violet-600/20 text-violet-300' : 'text-zinc-500 hover:text-zinc-300'}`}>
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'ingest' && <IngestPanel agentId={selectedAgent} />}
      {activeTab === 'search' && <SearchPanel agentId={selectedAgent} />}
      {activeTab === 'chat' && <ChatPanel agentId={selectedAgent} />}
    </div>
  );
}
