'use client';

import { useEffect, useRef, useState } from 'react';
import { uploadDocumentAttachment } from '@/lib/document-client';

interface WorkingFile { id: string; filename: string; size: number }

export function TeamDocumentFiles({ documentId, updatedAt, blocked, readOnly = false, onBusyChange, onChanged }: {
  documentId: string; updatedAt: string; blocked: boolean; readOnly?: boolean; onBusyChange: (busy: boolean) => void; onChanged: () => void;
}) {
  const [files, setFiles] = useState<WorkingFile[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const input = useRef<HTMLInputElement | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current?.abort(); }; }, []);
  useEffect(() => {
    if (!changing) return;
    const unload = (event: BeforeUnloadEvent) => event.preventDefault();
    const navigate = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element).closest?.('a[href]') as HTMLAnchorElement | null;
      if (!link || link.target === '_blank' || link.href === window.location.href || link.href.startsWith('blob:') || link.getAttribute('href')?.startsWith('#')) return;
      if (!window.confirm('A working file change is pending and may already be committed. Leave and check the saved document before retrying?')) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', unload); document.addEventListener('click', navigate, true);
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', navigate, true); };
  }, [changing]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void fetch(`/api/documents/${encodeURIComponent(documentId)}/files?page=${page}`, { signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load working files');
      if (!controller.signal.aborted) { setFiles(result.items); setHasMore(result.hasMore); setError(''); }
    }).catch(failure => { if (!controller.signal.aborted) { setFiles([]); setError(failure instanceof Error ? failure.message : 'Unable to load files'); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [documentId, updatedAt, page, refresh]);

  async function change(file?: File, attachmentId?: string) {
    if (readOnly || blocked || busy || loading || uncertain || request.current) return;
    if (!window.confirm(`${file ? 'Upload this working file' : 'Remove this working file'}? This returns the working document to draft and invalidates its review. Published files remain unchanged.`)) return;
    const controller = new AbortController();
    request.current = controller; setBusy(true); setChanging(true); onBusyChange(true); setError(''); setProgress(file ? 0 : null);
    let changed = false;
    try {
      if (file) await uploadDocumentAttachment(documentId, file, { teamVersion: updatedAt, signal: controller.signal, onProgress: setProgress });
      else {
        const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/files/${encodeURIComponent(attachmentId!)}`, { method: 'DELETE', signal: controller.signal,
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedUpdatedAt: updatedAt }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to confirm file removal');
      }
      if (!controller.signal.aborted) { changed = true; onChanged(); }
    } catch (failure) {
      if (mounted.current) { setUncertain(true); setError(`${failure instanceof Error ? failure.message : 'Unable to confirm file change'}. Reload the saved document and check files before retrying.`); }
    } finally {
      request.current = null;
      if (mounted.current) { setBusy(false); setChanging(false); setProgress(null); if (input.current) input.current.value = ''; if (!changed) onBusyChange(false); }
    }
  }

  async function download(file: WorkingFile) {
    if (request.current) return;
    const controller = new AbortController(); request.current = controller; setBusy(true); setError('');
    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/files/${encodeURIComponent(file.id)}`, { signal: controller.signal });
      if (!response.ok) throw new Error('Working file unavailable. Refresh files or ask an administrator to check storage.');
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob); const link = document.createElement('a');
      link.href = url; link.download = file.filename; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Download failed'); }
    finally { request.current = null; if (!controller.signal.aborted) setBusy(false); }
  }

  const disabled = blocked || busy || loading || uncertain;
  return <section aria-label="Team working files" className="card p-4 space-y-3 max-w-7xl mx-auto mt-6 min-w-0">
    <h2 className="font-semibold">Team working files</h2>
    <p className="text-sm">{readOnly ? 'Archived working files are read only for authorized maintainers.' : 'Maintainers can manage these files across uploaders.'} Readers see only files selected for publication. Maximum 10 MiB per file; downloads only.</p>
    <p className="text-sm">Removing a working file retains stored bytes for reviewed/published versions and later reference-aware cleanup.</p>
    {blocked && <p className="text-sm">Save or resolve document edits and review feedback before changing files.</p>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {loading && <p role="status">Loading working files…</p>}
    {!readOnly && <input ref={input} aria-label="Team attachment file" type="file" disabled={disabled} onChange={event => { const file = event.target.files?.[0]; if (file) void change(file); }} />}
    {progress !== null && <div><progress aria-label="Team upload progress" value={progress} max={100} /><p role="status">{progress === 100 ? 'File sent. Waiting for server confirmation…' : `Uploading: ${progress}%`}</p>
      <button type="button" className="btn-secondary" onClick={() => request.current?.abort()}>Cancel upload</button></div>}
    {busy && progress === null && <p role="status">Applying file request…</p>}
    <div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary" disabled={busy || loading} onClick={() => setRefresh(value => value + 1)}>Refresh working files</button>
      <button type="button" className="btn-secondary" disabled={blocked || busy || loading} onClick={() => { onBusyChange(true); onChanged(); }}>Reload saved document and files</button></div>
    {!loading && !files.length && !error && <p>No working files on this page.</p>}
    <ul className="space-y-2">{files.map(file => <li key={file.id} className="flex flex-wrap items-center justify-between gap-2"><span className="break-all text-sm">{file.filename} ({file.size} bytes)</span>
      <div className="flex gap-2"><button type="button" className="btn-secondary" disabled={busy} onClick={() => void download(file)} aria-label={`Download working ${file.filename}`}>Download</button>
        {!readOnly && <button type="button" className="btn-secondary" disabled={disabled} onClick={() => void change(undefined, file.id)} aria-label={`Remove working ${file.filename}`}>Remove</button>}</div></li>)}</ul>
    <div className="flex flex-wrap items-center gap-2"><button type="button" className="btn-secondary" disabled={busy || loading || page === 0} onClick={() => setPage(value => value - 1)}>Previous working files</button><span>Page {page + 1}</span>
      <button type="button" className="btn-secondary" disabled={busy || loading || !hasMore} onClick={() => setPage(value => value + 1)}>Next working files</button></div>
  </section>;
}
