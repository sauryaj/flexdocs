'use client';

import { useCallback, useEffect, useState } from 'react';
import { useOrganization } from '@/lib/OrganizationContext';
import { Network, Plus, Trash2, Loader2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/UIComponents';

interface IpamNetwork {
  id: string;
  name: string;
  cidr: string;
  range: string;
  prefix: string;
  vlanId: number | null;
  notes: string | null;
  totalAddresses: number;
  usedAddresses: number;
  hosts: { id: string; name: string; ipAddress: string | null }[];
  organization?: { name: string } | null;
}

export default function IpamPage() {
  const { selectedOrg } = useOrganization();
  const [networks, setNetworks] = useState<IpamNetwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [cidr, setCidr] = useState('');
  const [vlan, setVlan] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = selectedOrg?.id ? `?organizationId=${selectedOrg.id}` : '';
    const res = await fetch(`/api/ipam${params}`);
    if (res.ok) setNetworks(await res.json());
    setLoading(false);
  }, [selectedOrg?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    setError('');
    if (!name.trim() || !cidr.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/ipam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, cidr, vlanId: vlan || undefined, organizationId: selectedOrg?.id || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed to create network');
        return;
      }
      setName(''); setCidr(''); setVlan(''); setShowAdd(false);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleteId) return;
    await fetch(`/api/ipam/${deleteId}`, { method: 'DELETE' });
    setDeleteId(null);
    load();
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>IP Address Management</h1>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Networks and utilization{selectedOrg ? ` — ${selectedOrg.name}` : ' across your clients'}
          </p>
        </div>
        <button onClick={() => setShowAdd((v) => !v)} className="btn-primary flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> New Network
        </button>
      </div>

      {showAdd && (
        <div className="card p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Main Office LAN)" aria-label="Network name" className="input-field" />
            <input value={cidr} onChange={(e) => setCidr(e.target.value)} placeholder="CIDR (e.g. 192.168.1.0/24)" aria-label="CIDR range" className="input-field font-mono text-sm" />
            <input value={vlan} onChange={(e) => setVlan(e.target.value)} placeholder="VLAN (optional)" aria-label="VLAN id" className="input-field" inputMode="numeric" />
            <button onClick={add} disabled={busy || !name.trim() || !cidr.trim()} className="btn-primary disabled:opacity-50 flex items-center justify-center gap-2">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Create
            </button>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      )}

      {loading ? (
        <div className="card p-8 text-center text-sm" style={{ color: 'var(--muted)' }}>Loading networks…</div>
      ) : networks.length === 0 ? (
        <div className="card p-10 text-center">
          <Network className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--accent)' }} />
          <p className="font-medium" style={{ color: 'var(--foreground)' }}>No networks yet</p>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            Add a CIDR range — utilization is computed automatically from your servers' IPs.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {networks.map((n) => {
            const pct = n.totalAddresses > 0 ? Math.min(100, Math.round((n.usedAddresses / Math.min(n.totalAddresses, 1024)) * 100)) : 0;
            return (
              <div key={n.id} className="card p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold" style={{ color: 'var(--foreground)' }}>{n.name}</h3>
                      <span className="badge badge-slate font-mono">{n.cidr}</span>
                      {n.vlanId != null && <span className="badge badge-blue">VLAN {n.vlanId}</span>}
                      {n.organization && <span className="text-xs" style={{ color: 'var(--muted)' }}>{n.organization.name}</span>}
                    </div>
                    {n.hosts.length > 0 && (
                      <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
                        Hosts: {n.hosts.map((h) => `${h.name} (${h.ipAddress})`).join(', ')}
                      </p>
                    )}
                  </div>
                  <button onClick={() => setDeleteId(n.id)} aria-label={`Delete ${n.name}`} className="p-1.5 rounded hover:bg-red-500/10 hover:text-red-500" style={{ color: 'var(--muted)' }}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--surface-2)' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.max(2, pct)}%`, backgroundColor: pct > 80 ? 'var(--danger)' : 'var(--accent)' }}
                    />
                  </div>
                  <span className="text-xs shrink-0" style={{ color: 'var(--muted)' }}>
                    {n.usedAddresses} / {n.totalAddresses.toLocaleString()} addresses
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={remove}
        title="Delete network"
        message="Remove this network from IPAM? Servers and assets are not affected."
      />
    </div>
  );
}
