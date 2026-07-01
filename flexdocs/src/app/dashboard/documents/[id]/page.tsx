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
  Trash2,
  FileText,
  Upload,
  Link2,
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

function getRelUrl(type: string, id: string): string {
  switch (type) {
    case 'document': return `/dashboard/documents/${id}`;
    case 'password': return `/dashboard/passwords/${id}`;
    case 'domain': return `/dashboard/domains/${id}`;
    case 'asset': return `/dashboard/assets/${id}`;
    default: return '#';
  }
}

interface Document {
  id: string;
  title: string;
  content: string;
  category: string;
  isPinned: boolean;
  isArchived: boolean;
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

interface Relationship {
  id: string;
  name: string;
  sourceType: string;
  sourceId: string;
  sourceName: string;
  targetType: string;
  targetId: string;
  targetName: string;
  createdAt: string;
}

interface ResourceOption {
  id: string;
  title: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function DocumentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [doc, setDoc] = useState<Document | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('general');
  const [tags, setTags] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  // Version History
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [revisionMessage, setRevisionMessage] = useState('');
  const [savingRevision, setSavingRevision] = useState(false);
  const [restoringRevision, setRestoringRevision] = useState<string | null>(null);
  const [revisionsExpanded, setRevisionsExpanded] = useState(false);

  // Attachments
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingAttachment, setDeletingAttachment] = useState<string | null>(null);
  const [attachmentsExpanded, setAttachmentsExpanded] = useState(false);

  // Relationships
  const [outgoingRelationships, setOutgoingRelationships] = useState<Relationship[]>([]);
  const [incomingRelationships, setIncomingRelationships] = useState<Relationship[]>([]);
  const [relationshipsLoading, setRelationshipsLoading] = useState(false);
  const [showRelationshipForm, setShowRelationshipForm] = useState(false);
  const [relName, setRelName] = useState('');
  const [relTargetType, setRelTargetType] = useState('document');
  const [relTargetId, setRelTargetId] = useState('');
  const [relTargetOptions, setRelTargetOptions] = useState<ResourceOption[]>([]);
  const [relLoadingTargets, setRelLoadingTargets] = useState(false);
  const [creatingRelationship, setCreatingRelationship] = useState(false);
  const [deletingRelationship, setDeletingRelationship] = useState<string | null>(null);
  const [relationshipsExpanded, setRelationshipsExpanded] = useState(false);

