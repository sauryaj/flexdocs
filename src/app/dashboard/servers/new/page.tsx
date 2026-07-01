'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useOrganization } from '@/lib/OrganizationContext';

export default function NewServerPage() {
  const router = useRouter();
  const { selectedOrg } = useOrganization();
  const [form, setForm] = useState({
    name: '', hostname: '', ipAddress: '', macAddress: '', os: 'Ubuntu', osVersion: '',
    cpu: '', cpuCores: '', ramGB: '', storageGB: '', storageType: 'SSD',
    status: 'active', location: '', rackPosition: '', serialNumber: '', assetTag: '',
    purchaseDate: '', warrantyExpiry: '', notes: '', tags: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const tags = form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
    await fetch('/api/servers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, tags, organizationId: selectedOrg?.id }),
    });
    router.push('/dashboard/servers');
  };

  const update = (key: string, value: string) => setForm({ ...form, [key]: value });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href="/dashboard/servers" className="inline-flex items-center gap-1.5 text-sm" style={{ color: 'var(--muted)' }}>
        <ArrowLeft className="w-4 h-4" /> Back to Servers
      </Link>
      <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--foreground)' }}>New Server</h1>
      <form onSubmit={handleSubmit} className="card p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium mb-1">Name *</label><input required className="input-field" value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Web Server 01" /></div>
          <div><label className="block text-sm font-medium mb-1">Hostname</label><input className="input-field" value={form.hostname} onChange={(e) => update('hostname', e.target.value)} placeholder="web01.example.com" /></div>
          <div><label className="block text-sm font-medium mb-1">IP Address</label><input className="input-field" value={form.ipAddress} onChange={(e) => update('ipAddress', e.target.value)} placeholder="10.0.1.10" /></div>
          <div><label className="block text-sm font-medium mb-1">MAC Address</label><input className="input-field" value={form.macAddress} onChange={(e) => update('macAddress', e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div><label className="block text-sm font-medium mb-1">OS</label>
            <select className="input-field" value={form.os} onChange={(e) => update('os', e.target.value)}>
              <option>Ubuntu</option><option>CentOS</option><option>Debian</option><option>RHEL</option><option>Windows</option><option>Other</option>
            </select>
          </div>
          <div><label className="block text-sm font-medium mb-1">OS Version</label><input className="input-field" value={form.osVersion} onChange={(e) => update('osVersion', e.target.value)} placeholder="22.04" /></div>
          <div><label className="block text-sm font-medium mb-1">Status</label>
            <select className="input-field" value={form.status} onChange={(e) => update('status', e.target.value)}>
              <option value="active">Active</option><option value="maintenance">Maintenance</option><option value="decommissioned">Decommissioned</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <div><label className="block text-sm font-medium mb-1">CPU</label><input className="input-field" value={form.cpu} onChange={(e) => update('cpu', e.target.value)} placeholder="Intel Xeon" /></div>
          <div><label className="block text-sm font-medium mb-1">Cores</label><input type="number" className="input-field" value={form.cpuCores} onChange={(e) => update('cpuCores', e.target.value)} /></div>
          <div><label className="block text-sm font-medium mb-1">RAM (GB)</label><input type="number" className="input-field" value={form.ramGB} onChange={(e) => update('ramGB', e.target.value)} /></div>
          <div><label className="block text-sm font-medium mb-1">Storage (GB)</label><input type="number" className="input-field" value={form.storageGB} onChange={(e) => update('storageGB', e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <div><label className="block text-sm font-medium mb-1">Storage Type</label>
            <select className="input-field" value={form.storageType} onChange={(e) => update('storageType', e.target.value)}>
              <option>SSD</option><option>HDD</option><option>NVMe</option>
            </select>
          </div>
          <div><label className="block text-sm font-medium mb-1">Location</label><input className="input-field" value={form.location} onChange={(e) => update('location', e.target.value)} placeholder="DC1-Rack04" /></div>
          <div><label className="block text-sm font-medium mb-1">Rack Position</label><input className="input-field" value={form.rackPosition} onChange={(e) => update('rackPosition', e.target.value)} placeholder="U12" /></div>
          <div><label className="block text-sm font-medium mb-1">Serial #</label><input className="input-field" value={form.serialNumber} onChange={(e) => update('serialNumber', e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div><label className="block text-sm font-medium mb-1">Asset Tag</label><input className="input-field" value={form.assetTag} onChange={(e) => update('assetTag', e.target.value)} /></div>
          <div><label className="block text-sm font-medium mb-1">Purchase Date</label><input type="date" className="input-field" value={form.purchaseDate} onChange={(e) => update('purchaseDate', e.target.value)} /></div>
          <div><label className="block text-sm font-medium mb-1">Warranty Expiry</label><input type="date" className="input-field" value={form.warrantyExpiry} onChange={(e) => update('warrantyExpiry', e.target.value)} /></div>
        </div>
        <div><label className="block text-sm font-medium mb-1">Notes</label><textarea className="input-field" rows={3} value={form.notes} onChange={(e) => update('notes', e.target.value)} /></div>
        <div><label className="block text-sm font-medium mb-1">Tags</label><input className="input-field" value={form.tags} onChange={(e) => update('tags', e.target.value)} placeholder="comma-separated" /></div>
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Creating...' : 'Create Server'}</button>
          <Link href="/dashboard/servers" className="btn-secondary">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
