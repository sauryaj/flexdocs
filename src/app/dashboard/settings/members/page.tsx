'use client';

import { useEffect, useState } from 'react';
import { UsersRound, Loader2, Plus, Trash2 } from 'lucide-react';

interface Member {
  id: string;
  role: string;
  userName: string | null;
  userEmail: string;
  organizationName: string;
  organizationId: string;
}

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ email: '', organizationId: '', role: 'client' });

  const load = async () => {
    setLoading(true);
    try {
      const [mRes, oRes] = await Promise.all([fetch('/api/org-members'), fetch('/api/organizations')]);
      setMembers(await mRes.json());
      const orgData = await oRes.json();
      setOrgs(Array.isArray(orgData) ? orgData : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const addMember = async () => {
    if (adding) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch('/api/org-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add member');
      setForm({ email: '', organizationId: '', role: 'client' });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setAdding(false);
    }
  };

  const removeMember = async (id: string) => {
    await fetch(`/api/org-members?id=${id}`, { method: 'DELETE' });
    load();
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>;
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2"><UsersRound className="w-5 h-5" /> Organization Members</h2>
        <p className="text-xs text-slate-500 mt-1">
          Client contacts with portal access. They only see data belonging to their organization.
        </p>
      </div>

      <div className="card p-4 space-y-3">
        <h3 className="text-sm font-semibold">Grant portal access</h3>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input
            className="input-field md:col-span-1"
            placeholder="user@email.com"
            type="email"
            spellCheck={false}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <select className="input-field" aria-label="Organization" value={form.organizationId} onChange={(e) => setForm({ ...form, organizationId: e.target.value })}>
            <option value="">Select organization…</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          <select className="input-field" aria-label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="client">Client (read-only)</option>
            <option value="org_admin">Org admin</option>
          </select>
          <button onClick={addMember} disabled={!form.email || !form.organizationId || adding} className="btn-primary flex items-center justify-center gap-2">
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
          </button>
        </div>
        <p className="text-[11px] text-slate-500">The user must already exist — invite them via Admin → Users first.</p>
      </div>

      <div className="card divide-y" style={{ borderColor: 'var(--card-border)' }}>
        {members.length === 0 ? (
          <p className="px-5 py-8 text-sm text-center text-slate-500">No members yet.</p>
        ) : (
          members.map((m) => (
            <div key={m.id} className="flex items-center justify-between px-5 py-3 gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{m.userName || m.userEmail}</p>
                <p className="text-xs text-slate-500 truncate">{m.userEmail} · {m.organizationName} · {m.role}</p>
              </div>
              <button onClick={() => removeMember(m.id)} aria-label={`Remove ${m.userEmail}`} className="p-1.5 rounded-md hover:bg-red-500/10 text-red-500 transition-colors shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
