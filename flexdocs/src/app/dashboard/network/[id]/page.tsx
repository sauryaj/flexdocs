'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { ConfirmDialog } from '@/components/UIComponents';

const types = [
  { value: 'ip-schema', label: 'IP Schema' },
  { value: 'vlan', label: 'VLAN' },
  { value: 'firewall-rule', label: 'Firewall Rule' },
  { value: 'dns-zone', label: 'DNS Zone' },
  { value: 'subnet', label: 'Subnet' },
  { value: 'nat', label: 'NAT' },
  { value: 'vpn', label: 'VPN' },
];

export default function NetworkDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [form, setForm] = useState({ name: '', type: 'ip-schema', content: '', notes: '', tags: '' });
  const [item, setItem] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/network/${id}`).then((r) => r.json()).then((data) => {
      setItem(data);
      let contentStr = '';
      try { contentStr = JSON.stringify(JSON.parse(data.content), null, 2); } catch { contentStr = data.content || ''; }
      setForm({ name: data.name, type: data.type, content: contentStr, notes: data.notes || '', tags: data.tags?.map((t: any) => t.name).join(', ') || '' });
      setLoading(false);
    });
  }, [id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const tags = form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
    let content = {};
    try { content = JSON.parse(form.content); } catch { content = { raw: form.content }; }
    await fetch(`/api/network/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, content, tags }),
    });
    setSaving(false);
  };

  const handleDelete = async () => {
    await fetch(`/api/network/${id}`, { method: 'DELETE' });
    router.push('/dashboard/network');
  };

  if (loading) return <div className="card p-6 h-64 animate-shimmer" />;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/dashboard/network" className="inline-flex items-center gap-1.5 text-sm" style={{ color: 'var(--muted)' }}>
          <ArrowLeft className="w-4 h-4" /> Back to Network
        </Link>
        <button onClick={() => setShowDelete(true)} className="p-2 rounded-lg hover:bg-red-50 hover:text-red-600 transition-colors" style={{ color: 'var(--muted)' }}>
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--foreground)' }}>{item?.name}</h1>
      <p className="text-xs" style={{ color: 'var(--muted)' }}>Created {formatDate(item?.createdAt)} · Updated {formatDate(item?.updatedAt)}</p>
      <form onSubmit={handleSave} className="card p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--foreground)' }}>Name</label>
          <input required className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--foreground)' }}>Type</label>
          <select className="input-field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--foreground)' }}>Content</label>
          <textarea className="input-field font-mono text-sm" rows={10} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--foreground)' }}>Notes</label>
          <textarea className="input-field" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--foreground)' }}>Tags</label>
          <input className="input-field" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="comma-separated" />
        </div>
        <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Save Changes'}</button>
      </form>
      <ConfirmDialog isOpen={showDelete} onClose={() => setShowDelete(false)} onConfirm={handleDelete} title="Delete Network Document" message="This action cannot be undone." />
    </div>
  );
}
