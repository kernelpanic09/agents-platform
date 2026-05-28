const ROUTE_COLORS = {
  rag: '#3B82F6',
  workflow: '#F97316',
  ssh: '#EF4444',
};

const ROUTE_LABELS = {
  rag: 'RAG Query',
  workflow: 'Multi-Step Workflow',
  ssh: 'SSH Dispatch',
};

export default function GraphView({ route, task, agent }) {
  const color = ROUTE_COLORS[route] || '#71717A';
  const label = ROUTE_LABELS[route] || route;

  return (
    <div className="p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)' }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-zinc-500">Route:</span>
        <span className="text-xs px-2 py-0.5 rounded-full text-white" style={{ background: color }}>{label}</span>
        <span className="text-xs text-zinc-600">for {agent}</span>
      </div>
      <svg viewBox="0 0 560 120" className="w-full" style={{ maxHeight: 100 }}>
        <line x1="90" y1="50" x2="190" y2="50" stroke="#3f3f46" strokeWidth="2" />
        <line x1="240" y1="50" x2="330" y2="20" stroke={route === 'rag' ? color : '#27272a'} strokeWidth="2" />
        <line x1="240" y1="50" x2="330" y2="50" stroke={route === 'workflow' ? color : '#27272a'} strokeWidth="2" />
        <line x1="240" y1="50" x2="330" y2="80" stroke={route === 'ssh' ? color : '#27272a'} strokeWidth="2" />
        <line x1="410" y1={route === 'rag' ? 20 : route === 'workflow' ? 50 : 80} x2="480" y2="50" stroke={color} strokeWidth="2" />
        {[
          { x: 50, y: 50, label: 'Input', active: true },
          { x: 200, y: 50, label: 'Router', active: true },
          { x: 370, y: 20, label: 'RAG', active: route === 'rag' },
          { x: 370, y: 50, label: 'Workflow', active: route === 'workflow' },
          { x: 370, y: 80, label: 'SSH', active: route === 'ssh' },
          { x: 510, y: 50, label: 'Result', active: true },
        ].map((n, i) => (
          <g key={i}>
            <rect x={n.x - 35} y={n.y - 12} width="70" height="24" rx="4" fill={n.active ? (i >= 2 && i <= 4 ? color : '#3f3f46') : '#1c1c1e'} fillOpacity={n.active ? 0.3 : 0.5} stroke={n.active ? (i >= 2 && i <= 4 ? color : '#52525b') : '#27272a'} strokeWidth="1" />
            <text x={n.x} y={n.y + 4} textAnchor="middle" fill={n.active ? '#e4e4e7' : '#52525b'} fontSize="10">{n.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}
