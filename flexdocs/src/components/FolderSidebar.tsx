'use client';

import { useState, useEffect } from 'react';
import {
  Folder,
  FolderOpen,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  Trash2,
  Edit3,
  Check,
  X,
  MoreVertical,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConfirmDialog, Modal } from '@/components/UIComponents';

interface FolderItem {
  id: string;
  name: string;
  color: string;
  parentId: string | null;
  _count: { documents: number; children: number };
}

const folderColors = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
];

interface FolderSidebarProps {
  selectedFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  refreshTrigger?: number;
}

export function FolderSidebar({ selectedFolderId, onSelectFolder, refreshTrigger }: FolderSidebarProps) {
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState(folderColors[0]);
  const [newFolderParent, setNewFolderParent] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<string | null>(null);

  useEffect(() => {
    fetchFolders();
  }, [refreshTrigger]);

  const fetchFolders = async () => {
    const res = await fetch('/api/folders');
    const data = await res.json();
    setFolders(data);
    setLoading(false);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    const res = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newFolderName.trim(),
        color: newFolderColor,
        parentId: newFolderParent,
      }),
    });
    if (res.ok) {
      await fetchFolders();
      setNewFolderName('');
      setShowNewFolder(false);
      setNewFolderParent(null);
    }
  };

  const handleRename = async (id: string) => {
    if (!editName.trim()) return;
    await fetch(`/api/folders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName.trim() }),
    });
    await fetchFolders();
    setEditingId(null);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await fetch(`/api/folders/${deleteId}`, { method: 'DELETE' });
    if (selectedFolderId === deleteId) onSelectFolder(null);
    await fetchFolders();
    setDeleteId(null);
  };

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expanded);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpanded(newExpanded);
  };

  // Build tree
  const rootFolders = folders.filter((f) => !f.parentId);
  const getChildren = (parentId: string) => folders.filter((f) => f.parentId === parentId);

  const renderFolder = (folder: FolderItem, depth: number = 0) => {
    const children = getChildren(folder.id);
    const hasChildren = children.length > 0;
    const isExpanded = expanded.has(folder.id);
    const isSelected = selectedFolderId === folder.id;
    const isEditing = editingId === folder.id;

    return (
      <div key={folder.id}>
        <div
          className={cn(
            'flex items-center gap-1 py-1.5 px-2 rounded-lg cursor-pointer group hover:bg-slate-100 transition-colors',
            isSelected && 'bg-blue-50 text-blue-700 hover:bg-blue-50'
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(folder.id);
              }}
              className="p-0.5 hover:bg-slate-200 rounded"
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
          ) : (
            <span className="w-5" />
          )}

          <button
            onClick={() => onSelectFolder(folder.id)}
            className="flex items-center gap-2 flex-1 min-w-0"
          >
            {isExpanded && hasChildren ? (
              <FolderOpen className="w-4 h-4 flex-shrink-0" style={{ color: folder.color }} />
            ) : (
              <Folder className="w-4 h-4 flex-shrink-0" style={{ color: folder.color }} />
            )}

            {isEditing ? (
              <div className="flex items-center gap-1 flex-1">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename(folder.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  className="flex-1 px-1 py-0.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRename(folder.id);
                  }}
                  className="p-0.5 text-green-600 hover:bg-green-50 rounded"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingId(null);
                  }}
                  className="p-0.5 text-slate-400 hover:bg-slate-200 rounded"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <span className="text-sm truncate flex-1 text-left">{folder.name}</span>
            )}
          </button>

          {!isEditing && (
            <div className="flex items-center gap-0.5">
              <span className="text-xs text-slate-400 mr-1">{folder._count.documents}</span>
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setContextMenu(contextMenu === folder.id ? null : folder.id);
                  }}
                  className="p-0.5 opacity-0 group-hover:opacity-100 hover:bg-slate-200 rounded transition-opacity"
                >
                  <MoreVertical className="w-3.5 h-3.5 text-slate-500" />
                </button>
                {contextMenu === folder.id && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setContextMenu(null)}
                    />
                    <div className="absolute right-0 top-6 z-20 bg-white border rounded-lg shadow-lg py-1 w-36">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(folder.id);
                          setEditName(folder.name);
                          setContextMenu(null);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Rename
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setNewFolderParent(folder.id);
                          setShowNewFolder(true);
                          setContextMenu(null);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50"
                      >
                        <FolderPlus className="w-3.5 h-3.5" />
                        Add Subfolder
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteId(folder.id);
                          setContextMenu(null);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {isExpanded && hasChildren && (
          <div>
            {children.map((child) => renderFolder(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 bg-slate-100 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-1">
        <div className="flex items-center justify-between px-2 mb-2">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Folders</h3>
          <button
            onClick={() => {
              setNewFolderParent(null);
              setShowNewFolder(true);
            }}
            className="p-1 hover:bg-slate-100 rounded"
            title="New folder"
          >
            <FolderPlus className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* All Documents */}
        <button
          onClick={() => onSelectFolder(null)}
          className={cn(
            'flex items-center gap-2 w-full py-1.5 px-2 rounded-lg text-left transition-colors',
            selectedFolderId === null
              ? 'bg-blue-50 text-blue-700'
              : 'hover:bg-slate-100 text-slate-700'
          )}
        >
          <FileText className="w-4 h-4" />
          <span className="text-sm flex-1">All Documents</span>
          <span className="text-xs text-slate-400">
            {folders.reduce((sum, f) => sum + f._count.documents, 0)}
          </span>
        </button>

        {/* Folder Tree */}
        {rootFolders.map((folder) => renderFolder(folder))}

        {folders.length === 0 && (
          <p className="text-xs text-slate-400 px-2 py-4 text-center">
            No folders yet. Create one to organize your docs.
          </p>
        )}
      </div>

      {/* New Folder Modal */}
      <Modal
        isOpen={showNewFolder}
        onClose={() => {
          setShowNewFolder(false);
          setNewFolderParent(null);
        }}
        title={newFolderParent ? 'New Subfolder' : 'New Folder'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Folder Name</label>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="input-field"
              placeholder="e.g., Network Documentation"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder();
              }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Color</label>
            <div className="flex gap-2">
              {folderColors.map((color) => (
                <button
                  key={color}
                  onClick={() => setNewFolderColor(color)}
                  className={cn(
                    'w-8 h-8 rounded-full border-2 transition-transform',
                    newFolderColor === color
                      ? 'border-slate-900 scale-110'
                      : 'border-transparent hover:scale-105'
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
          {newFolderParent && (
            <p className="text-sm text-slate-500">
              Creating inside: <span className="font-medium">{folders.find(f => f.id === newFolderParent)?.name}</span>
            </p>
          )}
          <div className="flex justify-end gap-3">
            <button
              onClick={() => {
                setShowNewFolder(false);
                setNewFolderParent(null);
              }}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button onClick={handleCreateFolder} className="btn-primary">
              Create Folder
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Folder"
        message="Documents in this folder will be moved to the root. Subfolders will also be deleted. Continue?"
      />
    </>
  );
}
