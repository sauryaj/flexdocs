'use client';

import { Trash2, FolderInput, Archive, X, CheckSquare, Square } from 'lucide-react';

interface BulkActionsProps {
  selectedIds: string[];
  onSelectAll: () => void;
  onDeselectAll: () => void;
  totalItems: number;
  onRefresh: () => void;
}

export default function BulkActions({ selectedIds, onSelectAll: _onSelectAll, onDeselectAll, totalItems: _totalItems, onRefresh }: BulkActionsProps) {

  if (selectedIds.length === 0) return null;

  const handleBulkAction = async (action: string, data?: Record<string, unknown>) => {
    const res = await fetch('/api/documents/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ids: selectedIds, data }),
    });
    if (res.ok) {
      onDeselectAll();
      onRefresh();
    }
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white border shadow-xl rounded-xl px-6 py-3 flex items-center gap-4 animate-in slide-in-from-bottom">
      <div className="flex items-center gap-2">
        <CheckSquare className="w-4 h-4 text-blue-500" />
        <span className="text-sm font-medium text-slate-700">
          {selectedIds.length} selected
        </span>
      </div>
      <div className="h-6 w-px bg-slate-200" />
      <div className="flex items-center gap-1">
        <button
          onClick={() => handleBulkAction('delete')}
          className="p-2 rounded-lg hover:bg-red-50 text-red-600 transition-colors"
          title="Delete selected"
        >
          <Trash2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => handleBulkAction('archive')}
          className="p-2 rounded-lg hover:bg-amber-50 text-amber-600 transition-colors"
          title="Archive selected"
        >
          <Archive className="w-4 h-4" />
        </button>
        <button
          onClick={() => handleBulkAction('move', { folderId: null })}
          className="p-2 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors"
          title="Move selected"
        >
          <FolderInput className="w-4 h-4" />
        </button>
      </div>
      <div className="h-6 w-px bg-slate-200" />
      <button
        onClick={onDeselectAll}
        className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function SelectableRow({
  id,
  selected,
  onToggle,
  children,
}: {
  id: string;
  selected: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
        selected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50 border border-transparent'
      }`}
      onClick={() => onToggle(id)}
    >
      {selected ? (
        <CheckSquare className="w-4 h-4 text-blue-500 flex-shrink-0" />
      ) : (
        <Square className="w-4 h-4 text-slate-300 flex-shrink-0" />
      )}
      {children}
    </div>
  );
}
