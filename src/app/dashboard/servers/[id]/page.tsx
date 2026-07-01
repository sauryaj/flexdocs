'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { ConfirmDialog } from '@/components/UIComponents';

export default function ServerDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/servers/${id}`).then((r) => r.json()).then((data) => {
      setForm({
        name: data.name || '', hostname: data.hostname || '', ipAddress: data.ipAddress || '',
        macAddress: data.macAddress || '', os: data.os || 'Ubuntu', osVersion: data.osVersion || '',
        cpu: data.cpu || '', cpuCores: data.cpuCores?.toString() || '', ramGB: data.ramGB?.toString() || '',
        storageGB: data.storageGB?.toString() || '', storageType: data.storageType || 'SSD',
        status: data.status || 'active', location: data.location || '', rackPosition: data.rackPosition || '',
        serialNumber: data.serialNumber || '', assetTag: data.assetTag || '',
        purchaseDate: data.purchaseDate ? data.purchaseDate.split('T')[0] : '',
        warrantyExpiry: data.warrantyExpiry ? data.warrantyExpiry.split('T')[0] : '',
        notes: data.notes || '', tags: data.tags?.map((t: any) => t.name).join(', ') || '',
        createdAt: data.createdAt, updatedAt: data.updatedAt,
      });
      setLoading(false);
    });
  }, [id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const tags = form.tags ? form.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];
    await fetch(`/api/servers/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, tags }) });
    setSaving(false);
  };

  const handleDelete = async () => { await fetch(`/api/servers/${id}`, { method: 'DELETE' }); router.push('/dashboard/servers'); };
  const update = (key: string, value: string) => setForm({ ...form, [key]: value });

  if (loading) return <div className="card p-6 h-64 animate-shimmer" />;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/dashboard/servers" className="inline-flex items-center gap-1.5 text-sm" style={{ color: 'var(--muted)' }}><ArrowLeft className="w-4 h-4" /> Back to Servers</Link>
        <button onClick={() => setShowDelete(true)} className="p-2 rounded-lg hover:bg-red-50 hover:text-red-600" style={{ color: 'var(--muted)' }}><Trash2 className="w-4 h-4" /></button>
      </div>
      <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--foreground)' }}>{form.name}</h1>
      <p className="text-xs" style={{ color: 'var(--muted)' }}>Created {formatDate(form.createdAt)} · Updated {formatDate(form.updatedAt)}</p>
      <form onSubmit={handleSave} className="card p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium mb-1">Name *</label><input required className="input-field" value={form.name} onChange={(e) => update('name', e.target.value)} /></div>
          <div><label className="block text-sm font-medium mb-1">Hostname</label><input className="input-field" value={form.hostname} onChange={(e) => update('hostname', e.target.value)} /></div>
          <div><label className="block text-sm font-medium mb-1">IP Address</label><input className="input-field" value={form.ipAddress} onChange={(e) => update('ipAddress', e.target.value)} /></div>
          <div><label className="block text-sm font-medium mb-1">MAC Address</label><input className="input-field" value={form.macAddress} onChange={(e) => update('macAddress', e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div><label className="block text-sm font-medium mb-1">OS</label><select className="input-field" value={form.os} onChange={(e) => update('os', e.target.value)}><option>Ubuntu</option><option>CentOS</option><option>Debian</option><option>RHEL</option><option>Windows</option><option>Other</option></select></div>
          <div><label className="block text-sm font-medium mb-1">OS Version</label><input className="input-field" value={form.osVersion} onChange={(e) => update('osVersion', e.target.value)} /></div>
          <div><label className="block text-sm font-medium mb-1">Status</label><select className="input-field" value={form.status} onChange={(e) => update('status', e.target.value)}><option value="active">Active</option><option value="maintenance">Maintenance</option><option value="decommissioned">Decommissioned</option></select></div>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <div><label className="block text-sm font-medium mb-1">CPU</label><input className="input-field" value={form.cpu} onChange={(e) => update('cpu', e.target.value)} /></div>
          <div><label className="block text-sm font-medium mb-1">Cores</label><input type="number" className="input-field" value={form.cpuCores} onChange={(e) => update('cpuCores', e.target.value)} /></div>
          <div><label className="block text-sm font-medium mb-1">RAM (GB)</label><input type="number" className="input-field" value={form.ramGB} onChange={(e) => update('ramGB', e.target.value)} /></div>
          <div><label className="block text-sm font-medium mb-1">Storage (GB)</label><input type="number" className="input-field" value={form.storageGB} onChange={(e) => update('storageGB', e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <div><label className="block text-sm font-medium mb-1">Storage Type</label><select className="input-field" value={form.storageType} onChange={(e) => update('storageType', e.target.value)}><option>SSD</option><option>HDD</option><option>NVMe</option></select></div>
          <div><label className="block text-sm font-medium mb-1">Location</label><input className="input-field" value={form.location} onChange={(e) => update('location', e.target.value)} /></div>
          <div><label className="block text-sm font-medium mb-1">Rack Position</label><input className="input-field" value={form.rackPosition} onChange={(e) => update('rackPosition', e.target.value)} /></div>
          <div><label className="block text-sm font-medium mb-1">Serial #</label><input className="input-field" value={form.serialNumber} onChange={(e) => update('serialNumber', e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div><label className="block text-sm font-medium mb-1">Asset Tag</label><input className="input-field" value={form.assetTag} onChange={(e) => update('assetTag', e.target.value)} /></div>
          <div><label className="block text-sm font-medium mb-1">Purchase Date</label><input type="date" className="input-field" value={form.purchaseDate} onChange={(e) => update('purchaseDate', e.target.value)} /></div>
          <div><label className="block text-sm font-medium mb-1">Warranty Expiry</label><input type="date" className="input-field" value={form.warrantyExpiry} onChange={(e) => update('warrantyExpiry', e.target.value)} /></div>
        </div>
        <div><label className="block text-sm font-medium mb-1">Notes</label><textarea className="input-field" rows={3} value={form.notes} onChange={(e) => update('notes', e.target.value)} /></div>
        <div><label className="block text-sm font-medium mb-1">Tags</label><input className="input-field" value={form.tags} onChange={(e) => update('tags', e.target.value)} placeholder="comma-separated" /></div>
        <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Save Changes'}</button>
      </form>
      <ConfirmDialog isOpen={showDelete} onClose={() => setShowDelete(false)} onConfirm={handleDelete} title="Delete Server" message="This action cannot be undone." />
    </div>
  );
}
