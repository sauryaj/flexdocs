'use client';

import { RequireStaff } from '@/components/RequireStaff';

import { useCallback, useEffect, useState } from 'react';
import { useOrganization } from '@/lib/OrganizationContext';
import { Globe, Plus, Trash2, Loader2, RefreshCw } from 'lucide-react';
import { ConfirmDialog } from '@/components/UIComponents';

interface Website {
  id: string;
  name: string;
  url: string;
  status: string;
  lastStatusCode: number | null;
  lastLatencyMs: number | null;
  lastCheckedAt: string | null;
  uptime24h: number | null;
  organization?: { name: string } | null;
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'up' ? 'var(--success)' : status === 'down' ? 'var(--danger)' : 'var(--muted)';
  return <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ backgroundColor: color }} aria-label={status} />;
}

export default function WebsitesPage() {
  const { selectedOrg } = useOrganization();
  const [sites, setSites] = useState<Website[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = selectedOrg?.id ? `?organizationId=${selectedOrg.id}` : '';
    const res = await fetch(`/api/websites${params}`);
    if (res.ok) setSites(await res.json());
    setLoading(false);
  }, [selectedOrg?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    setError('');
    if (!name.trim() || !url.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/websites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url, organizationId: selectedOrg?.id || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'Failed'); return; }
      setName(''); setUrl(''); setShowAdd(false);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const checkNow = async (id: string) => {
    setChecking(id);
    await fetch(`/api/websites/${id}`, { method: 'POST' }).catch(() => {});
    await load();
    setChecking(null);
  };

  const remove = async () => {
    if (!deleteId) return;
    await fetch(`/api/websites/${deleteId}`, { method: 'DELETE' });
    setDeleteId(null);
    load();
  };

  const downCount = sites.filter((s) => s.status === 'down').length;

  return (
    <RequireStaff>
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Website Monitoring</h1>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Checked every 5 minutes{downCount > 0 ? ` — ${downCount} down` : ' — all operational'}
          </p>
        </div>
        <button onClick={() => setShowAdd((v) => !v)} className="btn-primary flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Monitor Site
        </button>
      </div>

      {showAdd && (
        <div className="card p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Client Portal)" aria-label="Site name" className="input-field" />
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="example.com" aria-label="URL" className="input-field font-mono text-sm" />
            <button onClick={add} disabled={busy || !name.trim() || !url.trim()} className="btn-primary disabled:opacity-50 flex items-center justify-center gap-2">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Start Monitoring
            </button>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      )}

      {loading ? (
        <div className="card p-8 text-center text-sm" style={{ color: 'var(--muted)' }}>Loading…</div>
      ) : sites.length === 0 ? (
        <div className="card p-10 text-center">
          <Globe className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--accent)' }} />
          <p className="font-medium" style={{ color: 'var(--foreground)' }}>Not monitoring anything yet</p>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            Add client websites — you'll be alerted when one goes down.
          </p>
        </div>
      ) : (
        <div className="card divide-y" style={{ borderColor: 'var(--card-border)' }}>
          {sites.map((s) => (
            <div key={s.id} className="p-4 flex items-center gap-4 group">
              <StatusDot status={s.status} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-sm truncate" style={{ color: 'var(--foreground)' }}>{s.name}</p>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-xs font-mono truncate hover:underline" style={{ color: 'var(--muted)' }}>
                    {s.url.replace(/^https?:\/\//, '')}
                  </a>
                  {s.organization && <span className="text-xs hidden md:block" style={{ color: 'var(--muted)' }}>· {s.organization.name}</span>}
                </div>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                  {s.lastCheckedAt ? `Checked ${new Date(s.lastCheckedAt).toLocaleTimeString()}` : 'Not checked yet'}
                  {s.lastLatencyMs != null && ` · ${s.lastLatencyMs}ms`}
                  {s.lastStatusCode != null && ` · HTTP ${s.lastStatusCode}`}
                </p>
              </div>
              <span className={`badge shrink-0 ${s.uptime24h == null ? 'badge-slate' : s.uptime24h >= 99 ? 'badge-green' : s.uptime24h >= 95 ? 'badge-yellow' : 'badge-red'}`}>
                {s.uptime24h == null ? '—' : `${s.uptime24h}%`}
              </span>
              <button
                onClick={() => checkNow(s.id)}
                aria-label={`Check ${s.name} now`}
                className="p-1.5 rounded hover:bg-[var(--surface-2)] opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: 'var(--muted)' }}
              >
                {checking === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setDeleteId(s.id)}
                aria-label={`Stop monitoring ${s.name}`}
                className="p-1.5 rounded hover:bg-red-500/10 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: 'var(--muted)' }}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={remove}
        title="Stop monitoring"
        message="Remove this site from monitoring?"
      />
    </div>
    </RequireStaff>
  );
}
