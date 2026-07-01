'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Trash2, Plus } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { ConfirmDialog } from '@/components/UIComponents';

export default function StatusDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [form, setForm] = useState({ name: '', description: '', isPublic: false });
  const [components, setComponents] = useState<{ id?: string; name: string; status: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<any>(null);

  useEffect(() => {
    fetch(`/api/status-pages/${id}`).then((r) => r.json()).then((data) => {
      setItem(data);
      setForm({ name: data.name || '', description: data.description || '', isPublic: data.isPublic || false });
      setComponents(data.components?.map((c: any) => ({ id: c.id, name: c.name, status: c.status })) || []);
      setLoading(false);
    });
  }, [id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const filteredComponents = components.filter((c) => c.name.trim());
    await fetch(`/api/status-pages/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, components: filteredComponents }) });
    setSaving(false);
  };

  const handleDelete = async () => { await fetch(`/api/status-pages/${id}`, { method: 'DELETE' }); router.push('/dashboard/status'); };
  const addComponent = () => setComponents([...components, { name: '', status: 'operational' }]);
  const removeComponent = (i: number) => setComponents(components.filter((_, idx) => idx !== i));
  const updateComponent = (i: number, key: string, value: string) => {
    const next = [...components];
    next[i] = { ...next[i], [key]: value };
    setComponents(next);
  };

  if (loading) return <div className="card p-6 h-64 animate-shimmer" />;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/dashboard/status" className="inline-flex items-center gap-1.5 text-sm" style={{ color: 'var(--muted)' }}><ArrowLeft className="w-4 h-4" /> Back to Status Pages</Link>
        <button onClick={() => setShowDelete(true)} className="p-2 rounded-lg hover:bg-red-50 hover:text-red-600" style={{ color: 'var(--muted)' }}><Trash2 className="w-4 h-4" /></button>
      </div>
      <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--foreground)' }}>{item?.name}</h1>
      <p className="text-xs" style={{ color: 'var(--muted)' }}>Created {formatDate(item?.createdAt)} · Updated {formatDate(item?.updatedAt)}</p>
      <form onSubmit={handleSave} className="card p-6 space-y-4">
        <div><label className="block text-sm font-medium mb-1">Name *</label><input required className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><label className="block text-sm font-medium mb-1">Description</label><textarea className="input-field" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="isPublic" checked={form.isPublic} onChange={(e) => setForm({ ...form, isPublic: e.target.checked })} className="rounded" />
          <label htmlFor="isPublic" className="text-sm" style={{ color: 'var(--foreground)' }}>Public status page</label>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>Components</label>
            <button type="button" onClick={addComponent} className="text-xs flex items-center gap-1" style={{ color: 'var(--accent)' }}><Plus className="w-3 h-3" /> Add</button>
          </div>
          <div className="space-y-2">
            {components.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <input className="input-field flex-1" value={c.name} onChange={(e) => updateComponent(i, 'name', e.target.value)} placeholder="Component name" />
                <select className="input-field w-auto" value={c.status} onChange={(e) => updateComponent(i, 'status', e.target.value)}>
                  <option value="operational">Operational</option><option value="degraded">Degraded</option>
                  <option value="partial-outage">Partial Outage</option><option value="major-outage">Major Outage</option>
                </select>
                <button type="button" onClick={() => removeComponent(i)} className="p-1.5 rounded hover:bg-red-50 hover:text-red-600" style={{ color: 'var(--muted)' }}><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        </div>
        <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Save Changes'}</button>
      </form>
      <ConfirmDialog isOpen={showDelete} onClose={() => setShowDelete(false)} onConfirm={handleDelete} title="Delete Status Page" message="This will delete the page and all components/incidents." />
    </div>
  );
}
