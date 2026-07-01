'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Cloud, Plus, Search, Trash2, DollarSign, MapPin,
} from 'lucide-react';
import { formatDate, cn } from '@/lib/utils';
import { EmptyState, ConfirmDialog } from '@/components/UIComponents';
import { useOrganization } from '@/lib/OrganizationContext';

interface CloudResourceEntry {
  id: string;
  name: string;
  provider: string;
  service: string;
  resourceId: string | null;
  region: string | null;
  status: string;
  cost: number | null;
  costCurrency: string | null;
  createdAt: string;
  updatedAt: string;
  tags: { id: string; name: string; color: string }[];
}

const providerColors: Record<string, string> = {
  aws: '#ff9900',
  azure: '#0078d4',
  gcp: '#4285f4',
  other: '#6b7280',
};

const statusColors: Record<string, string> = {
  active: '#10b981',
  stopped: '#f59e0b',
  terminated: '#6b7280',
  error: '#ef4444',
};

export default function CloudPage() {
  const { selectedOrg } = useOrganization();
  const [resources, setResources] = useState<CloudResourceEntry[]>([]);
  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => { fetchResources(); }, [selectedOrg]);

  const fetchResources = async () => {
    const params = new URLSearchParams();
    if (selectedOrg?.id) params.set('organizationId', selectedOrg.id);
    const res = await fetch(`/api/cloud?${params.toString()}`);
    const data = await res.json();
    setResources(data.items || data);
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await fetch(`/api/cloud/${deleteId}`, { method: 'DELETE' });
    setResources(resources.filter((r) => r.id !== deleteId));
    setDeleteId(null);
  };

  const filtered = resources.filter((r) => {
    const matchesSearch = r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.service.toLowerCase().includes(search.toLowerCase());
    const matchesProvider = providerFilter === 'all' || r.provider === providerFilter;
    return matchesSearch && matchesProvider;
  });

  const totalCost = filtered.reduce((sum, r) => sum + (r.cost || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--foreground)' }}>Cloud Resources</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            {selectedOrg ? `${selectedOrg.name} — ` : ''}AWS, Azure, GCP resources
          </p>
        </div>
        <Link href="/dashboard/cloud/new" className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Resource
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted)' }} />
          <input
            type="text"
            placeholder="Search resources..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-10"
          />
        </div>
        <select
          value={providerFilter}
          onChange={(e) => setProviderFilter(e.target.value)}
          className="input-field w-auto"
        >
          <option value="all">All Providers</option>
          <option value="aws">AWS</option>
          <option value="azure">Azure</option>
          <option value="gcp">GCP</option>
          <option value="other">Other</option>
        </select>
        {totalCost > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--surface-2)', color: 'var(--muted)' }}>
            <DollarSign className="w-4 h-4" />
            <span className="text-sm font-medium">${totalCost.toFixed(2)}/mo</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="card p-5 h-36 animate-shimmer" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Cloud className="w-10 h-10" />}
          title="No cloud resources"
          description="Track AWS, Azure, and GCP resources."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((r) => (
            <Link
              key={r.id}
              href={`/dashboard/cloud/${r.id}`}
              className="card card-interactive p-5"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold"
                    style={{ backgroundColor: `${providerColors[r.provider]}15`, color: providerColors[r.provider] }}
                  >
                    {r.provider.toUpperCase().slice(0, 2)}
                  </div>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>{r.name}</p>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>{r.service}</p>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.preventDefault(); setDeleteId(r.id); }}
                  className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 hover:text-red-600"
                  style={{ color: 'var(--muted)' }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--muted)' }}>
                {r.region && (
                  <div className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    <span>{r.region}</span>
                  </div>
                )}
                {r.cost != null && (
                  <div className="flex items-center gap-1">
                    <DollarSign className="w-3 h-3" />
                    <span>${r.cost.toFixed(2)}/mo</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: '1px solid var(--card-border)' }}>
                <span
                  className="badge"
                  style={{ backgroundColor: `${statusColors[r.status]}15`, color: statusColors[r.status] }}
                >
                  {r.status}
                </span>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>{r.provider}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Cloud Resource"
        message="This action cannot be undone."
      />
    </div>
  );
}
