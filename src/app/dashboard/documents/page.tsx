'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  FileText,
  Plus,
  Search,
  Pin,
  Archive,
  Trash2,
  FolderOpen,
  } from 'lucide-react';
import { formatDate, cn } from '@/lib/utils';
import { EmptyState, ConfirmDialog, Modal } from '@/components/UIComponents';
import { FolderSidebar } from '@/components/FolderSidebar';
import { useOrganization } from '@/lib/OrganizationContext';
import { moveDocument } from '@/lib/document-client';

interface Document {
  id: string;
  title: string;
  content: string;
  category: string;
  isPinned: boolean;
  isArchived: boolean;
  reviewDate: string | null;
  createdAt: string;
  updatedAt: string;
  tags: { id: string; name: string; color: string }[];
  folder: { id: string; name: string; color: string } | null;
  folderId: string | null;
}

interface FolderInfo {
  id: string;
  name: string;
  color: string;
  parentId: string | null;
}

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

export default function DocumentsPage() {
  const { selectedOrg } = useOrganization();
  return <DocumentList key={selectedOrg?.id || 'all'} />;
}

function DocumentList() {
  const { selectedOrg } = useOrganization();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [totalDocs, setTotalDocs] = useState(0);
  const [totalAvailable, setTotalAvailable] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [listError, setListError] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [folderRefresh, setFolderRefresh] = useState(0);
  const [allFolders, setAllFolders] = useState<FolderInfo[]>([]);
  const [moveDocId, setMoveDocId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => { setSearchQuery(search); setPage(0); }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), limit: '50' });
    if (selectedOrg?.id) params.set('organizationId', selectedOrg.id);
    if (searchQuery.trim()) params.set('q', searchQuery.trim());
    if (category !== 'all') params.set('category', category);
    if (selectedFolderId) params.set('folderId', selectedFolderId);
    if (!showArchived) params.set('archived', 'false');
    setLoading(true); setListError(''); setSelectedIds(new Set());
    fetch(`/api/documents?${params}`, { signal: controller.signal })
      .then(async res => { if (!res.ok) throw new Error('Could not load documents. Please retry.'); return res.json(); })
      .then(data => {
        if (controller.signal.aborted) return;
        if (page > 0 && page * 50 >= data.total) { setPage(Math.max(0, Math.ceil(data.total / 50) - 1)); return; }
        setDocuments(data.items); setTotalDocs(data.total); setTotalAvailable(data.totalAvailable); setHasMore(data.hasMore);
      })
      .catch(cause => { if (!controller.signal.aborted) setListError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selectedOrg?.id, page, searchQuery, category, selectedFolderId, showArchived, refresh]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (selectedOrg?.id) params.set('organizationId', selectedOrg.id);
    fetch(`/api/folders?${params}`, { signal: controller.signal })
      .then(async res => { if (!res.ok) throw new Error('Could not load folders. Please reload.'); return res.json(); })
      .then(data => { if (!controller.signal.aborted) setAllFolders(data); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, [selectedOrg?.id, folderRefresh]);

  const fetchDocuments = () => setRefresh(value => value + 1);
  const selectFolder = (id: string | null) => { setSelectedFolderId(id); setPage(0); };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runBulk = async (action: 'archive' | 'unarchive' | 'tag' | 'delete', tag?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/documents/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ids: Array.from(selectedIds), tag }),
      });
      if (!res.ok) throw new Error('Could not update the selected documents. Please try again.');
      const result = await res.json();
      setError(result.updated !== result.requested ? `Updated ${result.updated} of ${result.requested} documents. Some were unavailable or you do not own them.` : '');
      setFolderRefresh(value => value + 1);
      fetchDocuments();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update documents. Please try again.');
    } finally { setBusy(false); }
  };

  const bulkDelete = async (confirmed: boolean) => {
    setBulkConfirmOpen(false);
    if (!confirmed) return;
    await runBulk('delete');
  };

  const handleDelete = async () => {
    if (!deleteId || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/documents/${deleteId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Could not move this document to trash. Please try again.');
      setError('');
      setFolderRefresh(value => value + 1);
      fetchDocuments();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not move this document to trash. Please try again.');
    } finally { setDeleteId(null); setBusy(false); }
  };

  const handleMoveToFolder = async (docId: string, folderId: string | null) => {
    const document = documents.find(d => d.id === docId);
    if (!document || busy) return;
    setBusy(true);
    try {
      const updated = await moveDocument(docId, folderId, document.updatedAt) as Document;
      setDocuments(current => current.map(d => d.id === docId ? updated : d));
      setError('');
      setFolderRefresh(r => r + 1);
      fetchDocuments();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not move the document. Please try again.');
    } finally {
      setMoveDocId(null);
      setBusy(false);
    }
  };

  // Build breadcrumb from folder tree
  const getBreadcrumbs = (folderId: string | null): FolderInfo[] => {
    if (!folderId) return [];
    const folder = allFolders.find((f) => f.id === folderId);
    if (!folder) return [];
    const crumbs = [folder];
    let current = folder;
    const visited = new Set([current.id]);
    while (current.parentId && !visited.has(current.parentId)) {
      const parent = allFolders.find((f) => f.id === current.parentId);
      if (parent) {
        visited.add(parent.id);
        crumbs.unshift(parent);
        current = parent;
      } else break;
    }
    return crumbs;
  };

  const breadcrumbs = getBreadcrumbs(selectedFolderId);

  const filtered = documents;
  const pending = loading || search !== searchQuery;

  const pinned = filtered.filter((d) => d.isPinned);
  const unpinned = filtered.filter((d) => !d.isPinned);

  const selectedFolderName = selectedFolderId
    ? allFolders.find((f) => f.id === selectedFolderId)?.name
    : null;

  return (
    <div className="flex gap-6 h-[calc(100vh-8rem)]">
      {/* Folder Sidebar */}
      <div className="w-64 flex-shrink-0 card p-3 overflow-y-auto h-fit max-h-[calc(100vh-8rem)] sticky top-0">
        <FolderSidebar
          selectedFolderId={selectedFolderId}
          onSelectFolder={selectFolder}
          refreshTrigger={folderRefresh}
          totalCount={totalAvailable}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 min-w-0 space-y-6">
        {error && <p role="alert" className="text-red-600">{error}</p>}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <button
                onClick={() => selectFolder(null)}
                className={cn(
                  'hover:text-blue-600 transition-colors',
                  !selectedFolderId && 'text-slate-900 font-medium'
                )}
              >
                All Documents
              </button>
              {breadcrumbs.map((crumb) => (
                <span key={crumb.id} className="flex items-center gap-1">
                  <span>/</span>
                  <button
                    onClick={() => selectFolder(crumb.id)}
                    className={cn(
                      'hover:text-blue-600 transition-colors',
                      selectedFolderId === crumb.id && 'text-slate-900 font-medium'
                    )}
                  >
                    {crumb.name}
                  </button>
                </span>
              ))}
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              {selectedFolderName || 'Documents'}
            </h1>
            <p className="text-slate-500">
              {pending ? 'Loading documents…' : `${totalDocs} document${totalDocs !== 1 ? 's' : ''}`}
              {selectedFolderName && ` in ${selectedFolderName}`}
            </p>
          </div>
          <Link
            href={`/dashboard/documents/new?${new URLSearchParams({ ...(selectedOrg?.id ? { organizationId: selectedOrg.id } : {}), ...(selectedFolderId ? { folder: selectedFolderId } : {}) })}`}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Document
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search documents..."
              aria-label="Search documents"
              maxLength={500}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field pl-10"
            />
          </div>
          <select
            aria-label="Document category"
            value={category}
            onChange={(e) => { setCategory(e.target.value); setPage(0); }}
            className="input-field w-auto"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
          <button
            onClick={() => { setShowArchived(!showArchived); setPage(0); }}
            className={cn(
              'btn-secondary flex items-center gap-2',
              showArchived && 'bg-slate-200'
            )}
          >
            <Archive className="w-4 h-4" />
            {showArchived ? 'Hide Archived' : 'Show Archived'}
          </button>
        </div>

        <Link href="/dashboard/documents/trash" className="btn-secondary inline-flex items-center gap-2"><Trash2 className="w-4 h-4" />Trash</Link>
        {pending ? <p role="status">Loading documents…</p> : listError ? <div role="alert"><p>{listError}</p><button className="btn-secondary mt-2" onClick={fetchDocuments}>Retry</button></div> : filtered.length === 0 ? (
          <EmptyState
            icon={<FileText className="w-8 h-8 text-slate-400" />}
            title={selectedFolderName ? `No documents in ${selectedFolderName}` : 'No documents found'}
            description={
              selectedFolderName
                ? 'Move documents here or create a new one'
                : 'Try another search or filter, or create a new document.'
            }
            action={
              <Link href={`/dashboard/documents/new${selectedOrg?.id ? `?organizationId=${selectedOrg.id}` : ''}`} className="btn-primary">
                <Plus className="w-4 h-4 mr-2 inline" />
                New Document
              </Link>
            }
          />
        ) : (
          <fieldset disabled={busy} className="space-y-6 min-w-0">
            {selectedIds.size > 0 && (
              <div
                className="sticky top-16 z-20 rounded-xl px-4 py-3 flex items-center justify-between gap-3 shadow-lg"
                style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--accent)' }}
              >
                <span className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                  {selectedIds.size} selected
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const tag = window.prompt('Tag to add to selected documents:');
                      if (tag && tag.trim()) runBulk('tag', tag.trim());
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-[var(--surface-2)]"
                    style={{ color: 'var(--foreground)', borderColor: 'var(--card-border)' }}
                  >
                    Add Tag
                  </button>
                  <button
                    onClick={() => runBulk(showArchived ? 'unarchive' : 'archive')}
                    className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-[var(--surface-2)]"
                    style={{ color: 'var(--foreground)', borderColor: 'var(--card-border)' }}
                  >
                    {showArchived ? 'Unarchive' : 'Archive'}
                  </button>
                  <button
                    onClick={() => setBulkConfirmOpen(true)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="text-xs px-2 py-1.5"
                    style={{ color: 'var(--muted)' }}
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
            {pinned.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-slate-500 mb-3 flex items-center gap-2">
                  <Pin className="w-4 h-4" /> Pinned
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pinned.map((doc) => (
                    <DocumentCard
                      key={doc.id}
                      doc={doc}
                      onDelete={setDeleteId}
                      onMove={setMoveDocId}
                      folders={allFolders}
                      onMoveConfirm={handleMoveToFolder}
                      selected={selectedIds.has(doc.id)}
                      onToggleSelect={toggleSelect}
                    />
                  ))}
                </div>
              </div>
            )}

            {unpinned.length > 0 && (
              <div>
                {pinned.length > 0 && (
                  <h3 className="text-sm font-medium text-slate-500 mb-3">
                    {selectedFolderName ? 'Documents' : 'All Documents'}
                  </h3>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {unpinned.map((doc) => (
                    <DocumentCard
                      key={doc.id}
                      doc={doc}
                      onDelete={setDeleteId}
                      onMove={setMoveDocId}
                      folders={allFolders}
                      onMoveConfirm={handleMoveToFolder}
                      selected={selectedIds.has(doc.id)}
                      onToggleSelect={toggleSelect}
                    />
                  ))}
                </div>
              </div>
            )}
          </fieldset>
        )}
        {!listError && <nav aria-label="Document pages" className="flex items-center gap-3">
          <button className="btn-secondary" disabled={pending || busy || page === 0} onClick={() => setPage(value => value - 1)}>Previous</button>
          <span>Page {page + 1} of {Math.max(1, Math.ceil(totalDocs / 50))}</span>
          <button className="btn-secondary" disabled={pending || busy || !hasMore} onClick={() => setPage(value => value + 1)}>Next</button>
        </nav>}
      </div>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Move to Trash"
        message="This document will be hidden from normal views. You can restore it, including its history and attachments, from Trash."
      />

      <ConfirmDialog
        isOpen={bulkConfirmOpen}
        onClose={() => setBulkConfirmOpen(false)}
        onConfirm={() => bulkDelete(true)}
        title="Move to Trash"
        message={`Move ${selectedIds.size} documents to Trash? Their history and attachments will be kept so you can restore them.`}
      />

      {/* Move Document Modal */}
      {moveDocId && (
        <MoveDocumentModal
          isOpen={!!moveDocId}
          onClose={() => setMoveDocId(null)}
          docTitle={documents.find((d) => d.id === moveDocId)?.title || ''}
          folders={allFolders}
          currentFolderId={documents.find((d) => d.id === moveDocId)?.folderId || null}
          onMove={(folderId) => handleMoveToFolder(moveDocId, folderId)}
        />
      )}
    </div>
  );
}

const categoryColors: Record<string, { bg: string; text: string; dot: string }> = {
  general: { bg: 'rgba(107, 114, 128, 0.08)', text: '#6b7280', dot: '#9ca3af' },
  procedure: { bg: 'rgba(37, 99, 235, 0.08)', text: '#2563eb', dot: '#60a5fa' },
  runbook: { bg: 'rgba(139, 92, 246, 0.08)', text: '#8b5cf6', dot: '#a78bfa' },
  network: { bg: 'rgba(16, 185, 129, 0.08)', text: '#10b981', dot: '#34d399' },
  server: { bg: 'rgba(245, 158, 11, 0.08)', text: '#f59e0b', dot: '#fbbf24' },
  application: { bg: 'rgba(236, 72, 153, 0.08)', text: '#ec4899', dot: '#f472b6' },
  compliance: { bg: 'rgba(220, 38, 38, 0.08)', text: '#dc2626', dot: '#f87171' },
  onboarding: { bg: 'rgba(6, 182, 212, 0.08)', text: '#0891b2', dot: '#22d3ee' },
};

function DocumentCard({
  doc,
  onDelete,
  onMove: _onMove,
  folders,
  onMoveConfirm,
  selected,
  onToggleSelect,
}: {
  doc: Document;
  onDelete: (id: string) => void;
  onMove: (id: string) => void;
  folders: FolderInfo[];
  onMoveConfirm: (docId: string, folderId: string | null) => void;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const catColor = categoryColors[doc.category] || categoryColors.general;

  return (
    <Link
      href={`/dashboard/documents/${doc.id}`}
      className="group relative rounded-xl p-4 transition-all duration-200 hover:scale-[1.01]"
      style={{
        backgroundColor: selected ? 'color-mix(in srgb, var(--accent) 8%, var(--card-bg))' : 'var(--card-bg)',
        border: `1px solid ${selected ? 'var(--accent)' : 'var(--card-border)'}`,
        boxShadow: 'var(--card-shadow)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = 'var(--card-shadow-hover)';
        e.currentTarget.style.borderColor = 'var(--input-border)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'var(--card-shadow)';
        e.currentTarget.style.borderColor = 'var(--card-border)';
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            role="checkbox"
            aria-checked={selected}
            aria-label={`Select ${doc.title}`}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onToggleSelect(doc.id);
            }}
            className="w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors"
            style={{
              borderColor: selected ? 'var(--accent)' : 'var(--card-border)',
              backgroundColor: selected ? 'var(--accent)' : 'transparent',
            }}
          >
            {selected && <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none"><path d="M2.5 6.5l2.5 2.5L9.5 4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          </button>
          <div
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium"
            style={{ backgroundColor: catColor.bg, color: catColor.text }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: catColor.dot }} />
            {doc.category}
          </div>
          {doc.isPinned && (
            <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)' }}>
              <Pin className="w-3 h-3 text-amber-500" />
            </div>
          )}
          {doc.isArchived && (
            <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: 'var(--border-subtle)' }}>
              <Archive className="w-3 h-3" style={{ color: 'var(--muted)' }} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="relative">
            <button
              onClick={(e) => {
                e.preventDefault();
                setShowMenu(!showMenu);
              }}
              className="p-1.5 rounded-md transition-colors"
              style={{ color: 'var(--muted)' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--border-subtle)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <FolderOpen className="w-3.5 h-3.5" />
            </button>
            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={(e) => {
                    e.preventDefault();
                    setShowMenu(false);
                  }}
                />
                <div
                  className="absolute right-0 top-7 z-20 py-1 w-44 rounded-xl shadow-xl"
                  style={{
                    backgroundColor: 'var(--card-bg)',
                    border: '1px solid var(--card-border)',
                  }}
                >
                  {doc.folderId && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        onMoveConfirm(doc.id, null);
                        setShowMenu(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors"
                      style={{ color: 'var(--foreground)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--border-subtle)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <FolderOpen className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                      Move to Root
                    </button>
                  )}
                  {folders
                    .filter((f) => f.id !== doc.folderId)
                    .slice(0, 5)
                    .map((folder) => (
                      <button
                        key={folder.id}
                        onClick={(e) => {
                          e.preventDefault();
                          onMoveConfirm(doc.id, folder.id);
                          setShowMenu(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors"
                        style={{ color: 'var(--foreground)' }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--border-subtle)')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <FolderOpen className="w-3.5 h-3.5" style={{ color: folder.color }} />
                        <span className="truncate">{folder.name}</span>
                      </button>
                    ))}
                </div>
              </>
            )}
          </div>
          <button
            onClick={(e) => {
              e.preventDefault();
              onDelete(doc.id);
            }}
            className="p-1.5 rounded-md transition-colors"
            style={{ color: 'var(--muted)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.08)';
              e.currentTarget.style.color = '#ef4444';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = 'var(--muted)';
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <h3 className="text-sm font-semibold mb-1.5 line-clamp-1" style={{ color: 'var(--foreground)' }}>
        {doc.title}
      </h3>
      <p className="text-xs line-clamp-2 mb-3 leading-relaxed" style={{ color: 'var(--muted)' }}>
        {doc.content || 'No content'}
      </p>
      <div className="flex items-center justify-between">
        <div className="flex gap-1 flex-wrap">
          {doc.folder && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 font-medium"
              style={{ backgroundColor: doc.folder.color + '15', color: doc.folder.color }}
            >
              <FolderOpen className="w-2.5 h-2.5" />
              {doc.folder.name}
            </span>
          )}
          {doc.tags.slice(0, 2).map((tag) => (
            <span
              key={tag.id}
              className="text-[10px] px-1.5 py-0.5 rounded font-medium"
              style={{ backgroundColor: tag.color + '15', color: tag.color }}
            >
              {tag.name}
            </span>
          ))}
          {doc.reviewDate && new Date(doc.reviewDate).getTime() <= Date.now() && (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-red-500/10 text-red-500">
              Review due
            </span>
          )}
        </div>
        <span className="text-[10px]" style={{ color: 'var(--muted)' }}>{formatDate(doc.updatedAt)}</span>
      </div>
    </Link>
  );
}

function MoveDocumentModal({
  isOpen,
  onClose,
  docTitle,
  folders,
  currentFolderId,
  onMove,
}: {
  isOpen: boolean;
  onClose: () => void;
  docTitle: string;
  folders: FolderInfo[];
  currentFolderId: string | null;
  onMove: (folderId: string | null) => void;
}) {
  const rootFolders = folders.filter((f) => !f.parentId);

  const renderFolder = (folder: FolderInfo, depth: number = 0) => {
    const children = folders.filter((f) => f.parentId === folder.id);
    return (
      <div key={folder.id}>
        <button
          onClick={() => {
            onMove(folder.id);
            onClose();
          }}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors',
            currentFolderId === folder.id
              ? 'bg-blue-50 text-blue-700'
              : 'hover:bg-slate-50'
          )}
          style={{ paddingLeft: `${depth * 16 + 12}px` }}
        >
          <FolderOpen className="w-4 h-4 flex-shrink-0" style={{ color: folder.color }} />
          <span className="flex-1">{folder.name}</span>
          {currentFolderId === folder.id && (
            <span className="text-xs text-blue-500">Current</span>
          )}
        </button>
        {children.map((child) => renderFolder(child, depth + 1))}
      </div>
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Move "${docTitle}"`}>
      <div className="space-y-1 max-h-80 overflow-y-auto">
        <button
          onClick={() => {
            onMove(null);
            onClose();
          }}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors',
            currentFolderId === null
              ? 'bg-blue-50 text-blue-700'
              : 'hover:bg-slate-50'
          )}
        >
          <FolderOpen className="w-4 h-4" />
          <span className="flex-1">Root (No folder)</span>
          {currentFolderId === null && (
            <span className="text-xs text-blue-500">Current</span>
          )}
        </button>
        {rootFolders.map((folder) => renderFolder(folder))}
      </div>
    </Modal>
  );
}
