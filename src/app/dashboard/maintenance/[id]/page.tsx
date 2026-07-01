'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { ConfirmDialog } from '@/components/UIComponents';

export default function MaintenanceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/maintenance/${id}`).then((r) => r.json()).then((data) => {
      const toLocal = (d: string) => { if (!d) return ''; const dt = new Date(d); return dt.toISOString().slice(0, 16); };
      let affected = '', emails = '';
      try { affected = JSON.parse(data.affectedSystems || '[]').join(', '); } catch { affected = data.affectedSystems || ''; }
      try { emails = JSON.parse(data.notifyEmails || '[]').join(', '); } catch { emails = data.notifyEmails || ''; }
      setForm({
        name: data.name || '', description: data.description || '',
        startTime: toLocal(data.startTime), endTime: toLocal(data.endTime),
        recurrence: data.recurrence || '', status: data.status || 'scheduled',
        priority: data.priority || 'medium', impact: data.impact || '',
        affectedSystems: affected, notifyEmails: emails,
        tags: data.tags?.map((t: any) => t.name).join(', ') || '',
        createdAt: data.createdAt, updatedAt: data.updatedAt,
      });
      setLoading(false);
    });
  }, [id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const tags = form.tags ? form.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];
    const affectedSystems = form.affectedSystems ? form.affectedSystems.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
    const notifyEmails = form.notifyEmails ? form.notifyEmails.split(',').map((e: string) => e.trim()).filter(Boolean) : [];
    await fetch(`/api/maintenance/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, affectedSystems, notifyEmails, tags }) });
    setSaving(false);
  };

  const handleDelete = async () => { await fetch(`/api/maintenance/${id}`, { method: 'DELETE' }); router.push('/dashboard/maintenance'); };
  const update = (key: string, value: string) => setForm({ ...form, [key]: value });

  if (loading) return <div className="card p-6 h-64 animate-shimmer" />;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/dashboard/maintenance" className="inline-flex items-center gap-1.5 text-sm" style={{ color: 'var(--muted)' }}><ArrowLeft className="w-4 h-4" /> Back to Maintenance</Link>
        <button onClick={() => setShowDelete(true)} className="p-2 rounded-lg hover:bg-red-50 hover:text-red-600" style={{ color: 'var(--muted)' }}><Trash2 className="w-4 h-4" /></button>
      </div>
      <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--foreground)' }}>{form.name}</h1>
      <p className="text-xs" style={{ color: 'var(--muted)' }}>Created {formatDate(form.createdAt)} · Updated {formatDate(form.updatedAt)}</p>
      <form onSubmit={handleSave} className="card p-6 space-y-4">
        <div><label className="block text-sm font-medium mb-1">Name *</label><input required className="input-field" value={form.name} onChange={(e) => update('name', e.target.value)} /></div>
        <div><label className="block text-sm font-medium mb-1">Description</label><textarea className="input-field" rows={3} value={form.description} onChange={(e) => update('description', e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium mb-1">Start Time *</label><input type="datetime-local" required className="input-field" value={form.startTime} onChange={(e) => update('startTime', e.target.value)} /></div>
          <div><label className="block text-sm font-medium mb-1">End Time *</label><input type="datetime-local" required className="input-field" value={form.endTime} onChange={(e) => update('endTime', e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div><label className="block text-sm font-medium mb-1">Recurrence</label><select className="input-field" value={form.recurrence} onChange={(e) => update('recurrence', e.target.value)}><option value="">Once</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></div>
          <div><label className="block text-sm font-medium mb-1">Priority</label><select className="input-field" value={form.priority} onChange={(e) => update('priority', e.target.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></div>
          <div><label className="block text-sm font-medium mb-1">Status</label><select className="input-field" value={form.status} onChange={(e) => update('status', e.target.value)}><option value="scheduled">Scheduled</option><option value="in-progress">In Progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div>
        </div>
        <div><label className="block text-sm font-medium mb-1">Impact</label><input className="input-field" value={form.impact} onChange={(e) => update('impact', e.target.value)} /></div>
        <div><label className="block text-sm font-medium mb-1">Affected Systems</label><input className="input-field" value={form.affectedSystems} onChange={(e) => update('affectedSystems', e.target.value)} placeholder="comma-separated" /></div>
        <div><label className="block text-sm font-medium mb-1">Notify Emails</label><input className="input-field" value={form.notifyEmails} onChange={(e) => update('notifyEmails', e.target.value)} placeholder="comma-separated" /></div>
        <div><label className="block text-sm font-medium mb-1">Tags</label><input className="input-field" value={form.tags} onChange={(e) => update('tags', e.target.value)} placeholder="comma-separated" /></div>
        <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Save Changes'}</button>
      </form>
      <ConfirmDialog isOpen={showDelete} onClose={() => setShowDelete(false)} onConfirm={handleDelete} title="Delete Maintenance Window" message="This action cannot be undone." />
    </div>
  );
}
