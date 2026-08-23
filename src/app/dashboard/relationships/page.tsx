'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Network, RefreshCw } from 'lucide-react';

interface Edge {
  id: string;
  name: string;
  sourceType: string;
  sourceId: string;
  sourceName: string;
  targetType: string;
  targetId: string;
  targetName: string;
}

const TYPE_ORDER = ['server', 'network', 'ssl', 'domain', 'asset', 'checklist', 'password', 'document'] as const;

const TYPE_META: Record<string, { label: string; color: string; hrefPrefix: string }> = {
  server: { label: 'Server', color: '#6366f1', hrefPrefix: '/dashboard/servers/' },
  network: { label: 'Network Doc', color: '#0ea5e9', hrefPrefix: '/dashboard/network/' },
  ssl: { label: 'SSL Cert', color: '#f59e0b', hrefPrefix: '/dashboard/ssl' },
  domain: { label: 'Domain', color: '#8b5cf6', hrefPrefix: '/dashboard/domains/' },
  asset: { label: 'Asset', color: '#14b8a6', hrefPrefix: '/dashboard/assets/' },
  checklist: { label: 'Checklist', color: '#22c55e', hrefPrefix: '/dashboard/checklists/' },
  password: { label: 'Password', color: '#ef4444', hrefPrefix: '/dashboard/passwords/' },
  document: { label: 'Document', color: '#3b82f6', hrefPrefix: '/dashboard/documents/' },
};

interface GraphNode {
  key: string;
  type: string;
  name: string;
}

