'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Network, Plus, Search, Trash2, Globe, Shield, Server, Wifi, Globe2, Lock,
} from 'lucide-react';
import { formatDate, cn } from '@/lib/utils';
import { EmptyState, ConfirmDialog } from '@/components/UIComponents';
import { useOrganization } from '@/lib/OrganizationContext';

interface NetworkDoc {
  id: string;
  name: string;
  type: string;
  content: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  tags: { id: string; name: string; color: string }[];
}

const typeConfig: Record<string, { label: string; icon: any; color: string }> = {
  'ip-schema': { label: 'IP Schema', icon: Globe, color: '#3b82f6' },
  'vlan': { label: 'VLAN', icon: Wifi, color: '#8b5cf6' },
  'firewall-rule': { label: 'Firewall Rule', icon: Shield, color: '#ef4444' },
  'dns-zone': { label: 'DNS Zone', icon: Globe2, color: '#10b981' },
  'subnet': { label: 'Subnet', icon: Network, color: '#f59e0b' },
  'nat': { label: 'NAT', icon: Server, color: '#06b6d4' },
  'vpn': { label: 'VPN', icon: Lock, color: '#ec4899' },
};

export default function NetworkPage() {
  const { selectedOrg } = useOrganization();
  const [items, setItems] = useState<NetworkDoc[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => { fetchItems(); }, [selectedOrg]);

  const fetchItems = async () => {
    const params = new URLSearchParams();
    if (selectedOrg?.id) params.set('organizationId', selectedOrg.id);
    const res = await fetch(`/api/network?${params.toString()}`);
    const data = await res.json();
    setItems(data);
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await fetch(`/api/network/${deleteId}`, { method: 'DELETE' });
    setItems(items.filter((i) => i.id !== deleteId));
    setDeleteId(null);
  };

  const filtered = items.filter((i) => {
    const matchesSearch = i.name.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === 'all' || i.type === typeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--foreground)' }}>Network Documentation</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            {selectedOrg ? `${selectedOrg.name} — ` : ''}IP schemas, VLANs, firewall rules, DNS zones
          </p>
        </div>
        <Link href="/dashboard/network/new" className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted)' }} />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-10"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="input-field w-auto"
        >
          <option value="all">All Types</option>
          {Object.entries(typeConfig).map(([key, cfg]) => (
            <option key={key} value={key}>{cfg.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-5 h-32 animate-shimmer" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Network className="w-10 h-10" />}
          title="No network documents"
          description="Add IP schemas, VLANs, firewall rules, and DNS zones."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => {
            const cfg = typeConfig[item.type] || typeConfig['ip-schema'];
            const Icon = cfg.icon;
            return (
              <Link
                key={item.id}
                href={`/dashboard/network/${item.id}`}
                className="card card-interactive p-5"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${cfg.color}15` }}
                    >
                      <Icon className="w-5 h-5" style={{ color: cfg.color }} />
                    </div>
                    <div>
                      <p className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>{item.name}</p>
                      <span className="badge badge-slate mt-1">{cfg.label}</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.preventDefault(); setDeleteId(item.id); }}
                    className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 hover:text-red-600"
                    style={{ color: 'var(--muted)' }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {item.notes && (
                  <p className="text-xs mt-3 line-clamp-2" style={{ color: 'var(--muted)' }}>{item.notes}</p>
                )}
                <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>{formatDate(item.updatedAt)}</p>
              </Link>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Network Document"
        message="This action cannot be undone."
      />
    </div>
  );
}
