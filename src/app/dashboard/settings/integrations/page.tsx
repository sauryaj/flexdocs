'use client';

import { useEffect, useState } from 'react';
import { Cloud, Loader2, RefreshCw, CheckCircle2, XCircle, Users } from 'lucide-react';

interface Integration {
  type: string;
  name: string;
  tenantId?: string | null;
  clientId?: string | null;
  serviceAccountEmail?: string | null;
  adminEmail?: string | null;
  lastSyncAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  userCount: number;
}

const EMPTY_M365 = { type: 'm365', name: '', tenantId: '', clientId: '', clientSecret: '' };
const EMPTY_GOOGLE = { type: 'google', name: '', serviceAccountEmail: '', privateKey: '', adminEmail: '' };

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [m365, setM365] = useState({ ...EMPTY_M365 });
  const [google, setGoogle] = useState({ ...EMPTY_GOOGLE });

  useEffect(() => {
    fetch('/api/integrations')
      .then((r) => r.json())
      .then((list) => {
        setIntegrations(Array.isArray(list) ? list : []);
        for (const i of list || []) {
          if (i.type === 'm365') setM365({ type: 'm365', name: i.name, tenantId: i.tenantId || '', clientId: i.clientId || '', clientSecret: '' });
          if (i.type === 'google') setGoogle({ type: 'google', name: i.name, serviceAccountEmail: i.serviceAccountEmail || '', privateKey: '', adminEmail: i.adminEmail || '' });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async (payload: Record<string, string>) => {
    setSaving(payload.type);
    setMessage(null);
    try {
      const res = await fetch('/api/integrations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setMessage({ kind: 'ok', text: `${data.type} integration saved` });
    } catch (e) {
      setMessage({ kind: 'err', text: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setSaving(null);
    }
  };

  const sync = async (type: string) => {
    setSyncing(type);
    setMessage(null);
    try {
      const res = await fetch(`/api/integrations/${type}/sync`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      setMessage({ kind: 'ok', text: `${data.userCount} users synced${data.licenseSummary ? ` · ${data.licenseSummary.length} license SKUs` : ''}` });
    } catch (e) {
      setMessage({ kind: 'err', text: e instanceof Error ? e.message : 'Sync failed' });
    } finally {
      setSyncing(null);
    }
  };

  const statusFor = (type: string) => integrations.find((i) => i.type === type);

  const input = 'w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white';

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2"><Cloud className="w-5 h-5" /> Tenant Integrations</h2>
        <p className="text-xs text-slate-500 mt-1">Sync users and licenses from Microsoft 365 or Google Workspace.</p>
      </div>

      {message && (
        <div
          aria-live="polite"
          className={`flex items-center gap-2 text-sm p-3 rounded-lg border ${message.kind === 'ok' ? 'border-green-200 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' : 'border-red-200 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'}`}
        >
          {message.kind === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      {/* M365 */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Microsoft 365</h3>
          {statusFor('m365') && (
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Users className="w-3.5 h-3.5" /> {statusFor('m365')!.userCount} users ·{' '}
              {statusFor('m365')!.lastStatus === 'error' ? (
                <span className="text-red-500">last sync failed</span>
              ) : (
                `synced ${statusFor('m365')!.lastSyncAt ? new Date(statusFor('m365')!.lastSyncAt!).toLocaleString() : 'never'}`
              )}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500">Azure app registration with <code>User.Read.All</code> application permission.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input className={input} placeholder="Name" value={m365.name} onChange={(e) => setM365({ ...m365, name: e.target.value })} />
          <input className={input} placeholder="Tenant ID" value={m365.tenantId} onChange={(e) => setM365({ ...m365, tenantId: e.target.value })} />
          <input className={input} placeholder="Client ID" value={m365.clientId} onChange={(e) => setM365({ ...m365, clientId: e.target.value })} />
          <input className={`${input} md:col-span-2`} type="password" placeholder="Client secret (stored encrypted)" value={m365.clientSecret} onChange={(e) => setM365({ ...m365, clientSecret: e.target.value })} />
          <button onClick={() => save(m365)} disabled={saving === 'm365'} className="btn-primary flex items-center justify-center gap-2 text-sm">
            {saving === 'm365' ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save
          </button>
        </div>
        {statusFor('m365') && (
          <button onClick={() => sync('m365')} disabled={syncing !== null} className="text-sm inline-flex items-center gap-1.5 hover:underline" style={{ color: 'var(--accent)' }}>
            {syncing === 'm365' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Sync now
          </button>
        )}
      </div>

      {/* Google */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Google Workspace</h3>
          {statusFor('google') && (
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Users className="w-3.5 h-3.5" /> {statusFor('google')!.userCount} users
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500">Service account with domain-wide delegation and Directory read scope.</p>
        <div className="grid grid-cols-1 gap-3">
          <input className={input} placeholder="Name" value={google.name} onChange={(e) => setGoogle({ ...google, name: e.target.value })} />
          <input className={input} placeholder="Service account email" value={google.serviceAccountEmail} onChange={(e) => setGoogle({ ...google, serviceAccountEmail: e.target.value })} />
          <textarea className={input} rows={3} placeholder="Private key (PEM, stored encrypted)" value={google.privateKey} onChange={(e) => setGoogle({ ...google, privateKey: e.target.value })} />
          <input className={input} placeholder="Admin email to impersonate" value={google.adminEmail} onChange={(e) => setGoogle({ ...google, adminEmail: e.target.value })} />
          <button onClick={() => save(google)} disabled={saving === 'google'} className="btn-primary flex items-center justify-center gap-2 text-sm w-fit px-6">
            {saving === 'google' ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save
          </button>
        </div>
        {statusFor('google') && (
          <button onClick={() => sync('google')} disabled={syncing !== null} className="text-sm inline-flex items-center gap-1.5 hover:underline" style={{ color: 'var(--accent)' }}>
            {syncing === 'google' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Sync now
          </button>
        )}
      </div>
    </div>
  );
}
