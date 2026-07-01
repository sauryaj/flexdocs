'use client';

import { useState, useEffect } from 'react';
import { Activity, Download, Trash2, Filter, Clock } from 'lucide-react';

interface AuditEntry {
  id: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  resourceName: string | null;
  details: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  user: { name: string | null; email: string } | null;
}

interface RetentionConfig {
  daysToKeep: number;
  lastPurgeAt: string | null;
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [retention, setRetention] = useState<RetentionConfig | null>(null);
  const [retentionDays, setRetentionDays] = useState(365);
  const [actionFilter, setActionFilter] = useState('');
  const [resourceFilter, setResourceFilter] = useState('');
  const [page, setPage] = useState(0);
  const limit = 50;

  useEffect(() => {
    loadLogs();
    loadRetention();
  }, [page, actionFilter, resourceFilter]);

  const loadLogs = async () => {
    setLoading(true);
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(page * limit),
    });
    if (actionFilter) params.set('action', actionFilter);
    if (resourceFilter) params.set('resourceType', resourceFilter);

    const res = await fetch(`/api/activity?${params}`);
    if (res.ok) {
      const data = await res.json();
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    }
    setLoading(false);
  };

  const loadRetention = async () => {
    const res = await fetch('/api/audit/retention');
    if (res.ok) {
      const data = await res.json();
      setRetention(data);
      setRetentionDays(data.daysToKeep);
    }
  };

  const saveRetention = async () => {
    await fetch('/api/audit/retention', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ daysToKeep: retentionDays }),
    });
    loadRetention();
  };

  const purgeLogs = async () => {
    if (!confirm(`Delete logs older than ${retentionDays} days?`)) return;
    await fetch('/api/audit/retention', { method: 'POST' });
    loadLogs();
    loadRetention();
  };

  const exportLogs = async (format: 'csv' | 'json') => {
    const res = await fetch(`/api/activity/export?format=${format}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.ceil(total / limit);

  const actionColors: Record<string, string> = {
    'document.create': 'bg-green-100 text-green-800',
    'document.update': 'bg-blue-100 text-blue-800',
    'document.delete': 'bg-red-100 text-red-800',
    'password.create': 'bg-green-100 text-green-800',
    'password.copy': 'bg-amber-100 text-amber-800',
    'domain.create': 'bg-green-100 text-green-800',
    'user.login': 'bg-purple-100 text-purple-800',
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Activity className="w-6 h-6" /> Audit Logs
          </h1>
          <p className="text-slate-500">{total} entries</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => exportLogs('csv')} className="btn-secondary flex items-center gap-2">
            <Download className="w-4 h-4" /> CSV
          </button>
          <button onClick={() => exportLogs('json')} className="btn-secondary flex items-center gap-2">
            <Download className="w-4 h-4" /> JSON
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex gap-3 items-center">
          <Filter className="w-4 h-4 text-slate-500" />
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(0); }}
            className="input-field w-48"
          >
            <option value="">All Actions</option>
            <option value="document.create">Document Create</option>
            <option value="document.update">Document Update</option>
            <option value="document.delete">Document Delete</option>
            <option value="password.create">Password Create</option>
            <option value="password.copy">Password Copy</option>
            <option value="domain.create">Domain Create</option>
            <option value="user.login">User Login</option>
          </select>
          <select
            value={resourceFilter}
            onChange={(e) => { setResourceFilter(e.target.value); setPage(0); }}
            className="input-field w-40"
          >
            <option value="">All Types</option>
            <option value="document">Document</option>
            <option value="password">Password</option>
            <option value="domain">Domain</option>
            <option value="asset">Asset</option>
            <option value="checklist">Checklist</option>
          </select>
        </div>
      </div>

      {/* Retention Settings */}
      {retention && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5" /> Retention Policy
          </h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">Keep logs for</span>
              <input
                type="number"
                value={retentionDays}
                onChange={(e) => setRetentionDays(Number(e.target.value))}
                className="input-field w-20"
                min={1}
              />
              <span className="text-sm text-slate-600">days</span>
            </div>
            <button onClick={saveRetention} className="btn-primary text-sm">Save</button>
            <button onClick={purgeLogs} className="btn-secondary text-sm flex items-center gap-1">
              <Trash2 className="w-3 h-3" /> Purge Old Logs
            </button>
            {retention.lastPurgeAt && (
              <span className="text-xs text-slate-400">
                Last purge: {new Date(retention.lastPurgeAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Log Entries */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center text-slate-500">No audit logs found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500 bg-slate-50">
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Resource</th>
                  <th className="px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b last:border-0 hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      {log.user?.name || log.user?.email || 'System'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${actionColors[log.action] || 'bg-slate-100'}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {log.resourceName || log.resourceType || '-'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-[200px] truncate">
                      {log.details ? JSON.parse(log.details).toString().slice(0, 100) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <span className="text-sm text-slate-500">
              Page {page + 1} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="btn-secondary text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="btn-secondary text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
