import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, BookOpen } from 'lucide-react';

export default function ChatPanel({ agentId }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState('haiku');
  const [showContext, setShowContext] = useState(null);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || loading) return;
    const userMsg = { role: 'user', content: input.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/rag/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userMsg.content, agent_id: agentId || null, model }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.answer,
        context: data.context,
        tokens: data.tokens,
        model: data.model,
      }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}`, error: true }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-[600px]">
      <div className="flex items-center gap-2 mb-3">
        <label className="text-xs text-zinc-500">Model:</label>
        {['haiku', 'sonnet'].map(m => (
          <button key={m} onClick={() => setModel(m)} className={`px-2 py-1 rounded text-xs transition-colors ${model === m ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}>
            {m}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 mb-3 pr-1">
        {messages.length === 0 && (
          <div className="text-zinc-500 text-sm text-center py-12">
            Ask a question about your ingested documents.
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-3 rounded-lg text-sm ${msg.role === 'user' ? 'bg-violet-600/20 text-violet-200' : msg.error ? 'bg-red-900/20 text-red-400' : 'text-zinc-300'}`} style={msg.role === 'assistant' && !msg.error ? { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' } : undefined}>
              <p className="whitespace-pre-wrap">{msg.content}</p>
              {msg.context && msg.context.length > 0 && (
                <button onClick={() => setShowContext(showContext === i ? null : i)} className="flex items-center gap-1 mt-2 text-xs text-violet-400 hover:text-violet-300">
                  <BookOpen size={12} />
                  {msg.context.length} sources
                </button>
              )}
              {showContext === i && msg.context && (
                <div className="mt-2 space-y-2 border-t border-zinc-700/50 pt-2">
                  {msg.context.map((c, ci) => (
                    <div key={ci} className="text-xs text-zinc-500">
                      <div className="flex justify-between">
                        <span>{c.source_type}: {c.source_path}</span>
                        <span>{(c.score * 100).toFixed(1)}%</span>
                      </div>
                      <p className="text-zinc-600 line-clamp-2 mt-0.5">{c.text}</p>
                    </div>
                  ))}
                </div>
              )}
              {msg.tokens && (
                <div className="text-xs text-zinc-600 mt-1">
                  {msg.model} | {msg.tokens.input + msg.tokens.output} tokens
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <Loader2 size={16} className="animate-spin text-violet-400" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="flex gap-2">
        <input type="text" value={input} onChange={e => setInput(e.target.value)} placeholder="Ask about your documents..." className="flex-1 px-3 py-2 rounded bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500" onKeyDown={e => e.key === 'Enter' && handleSend()} />
        <button onClick={handleSend} disabled={loading || !input.trim()} className="flex items-center gap-2 px-4 py-2 rounded bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-sm text-white transition-colors">
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
