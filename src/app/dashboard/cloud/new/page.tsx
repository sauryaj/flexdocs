'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useOrganization } from '@/lib/OrganizationContext';

export default function NewCloudPage() {
  const router = useRouter();
  const { selectedOrg } = useOrganization();
  const [form, setForm] = useState({
    name: '', provider: 'aws', service: '', resourceId: '', region: '',
    status: 'active', cost: '', costCurrency: 'USD', notes: '', tags: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const tags = form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
    await fetch('/api/cloud', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, tags, organizationId: selectedOrg?.id }),
    });
    router.push('/dashboard/cloud');
  };

  const update = (key: string, value: string) => setForm({ ...form, [key]: value });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href="/dashboard/cloud" className="inline-flex items-center gap-1.5 text-sm" style={{ color: 'var(--muted)' }}>
        <ArrowLeft className="w-4 h-4" /> Back to Cloud
      </Link>
      <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--foreground)' }}>New Cloud Resource</h1>
      <form onSubmit={handleSubmit} className="card p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium mb-1">Name *</label><input required className="input-field" value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Production Web Server" /></div>
          <div><label className="block text-sm font-medium mb-1">Provider</label>
            <select className="input-field" value={form.provider} onChange={(e) => update('provider', e.target.value)}>
              <option value="aws">AWS</option><option value="azure">Azure</option><option value="gcp">GCP</option><option value="other">Other</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div><label className="block text-sm font-medium mb-1">Service *</label><input required className="input-field" value={form.service} onChange={(e) => update('service', e.target.value)} placeholder="ec2, s3, rds..." /></div>
          <div><label className="block text-sm font-medium mb-1">Resource ID</label><input className="input-field" value={form.resourceId} onChange={(e) => update('resourceId', e.target.value)} placeholder="i-0123456789abcdef" /></div>
          <div><label className="block text-sm font-medium mb-1">Region</label><input className="input-field" value={form.region} onChange={(e) => update('region', e.target.value)} placeholder="us-east-1" /></div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div><label className="block text-sm font-medium mb-1">Status</label>
            <select className="input-field" value={form.status} onChange={(e) => update('status', e.target.value)}>
              <option value="active">Active</option><option value="stopped">Stopped</option><option value="terminated">Terminated</option><option value="error">Error</option>
            </select>
          </div>
          <div><label className="block text-sm font-medium mb-1">Monthly Cost ($)</label><input type="number" step="0.01" className="input-field" value={form.cost} onChange={(e) => update('cost', e.target.value)} /></div>
          <div><label className="block text-sm font-medium mb-1">Currency</label><input className="input-field" value={form.costCurrency} onChange={(e) => update('costCurrency', e.target.value)} /></div>
        </div>
        <div><label className="block text-sm font-medium mb-1">Notes</label><textarea className="input-field" rows={3} value={form.notes} onChange={(e) => update('notes', e.target.value)} /></div>
        <div><label className="block text-sm font-medium mb-1">Tags</label><input className="input-field" value={form.tags} onChange={(e) => update('tags', e.target.value)} placeholder="comma-separated" /></div>
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Creating...' : 'Create Resource'}</button>
          <Link href="/dashboard/cloud" className="btn-secondary">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
