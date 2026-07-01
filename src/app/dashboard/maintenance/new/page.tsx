'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useOrganization } from '@/lib/OrganizationContext';

export default function NewMaintenancePage() {
  const router = useRouter();
  const { selectedOrg } = useOrganization();
  const [form, setForm] = useState({
    name: '', description: '', startTime: '', endTime: '',
    recurrence: '', status: 'scheduled', priority: 'medium',
    impact: '', affectedSystems: '', notifyEmails: '', tags: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const tags = form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
    const affectedSystems = form.affectedSystems ? form.affectedSystems.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const notifyEmails = form.notifyEmails ? form.notifyEmails.split(',').map((e) => e.trim()).filter(Boolean) : [];
    await fetch('/api/maintenance', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, affectedSystems, notifyEmails, tags, organizationId: selectedOrg?.id }),
    });
    router.push('/dashboard/maintenance');
  };

  const update = (key: string, value: string) => setForm({ ...form, [key]: value });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href="/dashboard/maintenance" className="inline-flex items-center gap-1.5 text-sm" style={{ color: 'var(--muted)' }}>
        <ArrowLeft className="w-4 h-4" /> Back to Maintenance
      </Link>
      <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--foreground)' }}>Schedule Maintenance Window</h1>
      <form onSubmit={handleSubmit} className="card p-6 space-y-4">
        <div><label className="block text-sm font-medium mb-1">Name *</label><input required className="input-field" value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Database Upgrade" /></div>
        <div><label className="block text-sm font-medium mb-1">Description</label><textarea className="input-field" rows={3} value={form.description} onChange={(e) => update('description', e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium mb-1">Start Time *</label><input type="datetime-local" required className="input-field" value={form.startTime} onChange={(e) => update('startTime', e.target.value)} /></div>
          <div><label className="block text-sm font-medium mb-1">End Time *</label><input type="datetime-local" required className="input-field" value={form.endTime} onChange={(e) => update('endTime', e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div><label className="block text-sm font-medium mb-1">Recurrence</label>
            <select className="input-field" value={form.recurrence} onChange={(e) => update('recurrence', e.target.value)}>
              <option value="">Once</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option>
            </select>
          </div>
          <div><label className="block text-sm font-medium mb-1">Priority</label>
            <select className="input-field" value={form.priority} onChange={(e) => update('priority', e.target.value)}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
            </select>
          </div>
          <div><label className="block text-sm font-medium mb-1">Status</label>
            <select className="input-field" value={form.status} onChange={(e) => update('status', e.target.value)}>
              <option value="scheduled">Scheduled</option><option value="in-progress">In Progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
        <div><label className="block text-sm font-medium mb-1">Impact</label><input className="input-field" value={form.impact} onChange={(e) => update('impact', e.target.value)} placeholder="Brief description of impact" /></div>
        <div><label className="block text-sm font-medium mb-1">Affected Systems</label><input className="input-field" value={form.affectedSystems} onChange={(e) => update('affectedSystems', e.target.value)} placeholder="comma-separated: DB, API, Frontend" /></div>
        <div><label className="block text-sm font-medium mb-1">Notify Emails</label><input className="input-field" value={form.notifyEmails} onChange={(e) => update('notifyEmails', e.target.value)} placeholder="comma-separated emails" /></div>
        <div><label className="block text-sm font-medium mb-1">Tags</label><input className="input-field" value={form.tags} onChange={(e) => update('tags', e.target.value)} placeholder="comma-separated" /></div>
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Scheduling...' : 'Schedule'}</button>
          <Link href="/dashboard/maintenance" className="btn-secondary">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
