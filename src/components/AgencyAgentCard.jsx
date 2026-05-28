import { memo } from 'react';
import { Link } from 'react-router-dom';

export default memo(function AgencyAgentCard({ agent, index }) {
  return (
    <Link
      to={`/agency/${agent.id}`}
      className="agent-card glass glass-hover rounded-2xl p-6 text-left w-full cursor-pointer group animate-fade-in-up block"
      style={{
        '--agent-color': agent.color,
        '--agent-glow': `${agent.color}25`,
        animationDelay: `${index * 50}ms`,
      }}
      aria-label={`View ${agent.name}`}
    >
      <div className="flex items-start gap-4">
        {/* Emoji avatar */}
        <div
          className="relative flex items-center justify-center rounded-full flex-shrink-0"
          style={{ width: 64, height: 64 }}
        >
          <div
            className="absolute inset-0 rounded-full avatar-ring"
            style={{
              background: `radial-gradient(circle, ${agent.color}20 0%, transparent 70%)`,
            }}
          />
          <div
            className="w-full h-full rounded-full flex items-center justify-center text-3xl"
            style={{ backgroundColor: `${agent.color}12`, border: `1px solid ${agent.color}25` }}
          >
            {agent.emoji || '🤖'}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-lg text-white group-hover:text-white/90 transition-colors">
              {agent.name}
            </h3>
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: agent.color }} aria-hidden="true" />
          </div>
          {agent.vibe && (
            <p className="text-sm font-medium mb-1 italic" style={{ color: agent.color }}>
              {agent.vibe}
            </p>
          )}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 capitalize">
              {agent.category.replace('-', ' ')}
            </span>
            {agent.services?.length > 0 && (
              <span className="text-xs text-zinc-500">
                {agent.services.length} service{agent.services.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p className="text-sm text-zinc-300 line-clamp-2">
            {agent.description}
          </p>
        </div>
      </div>

      {/* Services preview */}
      {agent.services?.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {agent.services.slice(0, 3).map((svc, i) => (
            <span
              key={`${agent.id}-svc-${i}`}
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: `${agent.color}15`,
                color: agent.color,
                border: `1px solid ${agent.color}25`,
              }}
            >
              {svc.name}
            </span>
          ))}
          {agent.services.length > 3 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
              +{agent.services.length - 3}
            </span>
          )}
        </div>
      )}
    </Link>
  );
})
