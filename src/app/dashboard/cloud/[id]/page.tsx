'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { ConfirmDialog } from '@/components/UIComponents';

export default function CloudDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/cloud/${id}`).then((r) => r.json()).then((data) => {
      setForm({
        name: data.name || '', provider: data.provider || 'aws', service: data.service || '',
        resourceId: data.resourceId || '', region: data.region || '', status: data.status || 'active',
        cost: data.cost?.toString() || '', costCurrency: data.costCurrency || 'USD',
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
    await fetch(`/api/cloud/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, tags }) });
    setSaving(false);
  };

  const handleDelete = async () => { await fetch(`/api/cloud/${id}`, { method: 'DELETE' }); router.push('/dashboard/cloud'); };
  const update = (key: string, value: string) => setForm({ ...form, [key]: value });

  if (loading) return <div className="card p-6 h-64 animate-shimmer" />;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/dashboard/cloud" className="inline-flex items-center gap-1.5 text-sm" style={{ color: 'var(--muted)' }}><ArrowLeft className="w-4 h-4" /> Back to Cloud</Link>
        <button onClick={() => setShowDelete(true)} className="p-2 rounded-lg hover:bg-red-50 hover:text-red-600" style={{ color: 'var(--muted)' }}><Trash2 className="w-4 h-4" /></button>
      </div>
      <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--foreground)' }}>{form.name}</h1>
      <p className="text-xs" style={{ color: 'var(--muted)' }}>Created {formatDate(form.createdAt)} · Updated {formatDate(form.updatedAt)}</p>
      <form onSubmit={handleSave} className="card p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium mb-1">Name *</label><input required className="input-field" value={form.name} onChange={(e) => update('name', e.target.value)} /></div>
          <div><label className="block text-sm font-medium mb-1">Provider</label><select className="input-field" value={form.provider} onChange={(e) => update('provider', e.target.value)}><option value="aws">AWS</option><option value="azure">Azure</option><option value="gcp">GCP</option><option value="other">Other</option></select></div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div><label className="block text-sm font-medium mb-1">Service *</label><input required className="input-field" value={form.service} onChange={(e) => update('service', e.target.value)} /></div>
          <div><label className="block text-sm font-medium mb-1">Resource ID</label><input className="input-field" value={form.resourceId} onChange={(e) => update('resourceId', e.target.value)} /></div>
          <div><label className="block text-sm font-medium mb-1">Region</label><input className="input-field" value={form.region} onChange={(e) => update('region', e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div><label className="block text-sm font-medium mb-1">Status</label><select className="input-field" value={form.status} onChange={(e) => update('status', e.target.value)}><option value="active">Active</option><option value="stopped">Stopped</option><option value="terminated">Terminated</option><option value="error">Error</option></select></div>
          <div><label className="block text-sm font-medium mb-1">Monthly Cost ($)</label><input type="number" step="0.01" className="input-field" value={form.cost} onChange={(e) => update('cost', e.target.value)} /></div>
          <div><label className="block text-sm font-medium mb-1">Currency</label><input className="input-field" value={form.costCurrency} onChange={(e) => update('costCurrency', e.target.value)} /></div>
        </div>
        <div><label className="block text-sm font-medium mb-1">Notes</label><textarea className="input-field" rows={3} value={form.notes} onChange={(e) => update('notes', e.target.value)} /></div>
        <div><label className="block text-sm font-medium mb-1">Tags</label><input className="input-field" value={form.tags} onChange={(e) => update('tags', e.target.value)} placeholder="comma-separated" /></div>
        <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Save Changes'}</button>
      </form>
      <ConfirmDialog isOpen={showDelete} onClose={() => setShowDelete(false)} onConfirm={handleDelete} title="Delete Cloud Resource" message="This action cannot be undone." />
    </div>
  );
}
