import { memo } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Check } from 'lucide-react';
import AgentAvatar from './AgentAvatar';
import { useSelection } from '../context/SelectionContext';

export default memo(function AgentCard({ agent, index }) {
  const { selectMode, selectedIds, toggle } = useSelection();
  const sourceCount = agent.knowledge_sources?.length || 0;
  const isSelected = selectedIds.has(agent.id);

  const cardContent = (
    <>
      <div className="flex items-start gap-4">
        <div className="relative">
          <AgentAvatar iconId={agent.icon_id} color={agent.color} size={64} />
          {selectMode && (
            <div
              className={`absolute -top-1 -right-1 w-5 h-5 rounded-full border-2 flex items-center justify-center checkbox-scale ${
                isSelected
                  ? 'border-transparent'
                  : 'border-zinc-500 bg-zinc-800/80'
              }`}
              style={isSelected ? { backgroundColor: agent.color } : undefined}
            >
              {isSelected && <Check size={12} className="text-white" strokeWidth={3} />}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-lg text-white group-hover:text-white/90 transition-colors">
              {agent.name}
            </h3>
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: agent.color }} aria-hidden="true" />
          </div>
          <p className="text-sm font-medium mb-1" style={{ color: agent.color }}>
            {agent.title}
          </p>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 capitalize">
              {agent.category}
            </span>
            {sourceCount > 0 && (
              <span className="text-xs text-zinc-400 flex items-center gap-1">
                <BookOpen size={10} aria-hidden="true" />
                {sourceCount}
              </span>
            )}
          </div>
          <p className="text-sm text-zinc-300 line-clamp-2">
            {agent.tagline}
          </p>
        </div>
      </div>

      {/* Skills preview */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {agent.skills.slice(0, 3).map((skill, i) => (
          <span
            key={`${agent.id}-skill-${i}`}
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: `${agent.color}15`,
              color: agent.color,
              border: `1px solid ${agent.color}25`,
            }}
          >
            {skill}
          </span>
        ))}
        {agent.skills.length > 3 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
            +{agent.skills.length - 3}
          </span>
        )}
      </div>
    </>
  );

  if (selectMode) {
    return (
      <div
        onClick={() => toggle(agent.id)}
        className={`agent-card glass glass-hover rounded-2xl p-6 text-left w-full cursor-pointer group animate-fade-in-up ${
          isSelected ? 'agent-card-selected' : ''
        }`}
        style={{
          '--agent-color': agent.color,
          '--agent-glow': `${agent.color}25`,
          animationDelay: `${index * 50}ms`,
          borderColor: isSelected ? `${agent.color}50` : undefined,
        }}
        role="checkbox"
        aria-checked={isSelected}
        aria-label={`Select ${agent.name} — ${agent.title}`}
      >
        {cardContent}
      </div>
    );
  }

  return (
    <Link
      to={`/agent/${agent.id}`}
      className="agent-card glass glass-hover rounded-2xl p-6 text-left w-full cursor-pointer group animate-fade-in-up block"
      style={{
        '--agent-color': agent.color,
        '--agent-glow': `${agent.color}25`,
        animationDelay: `${index * 50}ms`,
      }}
      aria-label={`View ${agent.name} — ${agent.title}`}
    >
      {cardContent}
    </Link>
  );
})
