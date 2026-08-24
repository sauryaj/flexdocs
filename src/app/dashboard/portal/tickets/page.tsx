'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Ticket as TicketIcon, Plus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOrganization } from '@/lib/OrganizationContext';

interface TicketRow {
  id: number;
  subject: string;
  status: string;
  priority: string;
  replyCount: number;
  updatedAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  open: 'badge-blue',
  pending: 'badge-yellow',
  resolved: 'badge-green',
  closed: 'badge-slate',
};

export default function PortalTicketsPage() {
  const { selectedOrg } = useOrganization();
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ subject: '', description: '', priority: 'medium' });

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tickets');
      if (res.ok) setTickets(await res.json());
    } finally {
      setLoading(false);
    }
  };

  const createTicket = async () => {
    if (sending || !form.subject.trim() || !form.description.trim()) return;
    setSending(true);
    try {
      await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, organizationId: selectedOrg?.id }),
      });
      setForm({ subject: '', description: '', priority: 'medium' });
      setShowForm(false);
      fetchTickets();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" style={{ color: 'var(--foreground)' }}>
            <TicketIcon className="w-6 h-6" /> Support Tickets
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Requests to your IT provider</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary inline-flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> New ticket
        </button>
      </div>

      {showForm && (
        <div className="card p-4 space-y-3">
          <input
            className="input-field"
            placeholder="Subject"
            aria-label="Subject"
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
          />
          <textarea
            className="input-field min-h-[110px]"
            placeholder="Describe the issue…"
            aria-label="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div className="flex items-center justify-between gap-3">
            <select
              className="input-field w-auto text-sm"
              aria-label="Priority"
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <button onClick={createTicket} disabled={sending} className="btn-primary inline-flex items-center gap-2 text-sm">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Submit ticket
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent)' }} /></div>
      ) : tickets.length === 0 ? (
        <div className="card p-12 text-center">
          <TicketIcon className="w-10 h-10 mx-auto mb-3 opacity-40" style={{ color: 'var(--muted)' }} />
          <p className="font-semibold" style={{ color: 'var(--foreground)' }}>No tickets yet</p>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>File one above and your provider will respond.</p>
        </div>
      ) : (
        <div className="card divide-y" style={{ borderColor: 'var(--card-border)' }}>
          {tickets.map((t) => (
            <Link key={t.id} href={`/dashboard/portal/tickets/${t.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-[var(--surface-1)] transition-colors">
              <span className="text-xs font-mono w-12 shrink-0" style={{ color: 'var(--muted)' }}>#{t.id}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>{t.subject}</p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>updated {new Date(t.updatedAt).toLocaleDateString()}</p>
              </div>
              <span className={cn('badge shrink-0', STATUS_STYLES[t.status])}>{t.status}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
