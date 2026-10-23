'use client';

import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import type { previewDocumentOwnership } from '@/lib/document-ownership-preview';

type Preview = Awaited<ReturnType<typeof previewDocumentOwnership>>;
const intentSchema = z.object({ userId: z.string(), documentId: z.string(), key: z.string().uuid(), destinationOrganizationId: z.string(),
  expectedUpdatedAt: z.string().datetime(), previewFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  requestId: z.string().nullable(), acknowledgeWorkingHistoryAndFilesExposure: z.literal(true) }).strict();
type Intent = z.infer<typeof intentSchema>;

export function DocumentOwnership({ documentId, updatedAt, userId, blocked, canStart = true, verifyAccount, onBusyChange, onChanged }: {
  documentId: string; updatedAt: string; userId: string | null; blocked: boolean; verifyAccount: () => Promise<boolean>;
  canStart?: boolean;
  onBusyChange: (busy: boolean) => void; onChanged: () => void;
}) {
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [destination, setDestination] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [teamPage, setTeamPage] = useState(0);
  const [moreTeams, setMoreTeams] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [lastSeen, setLastSeen] = useState(0);
  const [acknowledged, setAcknowledged] = useState(false);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [storageReady, setStorageReady] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const busyCallback = useRef(onBusyChange); busyCallback.current = onBusyChange;
  const storageKey = userId ? `flexdocs:ownership:${encodeURIComponent(userId)}:${encodeURIComponent(documentId)}` : null;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; busyCallback.current(false); };
  }, []);
  useEffect(() => {
    if (!storageKey || !userId) return;
    try {
      const probe = `${storageKey}:probe`; sessionStorage.setItem(probe, '1'); sessionStorage.removeItem(probe);
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        const parsed = intentSchema.safeParse(JSON.parse(stored));
        if (!parsed.success || parsed.data.userId !== userId || parsed.data.documentId !== documentId) throw new Error('Invalid saved ownership request');
        setIntent(parsed.data); busyCallback.current(true);
        setStatus('An acknowledged ownership change may be pending or completed. Check its status or retry the same change.');
      }
      setStorageReady(true);
    } catch { setError('Ownership retry storage is unavailable. No new change can start; keep this page open to resolve any existing request.'); }
  }, [storageKey, userId, documentId]);
  useEffect(() => {
    if (!userId || intent || !canStart) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ expectedUpdatedAt: updatedAt, page: String(teamPage), q: search });
    void fetch(`/api/documents/${encodeURIComponent(documentId)}/ownership/destinations?${params}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to load teams');
        if (!controller.signal.aborted) { setTeams(result.items); setMoreTeams(result.hasMore); } })
      .catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Unable to load teams'); });
    return () => controller.abort();
  }, [documentId, updatedAt, userId, teamPage, search, intent, canStart]);
  useEffect(() => {
    if (!intent && !busy) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  }, [intent, busy]);

  function persist(value: Intent) {
    if (!storageKey) throw new Error('Account identity is unavailable');
    sessionStorage.setItem(storageKey, JSON.stringify(value)); setIntent(value);
  }
  function clear(message: string) {
    try { if (storageKey) sessionStorage.removeItem(storageKey); }
    catch { setStorageReady(false); setError('Ownership outcome confirmed, but the browser retry record could not be removed. Check status again after reload.'); }
    setIntent(null); setPreview(null); setAcknowledged(false); setStatus(message); onBusyChange(false);
  }
  async function run(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      if (!await verifyAccount()) throw new Error('Verify your current account before changing ownership');
      await action();
    } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : 'Unable to confirm ownership state'); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  async function json(path: string, method = 'GET', body?: unknown) {
    const response = await fetch(path, { method, cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Request result is uncertain. Check status before starting another change.'); return result;
  }
  async function loadPreview(page = 0) {
    if (!destination || blocked || intent) return;
    await run(async () => {
      const params = new URLSearchParams({ destinationOrganizationId: destination, expectedUpdatedAt: updatedAt, page: String(page) });
      const result: Preview = await json(`/api/documents/${encodeURIComponent(documentId)}/ownership/preview?${params}`);
      if (preview && result.fingerprint !== preview.fingerprint) { setPreview(null); setLastSeen(0); setAcknowledged(false); throw new Error('Audience or document changed. Review a new preview.'); }
      setPreview(result); setLastSeen(value => preview ? Math.max(value, page) : page);
    });
  }
  async function resolve(value: Intent, cancel = false, checkOnly = false) {
    onBusyChange(true);
    let current = value;
    if (!current.requestId) {
      const prepared = await json(`/api/documents/${encodeURIComponent(documentId)}/ownership/requests`, 'POST', {
        key: current.key, destinationOrganizationId: current.destinationOrganizationId, expectedUpdatedAt: current.expectedUpdatedAt, previewFingerprint: current.previewFingerprint,
      });
      current = { ...current, requestId: prepared.id }; persist(current);
    }
    const path = `/api/ownership-requests/${encodeURIComponent(current.requestId!)}`;
    const saved = await json(path);
    if (saved.status === 'completed') { clear('Ownership change completed. Reload the saved document.'); return; }
    if (saved.status === 'cancelled') { clear('Ownership request cancelled.'); return; }
    if (cancel) { await json(path, 'DELETE'); clear('Ownership request cancelled.'); return; }
    if (checkOnly) { setStatus(saved.expired ? 'The request expired. Cancel it before starting a fresh preview.' : 'The request is pending. Retry the acknowledged change or cancel it.'); return; }
    await json(`${path}/confirm`, 'POST', { expectedUpdatedAt: current.expectedUpdatedAt, previewFingerprint: current.previewFingerprint, acknowledgeWorkingHistoryAndFilesExposure: true });
    clear('Ownership change completed. Reload the saved document.'); onChanged();
  }
  const allAudienceSeen = !!preview && lastSeen >= Math.max(0, Math.ceil(preview.audience.total / preview.audience.limit) - 1);
  if (!canStart && !intent && !status) return null;
  return <section aria-label="Document ownership" className="max-w-7xl mx-auto w-full min-w-0 rounded-xl border border-slate-200 bg-white p-4 space-y-3">
    <h2 className="font-semibold">Document ownership</h2>
    <p className="text-sm text-slate-600">Move documentation to a team only after reviewing who gains access to working content, history and files.</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {status && <p role="status" className="text-sm">{status}</p>}
    {intent ? <div className="flex flex-wrap gap-2">
      <button className="btn-secondary" disabled={busy} onClick={() => void run(() => resolve(intent, false, true))}>Check ownership request</button>
      <button className="btn-primary" disabled={busy} onClick={() => void run(() => resolve(intent))}>Retry acknowledged ownership change</button>
      <button className="btn-secondary" disabled={busy} onClick={() => void run(() => resolve(intent, true))}>Cancel ownership request</button>
    </div> : canStart ? <>
      {blocked && <p className="text-sm text-slate-600">Save or resolve edits and review feedback before changing ownership.</p>}
      <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); setSearch(query); setTeamPage(0); setDestination(''); setPreview(null); setAcknowledged(false); }}>
        <label htmlFor="ownership-team-search" className="sr-only">Search destination teams</label>
        <input id="ownership-team-search" className="input-field flex-1 min-w-0" placeholder="Team name" value={query} maxLength={200} onChange={event => setQuery(event.target.value)} disabled={busy || blocked} />
        <button className="btn-secondary" disabled={busy || blocked}>Search teams</button>
      </form>
      <label htmlFor="ownership-destination" className="block text-sm">Destination team</label>
      <select id="ownership-destination" className="input-field w-full min-w-0" value={destination} disabled={busy || blocked || !storageReady}
        onChange={event => { setDestination(event.target.value); setPreview(null); setAcknowledged(false); setLastSeen(0); setError(''); }}>
        <option value="">Select a team you administer</option>{teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
      </select>
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary" disabled={busy || blocked || teamPage === 0} onClick={() => { setTeamPage(value => value - 1); setDestination(''); setPreview(null); }}>Previous teams</button>
        <button className="btn-secondary" disabled={busy || blocked || !moreTeams} onClick={() => { setTeamPage(value => value + 1); setDestination(''); setPreview(null); }}>Next teams</button>
        <button className="btn-secondary" disabled={busy || blocked || !destination || !storageReady} onClick={() => void loadPreview()}>Preview ownership change</button>
      </div>
      {preview && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-3">
        <h3 className="font-semibold">Access in {preview.destination.name}</h3>
        <p className="text-sm">{preview.audience.workingCount} maintainers gain working content, {preview.exposure.revisions} revisions, {preview.exposure.reviews} reviews, {preview.exposure.publications} historical publications and {preview.exposure.workingFiles} working files. {preview.audience.publishedOnlyCount} readers wait for a new publication.</p>
        <p className="text-sm">Folder placement and the current publication are cleared. Pending reviews are withdrawn. The destination starts as a draft, with you responsible. Source-team access is removed unless those people also have destination grants.</p>
        <ul className="text-sm space-y-1">{preview.audience.items.map(member => <li key={member.id} className="break-words">{member.name || member.email} · {member.role} · {member.working ? 'working content and history' : 'published only'}</li>)}</ul>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" disabled={busy || blocked || preview.audience.page === 0} onClick={() => void loadPreview(preview.audience.page - 1)}>Previous audience</button>
          <button className="btn-secondary" disabled={busy || blocked || !preview.audience.hasMore} onClick={() => void loadPreview(preview.audience.page + 1)}>Next audience</button>
        </div>
        {preview.blockers.map(blocker => <p key={blocker.code} role="alert" className="text-sm text-red-700">{blocker.message} ({blocker.count})</p>)}
        {!allAudienceSeen && <p className="text-sm">Review every audience page before confirming.</p>}
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={acknowledged} disabled={busy || blocked || !allAudienceSeen} onChange={event => setAcknowledged(event.target.checked)} />I authorize this team to access the working document, complete history and files described above.</label>
        <button className="btn-primary" disabled={busy || blocked || !storageReady || !acknowledged || !allAudienceSeen || preview.blockers.length > 0}
          onClick={() => void run(async () => {
            if (!userId) throw new Error('Account identity unavailable');
            const value: Intent = { userId, documentId, key: crypto.randomUUID(), destinationOrganizationId: destination,
              expectedUpdatedAt: updatedAt, previewFingerprint: preview.fingerprint, requestId: null, acknowledgeWorkingHistoryAndFilesExposure: true };
            persist(value); await resolve(value);
          })}>Confirm ownership change</button>
      </div>}
    </> : null}
    {status.includes('Reload') && <button className="btn-secondary" disabled={busy} onClick={onChanged}>Reload saved document</button>}
    {busy && <p role="status" className="text-sm">Checking ownership state…</p>}
  </section>;
}
