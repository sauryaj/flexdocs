'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useOrganization } from '@/lib/OrganizationContext';

interface TrashedDocument { id: string; title: string; deletedAt: string }

export default function DocumentTrashPage() {
  const { selectedOrg } = useOrganization();
  const [items, setItems] = useState<TrashedDocument[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => { setPage(0); }, [selectedOrg?.id]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams({ trash: 'true', page: String(page), limit: '25' });
    if (selectedOrg?.id) params.set('organizationId', selectedOrg.id);
    fetch(`/api/documents?${params}`, { signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error('Could not load Trash.'); return response.json(); })
      .then(data => { setItems(data.items); setHasMore(data.hasMore); setError(''); })
      .catch(err => { if (err.name !== 'AbortError') setError('Could not load Trash. Please try again.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, selectedOrg?.id, refresh]);

  async function restore(document: TrashedDocument) {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch(`/api/documents/${document.id}/restore`, { method: 'POST' });
      if (!response.ok) throw new Error('Restore failed');
      setMessage(`Restored “${document.title}” privately. Its previous archive status is preserved.`);
      if (items.length === 1 && page > 0) setPage(page - 1);
      else setRefresh(value => value + 1);
    } catch { setError('Could not restore this document. You must be its owner and have editing permission.'); }
    finally { setBusy(false); }
  }

  return <div className="max-w-4xl mx-auto space-y-6">
    <Link href="/dashboard/documents" className="text-blue-600">← Documents</Link>
    <div><h1 className="text-2xl font-bold">Trash</h1>
      <p className="text-slate-500 mt-2">Your deleted documents are kept here with their history and attachments. Nothing is automatically erased. Restored documents are private until you share them again.</p></div>
    {error && <div role="alert"><p className="text-red-600">{error}</p><button className="btn-secondary mt-2" onClick={() => setRefresh(value => value + 1)}>Retry</button></div>}
    {message && <p role="status" className="text-green-600">{message}</p>}
    {loading ? <p role="status">Loading Trash…</p> : !error && items.length === 0 ? <p>Trash is empty.</p> : !error && <ul className="space-y-3">{items.map(document => <li key={document.id} className="card p-4 flex items-center justify-between gap-4">
      <div className="min-w-0"><h2 className="font-semibold break-words">{document.title}</h2><p className="text-sm text-slate-500">Moved to Trash {new Date(document.deletedAt).toLocaleString()}</p></div>
      <button disabled={busy} className="btn-secondary" onClick={() => restore(document)}>Restore<span className="sr-only"> {document.title}</span></button>
    </li>)}</ul>}
    <div className="flex gap-3"><button className="btn-secondary" disabled={page === 0 || loading || busy} onClick={() => setPage(page - 1)}>Previous</button><span className="self-center">Page {page + 1}</span><button className="btn-secondary" disabled={!hasMore || loading || busy} onClick={() => setPage(page + 1)}>Next</button></div>
  </div>;
}
