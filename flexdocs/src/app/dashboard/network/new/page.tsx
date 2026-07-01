'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useOrganization } from '@/lib/OrganizationContext';

const types = [
  { value: 'ip-schema', label: 'IP Schema' },
  { value: 'vlan', label: 'VLAN' },
  { value: 'firewall-rule', label: 'Firewall Rule' },
  { value: 'dns-zone', label: 'DNS Zone' },
  { value: 'subnet', label: 'Subnet' },
  { value: 'nat', label: 'NAT' },
  { value: 'vpn', label: 'VPN' },
];

export default function NewNetworkPage() {
  const router = useRouter();
  const { selectedOrg } = useOrganization();
  const [form, setForm] = useState({ name: '', type: 'ip-schema', content: '', notes: '', tags: '' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const tags = form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
    let content = {};
    try { content = JSON.parse(form.content); } catch { content = { raw: form.content }; }
    await fetch('/api/network', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, content, tags, organizationId: selectedOrg?.id }),
    });
    router.push('/dashboard/network');
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href="/dashboard/network" className="inline-flex items-center gap-1.5 text-sm" style={{ color: 'var(--muted)' }}>
        <ArrowLeft className="w-4 h-4" /> Back to Network
      </Link>
      <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--foreground)' }}>New Network Document</h1>
      <form onSubmit={handleSubmit} className="card p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--foreground)' }}>Name *</label>
          <input required className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., Main Office Firewall Rules" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--foreground)' }}>Type</label>
          <select className="input-field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--foreground)' }}>Content</label>
          <textarea className="input-field font-mono text-sm" rows={8} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder='{"cidr": "10.0.0.0/24", "gateway": "10.0.0.1"}' />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--foreground)' }}>Notes</label>
          <textarea className="input-field" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--foreground)' }}>Tags</label>
          <input className="input-field" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="comma-separated" />
        </div>
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Creating...' : 'Create'}</button>
          <Link href="/dashboard/network" className="btn-secondary">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
