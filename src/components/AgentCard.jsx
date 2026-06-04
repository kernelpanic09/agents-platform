import { memo } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Check, Activity } from 'lucide-react';
import AgentAvatar from './AgentAvatar';
import { useSelection } from '../context/SelectionContext';

// Compact display helpers (tabular telemetry strip)
function compactTokens(n) {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function relAge(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso + 'Z').getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default memo(function AgentCard({ agent, index, stats }) {
  const { selectMode, selectedIds, toggle } = useSelection();
  const sourceCount = agent.knowledge_sources?.length || 0;
  const isSelected = selectedIds.has(agent.id);
  const s = stats || null;

  const cardContent = (
    <>
      {/* Accent hairline — per-agent color, fades out (flat, no glow) */}
      <div
        className="absolute inset-x-0 top-0 h-px rounded-t-2xl opacity-70"
        style={{ background: `linear-gradient(90deg, ${agent.color} 0%, ${agent.color}66 35%, transparent 80%)` }}
        aria-hidden="true"
      />

      <div className="flex items-start gap-3.5">
        <div className="relative shrink-0">
          <AgentAvatar iconId={agent.icon_id} color={agent.color} size={52} />
          {selectMode && (
            <div
              className={`absolute -top-1 -right-1 w-5 h-5 rounded-full border-2 flex items-center justify-center checkbox-scale ${
                isSelected ? 'border-transparent' : 'border-zinc-500 bg-zinc-800/80'
              }`}
              style={isSelected ? { backgroundColor: agent.color } : undefined}
            >
              {isSelected && <Check size={12} className="text-white" strokeWidth={3} />}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-semibold text-[15px] leading-tight text-white truncate">{agent.name}</h3>
            <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 shrink-0">{agent.category}</span>
          </div>
          <p className="text-[13px] font-medium leading-snug mb-1.5 truncate" style={{ color: agent.color }}>
            {agent.title}
          </p>
          <p className="text-[13px] leading-snug text-zinc-400 line-clamp-2">{agent.tagline}</p>
        </div>
      </div>

      {/* Capability chips */}
      <div className="mt-3.5 flex flex-wrap gap-1.5 min-h-[22px]">
        {agent.skills.slice(0, 3).map((skill, i) => (
          <span
            key={`${agent.id}-skill-${i}`}
            className="text-[11px] leading-none px-2 py-1 rounded-full"
            style={{ backgroundColor: `${agent.color}14`, color: agent.color, border: `1px solid ${agent.color}26` }}
          >
            {skill}
          </span>
        ))}
        {agent.skills.length > 3 && (
          <span className="text-[11px] leading-none px-2 py-1 rounded-full bg-zinc-800 text-zinc-500">
            +{agent.skills.length - 3}
          </span>
        )}
      </div>

      {/* Telemetry strip — live dispatch stats from traces */}
      <div className="mt-3.5 pt-3 border-t border-white/5 grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-[13px] font-semibold tabular-nums text-zinc-200">{s ? s.dispatches : '—'}</div>
          <div className="text-[9px] uppercase tracking-[0.12em] text-zinc-600">runs</div>
        </div>
        <div className="border-x border-white/5">
          <div className="text-[13px] font-semibold tabular-nums text-zinc-200">{s ? compactTokens(s.tokens) : '—'}</div>
          <div className="text-[9px] uppercase tracking-[0.12em] text-zinc-600">tokens</div>
        </div>
        <div>
          <div className="text-[13px] font-semibold tabular-nums text-zinc-200">
            {s?.last_active ? relAge(s.last_active) : '—'}
          </div>
          <div className="text-[9px] uppercase tracking-[0.12em] text-zinc-600">last run</div>
        </div>
      </div>

      {/* Footer meta */}
      <div className="mt-2.5 flex items-center justify-between text-[11px] text-zinc-600">
        <span className="inline-flex items-center gap-1">
          <BookOpen size={11} aria-hidden="true" /> {sourceCount} source{sourceCount === 1 ? '' : 's'}
        </span>
        <span className="inline-flex items-center gap-1">
          <Activity size={11} aria-hidden="true" />
          <span className={s?.dispatches ? 'text-teal-400/80' : ''}>{s?.dispatches ? 'active' : 'idle'}</span>
        </span>
      </div>
    </>
  );

  const baseClass = 'agent-card glass glass-hover relative overflow-hidden rounded-2xl p-5 text-left w-full cursor-pointer group animate-fade-in-up focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60';

  if (selectMode) {
    return (
      <div
        onClick={() => toggle(agent.id)}
        className={`${baseClass} ${isSelected ? 'agent-card-selected' : ''}`}
        style={{
          '--agent-color': agent.color,
          '--agent-glow': `${agent.color}25`,
          animationDelay: `${Math.min(index, 12) * 40}ms`,
          borderColor: isSelected ? `${agent.color}50` : undefined,
        }}
        role="checkbox"
        aria-checked={isSelected}
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(agent.id); } }}
        aria-label={`Select ${agent.name} — ${agent.title}`}
      >
        {cardContent}
      </div>
    );
  }

  return (
    <Link
      to={`/agent/${agent.id}`}
      className={`${baseClass} block`}
      style={{
        '--agent-color': agent.color,
        '--agent-glow': `${agent.color}25`,
        animationDelay: `${Math.min(index, 12) * 40}ms`,
      }}
      aria-label={`View ${agent.name} — ${agent.title}`}
    >
      {cardContent}
    </Link>
  );
})
