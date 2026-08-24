'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Ticket as TicketIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TicketRow {
  id: number;
  subject: string;
  status: string;
  priority: string;
  createdByName: string;
  organizationName?: string | null;
  assignedTo?: { name: string } | null;
  replyCount: number;
  updatedAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  open: 'badge-blue',
  pending: 'badge-yellow',
  resolved: 'badge-green',
  closed: 'badge-slate',
};

export default function TicketsPage() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    setLoading(true);
    const res = await fetch('/api/tickets');
    if (res.ok) setTickets(await res.json());
    setLoading(false);
  };

  const filtered = statusFilter ? tickets.filter((t) => t.status === statusFilter) : tickets;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><TicketIcon className="w-6 h-6" /> Tickets</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">Client requests and internal work items</p>
        </div>
        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input-field w-auto text-sm"
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="pending">Pending</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent)' }} /></div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <TicketIcon className="w-10 h-10 mx-auto mb-3 opacity-40" style={{ color: 'var(--muted)' }} />
          <p className="font-semibold" style={{ color: 'var(--foreground)' }}>No tickets</p>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            Client tickets filed from the portal will appear here.
          </p>
        </div>
      ) : (
        <div className="card divide-y" style={{ borderColor: 'var(--card-border)' }}>
          {filtered.map((t) => (
            <Link
              key={t.id}
              href={`/dashboard/tickets/${t.id}`}
              className="flex items-center gap-4 px-5 py-3.5 hover:bg-[var(--surface-1)] transition-colors"
            >
              <span className="text-xs font-mono w-12 shrink-0" style={{ color: 'var(--muted)' }}>#{t.id}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>{t.subject}</p>
                <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>
                  {[t.organizationName, t.createdByName].filter(Boolean).join(' · ')} · updated{' '}
                  {new Date(t.updatedAt).toLocaleDateString()}
                </p>
              </div>
              <span className={`badge ${cn(STATUS_STYLES[t.status])} shrink-0`}>{t.status}</span>
              <span
                className={`badge shrink-0 ${
                  t.priority === 'urgent' ? 'badge-red' : t.priority === 'high' ? 'badge-yellow' : 'badge-slate'
                }`}
              >
                {t.priority}
              </span>
              {t.replyCount > 0 && (
                <span className="text-xs w-8 text-right shrink-0" style={{ color: 'var(--muted)' }}>{t.replyCount}💬</span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
