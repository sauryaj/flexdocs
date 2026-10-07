'use client';

import { useEffect, useRef, useState } from 'react';

interface Maintainer { id: string; name: string | null; email: string }

export function DocumentResponsibility({ documentId, updatedAt, blocked, onBusyChange, onChanged }: {
  documentId: string; updatedAt: string; blocked: boolean; onBusyChange: (busy: boolean) => void; onChanged: () => void;
}) {
  const [items, setItems] = useState<Maintainer[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [selected, setSelected] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current?.abort(); }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setSelected(''); setItems([]);
    void fetch(`/api/documents/${encodeURIComponent(documentId)}/responsibility?page=${page}&q=${encodeURIComponent(search)}`, { signal: controller.signal })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to load maintainers');
        if (result.updatedAt !== updatedAt) throw new Error('Document changed. Reload the saved document before assigning a maintainer.');
        if (!controller.signal.aborted) { setItems(result.items); setCurrent(result.responsibleUserId); setHasMore(result.hasMore); setError(''); }
      }).catch(failure => { if (!controller.signal.aborted) { setHasMore(false); setError(failure instanceof Error ? failure.message : 'Unable to load maintainers'); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [documentId, updatedAt, page, search, refresh]);
  useEffect(() => {
    if (!busy) return;
    const unload = (event: BeforeUnloadEvent) => event.preventDefault();
    const navigate = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element).closest?.('a[href]') as HTMLAnchorElement | null;
      if (!link || link.target === '_blank' || link.href === window.location.href || link.getAttribute('href')?.startsWith('#')) return;
      if (!window.confirm('A responsibility change is pending and may already be saved. Leave and check the saved document before retrying?')) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', unload); document.addEventListener('click', navigate, true);
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', navigate, true); };
  }, [busy]);

  async function change(targetId: string | null) {
    if (blocked || busy || loading || error || uncertain || request.current) return;
    if (!window.confirm(`${targetId ? 'Assign the selected maintainer' : 'Clear the responsible maintainer'}? Pending reviews will be withdrawn. This changes responsibility; document access and the published version stay the same.`)) return;
    const controller = new AbortController(); request.current = controller;
    setBusy(true); onBusyChange(true); setError('');
    let changed = false;
    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/responsibility`, { method: 'PUT', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ responsibleUserId: targetId, expectedUpdatedAt: updatedAt }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to confirm responsibility change');
      if (!controller.signal.aborted && mounted.current) { changed = true; onChanged(); }
    } catch (failure) {
      if (mounted.current) { setUncertain(true); setError(`${failure instanceof Error ? failure.message : 'Unable to confirm responsibility change'}. Reload the saved document before retrying.`); }
    } finally {
      request.current = null;
      if (mounted.current) { setBusy(false); if (!changed) onBusyChange(false); }
    }
  }

  const currentItem = items.find(item => item.id === current);
  const disabled = blocked || busy || loading || uncertain || !!error;
  return <section aria-label="Document responsibility" className="max-w-7xl mx-auto w-full min-w-0 rounded-xl border border-slate-200 bg-white p-4 space-y-3">
    <h2 className="font-semibold">Responsible maintainer</h2>
    <p className="text-sm text-slate-600">{loading ? 'Loading maintainers…' : error ? 'Reload to confirm the saved maintainer.' : current ? `Assigned: ${currentItem ? currentItem.name || currentItem.email : 'maintainer outside these search results'}` : 'No maintainer assigned'}</p>
    <p className="text-sm text-slate-600">Responsibility changes withdraw pending reviews. Document access and the published version stay the same.</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {blocked && !busy && <p className="text-sm text-slate-600">Save or resolve your document edits and review feedback before reassigning responsibility.</p>}
    <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); setSearch(query.trim()); setPage(0); setRefresh(value => value + 1); }}>
      <label htmlFor="maintainer-query" className="sr-only">Search maintainers</label>
      <input id="maintainer-query" className="input-field flex-1 min-w-0" placeholder="Name or email" maxLength={200} value={query} onChange={event => setQuery(event.target.value)} disabled={busy || blocked || uncertain} />
      <button className="btn-secondary" disabled={busy || blocked || uncertain}>Search maintainers</button>
    </form>
    <label htmlFor="responsible-maintainer" className="block text-sm">Eligible team maintainer</label>
    <select id="responsible-maintainer" className="input-field w-full min-w-0" value={selected} onChange={event => setSelected(event.target.value)} disabled={disabled}>
      <option value="">Select a maintainer</option>
      {items.map(item => <option key={item.id} value={item.id}>{item.name || item.email}</option>)}
    </select>
    {!loading && !error && items.length === 0 && <p className="text-sm text-slate-600">No eligible maintainers match this search.</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn-primary" disabled={disabled || !selected || selected === current} onClick={() => void change(selected)}>Assign maintainer</button>
      <button type="button" className="btn-secondary" disabled={disabled || !current} onClick={() => void change(null)}>Clear maintainer</button>
      <button type="button" className="btn-secondary" disabled={disabled || page === 0} onClick={() => setPage(value => value - 1)}>Previous maintainers</button>
      <button type="button" className="btn-secondary" disabled={disabled || !hasMore} onClick={() => setPage(value => value + 1)}>Next maintainers</button>
      {error && <button type="button" className="btn-secondary" disabled={busy || blocked} onClick={uncertain ? onChanged : () => setRefresh(value => value + 1)}>{uncertain ? 'Reload saved document' : 'Retry loading maintainers'}</button>}
    </div>
    {busy && <p role="status" className="text-sm">Saving responsibility…</p>}
  </section>;
}
