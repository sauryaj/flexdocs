'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Activity, Plus, Search, Trash2, CheckCircle, AlertTriangle, XCircle,
} from 'lucide-react';
import { formatDate, cn } from '@/lib/utils';
import { EmptyState, ConfirmDialog } from '@/components/UIComponents';
import { useOrganization } from '@/lib/OrganizationContext';

interface StatusPageEntry {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  components: { id: string; name: string; status: string }[];
  incidents: { id: string; title: string; status: string; impact: string }[];
}

const componentStatusColors: Record<string, string> = {
  operational: '#10b981',
  degraded: '#f59e0b',
  'partial-outage': '#f97316',
  'major-outage': '#ef4444',
};

const incidentStatusColors: Record<string, string> = {
  investigating: '#f59e0b',
  identified: '#f97316',
  monitoring: '#3b82f6',
  resolved: '#10b981',
  postmortem: '#6b7280',
};

export default function StatusPagesPage() {
  const { selectedOrg } = useOrganization();
  const [pages, setPages] = useState<StatusPageEntry[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => { fetchPages(); }, [selectedOrg]);

  const fetchPages = async () => {
    const params = new URLSearchParams();
    if (selectedOrg?.id) params.set('organizationId', selectedOrg.id);
    const res = await fetch(`/api/status-pages?${params.toString()}`);
    const data = await res.json();
    setPages(data);
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await fetch(`/api/status-pages/${deleteId}`, { method: 'DELETE' });
    setPages(pages.filter((p) => p.id !== deleteId));
    setDeleteId(null);
  };

  const filtered = pages.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const getOverallStatus = (components: StatusPageEntry['components']) => {
    if (components.some((c) => c.status === 'major-outage')) return { label: 'Major Outage', color: '#ef4444' };
    if (components.some((c) => c.status === 'partial-outage')) return { label: 'Partial Outage', color: '#f97316' };
    if (components.some((c) => c.status === 'degraded')) return { label: 'Degraded', color: '#f59e0b' };
    return { label: 'Operational', color: '#10b981' };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--foreground)' }}>Status Pages</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            {selectedOrg ? `${selectedOrg.name} — ` : ''}Internal/external status dashboards
          </p>
        </div>
        <Link href="/dashboard/status/new" className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Create Status Page
        </Link>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted)' }} />
        <input
          type="text"
          placeholder="Search status pages..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field pl-10"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => <div key={i} className="card p-5 h-36 animate-shimmer" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Activity className="w-10 h-10" />}
          title="No status pages"
          description="Create status pages to monitor service health."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((page) => {
            const overall = getOverallStatus(page.components);
            return (
              <Link
                key={page.id}
                href={`/dashboard/status/${page.id}`}
                className="card card-interactive p-5"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold" style={{ color: 'var(--foreground)' }}>{page.name}</p>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>/status/{page.slug}</p>
                  </div>
                  <button
                    onClick={(e) => { e.preventDefault(); setDeleteId(page.id); }}
                    className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 hover:text-red-600"
                    style={{ color: 'var(--muted)' }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: overall.color }} />
                  <span className="text-xs font-medium" style={{ color: overall.color }}>{overall.label}</span>
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>
                    {page.components.length} component{page.components.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {page.components.slice(0, 4).map((c) => (
                    <span
                      key={c.id}
                      className="badge text-[10px]"
                      style={{ backgroundColor: `${componentStatusColors[c.status]}15`, color: componentStatusColors[c.status] }}
                    >
                      {c.name}
                    </span>
                  ))}
                  {page.components.length > 4 && (
                    <span className="badge badge-slate text-[10px]">+{page.components.length - 4} more</span>
                  )}
                </div>

                {page.incidents.length > 0 && (
                  <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--card-border)' }}>
                    <p className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Recent Incidents</p>
                    {page.incidents.slice(0, 2).map((inc) => (
                      <div key={inc.id} className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: incidentStatusColors[inc.status] }} />
                        <span className="truncate">{inc.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Status Page"
        message="This will delete the status page and all its components and incidents."
      />
    </div>
  );
}
