'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Activity,
  FileText,
  Key,
  Globe,
  Box,
  CheckSquare,
  User,
  LogIn,
  LogOut,
  Trash2,
  Eye,
  Edit3,
  Copy,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface LogEntry {
  id: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  resourceName: string | null;
  details: string | null;
  ip: string | null;
  createdAt: string;
  user: { name: string | null; email: string } | null;
}

const actionIcons: Record<string, any> = {
  'user.login': LogIn,
  'user.logout': LogOut,
  'user.register': User,
  'user.profile.update': Edit3,
  'document.create': FileText,
  'document.update': Edit3,
  'document.delete': Trash2,
  'document.view': Eye,
  'password.create': Key,
  'password.update': Edit3,
  'password.delete': Trash2,
  'password.view': Eye,
  'password.copy': Copy,
  'domain.create': Globe,
  'domain.update': Edit3,
  'domain.delete': Trash2,
  'asset.create': Box,
  'asset.update': Edit3,
  'asset.delete': Trash2,
  'checklist.create': CheckSquare,
  'checklist.update': Edit3,
  'checklist.complete': CheckSquare,
  'checklist.delete': Trash2,
};

const actionColors: Record<string, string> = {
  'user.login': 'text-green-600 bg-green-50',
  'user.logout': 'text-slate-600 bg-slate-50',
  'user.register': 'text-blue-600 bg-blue-50',
  'user.profile.update': 'text-blue-600 bg-blue-50',
  'document.create': 'text-blue-600 bg-blue-50',
  'document.update': 'text-amber-600 bg-amber-50',
  'document.delete': 'text-red-600 bg-red-50',
  'document.view': 'text-slate-600 bg-slate-50',
  'password.create': 'text-green-600 bg-green-50',
  'password.update': 'text-amber-600 bg-amber-50',
  'password.delete': 'text-red-600 bg-red-50',
  'password.view': 'text-slate-600 bg-slate-50',
  'password.copy': 'text-purple-600 bg-purple-50',
  'domain.create': 'text-blue-600 bg-blue-50',
  'domain.update': 'text-amber-600 bg-amber-50',
  'domain.delete': 'text-red-600 bg-red-50',
  'asset.create': 'text-blue-600 bg-blue-50',
  'asset.update': 'text-amber-600 bg-amber-50',
  'asset.delete': 'text-red-600 bg-red-50',
  'checklist.create': 'text-blue-600 bg-blue-50',
  'checklist.update': 'text-amber-600 bg-amber-50',
  'checklist.complete': 'text-green-600 bg-green-50',
  'checklist.delete': 'text-red-600 bg-red-50',
};

function formatAction(action: string): string {
  return action
    .replace('.', ' ')
    .replace(/\./g, ' ')
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function timeAgo(date: string): string {
  const now = new Date();
  const past = new Date(date);
  const diffMs = now.getTime() - past.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffDay > 0) return `${diffDay}d ago`;
  if (diffHr > 0) return `${diffHr}h ago`;
  if (diffMin > 0) return `${diffMin}m ago`;
  return 'Just now';
}

export default function ActivityPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(0);
  const limit = 50;
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { fetchLogs(); }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [filter, page]);

  const fetchLogs = async () => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(page * limit) });
    if (filter !== 'all') params.set('resourceType', filter);

    const res = await fetch(`/api/activity?${params}`);
    if (!res.ok) { setLoading(false); return; }
    const data = await res.json();
    setLogs(data.logs || []);
    setTotal(data.total || 0);
    setLoading(false);
  };

  const hasMore = (page + 1) * limit < total;

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
          <h1 className="text-2xl font-bold text-slate-900">Activity Log</h1>
          <p className="text-slate-500">Audit trail of all actions ({total} total)</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {['all', 'document', 'password', 'domain', 'asset', 'checklist', 'user'].map((f) => (
          <button
            key={f}
            onClick={() => { setFilter(f); setPage(0); }}
            className={cn(
              'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {logs.length === 0 ? (
        <div className="card p-12 text-center">
          <Activity className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-1">No activity yet</h3>
          <p className="text-slate-500">Actions will appear here as you use the system</p>
        </div>
      ) : (
        <div className="card divide-y">
          {logs.map((log) => {
            const Icon = actionIcons[log.action] || Activity;
            const colorClass = actionColors[log.action] || 'text-slate-600 bg-slate-50';
            return (
              <div key={log.id} className="flex items-start gap-3 p-4 hover:bg-slate-50">
                <div className={cn('p-2 rounded-lg flex-shrink-0', colorClass)}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-900">
                    <span className="font-medium">{formatAction(log.action)}</span>
                    {log.resourceName && (
                      <span className="text-slate-600"> &ldquo;{log.resourceName}&rdquo;</span>
                    )}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {timeAgo(log.createdAt)}
                    </span>
                    {log.ip && <span>IP: {log.ip}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      <div className="flex justify-between items-center">
        <button
          onClick={() => setPage(Math.max(0, page - 1))}
          disabled={page === 0}
          className="btn-secondary disabled:opacity-50"
        >
          Previous
        </button>
        <span className="text-sm text-slate-500">
          Page {page + 1} of {Math.ceil(total / limit)}
        </span>
        <button
          onClick={() => setPage(page + 1)}
          disabled={!hasMore}
          className="btn-secondary disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
