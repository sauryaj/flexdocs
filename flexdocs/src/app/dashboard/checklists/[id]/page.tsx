'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Save, Loader2, Trash2, Plus, X, Check,
} from 'lucide-react';
import { formatDate, cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/UIComponents';

interface ChecklistItem {
  id: string;
  text: string;
  isComplete: boolean;
  order: number;
}

interface Checklist {
  id: string;
  name: string;
  description: string | null;
  category: string;
  isComplete: boolean;
  isArchived: boolean;
  dueDate: string | null;
  items: ChecklistItem[];
  tags: { id: string; name: string; color: string }[];
  createdAt: string;
  updatedAt: string;
}

export default function ChecklistDetailPage() {
  const router = useRouter();
  const params = useParams();
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [dueDate, setDueDate] = useState('');
  const [tags, setTags] = useState('');
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [newItemText, setNewItemText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    fetch(`/api/checklists/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        setChecklist(data);
        setName(data.name);
        setDescription(data.description || '');
        setCategory(data.category);
        setDueDate(data.dueDate ? new Date(data.dueDate).toISOString().split('T')[0] : '');
        setTags(data.tags.map((t: any) => t.name).join(', '));
        setItems(data.items);
        setLoading(false);
      });
  }, [params.id]);

  const toggleItem = async (itemId: string) => {
    const updated = items.map((i) =>
      i.id === itemId ? { ...i, isComplete: !i.isComplete } : i
    );
    setItems(updated);

    const allComplete = updated.every((i) => i.isComplete);
    await fetch(`/api/checklists/${params.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, items: updated, isComplete: allComplete }),
    });
    setChecklist((prev) => prev ? { ...prev, items: updated, isComplete: allComplete } : prev);
  };

  const addItem = async () => {
    if (!newItemText.trim()) return;
    const newItem = { text: newItemText, isComplete: false, order: items.length, id: 'temp-' + Date.now() };
    const updated = [...items, newItem];
    setItems(updated);
    setNewItemText('');

    await fetch(`/api/checklists/${params.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, items: updated }),
    });
  };

  const removeItem = async (itemId: string) => {
    const updated = items.filter((i) => i.id !== itemId);
    setItems(updated);

    await fetch(`/api/checklists/${params.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, items: updated }),
    });
  };

  const handleSave = async () => {
    setSaving(true);
    const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);
    await fetch(`/api/checklists/${params.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, description, category,
        dueDate: dueDate || null,
        items, tags: tagList,
      }),
    });
    setSaving(false);
  };

  const handleDelete = async () => {
    await fetch(`/api/checklists/${params.id}`, { method: 'DELETE' });
    router.push('/dashboard/checklists');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!checklist) return null;

  const completedCount = items.filter((i) => i.isComplete).length;
  const progress = items.length > 0 ? (completedCount / items.length) * 100 : 0;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/checklists" className="p-2 hover:bg-slate-100 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Edit Checklist</h1>
            <p className="text-sm text-slate-500">Last updated {formatDate(checklist.updatedAt)}</p>
          </div>
        </div>
        <button onClick={() => setShowDelete(true)} className="p-2 hover:bg-red-50 text-red-500 rounded-lg">
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      <div className="card p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input-field" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input-field" rows={2} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="input-field">
              {['general', 'onboarding', 'offboarding', 'maintenance', 'security', 'compliance', 'disaster-recovery'].map((c) => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1).replace('-', ' ')}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Due Date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input-field" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Tags</label>
          <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} className="input-field" />
        </div>

        {/* Progress */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-sm font-medium text-slate-700">Progress</span>
            <span className="text-sm text-slate-500">{completedCount}/{items.length} complete</span>
          </div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', progress === 100 ? 'bg-green-500' : 'bg-blue-500')}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Items */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Items</label>
          <div className="space-y-2">
            {items.map((item, _i) => (
              <div key={item.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50">
                <button onClick={() => toggleItem(item.id)} className="flex-shrink-0">
                  <div className={cn(
                    'w-5 h-5 rounded border-2 flex items-center justify-center',
                    item.isComplete ? 'bg-green-500 border-green-500' : 'border-slate-300'
                  )}>
                    {item.isComplete && <Check className="w-3 h-3 text-white" />}
                  </div>
                </button>
                <span className={cn('flex-1 text-sm', item.isComplete && 'line-through text-slate-400')}>
                  {item.text}
                </span>
                <button onClick={() => removeItem(item.id)} className="p-1 hover:bg-red-50 text-red-400 rounded opacity-0 group-hover:opacity-100">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}

            {/* Add new item */}
            <div className="flex gap-2 mt-3">
              <input
                type="text"
                value={newItemText}
                onChange={(e) => setNewItemText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
                className="input-field flex-1"
                placeholder="Add new item..."
              />
              <button type="button" onClick={addItem} className="btn-secondary">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Link href="/dashboard/checklists" className="btn-secondary">Cancel</Link>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Delete Checklist"
        message="Are you sure you want to delete this checklist?"
      />
    </div>
  );
}
