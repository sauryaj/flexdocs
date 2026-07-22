'use client';

import { useState, useEffect } from 'react';
import { Search, FileText, Key, Globe, HardDrive, Server, CheckSquare, X } from 'lucide-react';

interface MentionItem {
  id: string;
  name: string;
  type: 'document' | 'password' | 'asset' | 'domain' | 'server';
}

interface MentionPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (item: MentionItem) => void;
  position?: { top: number; left: number };
}

export function MentionPicker({ isOpen, onClose, onSelect }: MentionPickerProps) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<MentionItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    fetchItems(query);
  }, [isOpen, query]);

  const fetchItems = async (q: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q || 'a')}`);
      if (res.ok) {
        const data = await res.json();
        const list: MentionItem[] = [];
        for (const [typeKey, itemList] of Object.entries(data) as [string, any[]][]) {
          if (Array.isArray(itemList)) {
            const singularType = typeKey.slice(0, -1) as MentionItem['type'];
            for (const i of itemList.slice(0, 4)) {
              list.push({
                id: i.id,
                name: i.name || i.title || i.username || 'Untitled',
                type: singularType,
              });
            }
          }
        }
        setItems(list);
      }
    } catch {
      // Error fetching mentions
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const getIcon = (type: string) => {
    switch (type) {
      case 'document':
        return <FileText className="w-3.5 h-3.5 text-blue-500" />;
      case 'password':
        return <Key className="w-3.5 h-3.5 text-emerald-500" />;
      case 'domain':
        return <Globe className="w-3.5 h-3.5 text-purple-500" />;
      case 'asset':
        return <HardDrive className="w-3.5 h-3.5 text-amber-500" />;
      case 'server':
        return <Server className="w-3.5 h-3.5 text-indigo-500" />;
      default:
        return <CheckSquare className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  return (
    <div
      className="absolute z-50 w-72 rounded-xl shadow-2xl overflow-hidden border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800 p-2 space-y-2 animate-in fade-in zoom-in-95 duration-150"
      style={{ marginTop: '4px' }}
    >
      <div className="flex items-center justify-between px-2 pt-1 border-b pb-2 dark:border-slate-800">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
          Mention Asset...
        </span>
        <button onClick={onClose} className="p-0.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">
          <X className="w-3.5 h-3.5 text-slate-400" />
        </button>
      </div>

      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
        <input
          type="text"
          autoFocus
          placeholder="Filter by name..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full text-xs pl-8 pr-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div className="max-h-48 overflow-y-auto space-y-0.5">
        {loading && items.length === 0 ? (
          <div className="p-3 text-xs text-center text-slate-400">Searching assets...</div>
        ) : items.length === 0 ? (
          <div className="p-3 text-xs text-center text-slate-400">No matching assets found</div>
        ) : (
          items.map((item) => (
            <button
              key={`${item.type}-${item.id}`}
              type="button"
              onClick={() => onSelect(item)}
              className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors group"
            >
              <div className="flex items-center gap-2 min-w-0">
                {getIcon(item.type)}
                <span className="truncate text-slate-800 dark:text-slate-200 group-hover:text-blue-600">
                  {item.name}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                {item.type}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
