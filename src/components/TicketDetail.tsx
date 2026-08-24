'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Send } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TicketDetail {
  id: number;
  subject: string;
  description: string;
  status: string;
  priority: string;
  createdByName: string;
  organizationName?: string | null;
  createdAt: string;
  firstResponseAt?: string | null;
  assignedTo?: { id: string; name: string } | null;
  replies: {
    id: string;
    body: string;
    internal: boolean;
    createdAt: string;
    userName: string;
    isSelf: boolean;
  }[];
}

const SLA_HOURS: Record<string, number> = { urgent: 1, high: 4, medium: 8, low: 24 };

const STATUS_STYLES: Record<string, string> = {
  open: 'badge-blue',
  pending: 'badge-yellow',
  resolved: 'badge-green',
  closed: 'badge-slate',
};

export function TicketDetail({ id, backHref, isStaff }: { id: string; backHref: string; isStaff?: boolean }) {
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [staffMode, setStaffMode] = useState(!!isStaff);
  const [isAdmin, setIsAdmin] = useState(false);
  const [staffUsers, setStaffUsers] = useState<{ id: string; name: string | null; email: string }[]>([]);

  const fetchTicket = useCallback(async () => {
    const res = await fetch(`/api/tickets/${id}`);
    if (res.ok) setTicket(await res.json());
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchTicket();
    if (!isStaff) {
      fetch('/api/me/org-scope')
        .then((r) => r.json())
        .then((d) => setStaffMode(d.mode === 'all'))
        .catch(() => {});
    }
    // Assignment picker is admin-only (user.manage permission)
    fetch('/api/rbac/users')
      .then((r) => (r.ok ? r.json() : []))
      .then((users) => {
        if (Array.isArray(users) && users.length > 0) {
          setIsAdmin(true);
          setStaffUsers(users.filter((u: { role?: string }) => !u.role || u.role !== 'viewer'));
        }
      })
      .catch(() => {});
  }, [fetchTicket, isStaff]);

  const assign = async (userId: string) => {
    await fetch(`/api/tickets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignedToUserId: userId || null }),
    });
    fetchTicket();
  };

  const sendReply = async () => {
    if (sending || !reply.trim()) return;
    setSending(true);
    try {
      await fetch(`/api/tickets/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: reply, internal }),
      });
      setReply('');
      setInternal(false);
      fetchTicket();
    } finally {
      setSending(false);
    }
  };

  const updateStatus = async (status: string) => {
    await fetch(`/api/tickets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    fetchTicket();
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent)' }} /></div>;
  }
  if (!ticket) {
    return <div className="card p-12 text-center text-sm" style={{ color: 'var(--muted)' }}>Ticket not found.</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <Link href={backHref} className="text-xs inline-flex items-center gap-1 hover:underline" style={{ color: 'var(--muted)' }}>
        <ArrowLeft className="w-3 h-3" /> Back
      </Link>

      <div className="card p-6 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-mono" style={{ color: 'var(--muted)' }}>#{ticket.id}</p>
            <h1 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>{ticket.subject}</h1>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
              {[ticket.organizationName, `filed by ${ticket.createdByName}`].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={cn('badge', STATUS_STYLES[ticket.status])}>{ticket.status}</span>
            <span
              className={cn(
                'badge',
                ticket.priority === 'urgent' ? 'badge-red' : ticket.priority === 'high' ? 'badge-yellow' : 'badge-slate',
              )}
            >
              {ticket.priority}
            </span>
            {(() => {
              const target = SLA_HOURS[ticket.priority] ?? 8;
              const ageH = (Date.now() - new Date(ticket.createdAt).getTime()) / 3600000;
              const breached =
                !ticket.firstResponseAt && ageH > target && (ticket.status === 'open' || ticket.status === 'pending');
              if (breached) {
                return <span className="badge badge-red">SLA breached {Math.floor(ageH - target)}h</span>;
              }
              if (!ticket.firstResponseAt && (ticket.status === 'open' || ticket.status === 'pending')) {
                return <span className="badge badge-slate">SLA {Math.max(0, Math.ceil(target - ageH))}h left</span>;
              }
              return null;
            })()}
          </div>
        </div>
        {staffMode && (
          <div className="flex items-center gap-2 text-xs flex-wrap" style={{ color: 'var(--muted)' }}>
            <span>Assignee:</span>
            {isAdmin ? (
              <select
                aria-label="Assign to"
                value={ticket.assignedTo?.id || ''}
                onChange={(e) => assign(e.target.value)}
                className="input-field w-auto text-xs py-1"
              >
                <option value="">Unassigned</option>
                {staffUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name || u.email}</option>
                ))}
              </select>
            ) : (
              <span className="font-medium" style={{ color: 'var(--foreground)' }}>
                {ticket.assignedTo?.name || 'Unassigned'}
              </span>
            )}
          </div>
        )}
        <div className="pt-2 border-t text-sm whitespace-pre-wrap" style={{ borderColor: 'var(--card-border)', color: 'var(--foreground)' }}>
          {ticket.description}
        </div>

        {staffMode && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t" style={{ borderColor: 'var(--card-border)' }}>
            <span className="text-xs font-medium mr-1" style={{ color: 'var(--muted)' }}>Set status:</span>
            {['open', 'pending', 'resolved', 'closed'].map((s) => (
              <button
                key={s}
                onClick={() => updateStatus(s)}
                disabled={s === ticket.status}
                className={cn(
                  'text-xs px-2.5 py-1 rounded-md border transition-colors',
                  s === ticket.status && 'opacity-50 cursor-default',
                )}
                style={{ color: 'var(--foreground)', borderColor: 'var(--card-border)' }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {!staffMode && ticket.status !== 'closed' && (
          <button onClick={() => updateStatus('closed')} className="text-xs hover:underline" style={{ color: 'var(--muted)' }}>
            Close this ticket
          </button>
        )}
      </div>

      <div className="space-y-3">
        {ticket.replies.map((r) => (
          <div
            key={r.id}
            className="card p-4"
            style={
              r.internal
                ? { borderLeft: '3px solid #f59e0b' }
                : r.isSelf
                  ? {}
                  : { borderLeft: '3px solid var(--accent)' }
            }
          >
            <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
              <span className="text-xs font-semibold" style={{ color: 'var(--foreground)' }}>
                {r.userName}
                {r.internal && <span className="badge badge-yellow ml-2">internal note</span>}
              </span>
              <span className="text-[10px]" style={{ color: 'var(--muted)' }}>
                {new Date(r.createdAt).toLocaleString()}
              </span>
            </div>
            <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--foreground)' }}>{r.body}</p>
          </div>
        ))}
      </div>

      {ticket.status !== 'closed' ? (
        <div className="card p-4 space-y-3">
          <textarea
            className="input-field min-h-[90px]"
            placeholder="Write a reply…"
            aria-label="Reply"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
          />
          <div className="flex items-center justify-between">
            {staffMode ? (
              <label className="text-xs flex items-center gap-1.5 select-none" style={{ color: 'var(--muted)' }}>
                <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="w-3.5 h-3.5 accent-current" />
                Internal note (hidden from client)
              </label>
            ) : <span />}
            <button onClick={sendReply} disabled={sending || !reply.trim()} className="btn-primary inline-flex items-center gap-2 text-sm">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send reply
            </button>
          </div>
        </div>
      ) : (
        <p className="text-center text-sm py-4" style={{ color: 'var(--muted)' }}>This ticket is closed.</p>
      )}
    </div>
  );
}