  useEffect(() => {
    fetch(`/api/documents/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        setDoc(data);
        setTitle(data.title);
        setContent(data.content);
        setCategory(data.category);
        setTags(data.tags.map((t: any) => t.name).join(', '));
        setLoading(false);
      });
  }, [params.id]);

  const fetchRevisions = async () => {
    setRevisionsLoading(true);
    try {
      const res = await fetch(`/api/documents/${params.id}/revisions`);
      if (res.ok) {
        const data = await res.json();
        setRevisions(data);
      }
    } finally {
      setRevisionsLoading(false);
    }
  };

  const fetchAttachments = async () => {
    setAttachmentsLoading(true);
    try {
      const res = await fetch(`/api/attachments?documentId=${params.id}`);
      if (res.ok) {
        const data = await res.json();
        setAttachments(data);
      }
    } finally {
      setAttachmentsLoading(false);
    }
  };

  const fetchRelationships = async () => {
    setRelationshipsLoading(true);
    try {
      const [outRes, inRes] = await Promise.all([
        fetch(`/api/relationships?sourceType=document&sourceId=${params.id}`),
        fetch(`/api/relationships?targetType=document&targetId=${params.id}`),
      ]);
      if (outRes.ok) setOutgoingRelationships(await outRes.json());
      if (inRes.ok) setIncomingRelationships(await inRes.json());
    } finally {
      setRelationshipsLoading(false);
    }
  };

  useEffect(() => {
    if (revisionsExpanded) fetchRevisions();
  }, [revisionsExpanded]);

  useEffect(() => {
    if (attachmentsExpanded) fetchAttachments();
  }, [attachmentsExpanded]);

  useEffect(() => {
    if (relationshipsExpanded) fetchRelationships();
  }, [relationshipsExpanded]);

  useEffect(() => {
    if (showRelationshipForm && relTargetType) {
      setRelLoadingTargets(true);
      setRelTargetId('');
      let url = '';
      if (relTargetType === 'document') url = '/api/documents';
      else if (relTargetType === 'password') url = '/api/passwords';
      else if (relTargetType === 'domain') url = '/api/domains';
      else if (relTargetType === 'asset') url = '/api/assets';

      fetch(url)
        .then((r) => r.json())
        .then((data) => {
          const options = data.map((item: any) => ({
            id: item.id,
            title: item.title || item.name || item.hostname || item.id,
          }));
          setRelTargetOptions(options);
          setRelLoadingTargets(false);
        })
        .catch(() => setRelLoadingTargets(false));
    }
  }, [showRelationshipForm, relTargetType]);

  const handleSave = async () => {
    setSaving(true);
    const tagList = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    await fetch(`/api/documents/${params.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        content,
        category,
        tags: tagList,
        isPinned: doc?.isPinned,
        isArchived: doc?.isArchived,
      }),
    });
    setSaving(false);
  };

  const togglePin = async () => {
    if (!doc) return;
    const updated = { ...doc, isPinned: !doc.isPinned };
    await fetch(`/api/documents/${params.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        content,
        category,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        isPinned: updated.isPinned,
        isArchived: updated.isArchived,
      }),
    });
    setDoc(updated);
  };

  const toggleArchive = async () => {
    if (!doc) return;
    const updated = { ...doc, isArchived: !doc.isArchived };
    await fetch(`/api/documents/${params.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        content,
        category,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        isPinned: updated.isPinned,
        isArchived: updated.isArchived,
      }),
    });
    setDoc(updated);
  };

  const handleDelete = async () => {
    await fetch(`/api/documents/${params.id}`, { method: 'DELETE' });
    router.push('/dashboard/documents');
  };

  const handleSaveRevision = async () => {
    setSavingRevision(true);
    try {
      const res = await fetch(`/api/documents/${params.id}/revisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          title,
          message: revisionMessage || null,
        }),
      });
      if (res.ok) {
        setShowRevisionForm(false);
        setRevisionMessage('');
        fetchRevisions();
      }
    } finally {
      setSavingRevision(false);
    }
  };

  const handleRestoreRevision = async (revisionId: string) => {
    setRestoringRevision(revisionId);
    try {
      const res = await fetch(`/api/documents/${params.id}/revisions/${revisionId}/restore`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        setContent(data.content);
        setTitle(data.title || title);
        fetchRevisions();
      }
    } finally {
      setRestoringRevision(null);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const res = await fetch('/api/attachments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documentId: params.id,
            filename: file.name,
            mimeType: file.type,
            size: file.size,
            data: base64,
          }),
        });
        if (res.ok) {
          fetchAttachments();
        }
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch {
      setUploading(false);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    setDeletingAttachment(attachmentId);
    try {
      await fetch(`/api/attachments/${attachmentId}`, { method: 'DELETE' });
      fetchAttachments();
    } finally {
      setDeletingAttachment(null);
    }
  };

  const handleCreateRelationship = async () => {
    if (!relName.trim() || !relTargetId) return;
    setCreatingRelationship(true);
    try {
      const res = await fetch('/api/relationships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: relName,
          sourceType: 'document',
          sourceId: params.id,
          targetType: relTargetType,
          targetId: relTargetId,
        }),
      });
      if (res.ok) {
        setRelName('');
        setRelTargetId('');
        setShowRelationshipForm(false);
        fetchRelationships();
      }
    } finally {
      setCreatingRelationship(false);
    }
  };

  const handleDeleteRelationship = async (relationshipId: string) => {
    setDeletingRelationship(relationshipId);
    try {
      await fetch(`/api/relationships/${relationshipId}`, { method: 'DELETE' });
      fetchRelationships();
    } finally {
      setDeletingRelationship(null);
    }
  };

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
        <h2 className="text-xl font-semibold text-slate-900">Document not found</h2>
        <Link href="/dashboard/documents" className="text-blue-600 hover:underline mt-2 inline-block">
          Back to documents
        </Link>
      </div>
    );
  }

  const allRelationships = [
    ...outgoingRelationships.map((r) => ({ ...r, direction: 'outgoing' as const })),
    ...incomingRelationships.map((r) => ({ ...r, direction: 'incoming' as const })),
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
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
      <div className="flex gap-6 items-start">
        {/* Left: Editor */}
        <div className="flex-1 min-w-0 card p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="input-field text-lg" />
          </div>
          <div className="grid grid-cols-2 gap-4">
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
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Content</label>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} className="input-field min-h-[500px] font-mono text-sm" />
          </div>
          <div className="flex justify-end gap-3">
            <Link href="/dashboard/documents" className="btn-secondary">Cancel</Link>
            <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Changes
            </button>
          </div>
        </div>

        {/* Right: Sidebar panels */}
        <div className="w-80 shrink-0 space-y-4 sticky top-24">
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
                    {revisionsLoading ? 'Loading...' : `${revisions.length} revision${revisions.length !== 1 ? 's' : ''}`}
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
                    {attachmentsLoading ? 'Loading...' : `${attachments.length} file${attachments.length !== 1 ? 's' : ''}`}
                  </p>
                  <div>
                    <input ref={fileInputRef} type="file" onChange={handleFileUpload} className="hidden" />
                    <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="btn-primary text-xs flex items-center gap-1">
                      {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} Upload
                    </button>
                  </div>
                </div>
                {attachmentsLoading ? (
                  <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
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

          {/* Relationships */}
          <div className="card overflow-hidden">
            <button
              onClick={() => setRelationshipsExpanded(!relationshipsExpanded)}
              className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Link2 className="w-5 h-5 text-slate-500" />
                <span className="font-semibold text-slate-900">Relationships</span>
                {allRelationships.length > 0 && !relationshipsExpanded && (
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{allRelationships.length}</span>
                )}
              </div>
              {relationshipsExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>
            {relationshipsExpanded && (
              <div className="border-t border-slate-100 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500">
                    {relationshipsLoading ? 'Loading...' : `${allRelationships.length} link${allRelationships.length !== 1 ? 's' : ''}`}
                  </p>
                  <button onClick={() => setShowRelationshipForm(!showRelationshipForm)} className="btn-primary text-xs flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Add
                  </button>
                </div>
                {showRelationshipForm && (
                  <div className="bg-slate-50 rounded-lg p-3 space-y-2">
                    <input type="text" value={relName} onChange={(e) => setRelName(e.target.value)} className="input-field text-sm" placeholder="e.g. hosted_on, managed_by" />
                    <select value={relTargetType} onChange={(e) => setRelTargetType(e.target.value)} className="input-field text-sm">
                      <option value="document">Document</option>
                      <option value="password">Password</option>
                      <option value="domain">Domain</option>
                      <option value="asset">Asset</option>
                    </select>
                    <select value={relTargetId} onChange={(e) => setRelTargetId(e.target.value)} className="input-field text-sm" disabled={relLoadingTargets}>
                      <option value="">{relLoadingTargets ? 'Loading...' : 'Select target'}</option>
                      {relTargetOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>{opt.title}</option>
                      ))}
                    </select>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => { setShowRelationshipForm(false); setRelName(''); setRelTargetId(''); }} className="btn-secondary text-xs">Cancel</button>
                      <button onClick={handleCreateRelationship} disabled={creatingRelationship || !relName.trim() || !relTargetId} className="btn-primary text-xs flex items-center gap-1">
                        {creatingRelationship ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} Create
                      </button>
                    </div>
                  </div>
                )}
                {relationshipsLoading ? (
                  <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
                ) : allRelationships.length === 0 ? (
                  <p className="text-center text-slate-400 py-6 text-sm">No relationships</p>
                ) : (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {allRelationships.map((rel) => {
                      const isOut = rel.direction === 'outgoing';
                      const srcType = isOut ? rel.sourceType : rel.targetType;
                      const srcId = isOut ? rel.sourceId : rel.targetId;
                      const srcName = isOut ? rel.sourceName : rel.targetName;
                      const tgtType = isOut ? rel.targetType : rel.sourceType;
                      const tgtId = isOut ? rel.targetId : rel.sourceId;
                      const tgtName = isOut ? rel.targetName : rel.sourceName;
                      return (
                        <div key={rel.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg hover:bg-slate-100">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1 text-xs">
                              <span className="font-medium text-slate-900">{rel.name}</span>
                              <span className="text-slate-400">·</span>
                              <Link href={getRelUrl(srcType, srcId)} className="text-blue-600 hover:underline truncate">{srcName}</Link>
                              <span className="text-slate-400">→</span>
                              <Link href={getRelUrl(tgtType, tgtId)} className="text-emerald-600 hover:underline truncate">{tgtName}</Link>
                            </div>
                          </div>
                          <button onClick={() => handleDeleteRelationship(rel.id)} disabled={deletingRelationship === rel.id} className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded ml-2">
                            {deletingRelationship === rel.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                          </button>
                        </div>
                      );
                    })}
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
        title="Delete Document"
        message="Are you sure you want to delete this document? This action cannot be undone."
      />
    </div>
  );
}
