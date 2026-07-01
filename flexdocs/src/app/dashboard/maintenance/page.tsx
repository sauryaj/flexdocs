'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  CalendarClock, Plus, Search, Trash2, Clock, AlertTriangle, CheckCircle, XCircle,
} from 'lucide-react';
import { formatDate, cn } from '@/lib/utils';
import { EmptyState, ConfirmDialog } from '@/components/UIComponents';
import { useOrganization } from '@/lib/OrganizationContext';

interface MaintenanceWindowEntry {
  id: string;
  name: string;
  description: string | null;
  startTime: string;
  endTime: string;
  recurrence: string | null;
  status: string;
  priority: string;
  impact: string | null;
  affectedSystems: string;
  createdAt: string;
  updatedAt: string;
  tags: { id: string; name: string; color: string }[];
}

const statusConfig: Record<string, { icon: any; color: string }> = {
  scheduled: { icon: Clock, color: '#3b82f6' },
  'in-progress': { icon: AlertTriangle, color: '#f59e0b' },
  completed: { icon: CheckCircle, color: '#10b981' },
  cancelled: { icon: XCircle, color: '#6b7280' },
};

const priorityColors: Record<string, string> = {
  low: '#6b7280',
  medium: '#3b82f6',
  high: '#f59e0b',
  critical: '#ef4444',
};

export default function MaintenancePage() {
  const { selectedOrg } = useOrganization();
  const [windows, setWindows] = useState<MaintenanceWindowEntry[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => { fetchWindows(); }, [selectedOrg]);

  const fetchWindows = async () => {
    const params = new URLSearchParams();
    if (selectedOrg?.id) params.set('organizationId', selectedOrg.id);
    const res = await fetch(`/api/maintenance?${params.toString()}`);
    const data = await res.json();
    setWindows(data);
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await fetch(`/api/maintenance/${deleteId}`, { method: 'DELETE' });
    setWindows(windows.filter((w) => w.id !== deleteId));
    setDeleteId(null);
  };

  const filtered = windows.filter((w) => {
    const matchesSearch = w.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || w.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--foreground)' }}>Maintenance Windows</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            {selectedOrg ? `${selectedOrg.name} — ` : ''}Scheduled maintenance tracking
          </p>
        </div>
        <Link href="/dashboard/maintenance/new" className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Schedule
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted)' }} />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-10"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input-field w-auto"
        >
          <option value="all">All Status</option>
          <option value="scheduled">Scheduled</option>
          <option value="in-progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="card p-5 h-24 animate-shimmer" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="w-10 h-10" />}
          title="No maintenance windows"
          description="Schedule and track maintenance windows."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((w) => {
            const cfg = statusConfig[w.status] || statusConfig.scheduled;
            const Icon = cfg.icon;
            const start = new Date(w.startTime);
            const end = new Date(w.endTime);
            return (
              <Link
                key={w.id}
                href={`/dashboard/maintenance/${w.id}`}
                className="card card-interactive p-5 flex items-center gap-4"
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${cfg.color}15` }}
                >
                  <Icon className="w-5 h-5" style={{ color: cfg.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>{w.name}</p>
                    <span
                      className="badge"
                      style={{ backgroundColor: `${priorityColors[w.priority]}15`, color: priorityColors[w.priority] }}
                    >
                      {w.priority}
                    </span>
                    <span
                      className="badge"
                      style={{ backgroundColor: `${cfg.color}15`, color: cfg.color }}
                    >
                      {w.status}
                    </span>
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                    {start.toLocaleDateString()} {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {' — '}
                    {end.toLocaleDateString()} {end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {w.recurrence ? ` (${w.recurrence})` : ''}
                  </p>
                </div>
                <button
                  onClick={(e) => { e.preventDefault(); setDeleteId(w.id); }}
                  className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 hover:text-red-600"
                  style={{ color: 'var(--muted)' }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </Link>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Maintenance Window"
        message="This action cannot be undone."
      />
    </div>
  );
}
