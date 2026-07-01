'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  CheckSquare,
  Plus,
  Search,
  Trash2,
  Check,
  Calendar,
} from 'lucide-react';
import { formatDate, cn } from '@/lib/utils';
import { EmptyState, ConfirmDialog } from '@/components/UIComponents';
import { useOrganization } from '@/lib/OrganizationContext';

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
  createdAt: string;
  updatedAt: string;
  items: ChecklistItem[];
  tags: { id: string; name: string; color: string }[];
}

const categories = [
  'general',
  'onboarding',
  'offboarding',
  'maintenance',
  'security',
  'compliance',
  'disaster-recovery',
];

export default function ChecklistsPage() {
  const { selectedOrg } = useOrganization();
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [showCompleted, setShowCompleted] = useState(true);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    fetchChecklists();
  }, [selectedOrg]);

  const fetchChecklists = async () => {
    const params = new URLSearchParams();
    if (selectedOrg?.id) {
      params.set('organizationId', selectedOrg.id);
    }
    const res = await fetch(`/api/checklists?${params.toString()}`);
    const data = await res.json();
    setChecklists(data.items || data);
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await fetch(`/api/checklists/${deleteId}`, { method: 'DELETE' });
    setChecklists(checklists.filter((c) => c.id !== deleteId));
    setDeleteId(null);
  };

  const toggleItem = async (checklist: Checklist, itemId: string) => {
    const item = checklist.items.find((i) => i.id === itemId);
    if (!item) return;

    const updatedItems = checklist.items.map((i) =>
      i.id === itemId ? { ...i, isComplete: !i.isComplete } : i
    );
    const allComplete = updatedItems.every((i) => i.isComplete);

    await fetch(`/api/checklists/${checklist.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: checklist.name,
        items: updatedItems,
        isComplete: allComplete,
      }),
    });

    setChecklists(
      checklists.map((c) =>
        c.id === checklist.id
          ? { ...c, items: updatedItems, isComplete: allComplete }
          : c
      )
    );
  };

  const filtered = checklists.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === 'all' || c.category === category;
    const matchesComplete = showCompleted ? true : !c.isComplete;
    return matchesSearch && matchesCategory && matchesComplete && !c.isArchived;
  });

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
          <h1 className="text-2xl font-bold text-slate-900">Checklists</h1>
          <p className="text-slate-500">Repeatable workflows and task lists</p>
        </div>
        <Link href="/dashboard/checklists/new" className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          New Checklist
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search checklists..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-10"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="input-field w-auto"
        >
          <option value="all">All Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c.charAt(0).toUpperCase() + c.slice(1).replace('-', ' ')}
            </option>
          ))}
        </select>
        <button
          onClick={() => setShowCompleted(!showCompleted)}
          className={cn('btn-secondary', !showCompleted && 'bg-slate-200')}
        >
          {showCompleted ? 'Hide Completed' : 'Show Completed'}
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<CheckSquare className="w-8 h-8 text-slate-400" />}
          title="No checklists found"
          description="Create a checklist for repeatable workflows"
          action={
            <Link href="/dashboard/checklists/new" className="btn-primary">
              <Plus className="w-4 h-4 mr-2 inline" />
              New Checklist
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {filtered.map((checklist) => {
            const completedCount = checklist.items.filter((i) => i.isComplete).length;
            const totalItems = checklist.items.length;
            const progress = totalItems > 0 ? (completedCount / totalItems) * 100 : 0;

            return (
              <div
                key={checklist.id}
                className={cn(
                  'card p-4 group',
                  checklist.isComplete && 'bg-green-50 border-green-200'
                )}
              >
                <div className="flex items-start justify-between mb-3">
                  <Link
                    href={`/dashboard/checklists/${checklist.id}`}
                    className="flex-1"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <CheckSquare className="w-5 h-5 text-blue-500" />
                      <h3 className="font-semibold text-slate-900">{checklist.name}</h3>
                      <span className="badge badge-blue">{checklist.category}</span>
                      {checklist.isComplete && <span className="badge badge-green">Complete</span>}
                    </div>
                    {checklist.description && (
                      <p className="text-sm text-slate-500 ml-7">{checklist.description}</p>
                    )}
                  </Link>
                  <button
                    onClick={() => setDeleteId(checklist.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-100 rounded transition-opacity"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>

                {/* Progress Bar */}
                <div className="ml-7 mb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          progress === 100 ? 'bg-green-500' : 'bg-blue-500'
                        )}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500">
                      {completedCount}/{totalItems}
                    </span>
                  </div>
                </div>

                {/* Items Preview */}
                <div className="ml-7 space-y-1">
                  {checklist.items.slice(0, 4).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => toggleItem(checklist, item.id)}
                      className="flex items-center gap-2 text-sm w-full text-left"
                    >
                      <div
                        className={cn(
                          'w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0',
                          item.isComplete
                            ? 'bg-green-500 border-green-500'
                            : 'border-slate-300'
                        )}
                      >
                        {item.isComplete && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <span
                        className={cn(
                          'truncate',
                          item.isComplete && 'line-through text-slate-400'
                        )}
                      >
                        {item.text}
                      </span>
                    </button>
                  ))}
                  {checklist.items.length > 4 && (
                    <p className="text-xs text-slate-400">
                      +{checklist.items.length - 4} more items
                    </p>
                  )}
                </div>

                {checklist.dueDate && (
                  <div className="ml-7 mt-2 flex items-center gap-1 text-xs text-slate-500">
                    <Calendar className="w-3 h-3" />
                    Due {formatDate(checklist.dueDate)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Checklist"
        message="Are you sure you want to delete this checklist and all its items?"
      />
    </div>
  );
}
