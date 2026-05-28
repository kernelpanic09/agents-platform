import { useNavigate } from 'react-router-dom';
import { Users, X } from 'lucide-react';
import AgentAvatar from './AgentAvatar';
import { useSelection } from '../context/SelectionContext';

export default function ComposeBar({ agents }) {
  const { selectedIds, clear } = useSelection();
  const navigate = useNavigate();

  if (selectedIds.size < 2) return null;

  const selected = agents.filter(a => selectedIds.has(a.id));

  return (
    <div className="compose-bar fixed bottom-0 left-0 right-0 z-40 glass border-t border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex -space-x-2 flex-shrink-0">
            {selected.slice(0, 5).map(a => (
              <div key={a.id} className="w-8 h-8 rounded-full border-2 border-zinc-900 overflow-hidden">
                <AgentAvatar iconId={a.icon_id} color={a.color} size={32} />
              </div>
            ))}
            {selected.length > 5 && (
              <div className="w-8 h-8 rounded-full border-2 border-zinc-900 bg-zinc-700 flex items-center justify-center text-xs text-zinc-300">
                +{selected.length - 5}
              </div>
            )}
          </div>
          <span className="text-sm text-zinc-300 truncate">
            {selected.length} agents selected
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={clear}
            className="text-sm px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
            aria-label="Clear selection"
          >
            <X size={14} />
          </button>
          <button
            onClick={() => navigate('/compose')}
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors"
          >
            <Users size={14} />
            Compose Task Force
          </button>
        </div>
      </div>
    </div>
  );
}
