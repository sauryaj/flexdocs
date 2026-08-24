'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Ticket, FileText, Globe, ShieldCheck, CalendarClock, Server,
  AlertTriangle, Inbox, ArrowRight, Sparkles,
} from 'lucide-react';

interface TicketItem {
  id: number;
  subject: string;
  priority: string;
  status: string;
  organizationName: string | null;
  ageHours: number;
  slaBreached: boolean;
}

interface Pulse {
  generatedAt: string;
  ticketsAssigned: TicketItem[];
  ticketsUnassignedBreached: TicketItem[];
  reviewsDue: { id: string; title: string; daysOverdue: number | null }[];
  expiringSoon: { kind: 'domain' | 'ssl' | 'renewal'; id: string; name: string; date: string; daysLeft: number; cost?: number | null }[];
  offlineAgents: { id: string; name: string; hoursSilent: number | null }[];
}

const KIND_ICON = { domain: Globe, ssl: ShieldCheck, renewal: CalendarClock };
const KIND_HREF = { domain: '/dashboard/domains', ssl: '/dashboard/ssl', renewal: '/dashboard/renewals' };

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

function TicketRow({ t }: { t: TicketItem }) {
  return (
    <Link
      href={`/dashboard/tickets/${t.id}`}
      className="flex items-center gap-3 py-2 px-2 rounded-lg transition-colors hover:bg-[var(--surface-2)]"
    >
      <span className={`badge shrink-0 ${t.slaBreached ? 'badge-red' : 'badge-slate'}`}>
        {t.priority}
      </span>
      <span className="text-sm truncate flex-1" style={{ color: 'var(--foreground)' }}>{t.subject}</span>
      {t.organizationName && (
        <span className="text-xs hidden sm:block truncate max-w-40" style={{ color: 'var(--muted)' }}>{t.organizationName}</span>
      )}
      <span className="text-xs shrink-0" style={{ color: 'var(--muted)' }}>{t.ageHours}h</span>
      <ArrowRight className="w-3.5 h-3.5 shrink-0 opacity-40" style={{ color: 'var(--muted)' }} />
    </Link>
  );
}

export default function MyDayPage() {
  const [data, setData] = useState<Pulse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/me/my-day')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="card p-8 text-center text-sm" style={{ color: 'var(--muted)' }}>Assembling your day…</div>;
  }
  if (!data) {
    return <div className="card p-8 text-center text-sm" style={{ color: 'var(--muted)' }}>Could not load your queue.</div>;
  }

  const breachedAssigned = data.ticketsAssigned.filter((t) => t.slaBreached).sort(
    (a, b) => (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3),
  );
  const restAssigned = data.ticketsAssigned.filter((t) => !t.slaBreached).sort(
    (a, b) => (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3),
  );

  const attention =
    breachedAssigned.length +
    data.ticketsUnassignedBreached.length +
    data.offlineAgents.length +
    data.reviewsDue.length +
    data.expiringSoon.filter((e) => e.daysLeft <= 2).length;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Headline */}
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--foreground)' }}>
            {greeting} <Sparkles className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          </h1>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {attention > 0
              ? `${attention} thing${attention === 1 ? '' : 's'} need your attention today.`
              : 'Nothing urgent today. Good time to get ahead.'}
          </p>
        </div>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          as of {new Date(data.generatedAt).toLocaleTimeString()}
        </p>
      </div>

      {/* SLA-breached assigned */}
      {breachedAssigned.length > 0 && (
        <div className="card p-5" style={{ borderLeft: '3px solid var(--danger)' }}>
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'var(--foreground)' }}>
            <AlertTriangle className="w-4 h-4" style={{ color: 'var(--danger)' }} />
            Your tickets past SLA ({breachedAssigned.length})
          </h2>
          {breachedAssigned.map((t) => <TicketRow key={t.id} t={t} />)}
        </div>
      )}

      {/* Unassigned breaches — staff triage */}
      {data.ticketsUnassignedBreached.length > 0 && (
        <div className="card p-5" style={{ borderLeft: '3px solid var(--warning)' }}>
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'var(--foreground)' }}>
            <Ticket className="w-4 h-4" style={{ color: 'var(--warning)' }} />
            Unassigned &amp; breaching ({data.ticketsUnassignedBreached.length})
          </h2>
          {data.ticketsUnassignedBreached.map((t) => <TicketRow key={t.id} t={t} />)}
        </div>
      )}

      {/* Assigned queue */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'var(--foreground)' }}>
          <Ticket className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          Assigned to you ({data.ticketsAssigned.length})
        </h2>
        {data.ticketsAssigned.length === 0 ? (
          <p className="text-xs flex items-center gap-1.5 py-2" style={{ color: 'var(--muted)' }}>
            <Inbox className="w-3.5 h-3.5" /> Empty queue.
          </p>
        ) : (
          restAssigned.map((t) => <TicketRow key={t.id} t={t} />)
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Expiries this week */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5" style={{ color: 'var(--foreground)' }}>
            <CalendarClock className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            Expiring within 7 days
          </h2>
          {data.expiringSoon.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Quiet week ahead.</p>
          ) : (
            <ul className="space-y-2">
              {data.expiringSoon.map((e) => {
                const Icon = KIND_ICON[e.kind];
                return (
                  <li key={`${e.kind}-${e.id}`} className="flex items-center gap-2">
                    <Link href={`${KIND_HREF[e.kind]}/${e.id}`} className="flex items-center gap-2 min-w-0 flex-1 group">
                      <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent)' }} />
                      <span className="text-sm truncate group-hover:underline" style={{ color: 'var(--foreground)' }}>{e.name}</span>
                    </Link>
                    {e.cost != null && (
                      <span className="text-xs hidden sm:block" style={{ color: 'var(--muted)' }}>${e.cost.toLocaleString()}</span>
                    )}
                    <span className={`badge shrink-0 ${e.daysLeft <= 2 ? 'badge-red' : 'badge-yellow'}`}>{e.daysLeft}d</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="space-y-6">
          {/* Reviews due */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5" style={{ color: 'var(--foreground)' }}>
              <FileText className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              Docs due for review ({data.reviewsDue.length})
            </h2>
            {data.reviewsDue.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--muted)' }}>All reviews current.</p>
            ) : (
              <ul className="space-y-2">
                {data.reviewsDue.slice(0, 8).map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2">
                    <Link href={`/dashboard/documents/${d.id}`} className="text-sm truncate hover:underline" style={{ color: 'var(--foreground)' }}>
                      {d.title}
                    </Link>
                    <span className="badge badge-amber shrink-0">{d.daysOverdue ?? 0}d overdue</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Offline agents */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5" style={{ color: 'var(--foreground)' }}>
              <Server className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              Agents offline ({data.offlineAgents.length})
            </h2>
            {data.offlineAgents.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--muted)' }}>All agents reporting.</p>
            ) : (
              <ul className="space-y-2">
                {data.offlineAgents.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2">
                    <Link href={`/dashboard/servers/${a.id}`} className="text-sm truncate hover:underline" style={{ color: 'var(--foreground)' }}>
                      {a.name}
                    </Link>
                    <span className="badge badge-red shrink-0">{a.hoursSilent ?? '?'}h silent</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
