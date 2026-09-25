'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Save,
  Loader2,
  Pin,
  Archive,
  Copy,
  Trash2,
  FileText,
  Upload,
  History,
  Paperclip,
  Plus,
  Download,
  RotateCcw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { ConfirmDialog } from '@/components/UIComponents';
import { MarkdownPreview } from '@/components/MarkdownPreview';
import { MarkdownToolbar } from '@/components/MarkdownToolbar';
import { Eye, Edit3, Columns } from 'lucide-react';
import { RelatedItems } from '@/components/RelatedItems';
import { uploadDocumentAttachment } from '@/lib/document-client';
import { useDocumentDraft } from '@/lib/use-document-draft';
import type { DocumentDraft } from '@/lib/document-drafts';

const categories = [
  'general',
  'procedure',
  'runbook',
  'network',
  'server',
  'application',
  'compliance',
  'onboarding',
];

interface Document {
  id: string;
  canEdit?: boolean;
  title: string;
  content: string;
  category: string;
  isPinned: boolean;
  isArchived: boolean;
  visibility?: string;
  reviewDate?: string | null;
  organizationId?: string | null;
  createdAt: string;
  updatedAt: string;
  tags: { id: string; name: string; color: string }[];
  folder: { id: string; name: string } | null;
}

interface Revision {
  id: string;
  version: number;
  message: string | null;
  createdAt: string;
  author: { id: string; name: string; email: string } | null;
}

interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
  uploadedBy: { id: string; name: string; email: string } | null;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>();
  return <DocumentEditor key={params.id} documentId={params.id} />;
}

