'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  FileText, Key, Globe, Box, Server, CheckSquare, ShieldCheck, Network,
  Link2, Unlink, Plus, X,
} from 'lucide-react';

const TYPE_META: Record<string, { icon: typeof FileText; routePrefix: string; label: string }> = {
  document: { icon: FileText, routePrefix: '/dashboard/documents', label: 'Document' },
  password: { icon: Key, routePrefix: '/dashboard/passwords', label: 'Password' },
  domain: { icon: Globe, routePrefix: '/dashboard/domains', label: 'Domain' },
  asset: { icon: Box, routePrefix: '/dashboard/assets', label: 'Asset' },
  server: { icon: Server, routePrefix: '/dashboard/servers', label: 'Server' },
  checklist: { icon: CheckSquare, routePrefix: '/dashboard/checklists', label: 'Checklist' },
  ssl: { icon: ShieldCheck, routePrefix: '/dashboard/ssl', label: 'Certificate' },
  network: { icon: Network, routePrefix: '/dashboard/network', label: 'Network' },
};

interface RelatedItem {
  id: string;
  name: string;
  relation: string;
  direction: 'outgoing' | 'incoming';
  otherType: string;
  otherId: string;
}

export function RelatedItems({ entityType, entityId }: { entityType: string; entityId: string }) {
  const [items, setItems] = useState<RelatedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [targetType, setTargetType] = useState('document');
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState<{ id: string; title: string }[]>([]);
  const [relationName, setRelationName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/relationships?entityType=${entityType}&entityId=${entityId}`);
      if (res.ok) {
        const rels = await res.json();
        setItems(
          rels.map((r: Record<string, string>) =>
            r.sourceType === entityType && r.sourceId === entityId
              ? { id: r.id, name: r.targetName, relation: r.name || 'related to', direction: 'outgoing', otherType: r.targetType, otherId: r.targetId }
              : { id: r.id, name: r.sourceName, relation: r.name || 'related to', direction: 'incoming', otherType: r.sourceType, otherId: r.sourceId },
          ),
        );
      }
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    load();
  }, [load]);

  // Debounced candidate search against global search API
  useEffect(() => {
    if (!pickerOpen) return;
    if (!search.trim()) {
      setCandidates([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(search)}`);
      if (res.ok) {
        const data = await res.json();
        // Flatten all groups but keep only rows of the chosen target type
        const wanted: Record<string, string> = {
          document: 'documents', password: 'passwords', domain: 'domains', asset: 'assets',
          server: 'servers', checklist: 'checklists', network: '', ssl: '',
        };
        const groupKey = wanted[targetType];
        const group = (data.groups ?? []).find((g: { type: string }) => g.type === groupKey);
        setCandidates(group ? group.items.map((i: { id: string; title: string }) => ({ id: i.id, title: i.title })) : []);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [search, pickerOpen, targetType]);

  const link = async (targetId: string) => {
    setBusy(true);
    try {
      await fetch('/api/relationships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType: entityType,
          sourceId: entityId,
          targetType,
          targetId,
          ...(relationName.trim() ? { name: relationName.trim() } : {}),
        }),
      });
      setSearch('');
      setRelationName('');
      setCandidates([]);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const unlink = async (relId: string) => {
    await fetch(`/api/relationships/${relId}`, { method: 'DELETE' });
    await load();
  };

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-1.5" style={{ color: 'var(--foreground)' }}>
          <Link2 className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          Related Items
          {items.length > 0 && (
            <span className="badge badge-slate ml-1">{items.length}</span>
          )}
        </h3>
        <button
          onClick={() => setPickerOpen((v) => !v)}
          aria-expanded={pickerOpen}
          aria-label="Link another item"
          className="p-1 rounded-md transition-colors hover:bg-[var(--surface-2)]"
          style={{ color: 'var(--muted)' }}
        >
          {pickerOpen ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        </button>
      </div>

      {pickerOpen && (
        <div className="mb-3 p-3 rounded-lg space-y-2" style={{ backgroundColor: 'var(--surface-2)' }}>
          <div className="flex gap-2">
            <select
              aria-label="Item type to link"
              value={targetType}
              onChange={(e) => { setTargetType(e.target.value); setCandidates([]); }}
              className="input-field w-auto text-xs py-1.5"
            >
              {Object.entries(TYPE_META).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <input
              type="text"
              value={relationName}
              onChange={(e) => setRelationName(e.target.value)}
              placeholder="Relation (optional) e.g. hosted_on"
              aria-label="Relationship name"
              className="input-field flex-1 text-xs py-1.5"
            />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${TYPE_META[targetType]?.label.toLowerCase()}s to link…`}
            aria-label={`Search ${TYPE_META[targetType]?.label}s`}
            autoFocus
            className="input-field w-full text-xs py-1.5"
          />
          {candidates.length > 0 && (
            <div className="rounded-lg overflow-hidden max-h-40 overflow-y-auto" style={{ border: '1px solid var(--card-border)' }}>
              {candidates.map((c) => (
                <button
                  key={c.id}
                  disabled={busy || c.id === entityId}
                  onClick={() => link(c.id)}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--surface-2)] transition-colors disabled:opacity-50"
                  style={{ color: 'var(--foreground)', borderBottom: '1px solid var(--card-border)' }}
                >
                  {c.title}
                </button>
              ))}
            </div>
          )}
          {search.trim() && !loading && candidates.length === 0 && (
            <p className="text-[11px]" style={{ color: 'var(--muted)' }}>No matches — type at least part of a name.</p>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-xs" style={{ color: 'var(--muted)' }}>Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          Nothing linked yet. Use + to connect servers, credentials, or docs.
        </p>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => {
            const meta = TYPE_META[item.otherType];
            const Icon = meta?.icon ?? Box;
            const href = item.otherId && meta ? `${meta.routePrefix}/${item.otherId}` : undefined;
            return (
              <li key={item.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--surface-2)]">
                <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent)' }} />
                <div className="min-w-0 flex-1">
                  {href ? (
                    <a href={href} className="text-xs font-medium truncate block hover:underline" style={{ color: 'var(--foreground)' }}>
                      {item.name}
                    </a>
                  ) : (
                    <span className="text-xs font-medium truncate block" style={{ color: 'var(--foreground)' }}>{item.name}</span>
                  )}
                  <span className="text-[10px]" style={{ color: 'var(--muted)' }}>
                    {item.direction === 'incoming' ? '← ' : ''}{item.relation.replace(/_/g, ' ')}
                  </span>
                </div>
                <button
                  onClick={() => unlink(item.id)}
                  aria-label={`Unlink ${item.name}`}
                  title="Unlink"
                  className="opacity-0 group-hover:opacity-100 p-1 rounded transition-opacity hover:text-red-500"
                  style={{ color: 'var(--muted)' }}
                >
                  <Unlink className="w-3 h-3" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
