'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Server, Plus, Search, Trash2, Cpu, HardDrive, MemoryStick, MapPin,
} from 'lucide-react';
import { formatDate, cn } from '@/lib/utils';
import { EmptyState, ConfirmDialog } from '@/components/UIComponents';
import { useOrganization } from '@/lib/OrganizationContext';

interface ServerEntry {
  id: string;
  name: string;
  hostname: string | null;
  ipAddress: string | null;
  os: string | null;
  osVersion: string | null;
  cpu: string | null;
  cpuCores: number | null;
  ramGB: number | null;
  storageGB: number | null;
  storageType: string | null;
  status: string;
  location: string | null;
  serialNumber: string | null;
  purchaseDate: string | null;
  warrantyExpiry: string | null;
  createdAt: string;
  updatedAt: string;
  tags: { id: string; name: string; color: string }[];
}

const statusColors: Record<string, string> = {
  active: '#10b981',
  maintenance: '#f59e0b',
  decommissioned: '#6b7280',
};

export default function ServersPage() {
  const { selectedOrg } = useOrganization();
  const [servers, setServers] = useState<ServerEntry[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => { fetchServers(); }, [selectedOrg]);

  const fetchServers = async () => {
    const params = new URLSearchParams();
    if (selectedOrg?.id) params.set('organizationId', selectedOrg.id);
    const res = await fetch(`/api/servers?${params.toString()}`);
    const data = await res.json();
    setServers(data.items || data);
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await fetch(`/api/servers/${deleteId}`, { method: 'DELETE' });
    setServers(servers.filter((s) => s.id !== deleteId));
    setDeleteId(null);
  };

  const filtered = servers.filter((s) => {
    const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.hostname?.toLowerCase().includes(search.toLowerCase()) ||
      s.ipAddress?.includes(search);
    const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--foreground)' }}>Server Inventory</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            {selectedOrg ? `${selectedOrg.name} — ` : ''}Hardware, OS, specifications
          </p>
        </div>
        <Link href="/dashboard/servers/new" className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Server
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted)' }} />
          <input
            type="text"
            placeholder="Search servers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-10"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input-field w-auto"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="maintenance">Maintenance</option>
          <option value="decommissioned">Decommissioned</option>
        </select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="card p-5 h-40 animate-shimmer" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Server className="w-10 h-10" />}
          title="No servers"
          description="Add servers to track hardware specs, OS, and location."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((server) => (
            <Link
              key={server.id}
              href={`/dashboard/servers/${server.id}`}
              className="card card-interactive p-5"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${statusColors[server.status] || '#6b7280'}15` }}
                  >
                    <Server className="w-5 h-5" style={{ color: statusColors[server.status] || '#6b7280' }} />
                  </div>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>{server.name}</p>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>{server.hostname || server.ipAddress || '—'}</p>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.preventDefault(); setDeleteId(server.id); }}
                  className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 hover:text-red-600"
                  style={{ color: 'var(--muted)' }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs" style={{ color: 'var(--muted)' }}>
                {server.os && (
                  <div className="flex items-center gap-1">
                    <Cpu className="w-3 h-3" />
                    <span>{server.os}{server.osVersion ? ` ${server.osVersion}` : ''}</span>
                  </div>
                )}
                {server.ramGB && (
                  <div className="flex items-center gap-1">
                    <MemoryStick className="w-3 h-3" />
                    <span>{server.ramGB}GB RAM</span>
                  </div>
                )}
                {server.storageGB && (
                  <div className="flex items-center gap-1">
                    <HardDrive className="w-3 h-3" />
                    <span>{server.storageGB}GB {server.storageType || ''}</span>
                  </div>
                )}
                {server.location && (
                  <div className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    <span>{server.location}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: '1px solid var(--card-border)' }}>
                <span
                  className="badge"
                  style={{ backgroundColor: `${statusColors[server.status] || '#6b7280'}15`, color: statusColors[server.status] || '#6b7280' }}
                >
                  {server.status}
                </span>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>{formatDate(server.updatedAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Server"
        message="This action cannot be undone."
      />
    </div>
  );
}
