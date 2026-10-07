'use client';

import { useEffect, useRef, useState } from 'react';
import { PublishedAttachments } from '@/components/PublishedAttachments';

interface Choice { id: string; name: string | null; email: string }
interface FileChoice { id: string; filename: string; size: number }
interface Review {
  id: string; decision: string; submittedAt: string; feedback: string | null;
  canDecide: boolean; canWithdraw: boolean; canPublish: boolean; isPublished: boolean; isCurrentPublication: boolean;
  sourceRevision: { title: string; content: string; category: string; version: number };
  attachments: { attachmentId: string; filename: string; size: number }[];
  tags?: unknown;
}
interface Reviews { items: Review[]; canSubmit: boolean; hasMore: boolean }
interface Page<T> { items: T[]; hasMore: boolean }

export function DocumentReviewPanel({ documentId, updatedAt, current, blocked, onBusyChange, onChanged, onFeedbackDirty }: {
  documentId: string; updatedAt: string; current: { title: string; content: string; category: string; tags: { name: string }[] };
  blocked: boolean; onBusyChange: (busy: boolean) => void; onChanged: () => void;
  onFeedbackDirty: (dirty: boolean) => void;
}) {
  const [data, setData] = useState<Reviews | null>(null);
  const [reviewers, setReviewers] = useState<Page<Choice>>({ items: [], hasMore: false });
  const [files, setFiles] = useState<Page<FileChoice>>({ items: [], hasMore: false });
  const [selected, setSelected] = useState<Record<string, Choice>>({});
  const [selectedFiles, setSelectedFiles] = useState<Record<string, FileChoice>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [reviewerPage, setReviewerPage] = useState(0);
  const [filePage, setFilePage] = useState(0);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const mutation = useRef<AbortController | null>(null);
  useEffect(() => () => mutation.current?.abort(), []);
  const feedbackDirty = Object.values(feedback).some(value => value.length > 0);
  useEffect(() => {
    onFeedbackDirty(feedbackDirty);
    return () => onFeedbackDirty(false);
  }, [feedbackDirty, onFeedbackDirty]);
  useEffect(() => {
    if (!feedbackDirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    const navigate = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element).closest?.('a[href]') as HTMLAnchorElement | null;
      if (!link || link.target === '_blank' || link.href === window.location.href || link.getAttribute('href')?.startsWith('#')) return;
      if (!window.confirm('Leave this page? Unsubmitted review feedback will be lost.')) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', navigate, true);
    return () => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('click', navigate, true); };
  }, [feedbackDirty]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    async function read<T>(path: string): Promise<T> {
      const response = await fetch(path, { signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load review workflow');
      return result;
    }
    async function load() {
      try {
        const reviews = await read<Reviews>(`/api/documents/${documentId}/reviews?page=${page}`);
        const [people, attachments] = reviews.canSubmit ? await Promise.all([
          read<Page<Choice>>(`/api/documents/${documentId}/reviewers?page=${reviewerPage}&q=${encodeURIComponent(search)}`),
          read<Page<FileChoice>>(`/api/documents/${documentId}/reviews/files?page=${filePage}`),
        ]) : [{ items: [], hasMore: false }, { items: [], hasMore: false }];
        if (controller.signal.aborted) return;
        setData(reviews); setReviewers(people); setFiles(attachments); setError(''); setUncertain(false);
      } catch (failure) {
        if (!controller.signal.aborted) { setData(null); setError(failure instanceof Error ? failure.message : 'Unable to load reviews'); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [documentId, updatedAt, page, reviewerPage, filePage, search, refresh]);

  async function act(path: string, body: unknown, message: string) {
    if (blocked || loading || uncertain || mutation.current || !window.confirm(message)) return;
    const controller = new AbortController();
    mutation.current = controller;
    setBusy(true); onBusyChange(true); setError('');
    let changed = false;
    try {
      const response = await fetch(path, { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(result.error || 'Review action failed');
      onChanged(); changed = true;
    } catch (failure) {
      if (!controller.signal.aborted) { setUncertain(true); setError(`${failure instanceof Error ? failure.message : 'Unable to confirm action'}. Refresh reviews and check the saved outcome before retrying.`); }
    } finally { mutation.current = null; setBusy(false); if (!changed) onBusyChange(false); }
  }

  const disabled = blocked || busy || loading || uncertain;
  const selectedIds = Object.keys(selected);
  const fileIds = Object.keys(selectedFiles);
  const bytes = Object.values(selectedFiles).reduce((sum, file) => sum + file.size, 0);
  const pager = (value: number, more: boolean, change: (page: number) => void, label: string) => <div className="flex flex-wrap items-center gap-2">
    <button type="button" className="btn-secondary" disabled={loading || busy || value === 0} onClick={() => change(value - 1)}>Previous {label}</button>
    <span className="text-sm">Page {value + 1}</span>
    <button type="button" className="btn-secondary" disabled={loading || busy || !more} onClick={() => change(value + 1)}>Next {label}</button>
  </div>;

  return <section aria-label="Document reviews" className="card p-4 space-y-4 min-w-0">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Review and publication</h2>
      <div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary" disabled={busy || loading} onClick={() => setRefresh(value => value + 1)}>Refresh reviews</button>
        <button type="button" className="btn-secondary" disabled={blocked || busy || loading} onClick={() => { if (feedbackDirty && !window.confirm('Reload the saved document? Unsubmitted review feedback will be cleared.')) return; onBusyChange(true); onChanged(); }}>Reload saved document</button></div></div>
    <p className="text-sm text-slate-600">Review freezes the saved version and selected files. Approval and publication are separate actions.</p>
    {blocked && <p className="text-sm">Save or resolve your document edits before taking a review action.</p>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {loading && <p role="status">Loading reviews…</p>}
    {busy && <p role="status">Applying review action…</p>}
    {!loading && data?.canSubmit && <div className="space-y-3 border-b border-slate-200 pb-4">
      <h3 className="font-medium">Submit saved version</h3>
      <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); setReviewerPage(0); setSearch(query.trim()); }}>
        <label className="text-sm">Find reviewers<input className="input block" value={query} maxLength={200} onChange={event => setQuery(event.target.value)} /></label>
        <button type="submit" className="btn-secondary" disabled={busy}>Search reviewers</button>
      </form>
      <p className="text-sm">Selected reviewers: {Object.values(selected).map(person => person.name || person.email).join(', ') || 'None'}</p>
      <button type="button" className="btn-secondary" disabled={disabled} onClick={() => { setSelected({}); setSelectedFiles({}); }}>Clear selections</button>
      {reviewers.items.length === 0 && <p className="text-sm">No eligible reviewers match this search.</p>}
      {reviewers.items.map(person => <label key={person.id} className="flex items-start gap-2 text-sm break-all"><input type="checkbox" checked={!!selected[person.id]} disabled={disabled || (!selected[person.id] && selectedIds.length >= 10)}
        onChange={event => setSelected(previous => { const next = { ...previous }; if (event.target.checked) next[person.id] = person; else delete next[person.id]; return next; })} />{person.name || person.email} · {person.email}</label>)}
      {pager(reviewerPage, reviewers.hasMore, setReviewerPage, 'reviewers')}
      <h3 className="font-medium">Files to include</h3>
      <p className="text-sm">Select up to 10 files (10 MiB each, 50 MiB total). Only selected files will be published. Selected: {fileIds.length}.</p>
      <p className="text-sm break-words">Selected files: {Object.values(selectedFiles).map(file => file.filename).join(', ') || 'None'}</p>
      {files.items.map(file => <label key={file.id} className="flex items-start gap-2 text-sm break-all"><input type="checkbox" checked={!!selectedFiles[file.id]}
        disabled={disabled || (!selectedFiles[file.id] && (fileIds.length >= 10 || file.size > 10 * 1024 * 1024 || bytes + file.size > 50 * 1024 * 1024))}
        onChange={event => setSelectedFiles(previous => { const next = { ...previous }; if (event.target.checked) next[file.id] = file; else delete next[file.id]; return next; })} />{file.filename} ({file.size} bytes)</label>)}
      {files.items.length === 0 && <p className="text-sm">No working files on this page.</p>}
      {pager(filePage, files.hasMore, setFilePage, 'files')}
      <button type="button" className="btn-primary" disabled={disabled || selectedIds.length === 0}
        onClick={() => void act(`/api/documents/${documentId}/reviews`, { expectedUpdatedAt: updatedAt, reviewerIds: selectedIds, attachmentIds: fileIds }, `Submit the saved version for review with ${fileIds.length} selected files? ${fileIds.length === 0 ? 'This review and its publication will contain no attachments. ' : ''}This does not publish it.`)}>Submit for review</button>
    </div>}
    {!loading && data?.items.length === 0 && <p>No reviews yet.</p>}
    {!loading && data?.items.map(review => <article key={review.id} className="rounded-lg border border-slate-200 p-3 space-y-3 min-w-0">
      <h3 className="font-medium">Version {review.sourceRevision.version} · {review.decision}{review.isCurrentPublication ? ' · Current publication' : review.isPublished ? ' · Historical publication' : ''}</h3>
      <p className="text-sm text-slate-500">Submitted {new Date(review.submittedAt).toLocaleString()}</p>
      <details><summary className="cursor-pointer text-sm font-medium">Compare reviewed version with saved working version</summary>
        <div className="grid gap-3 mt-3 md:grid-cols-2">
          {[{ label: 'Reviewed version', ...review.sourceRevision, tags: review.tags }, { label: 'Saved working version', ...current, tags: current.tags.map(tag => tag.name) }].map(version => <div key={version.label} className="min-w-0"><h4 className="font-medium break-words">{version.label}: {version.title}</h4><p className="text-sm break-words">Category: {version.category} · Tags: {Array.isArray(version.tags) ? version.tags.filter(tag => typeof tag === 'string').join(', ') || 'None' : 'Unavailable'}</p><pre className="text-sm whitespace-pre-wrap break-words max-h-80 overflow-auto">{version.content}</pre></div>)}
        </div>
      </details>
      <PublishedAttachments documentId={documentId} reviewId={review.id} files={review.attachments} />
      {review.feedback && <p className="text-sm whitespace-pre-wrap break-words">Review feedback: {review.feedback}</p>}
      {(review.canDecide || review.canWithdraw) && <div><label htmlFor={`review-feedback-${review.id}`} className="block text-sm">Feedback for version {review.sourceRevision.version}</label><textarea id={`review-feedback-${review.id}`} className="input block w-full mt-1" maxLength={10000} value={feedback[review.id] || ''} disabled={disabled} onChange={event => setFeedback(previous => ({ ...previous, [review.id]: event.target.value }))} /></div>}
      <div className="flex flex-wrap gap-2">
        {(['approved', 'rejected', 'withdrawn'] as const).filter(decision => decision === 'withdrawn' ? review.canWithdraw : review.canDecide).map(decision => <button key={decision} type="button" className="btn-secondary" disabled={disabled}
          onClick={() => void act(`/api/documents/${documentId}/reviews/${review.id}`, { decision, feedback: feedback[review.id] || '' }, `${decision === 'approved' ? 'Approve' : decision === 'rejected' ? 'Reject' : 'Withdraw'} this exact reviewed version? Approval does not publish.`)}>{decision === 'approved' ? 'Approve review' : decision === 'rejected' ? 'Reject review' : 'Withdraw review'}</button>)}
        {review.canPublish && <button type="button" className="btn-primary" disabled={disabled} onClick={() => void act(`/api/documents/${documentId}/reviews/${review.id}/publish`, {}, 'Publish this approved version and its selected files for authorized readers?')}>Publish approved version</button>}
      </div>
    </article>)}
    {data && pager(page, data.hasMore, setPage, 'reviews')}
  </section>;
}
