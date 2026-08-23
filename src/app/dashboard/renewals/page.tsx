'use client';

import { useEffect, useState } from 'react';
import { CalendarClock, Plus, Trash2, Loader2 } from 'lucide-react';
import { useOrganization } from '@/lib/OrganizationContext';
import { ConfirmDialog } from '@/components/UIComponents';

interface Renewal {
  id: string;
  name: string;
  vendor: string | null;
  type: string;
  seats: number | null;
  costPerSeat: number | null;
  totalCost: number | null;
  renewsAt: string;
  autoRenew: boolean;
  organizationName?: string | null;
  daysUntilRenewal: number;
}

export default function RenewalsPage() {
  const { selectedOrg } = useOrganization();
  const [items, setItems] = useState<Renewal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', vendor: '', type: 'license', seats: '', totalCost: '', renewsAt: '' });

  useEffect(() => {
    fetchItems();
  }, [selectedOrg]);

  const fetchItems = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedOrg?.id) params.set('organizationId', selectedOrg.id);
    const res = await fetch(`/api/renewals?${params}`);
    if (res.ok) setItems(await res.json());
    setLoading(false);
  };

  const submit = async () => {
    if (saving || !form.name || !form.renewsAt) return;
    setSaving(true);
    try {
      await fetch('/api/renewals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, organizationId: selectedOrg?.id }),
      });
      setShowForm(false);
      setForm({ name: '', vendor: '', type: 'license', seats: '', totalCost: '', renewsAt: '' });
      fetchItems();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (confirmed: boolean) => {
    if (!confirmed || !deleteId) return;
    setDeleteId(null);
    await fetch(`/api/renewals?id=${deleteId}`, { method: 'DELETE' });
    fetchItems();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><CalendarClock className="w-6 h-6" /> Licenses & Contracts</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">Renewal dates that would otherwise surprise you</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Add renewal
        </button>
      </div>

      {showForm && (
        <div className="card p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <input className="input-field" placeholder="Name (e.g. M365 Business Premium)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="input-field" placeholder="Vendor" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
          <select className="input-field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="license">License</option>
            <option value="saas">SaaS</option>
            <option value="contract">Contract</option>
            <option value="warranty">Warranty</option>
          </select>
          <input className="input-field" type="number" placeholder="Seats" value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value })} />
          <input className="input-field" type="number" placeholder="Total cost / yr" value={form.totalCost} onChange={(e) => setForm({ ...form, totalCost: e.target.value })} />
          <input className="input-field" type="date" aria-label="Renewal date" value={form.renewsAt} onChange={(e) => setForm({ ...form, renewsAt: e.target.value })} />
          <button
            onClick={submit}
            disabled={saving}
            className="btn-primary md:col-span-3 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save renewal
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent)' }} /></div>
      ) : items.length === 0 ? (
        <div className="card p-12 text-center">
          <CalendarClock className="w-10 h-10 mx-auto mb-3 opacity-40" style={{ color: 'var(--muted)' }} />
          <p className="font-semibold" style={{ color: 'var(--foreground)' }}>No renewals tracked</p>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Add licenses and contracts to get 30-day warning notifications.</p>
        </div>
      ) : (
        <div className="card divide-y" style={{ borderColor: 'var(--card-border)' }}>
          {items.map((r) => {
            const urgent = r.daysUntilRenewal <= 30;
            return (
              <div key={r.id} className="flex items-center justify-between px-5 py-3.5 gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--foreground)' }}>{r.name}</p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>
                    {[r.vendor, r.type, r.seats ? `${r.seats} seats` : null, r.totalCost != null ? `$${r.totalCost.toLocaleString()}/yr` : null, r.autoRenew ? 'auto-renew' : 'manual'].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`badge ${urgent ? 'badge-yellow' : 'badge-green'}`}>
                    {new Date(r.renewsAt).toLocaleDateString()} · {r.daysUntilRenewal}d
                  </span>
                  <button
                    onClick={() => setDeleteId(r.id)}
                    aria-label={`Delete ${r.name}`}
                    className="p-1.5 rounded-md hover:bg-red-500/10 text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => remove(true)}
        title="Delete renewal"
        message="Remove this license/contract from tracking?"
      />
    </div>
  );
}
