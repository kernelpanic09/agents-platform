// SVG renderer for a pipeline DAG. Lays nodes out in columns by longest-path
// "level" and colors each by live run status. Used both in the builder (no
// statuses) and on the run overlay (statuses streamed over SSE).

const STATUS_FILL = {
  pending: { fill: '#27272a', stroke: '#52525b', text: '#a1a1aa' },
  running: { fill: 'rgba(20,184,166,0.18)', stroke: '#14b8a6', text: '#5eead4' },
  success: { fill: 'rgba(34,197,94,0.15)', stroke: '#22c55e', text: '#86efac' },
  failed:  { fill: 'rgba(239,68,68,0.15)', stroke: '#ef4444', text: '#fca5a5' },
  timeout: { fill: 'rgba(249,115,22,0.15)', stroke: '#f97316', text: '#fdba74' },
};

const COL = 188, ROW = 78, NODE_W = 138, NODE_H = 46;

function layout(nodes, edges) {
  const adj = new Map(nodes.map(n => [n.id, []]));
  const indeg = new Map(nodes.map(n => [n.id, 0]));
  for (const e of edges) {
    if (adj.has(e.from) && indeg.has(e.to)) { adj.get(e.from).push(e.to); indeg.set(e.to, indeg.get(e.to) + 1); }
  }
  const level = new Map(nodes.map(n => [n.id, 0]));
  const indegCopy = new Map(indeg);
  const queue = nodes.filter(n => indeg.get(n.id) === 0).map(n => n.id);
  while (queue.length) {
    const u = queue.shift();
    for (const v of adj.get(u) || []) {
      level.set(v, Math.max(level.get(v), level.get(u) + 1));
      indegCopy.set(v, indegCopy.get(v) - 1);
      if (indegCopy.get(v) === 0) queue.push(v);
    }
  }
  const byLevel = {};
  for (const n of nodes) { const l = level.get(n.id) || 0; (byLevel[l] = byLevel[l] || []).push(n.id); }
  const maxRows = Math.max(1, ...Object.values(byLevel).map(a => a.length));
  const pos = new Map();
  for (const [l, ids] of Object.entries(byLevel)) {
    const offset = (maxRows - ids.length) / 2; // vertically center each column
    ids.forEach((id, i) => pos.set(id, { cx: Number(l) * COL + NODE_W / 2 + 20, cy: (i + offset) * ROW + NODE_H / 2 + 16 }));
  }
  const maxLevel = Math.max(0, ...[...level.values()]);
  return { pos, width: (maxLevel + 1) * COL + 40, height: maxRows * ROW + 32 };
}

export default function PipelineGraph({ graph, nodeStates = {}, height = 360 }) {
  const nodes = graph?.nodes || [];
  const edges = graph?.edges || [];
  if (nodes.length === 0) {
    return <div className="flex items-center justify-center h-40 text-sm text-zinc-600 border border-dashed border-white/10 rounded-lg">Add nodes to see the graph</div>;
  }
  const { pos, width, height: h } = layout(nodes, edges);

  return (
    <div className="overflow-auto rounded-lg border border-white/10 bg-black/20" style={{ maxHeight: height }}>
      <svg viewBox={`0 0 ${width} ${h}`} width={width} height={h} style={{ minWidth: '100%' }}>
        <defs>
          <marker id="pg-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
            <path d="M0,0 L7,3 L0,6 Z" fill="#71717a" />
          </marker>
        </defs>
        {edges.map((e, i) => {
          const a = pos.get(e.from), b = pos.get(e.to);
          if (!a || !b) return null;
          const x1 = a.cx + NODE_W / 2, y1 = a.cy, x2 = b.cx - NODE_W / 2, y2 = b.cy;
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
          const cond = (e.condition || '').trim();
          return (
            <g key={i}>
              <path d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none" stroke="#52525b" strokeWidth="1.5" markerEnd="url(#pg-arrow)" />
              {cond && (
                <text x={mx} y={my - 4} textAnchor="middle" fontSize="9" fill="#a78bfa" fontFamily="monospace">
                  {cond.length > 22 ? cond.slice(0, 21) + '…' : cond}
                </text>
              )}
            </g>
          );
        })}
        {nodes.map((n) => {
          const p = pos.get(n.id);
          if (!p) return null;
          const st = nodeStates[n.id]?.status || 'pending';
          const c = STATUS_FILL[st] || STATUS_FILL.pending;
          return (
            <g key={n.id}>
              <rect x={p.cx - NODE_W / 2} y={p.cy - NODE_H / 2} width={NODE_W} height={NODE_H} rx="8"
                fill={c.fill} stroke={c.stroke} strokeWidth="1.5"
                className={st === 'running' ? 'animate-pulse' : ''} />
              <text x={p.cx} y={p.cy - 2} textAnchor="middle" fontSize="12" fontWeight="600" fill={c.text}>
                {(n.label || n.id).slice(0, 16)}
              </text>
              <text x={p.cx} y={p.cy + 13} textAnchor="middle" fontSize="9" fill={c.text} opacity="0.7">{st}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