function DocumentEditor({ documentId }: { documentId: string }) {
  const router = useRouter();
  const params = { id: documentId };
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [doc, setDoc] = useState<Document | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('general');
  const [tags, setTags] = useState('');
  const [reviewDate, setReviewDate] = useState('');
  const [reviewDue, setReviewDue] = useState(false);
  const [visibility, setVisibility] = useState('private');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [viewMode, setViewMode] = useState<'write' | 'preview' | 'split'>('write');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // --- Autosave -------------------------------------------------------------
  const lastSavedRef = useRef<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState('');
  const [conflict, setConflict] = useState<Document | null>(null);
  const [autosavePaused, setAutosavePaused] = useState(false);
  const savingRef = useRef(false);
  const versionRef = useRef<string | undefined>(undefined);
  const liveSnapshotRef = useRef('');

  const currentSnapshot = () =>
    JSON.stringify({ t: title, c: content, cat: category, tg: tags, rd: reviewDate, v: visibility });

  liveSnapshotRef.current = currentSnapshot();
  const hasUnsavedChanges = !loading && !!doc && doc.canEdit !== false && lastSavedRef.current !== null && currentSnapshot() !== lastSavedRef.current;
  const draft = useDocumentDraft({ title, content, category, tags, reviewDate, visibility,
    folderId: doc?.folder?.id || '', organizationId: doc?.organizationId || '', baseUpdatedAt: versionRef.current,
  }, hasUnsavedChanges, documentId, !loading && !!doc && doc.canEdit !== false);
  const [recoveryPreview, setRecoveryPreview] = useState<DocumentDraft | null>(null);

  const restoreDraft = (candidate: DocumentDraft) => {
    if (hasUnsavedChanges && !confirm('Replace your current unsaved edits and their browser copy with this recovered text?')) return;
    setTitle(candidate.fields.title);
    setContent(candidate.fields.content);
    setCategory(candidate.fields.category);
    setTags(candidate.fields.tags);
    setReviewDate(candidate.fields.reviewDate || '');
    setVisibility(candidate.fields.visibility || 'private');
    setDirty(true);
    setAutosavePaused(true);
    setSaveError('Recovered edits are in the editor. Compare them with the saved version below, then use Save Now to apply them. Autosave is paused.');
  };

  useEffect(() => {
    if (loading || !doc || doc.canEdit === false || saving || saveError || draft.revoked || autosavePaused) return;
    if (lastSavedRef.current === null) return;
    if (currentSnapshot() === lastSavedRef.current) { setDirty(false); return; }
    setDirty(true);
    const timer = setTimeout(() => {
      void doSave();
    }, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, category, tags, reviewDate, visibility, loading, doc, saving, saveError, draft.revoked, autosavePaused]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const insertFormatting = (prefix: string, suffix: string = '', defaultText: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end) || defaultText;
    const replacement = `${prefix}${selectedText}${suffix}`;

    setContent(content.substring(0, start) + replacement + content.substring(end));

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selectedText.length);
    }, 0);
  };

  // Version History
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [revisionsError, setRevisionsError] = useState('');
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [revisionMessage, setRevisionMessage] = useState('');
  const [savingRevision, setSavingRevision] = useState(false);
  const [restoringRevision, setRestoringRevision] = useState<string | null>(null);
  const [revisionsExpanded, setRevisionsExpanded] = useState(false);

  // Attachments
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [attachmentsError, setAttachmentsError] = useState('');
  const [attachmentActionError, setAttachmentActionError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [deletingAttachment, setDeletingAttachment] = useState<string | null>(null);
  const [attachmentsExpanded, setAttachmentsExpanded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError('');
    fetch(`/api/documents/${params.id}`, { signal: controller.signal })
      .then((r) => { if (!r.ok) throw new Error(r.status === 404 ? 'Document not found or unavailable.' : 'Unable to load document. Please try again.'); return r.json(); })
      .then((data) => {
        if (controller.signal.aborted) return;
        versionRef.current = data.updatedAt;
        setDoc(data);
        setTitle(data.title);
        setContent(data.content);
        setCategory(data.category);
        setTags(data.tags.map((t: any) => t.name).join(', '));
        if (data.reviewDate) {
          setReviewDate(new Date(data.reviewDate).toISOString().slice(0, 10));
          setReviewDue(new Date(data.reviewDate).getTime() <= Date.now());
        }
        const vis = data.visibility || 'private';
        setVisibility(vis);
        // Autosave baseline: what the server has right now
        lastSavedRef.current = JSON.stringify({
          t: data.title,
          c: data.content,
          cat: data.category,
          tg: data.tags.map((t: any) => t.name).join(', '),
          rd: data.reviewDate ? new Date(data.reviewDate).toISOString().slice(0, 10) : '',
          v: vis,
        });
        setDirty(false);
        setLoading(false);
      }).catch((error) => {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : 'Unable to load document. Please try again.');
        setDoc(null);
        setLoading(false);
      });
    return () => controller.abort();
  }, [params.id, loadAttempt]);

  const fetchRevisions = async () => {
    setRevisionsLoading(true);
    setRevisionsError('');
    try {
      const res = await fetch(`/api/documents/${params.id}/revisions`);
      if (!res.ok) throw new Error('Unable to load revision history.');
      setRevisions(await res.json());
    } catch {
      setRevisionsError('Unable to load revision history. Please try again.');
    } finally {
      setRevisionsLoading(false);
    }
  };

  const fetchAttachments = async () => {
    setAttachmentsLoading(true);
    setAttachmentsError('');
    try {
      const res = await fetch(`/api/attachments?documentId=${params.id}`);
      if (!res.ok) throw new Error('Unable to load attachments.');
      setAttachments(await res.json());
    } catch {
      setAttachmentsError('Unable to load attachments. Please try again.');
    } finally {
      setAttachmentsLoading(false);
    }
  };

  useEffect(() => {
    if (revisionsExpanded) fetchRevisions();
  }, [revisionsExpanded]);

  useEffect(() => {
    if (attachmentsExpanded) fetchAttachments();
  }, [attachmentsExpanded]);

  const doSave = async (): Promise<boolean> => {
    if (savingRef.current || !doc || doc.canEdit === false || draft.revoked) return false;
    savingRef.current = true;
    setSaving(true);
    setSaveError('');
    const snapshot = currentSnapshot();
    try {
      const res = await fetch(`/api/documents/${params.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, category,
          tags: tags.split(',').map(t => t.trim()).filter(Boolean),
          reviewDate: reviewDate || null, visibility, expectedUpdatedAt: versionRef.current }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setAutosavePaused(true);
        const latest = await fetch(`/api/documents/${params.id}`);
        if (latest.ok) setConflict(await latest.json());
        throw new Error('The server document changed. Your edits are preserved. Compare both versions below before trying again.');
      }
      if (!res.ok) throw new Error(data.error || 'Save failed. Your edits are still here; try Save Now.');
      versionRef.current = data.updatedAt;
      lastSavedRef.current = snapshot;
      if (liveSnapshotRef.current === snapshot) draft.clear();
      setDoc({ ...data, canEdit: doc.canEdit });
      setRecoveryPreview(null);
      setConflict(null);
      setAutosavePaused(false);
      setDirty(liveSnapshotRef.current !== snapshot);
      setSavedAt(new Date());
      return true;
    } catch (error) {
      setSaveError(error instanceof Error && !(error instanceof TypeError) ? error.message : 'Save failed. Your edits are still here; try Save Now.');
      setDirty(true);
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleSave = () => { void doSave(); };

  const updateMetadata = async (fields: Record<string, unknown>) => {
    if (savingRef.current || !doc) return false;
    savingRef.current = true;
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch(`/api/documents/${params.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fields, expectedUpdatedAt: versionRef.current }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      versionRef.current = data.updatedAt;
      setDoc({ ...data, canEdit: doc.canEdit });
      return true;
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Update failed');
      return false;
    } finally { savingRef.current = false; setSaving(false); }
  };

  const togglePin = () => { if (doc) void updateMetadata({ isPinned: !doc.isPinned }); };
  const toggleArchive = () => { if (doc) void updateMetadata({ isArchived: !doc.isArchived }); };

  const handleDelete = async () => {
    if (savingRef.current) return;
    try {
      const res = await fetch(`/api/documents/${params.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed. The document has not been removed.');
      router.push('/dashboard/documents');
    } catch (error) { setSaveError(error instanceof Error ? error.message : 'Delete failed'); }
  };

  const handleSaveRevision = async () => {
    if (!await doSave()) return;
    savingRef.current = true;
    setSaving(true);
    setSavingRevision(true);
    try {
      const res = await fetch(`/api/documents/${params.id}/revisions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: revisionMessage || null, expectedUpdatedAt: versionRef.current }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Revision could not be saved');
      versionRef.current = data.updatedAt;
      setShowRevisionForm(false);
      setRevisionMessage('');
      void fetchRevisions();
    } catch (error) { setSaveError(error instanceof Error ? error.message : 'Revision could not be saved'); }
    finally { savingRef.current = false; setSaving(false); setSavingRevision(false); }
  };

  const handleRestoreRevision = async (revisionId: string) => {
    if (!await doSave()) return;
    savingRef.current = true;
    setSaving(true);
    setRestoringRevision(revisionId);
    const beforeRestore = liveSnapshotRef.current;
    try {
      const res = await fetch(`/api/documents/${params.id}/revisions/${revisionId}/restore`, {
        method: 'POST', headers: { 'If-Unmodified-Since-Version': versionRef.current! },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Restore failed');
      versionRef.current = data.updatedAt;
      if (liveSnapshotRef.current === beforeRestore) {
        setContent(data.content);
        setTitle(data.title);
        setCategory(data.category);
        lastSavedRef.current = JSON.stringify({ t: data.title, c: data.content, cat: data.category, tg: tags, rd: reviewDate, v: visibility });
        setDirty(false);
        setSavedAt(new Date());
      } else {
        setSaveError('Revision restored on the server. Your newer edits remain here unsaved. Copy them before reloading, or use Save Now to keep them.');
      }
      void fetchRevisions();
    } catch (error) { setSaveError(error instanceof Error ? error.message : 'Restore failed'); }
    finally { savingRef.current = false; setSaving(false); setRestoringRevision(null); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setAttachmentActionError('');
    try {
      await uploadDocumentAttachment(params.id, file);
      await fetchAttachments();
    } catch (error) {
      setAttachmentActionError(error instanceof Error ? error.message : 'Unable to confirm the upload. Refresh the attachment list before trying again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    setDeletingAttachment(attachmentId);
    setAttachmentActionError('');
    try {
      const response = await fetch(`/api/attachments/${attachmentId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('The attachment could not be deleted.');
      await fetchAttachments();
    } catch {
      setAttachmentActionError('Unable to confirm deletion. Refresh the attachment list before trying again.');
    } finally {
      setDeletingAttachment(null);
    }
  };

  if (draft.revoked) return <p role="alert" className="p-6">This editor was closed after sign-out. Reload and sign in before continuing.</p>;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="text-center py-20">
        <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <h2 role="alert" className="text-xl font-semibold text-slate-900">{loadError || 'Document not found'}</h2>
        <button onClick={() => setLoadAttempt(value => value + 1)} className="btn-secondary mt-3">Retry loading document</button>
        <Link href="/dashboard/documents" className="text-blue-600 hover:underline mt-2 inline-block">
          Back to documents
        </Link>
      </div>
    );
  }

  if (doc.canEdit === false) return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link href="/dashboard/documents" className="btn-secondary">Back to documents</Link>
      <h1 className="text-2xl font-bold">{doc.title}</h1>
      <p className="text-sm text-slate-500">Read only · Last updated {formatDate(doc.updatedAt)}</p>
      <MarkdownPreview content={doc.content} />
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/documents" className="p-2 hover:bg-slate-100 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Edit Document</h1>
            <p className="text-sm text-slate-500">Last updated {formatDate(doc.updatedAt)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={togglePin}
            className={`p-2 rounded-lg transition-colors ${doc.isPinned ? 'bg-amber-100 text-amber-700' : 'hover:bg-slate-100'}`}
            title={doc.isPinned ? 'Unpin' : 'Pin'}
          >
            <Pin className="w-5 h-5" />
          </button>
          <button
            onClick={async () => {
              const res = await fetch(`/api/documents/${doc.id}/duplicate`, { method: 'POST' });
              if (res.ok) {
                const copy = await res.json();
                router.push(`/dashboard/documents/${copy.id}`);
              }
            }}
            className="p-2 rounded-lg transition-colors hover:bg-slate-100"
            title="Duplicate"
          >
            <Copy className="w-5 h-5" />
          </button>
          <button
            onClick={toggleArchive}
            className={`p-2 rounded-lg transition-colors ${doc.isArchived ? 'bg-slate-200 text-slate-700' : 'hover:bg-slate-100'}`}
            title={doc.isArchived ? 'Unarchive' : 'Archive'}
          >
            <Archive className="w-5 h-5" />
          </button>
          <button onClick={() => setShowDelete(true)} className="p-2 hover:bg-red-50 text-red-500 rounded-lg" title="Delete">
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Two-column layout */}
      {conflict && <section className="card p-4 space-y-3" aria-label="Save conflict comparison">
        <h2 className="font-semibold">Resolve conflicting edits</h2>
        <p className="text-sm">The server has a newer version. Edit your local text to combine the changes you want to keep. Accepting the baseline below does not save; Save Now checks for further server changes.</p>
        <div className="grid gap-4 md:grid-cols-2">
          <div><h3 className="font-medium">Latest server version: {conflict.title}</h3>
            <p className="text-sm">Category: {conflict.category} · Tags: {conflict.tags.map(tag => tag.name).join(', ')} · Visibility: {conflict.visibility || 'private'} · Review: {conflict.reviewDate || 'None'}</p>
            <pre className="whitespace-pre-wrap break-words max-h-80 overflow-auto text-sm">{conflict.content}</pre>
          </div>
          <div><h3 className="font-medium">Your local edits: {title}</h3>
            <p className="text-sm">Category: {category} · Tags: {tags} · Visibility: {visibility} · Review: {reviewDate || 'None'}</p>
            <pre className="whitespace-pre-wrap break-words max-h-80 overflow-auto text-sm">{content}</pre>
          </div>
        </div>
        <button className="btn-primary" onClick={() => {
          versionRef.current = conflict.updatedAt;
          lastSavedRef.current = JSON.stringify({ t: conflict.title, c: conflict.content, cat: conflict.category,
            tg: conflict.tags.map(tag => tag.name).join(', '), rd: conflict.reviewDate ? new Date(conflict.reviewDate).toISOString().slice(0, 10) : '', v: conflict.visibility || 'private' });
          setDirty(liveSnapshotRef.current !== lastSavedRef.current);
          setDoc(conflict);
          setConflict(null);
          setSaveError('Server baseline accepted. Review your local edits, then use Save Now. Autosave remains paused.');
        }}>Keep local edits against this server version</button>
      </section>}
      {draft.error && <p role="alert" className="text-amber-700">{draft.error}</p>}
      {hasUnsavedChanges && draft.savedAt && !draft.error && <p role="status" className="text-sm text-slate-500">Unsaved edits protected in this browser at {new Date(draft.savedAt).toLocaleTimeString()}.</p>}
      {draft.candidates.length > 0 && <section className="card p-4 space-y-3" aria-label="Recover unsaved edits">
        <h2 className="font-semibold">Recover unsaved edits</h2>
        <p className="text-sm">Browser copies expire after seven days. Compare a copy before restoring it; the server document stays unchanged until you save.</p>
        {draft.candidates.map(candidate => <div key={candidate.instanceId} className="flex flex-wrap items-center gap-3">
          <span>{candidate.fields.title || 'Untitled'} · {new Date(candidate.savedAt).toLocaleString()}</span>
          <button className="btn-secondary" onClick={() => setRecoveryPreview(candidate)}>Compare draft</button>
          <button className="btn-secondary" onClick={() => { if (confirm('Discard this browser copy?')) { draft.discard(candidate); if (recoveryPreview?.instanceId === candidate.instanceId) setRecoveryPreview(null); } }}>Discard draft</button>
        </div>)}
      </section>}
      {recoveryPreview && <section className="card p-4 space-y-3" aria-label="Draft comparison">
        <h2 className="font-semibold">Saved version and recovered copy</h2>
        <p className="text-sm">{recoveryPreview.fields.baseUpdatedAt === doc.updatedAt ? 'The copy started from this saved version.' : 'The server version differs from the copy’s original version. Review both before saving.'} Concurrent server changes are checked again when you save.</p>
        <div className="grid gap-4 md:grid-cols-2">
          <div><h3 className="font-medium">Saved version: {doc.title}</h3><p className="text-sm">Category: {doc.category} · Tags: {doc.tags.map(tag => tag.name).join(', ')} · Visibility: {doc.visibility || 'private'} · Review: {doc.reviewDate || 'None'}</p><pre className="whitespace-pre-wrap break-words max-h-80 overflow-auto text-sm">{doc.content}</pre></div>
          <div><h3 className="font-medium">Browser copy: {recoveryPreview.fields.title}</h3><p className="text-sm">Category: {recoveryPreview.fields.category} · Tags: {recoveryPreview.fields.tags} · Visibility: {recoveryPreview.fields.visibility || 'private'} · Review: {recoveryPreview.fields.reviewDate || 'None'}</p><pre className="whitespace-pre-wrap break-words max-h-80 overflow-auto text-sm">{recoveryPreview.fields.content}</pre></div>
        </div>
        <button className="btn-primary" onClick={() => restoreDraft(recoveryPreview)}>Restore a copy into editor</button>
        <button className="btn-secondary ml-2" onClick={() => setRecoveryPreview(null)}>Close comparison</button>
      </section>}
      <div className="flex flex-col xl:flex-row gap-6 items-start">
        {/* Left: Editor */}
        <div className="w-full flex-1 min-w-0 card p-4 sm:p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="input-field text-lg" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="input-field">
                {categories.map((c) => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tags (comma separated)</label>
              <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} className="input-field" placeholder="network, windows" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Review due</label>              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={reviewDate}
                  onChange={(e) => setReviewDate(e.target.value)}
                  aria-label="Next review date"
                  className="input-field"
                />
                {reviewDate && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (await updateMetadata({ reviewAcknowledged: true, reviewDate })) setReviewDue(false);
                    }}
                    className="text-xs px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
                  >
                    Mark reviewed
                  </button>
                )}
              </div>
              {reviewDue && (
                <p className="text-xs text-red-600 mt-1">This document is past its review date.</p>
              )}
            </div>
            {doc?.organizationId && (
              <div>
                <label htmlFor="doc-visibility" className="block text-sm font-medium text-slate-700 mb-1">Visibility</label>
                <select
                  id="doc-visibility"
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value)}
                  className="input-field"
                >
                  <option value="private">Private (internal only)</option>
                  <option value="org">Shared to client portal</option>
                </select>
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-slate-700">Content</label>
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs font-medium">
                <button
                  onClick={() => setViewMode('write')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
                    viewMode === 'write' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm font-semibold' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Edit3 className="w-3 h-3" /> Write
                </button>
                <button
                  onClick={() => setViewMode('preview')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
                    viewMode === 'preview' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm font-semibold' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Eye className="w-3 h-3" /> Preview
                </button>
                <button
                  onClick={() => setViewMode('split')}
                  className={`hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
                    viewMode === 'split' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm font-semibold' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Columns className="w-3 h-3" /> Split
                </button>
              </div>
            </div>
            {viewMode === 'write' && (
              <div className="space-y-1.5">
                <MarkdownToolbar onFormat={insertFormatting} />
                <textarea ref={textareaRef} value={content} onChange={(e) => setContent(e.target.value)} className="input-field min-h-[500px] font-mono text-sm" />
              </div>
            )}
            {viewMode === 'preview' && (
              <div className="min-h-[500px] p-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 overflow-y-auto">
                {content.trim() ? (
                  <MarkdownPreview content={content} />
                ) : (
                  <div className="text-slate-400 italic text-center py-16">No content to preview.</div>
                )}
              </div>
            )}
            {viewMode === 'split' && (
              <div className="space-y-1.5">
                <MarkdownToolbar onFormat={insertFormatting} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-h-[500px]">
                  <textarea ref={textareaRef} value={content} onChange={(e) => setContent(e.target.value)} className="input-field min-h-[500px] font-mono text-sm" />
                  <div className="min-h-[500px] p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 overflow-y-auto max-h-[500px]">
                    {content.trim() ? (
                      <MarkdownPreview content={content} />
                    ) : (
                      <div className="text-slate-400 italic text-center py-16">Live preview</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-wrap justify-end items-center gap-3">
            <span role={saveError ? 'alert' : 'status'} aria-live="polite" className={saveError ? 'w-full rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800' : 'text-xs mr-auto text-slate-500'}>
              {saveError ? saveError : saving
                ? 'Saving…'
                : autosavePaused
                  ? 'Autosave paused — review your edits and use Save Now.'
                : dirty
                  ? 'Unsaved changes — autosaving…'
                  : savedAt
                    ? `All changes saved (${savedAt.toLocaleTimeString()})`
                    : ''}
            </span>
            <Link
              href="/dashboard/documents"
              className="btn-secondary"
              onClick={(e) => {
                if (dirty && !window.confirm('Discard unsaved changes?')) e.preventDefault();
              }}
            >
              Cancel
            </Link>
            <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Now
            </button>
          </div>
        </div>

        {/* Right: Sidebar panels */}
        <div className="w-full xl:w-80 shrink-0 space-y-4 xl:sticky xl:top-24">
          {/* Related Items */}
          {doc?.id && <RelatedItems entityType="document" entityId={doc.id} />}

          {/* Version History */}
          <div className="card overflow-hidden">
            <button
              onClick={() => setRevisionsExpanded(!revisionsExpanded)}
              className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <History className="w-5 h-5 text-slate-500" />
                <span className="font-semibold text-slate-900">Version History</span>
                {revisions.length > 0 && !revisionsExpanded && (
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{revisions.length}</span>
                )}
              </div>
              {revisionsExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>
            {revisionsExpanded && (
              <div className="border-t border-slate-100 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500">
                    {revisionsLoading ? 'Loading...' : revisionsError ? 'History unavailable' : `${revisions.length} revision${revisions.length !== 1 ? 's' : ''}`}
                  </p>
                  <button onClick={() => setShowRevisionForm(!showRevisionForm)} className="btn-primary text-xs flex items-center gap-1">
                    <Save className="w-3 h-3" /> Save Revision
                  </button>
                </div>
                {showRevisionForm && (
                  <div className="bg-slate-50 rounded-lg p-3 space-y-2">
                    <input type="text" value={revisionMessage} onChange={(e) => setRevisionMessage(e.target.value)} className="input-field text-sm" placeholder="What changed?" />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => { setShowRevisionForm(false); setRevisionMessage(''); }} className="btn-secondary text-xs">Cancel</button>
                      <button onClick={handleSaveRevision} disabled={savingRevision} className="btn-primary text-xs flex items-center gap-1">
                        {savingRevision ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
                      </button>
                    </div>
                  </div>
                )}
                {revisionsLoading ? (
                  <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
                ) : revisionsError ? (
                  <div role="alert" className="text-sm text-red-600">
                    <p>{revisionsError}</p>
                    <button onClick={() => void fetchRevisions()} className="btn-secondary mt-2">Retry loading history</button>
                  </div>
                ) : revisions.length === 0 ? (
                  <p className="text-center text-slate-400 py-6 text-sm">No revisions yet</p>
                ) : (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {revisions.map((rev) => (
                      <div key={rev.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg text-sm hover:bg-slate-100">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-slate-900 text-xs">v{rev.version}{rev.message && <span className="text-slate-500 font-normal"> — {rev.message}</span>}</div>
                          <div className="text-xs text-slate-400">{formatDate(rev.createdAt)}</div>
                        </div>
                        <button onClick={() => handleRestoreRevision(rev.id)} disabled={restoringRevision === rev.id} className="text-slate-400 hover:text-blue-600 p-1 ml-2" title="Restore">
                          {restoringRevision === rev.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Attachments */}
          <div className="card overflow-hidden">
            <button
              onClick={() => setAttachmentsExpanded(!attachmentsExpanded)}
              className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Paperclip className="w-5 h-5 text-slate-500" />
                <span className="font-semibold text-slate-900">Attachments</span>
                {attachments.length > 0 && !attachmentsExpanded && (
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{attachments.length}</span>
                )}
              </div>
              {attachmentsExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>
            {attachmentsExpanded && (
              <div className="border-t border-slate-100 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500">
                    {attachmentsLoading ? 'Loading...' : attachmentsError ? 'Attachments unavailable' : `${attachments.length} file${attachments.length !== 1 ? 's' : ''}`}
                  </p>
                  <div>
                    <input ref={fileInputRef} type="file" onChange={handleFileUpload} className="hidden" />
                    <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="btn-primary text-xs flex items-center gap-1">
                      {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} Upload
                    </button>
                  </div>
                </div>
                {attachmentActionError && <p role="alert" className="text-sm text-red-600">{attachmentActionError}</p>}
                <button onClick={() => void fetchAttachments()} disabled={attachmentsLoading} className="btn-secondary text-xs">Refresh attachments</button>
                {attachmentsLoading ? (
                  <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
                ) : attachmentsError ? (
                  <p role="alert" className="text-sm text-red-600">{attachmentsError}</p>
                ) : attachments.length === 0 ? (
                  <p className="text-center text-slate-400 py-6 text-sm">No attachments</p>
                ) : (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {attachments.map((att) => (
                      <div key={att.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg hover:bg-slate-100">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-slate-900 truncate">{att.filename}</p>
                            <p className="text-xs text-slate-400">{formatBytes(att.size)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 ml-2">
                          <a href={`/api/attachments/${att.id}`} download className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-blue-600"><Download className="w-3.5 h-3.5" /></a>
                          <button onClick={() => handleDeleteAttachment(att.id)} disabled={deletingAttachment === att.id} className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded">
                            {deletingAttachment === att.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>

      <ConfirmDialog
        isOpen={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Move to Trash"
        message="This document will be hidden from normal views. You can restore it, including its history and attachments, from Trash."
      />
    </div>
  );
}
