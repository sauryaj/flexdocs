'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, FileText, Key, Globe, Box, CheckSquare, Server, Ticket,
  Building2, Command as CommandIcon, CornerDownLeft,
} from 'lucide-react';
import { useOrganization } from '@/lib/OrganizationContext';

interface SearchItem {
  id: string;
  title: string;
  subtitle?: string;
  url: string;
}

interface SearchGroup {
  type: string;
  label: string;
  items: SearchItem[];
}

const GROUP_ICONS: Record<string, typeof FileText> = {
  documents: FileText,
  passwords: Key,
  domains: Globe,
  assets: Box,
  servers: Server,
  checklists: CheckSquare,
  tickets: Ticket,
  organizations: Building2,
};

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { selectedOrg } = useOrganization();
  const [query, setQuery] = useState('');
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const flatItems = groups.flatMap((g) => g.items.map((item) => ({ ...item, groupLabel: g.label })));

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setGroups([]);
    setActive(0);
    setTimeout(() => inputRef.current?.focus(), 30);
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!query.trim()) {
      setGroups([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: query });
        if (selectedOrg?.id) params.set('organizationId', selectedOrg.id);
        const res = await fetch(`/api/search?${params}`, { signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          setGroups(data.groups ?? []);
          setActive(0);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open, selectedOrg?.id]);

  const go = useCallback(
    (url: string) => {
      onClose();
      router.push(url);
    },
    [onClose, router],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, flatItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = flatItems[active];
        if (item) go(item.url);
      }
    },
    [flatItems, active, go, onClose],
  );

  // Keep the highlighted row visible
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  let runningIndex = -1;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center pt-[12vh] px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Global search"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
    >
      <div
        className="w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
      >
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--card-border)' }}>
          <Search className="w-4 h-4 shrink-0" style={{ color: 'var(--muted)' }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search documents, passwords, servers, tickets…"
            aria-label="Search query"
            className="flex-1 bg-transparent text-sm focus:outline-none"
            style={{ color: 'var(--foreground)' }}
          />
          <button
            onClick={onClose}
            aria-label="Close search"
            className="text-[10px] font-medium px-1.5 py-0.5 rounded"
            style={{ backgroundColor: 'var(--surface-2)', color: 'var(--muted)' }}
          >
            ESC
          </button>
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-y-auto">
          {loading && flatItems.length === 0 && (
            <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--muted)' }}>Searching…</div>
          )}
          {!loading && query.trim() && flatItems.length === 0 && (
            <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--muted)' }}>
              No results for “{query}”
            </div>
          )}
          {!query.trim() && (
            <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--muted)' }}>
              Type to search across everything…
              {selectedOrg && <div className="text-xs mt-1">Scoped to {selectedOrg.name}</div>}
            </div>
          )}

          {groups.map((group) => {
            const Icon = GROUP_ICONS[group.type] ?? FileText;
            return (
              <div key={group.type}>
                <div
                  className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider sticky top-0"
                  style={{ backgroundColor: 'var(--surface-2)', color: 'var(--muted)' }}
                >
                  <Icon className="w-3 h-3 inline mr-1.5 -mt-0.5" />
                  {group.label}
                </div>
                {group.items.map((item) => {
                  runningIndex += 1;
                  const idx = runningIndex;
                  const isActive = idx === active;
                  return (
                    <button
                      key={`${group.type}-${item.id}`}
                      data-active={isActive}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => go(item.url)}
                      className="w-full flex items-center gap-3 text-left px-4 py-2.5 transition-colors"
                      style={{
                        backgroundColor: isActive ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
                        borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>
                          {item.title}
                        </div>
                        {item.subtitle && (
                          <div className="text-xs truncate mt-0.5" style={{ color: 'var(--muted)' }}>{item.subtitle}</div>
                        )}
                      </div>
                      {isActive && <CornerDownLeft className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent)' }} />}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div
          className="flex items-center gap-4 px-4 py-2 text-[11px]"
          style={{ borderTop: '1px solid var(--card-border)', color: 'var(--muted)' }}
        >
          <span className="flex items-center gap-1"><CommandIcon className="w-3 h-3" />K anywhere</span>
          <span>↑↓ navigate</span>
          <span>↵ open</span>
        </div>
      </div>
    </div>
  );
}
