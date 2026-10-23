'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Role = 'reader' | 'contributor' | 'reviewer' | 'administrator';
interface Member { userId: string; userEmail: string; organizationId: string }
interface Grant { userId: string; role: Role }
const roles: Role[] = ['reader', 'contributor', 'reviewer', 'administrator'];

export function DocumentationGrantsPanel({ organizations, members }: { organizations: { id: string; name: string }[]; members: Member[] }) {
  const [organizationId, setOrganizationId] = useState('');
  const [grants, setGrants] = useState<Grant[]>([]);
  const [selection, setSelection] = useState<Record<string, Role | ''>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const load = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setGrants([]);
    setSelection({});
    setError(null);
    if (!organizationId) { setLoading(false); return; }
    setLoading(true);
    try {
      const response = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/documentation-grants`, { signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load documentation grants');
      if (!Array.isArray(data)) throw new Error('Invalid documentation grant response');
      if (controller.signal.aborted) return;
      setGrants(data);
      setSelection(Object.fromEntries(data.map((grant: Grant) => [grant.userId, grant.role])));
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load documentation grants');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [organizationId]);
  useEffect(() => { void load(); return () => requestRef.current?.abort(); }, [load]);

  const save = async (userId: string) => {
    if (busy.current) return;
    busy.current = true;
    setSaving(userId);
    setError(null);
    try {
      const response = await fetch(`/api/organizations/${encodeURIComponent(organizationId)}/documentation-grants`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, role: selection[userId] || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Grant change failed');
      await load();
    } catch (cause) {
      setError(`${cause instanceof Error ? cause.message : 'Grant change failed'}. Refresh grants before retrying an uncertain request.`);
    } finally { busy.current = false; setSaving(null); }
  };

  return <section className="card p-4 space-y-3" aria-labelledby="documentation-grants-title">
    <h3 id="documentation-grants-title" className="text-sm font-semibold">Documentation permissions</h3>
    <p className="text-xs text-slate-500">Assign explicit team roles to current members. These grants do not convert personal documents or enable team publication.</p>
    <select className="input-field" aria-label="Documentation organization" value={organizationId} disabled={!!saving} onChange={event => setOrganizationId(event.target.value)}>
      <option value="">Select organization…</option>
      {organizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
    </select>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {organizationId && <button className="btn-secondary" disabled={loading || !!saving} onClick={() => void load()}>Refresh grants</button>}
    {loading && <p role="status" className="text-sm">Loading documentation permissions…</p>}
    {!loading && !error && organizationId && members.filter(member => member.organizationId === organizationId).map(member => {
      const current = grants.find(grant => grant.userId === member.userId)?.role || '';
      return <div key={member.userId} className="flex flex-wrap items-center gap-2">
        <span className="text-sm w-full min-w-0 break-all sm:flex-1 sm:w-auto">{member.userEmail}</span>
        <select className="input-field w-auto" aria-label={`Documentation role for ${member.userEmail}`} value={selection[member.userId] || ''} disabled={!!saving} onChange={event => setSelection(previous => ({ ...previous, [member.userId]: event.target.value as Role | '' }))}>
          <option value="">No grant</option>{roles.map(role => <option key={role} value={role}>{role}</option>)}
        </select>
        <button className="btn-primary" disabled={!!saving || (selection[member.userId] || '') === current} onClick={() => void save(member.userId)}>{saving === member.userId ? 'Saving…' : 'Save role'}</button>
      </div>;
    })}
    {!loading && !error && organizationId && !members.some(member => member.organizationId === organizationId) && <p className="text-sm text-slate-500">Add organization members before assigning documentation permissions.</p>}
  </section>;
}