export default function RelationshipMapPage() {
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEdges = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/relationships');
      if (res.ok) setEdges(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEdges();
  }, []);

  const { nodes, columns, width, height } = useMemo(() => {
    const nodeMap = new Map<string, GraphNode>();
    for (const e of edges) {
      const sk = `${e.sourceType}:${e.sourceId}`;
      const tk = `${e.targetType}:${e.targetId}`;
      if (!nodeMap.has(sk)) nodeMap.set(sk, { key: sk, type: e.sourceType, name: e.sourceName || '(unnamed)' });
      if (!nodeMap.has(tk)) nodeMap.set(tk, { key: tk, type: e.targetType, name: e.targetName || '(unnamed)' });
    }

    // Group nodes into type-ordered columns
    const groups = new Map<string, GraphNode[]>();
    for (const n of nodeMap.values()) {
      if (!groups.has(n.type)) groups.set(n.type, []);
      groups.get(n.type)!.push(n);
    }
    const presentTypes = TYPE_ORDER.filter((t) => groups.has(t));
    // Any types outside the known list go last in one column
    const extraTypes = [...groups.keys()].filter((t) => !(TYPE_ORDER as readonly string[]).includes(t));

    const allCols: GraphNode[][] = [...presentTypes, ...extraTypes].map((t) => groups.get(t)!);
    const colIndex = new Map<string, number>();
    const rowIndex = new Map<string, number>();
    allCols.forEach((col, ci) =>
      col.forEach((n, ri) => {
        colIndex.set(n.key, ci);
        rowIndex.set(n.key, ri);
      }),
    );

    const NODE_W = 170;
    const NODE_H = 52;
    const COL_GAP = 110;
    const ROW_GAP = 84;
    const PAD = 30;
    const maxRows = Math.max(1, ...allCols.map((c) => c.length));

    return {
      nodes: Array.from(nodeMap.values()),
      columns: allCols,
      width: PAD * 2 + allCols.length * (NODE_W + COL_GAP),
      height: PAD * 2 + maxRows * (NODE_H + ROW_GAP),
    };
  }, [edges]);

  const posOf = (key: string) => {
    let ci = 0;
    let ri = 0;
    let x = 0;
    columns.forEach((col, c) => {
      col.forEach((n, r) => {
        if (n.key === key) {
          ci = c;
          ri = r;
        }
      });
    });
    void ci;
    const NODE_W = 170;
    const NODE_H = 52;
    const COL_GAP = 110;
    const ROW_GAP = 84;
    const PAD = 30;
    x = PAD + ci * (NODE_W + COL_GAP);
    return { x, y: PAD + ri * (NODE_H + ROW_GAP), w: NODE_W, h: NODE_H };
  };

  const edgeColor = (name: string): string => {
    const palette = ['#94a3b8', '#60a5fa', '#34d399', '#fbbf24', '#c084fc', '#f472b6'];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return palette[h % palette.length];
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Network className="w-6 h-6" /> Relationship Map
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            How your infrastructure connects — servers, domains, credentials, and docs
          </p>
        </div>
        <button onClick={fetchEdges} className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw className={loading ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} /> Refresh
        </button>
      </div>

      {!loading && edges.length === 0 ? (
        <div className="card p-12 text-center">
          <Network className="w-10 h-10 mx-auto mb-3 opacity-40" style={{ color: 'var(--muted)' }} />
          <h3 className="font-semibold mb-1">No relationships yet</h3>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Link entities together from an asset&apos;s <strong>Relationships</strong> panel to see them mapped here.
          </p>
        </div>
      ) : (
        <div className="card overflow-auto p-4" style={{ maxHeight: '70vh' }}>
          <svg width={width} height={height} role="img" aria-label="Infrastructure relationship graph" className="min-w-full">
            {/* Column headers */}
            {columns.map((col, ci) => {
              const meta = TYPE_META[col[0]?.type] || { label: col[0]?.type || '?', color: '#94a3b8' };
              const x = 30 + ci * (170 + 110);
              return (
                <text key={ci} x={x} y={16} fontSize={11} fontWeight={600} fill={meta.color} style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {meta.label} ({col.length})
                </text>
              );
            })}

            {/* Edges */}
            {edges.map((e) => {
              const s = posOf(`${e.sourceType}:${e.sourceId}`);
              const t = posOf(`${e.targetType}:${e.targetId}`);
              const x1 = s.x + s.w;
              const y1 = s.y + s.h / 2;
              const x2 = t.x;
              const y2 = t.y + t.h / 2;
              const mx = (x1 + x2) / 2;
              const color = edgeColor(e.name);
              return (
                <g key={e.id}>
                  <path
                    d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                    fill="none"
                    stroke={color}
                    strokeWidth={1.5}
                    opacity={0.55}
                  >
                    <title>{`${e.name.replace(/_/g, ' ')}`}</title>
                  </path>
                  <circle cx={mx} cy={(y1 + y2) / 2} r={9} fill="var(--card-bg)" stroke={color} strokeWidth={1}>
                    <title>{`${e.name.replace(/_/g, ' ')}`}</title>
                  </circle>
                  <text x={mx} y={(y1 + y2) / 2 + 3} textAnchor="middle" fontSize={8} fill={color}>
                    {e.name.slice(0, 2)}
                  </text>
                </g>
              );
            })}

            {/* Nodes */}
            {nodes.map((n) => {
              const meta = TYPE_META[n.type] || { label: n.type, color: '#94a3b8', hrefPrefix: '#' };
              const p = posOf(n.key);
              const href = meta.hrefPrefix === '#' ? undefined : `${meta.hrefPrefix}${n.key.split(':')[1]}`;
              return (
                <g key={n.key}>
                  <rect
                    x={p.x}
                    y={p.y}
                    rx={10}
                    width={p.w}
                    height={p.h}
                    fill="var(--card-bg)"
                    stroke={meta.color}
                    strokeWidth={1.5}
                    style={{ cursor: href ? 'pointer' : 'default' }}
                  >
                    <title>{n.name}</title>
                  </rect>
                  <rect x={p.x} y={p.y} width={5} height={p.h} rx={2.5} fill={meta.color} />
                  <a href={href} style={{ cursor: href ? 'pointer' : 'default' }}>
                    <rect x={p.x} y={p.y} width={p.w} height={p.h} fill="transparent" />
                    <text x={p.x + 12} y={p.y + 21} fontSize={9} fontWeight={700} fill={meta.color}>
                      {(TYPE_META[n.type]?.label || n.type).toUpperCase()}
                    </text>
                    <text x={p.x + 12} y={p.y + 38} fontSize={11} fill="var(--foreground)">
                      {n.name.length > 20 ? `${n.name.slice(0, 19)}…` : n.name}
                    </text>
                  </a>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      <div className="flex items-center gap-4 flex-wrap text-xs" style={{ color: 'var(--muted)' }}>
        <span>Click any node to open the record.</span>
        <span>Circles on edges show the relationship type.</span>
        <Link href="/dashboard/assets" className="hover:underline" style={{ color: 'var(--accent)' }}>
          Manage assets →
        </Link>
      </div>
    </div>
  );
}
