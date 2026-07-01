'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useOrganization } from '@/lib/OrganizationContext';

export default function NewStatusPage() {
  const router = useRouter();
  const { selectedOrg } = useOrganization();
  const [form, setForm] = useState({ name: '', description: '', isPublic: false });
  const [components, setComponents] = useState<{ name: string; status: string }[]>([{ name: '', status: 'operational' }]);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const filteredComponents = components.filter((c) => c.name.trim());
    await fetch('/api/status-pages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, components: filteredComponents, organizationId: selectedOrg?.id }),
    });
    router.push('/dashboard/status');
  };

  const addComponent = () => setComponents([...components, { name: '', status: 'operational' }]);
  const removeComponent = (i: number) => setComponents(components.filter((_, idx) => idx !== i));
  const updateComponent = (i: number, key: string, value: string) => {
    const next = [...components];
    next[i] = { ...next[i], [key]: value };
    setComponents(next);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href="/dashboard/status" className="inline-flex items-center gap-1.5 text-sm" style={{ color: 'var(--muted)' }}>
        <ArrowLeft className="w-4 h-4" /> Back to Status Pages
      </Link>
      <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--foreground)' }}>Create Status Page</h1>
      <form onSubmit={handleSubmit} className="card p-6 space-y-4">
        <div><label className="block text-sm font-medium mb-1">Name *</label><input required className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Company Status" /></div>
        <div><label className="block text-sm font-medium mb-1">Description</label><textarea className="input-field" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="isPublic" checked={form.isPublic} onChange={(e) => setForm({ ...form, isPublic: e.target.checked })} className="rounded" />
          <label htmlFor="isPublic" className="text-sm" style={{ color: 'var(--foreground)' }}>Public status page</label>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>Components</label>
            <button type="button" onClick={addComponent} className="text-xs flex items-center gap-1" style={{ color: 'var(--accent)' }}>
              <Plus className="w-3 h-3" /> Add Component
            </button>
          </div>
          <div className="space-y-2">
            {components.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <input className="input-field flex-1" value={c.name} onChange={(e) => updateComponent(i, 'name', e.target.value)} placeholder="Component name" />
                <select className="input-field w-auto" value={c.status} onChange={(e) => updateComponent(i, 'status', e.target.value)}>
                  <option value="operational">Operational</option><option value="degraded">Degraded</option>
                  <option value="partial-outage">Partial Outage</option><option value="major-outage">Major Outage</option>
                </select>
                {components.length > 1 && (
                  <button type="button" onClick={() => removeComponent(i)} className="p-1.5 rounded hover:bg-red-50 hover:text-red-600" style={{ color: 'var(--muted)' }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Creating...' : 'Create Status Page'}</button>
          <Link href="/dashboard/status" className="btn-secondary">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
