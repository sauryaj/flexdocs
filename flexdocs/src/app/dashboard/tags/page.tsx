'use client';

import { useState, useEffect } from 'react';
import { Tag, Plus, Trash2, FileText, Key, Globe } from 'lucide-react';
import { EmptyState, ConfirmDialog } from '@/components/UIComponents';

interface TagItem {
  id: string;
  name: string;
  color: string;
  _count: { documents: number; passwords: number; domains: number };
}

const tagColors = [
  '#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316',
];

export default function TagsPage() {
  const [tags, setTags] = useState<TagItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(tagColors[0]);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    fetchTags();
  }, []);

  const fetchTags = async () => {
    const res = await fetch('/api/tags');
    const data = await res.json();
    setTags(data);
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const res = await fetch('/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), color: newColor }),
    });
    if (res.ok) {
      const tag = await res.json();
      setTags([...tags, { ...tag, _count: { documents: 0, passwords: 0, domains: 0 } }]);
      setNewName('');
      setShowNew(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await fetch(`/api/tags/${deleteId}`, { method: 'DELETE' });
    setTags(tags.filter((t) => t.id !== deleteId));
    setDeleteId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tags</h1>
          <p className="text-slate-500">Organize your assets with tags</p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          New Tag
        </button>
      </div>

      {showNew && (
        <div className="card p-4">
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-700 mb-1">Tag Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="input-field"
                placeholder="Enter tag name"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Color</label>
              <div className="flex gap-1">
                {tagColors.map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewColor(color)}
                    className={`w-8 h-8 rounded-full border-2 ${
                      newColor === color ? 'border-slate-900' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            <button onClick={handleCreate} className="btn-primary">
              Create
            </button>
            <button onClick={() => setShowNew(false)} className="btn-secondary">
              Cancel
            </button>
          </div>
        </div>
      )}

      {tags.length === 0 ? (
        <EmptyState
          icon={<Tag className="w-8 h-8 text-slate-400" />}
          title="No tags yet"
          description="Create tags to organize your documents, passwords, and domains"
          action={
            <button onClick={() => setShowNew(true)} className="btn-primary">
              <Plus className="w-4 h-4 mr-2 inline" />
              New Tag
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tags.map((tag) => (
            <div key={tag.id} className="card p-4 group">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  <span className="font-semibold text-slate-900">{tag.name}</span>
                </div>
                <button
                  onClick={() => setDeleteId(tag.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 text-red-500 rounded transition-opacity"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex gap-4 text-sm text-slate-500">
                <span className="flex items-center gap-1">
                  <FileText className="w-4 h-4" />
                  {tag._count.documents} docs
                </span>
                <span className="flex items-center gap-1">
                  <Key className="w-4 h-4" />
                  {tag._count.passwords} passwords
                </span>
                <span className="flex items-center gap-1">
                  <Globe className="w-4 h-4" />
                  {tag._count.domains} domains
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Tag"
        message="Are you sure you want to delete this tag? It will be removed from all associated items."
      />
    </div>
  );
}
