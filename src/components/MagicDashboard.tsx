'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Globe, ShieldCheck, CalendarClock, Ticket, Server, FileText,
  AlertTriangle, Activity,
} from 'lucide-react';

const KIND_META: Record<string, { icon: typeof Globe; label: string; hrefPrefix?: string }> = {
  domain: { icon: Globe, label: 'Domain', hrefPrefix: '/dashboard/domains' },
  ssl: { icon: ShieldCheck, label: 'SSL cert', hrefPrefix: '/dashboard/ssl' },
  renewal: { icon: CalendarClock, label: 'Renewal', hrefPrefix: '/dashboard/renewals' },
};

interface Pulse {
  generatedAt: string;
  expiringSoon: { kind: 'domain' | 'ssl' | 'renewal'; name: string; date: string; daysLeft: number; cost?: number | null }[];
  tickets: { open: number; breached: number; oldestOpenDays: number };
  offlineAgents: { id: string; name: string; hoursSilent: number }[];
  staleDocs: { id: string; title: string; daysSinceUpdate: number }[];
}

function daysTone(days: number): string {
  if (days <= 7) return 'badge-red';
  if (days <= 14) return 'badge-amber';
  return 'badge-slate';
}

export function MagicDashboard({ orgId }: { orgId: string }) {
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/organizations/${orgId}/pulse`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setPulse(d);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  if (loading) {
    return <div className="card p-8 text-center text-sm" style={{ color: 'var(--muted)' }}>Reading the pulse…</div>;
  }
  if (!pulse) {
    return <div className="card p-8 text-center text-sm" style={{ color: 'var(--muted)' }}>Pulse unavailable.</div>;
  }

  const attention =
    pulse.expiringSoon.filter((e) => e.daysLeft <= 7).length +
    pulse.tickets.breached +
    pulse.offlineAgents.length;

  return (
    <div className="space-y-6">
      {/* Headline */}
      <div
        className="card p-5 flex items-center gap-4"
        style={attention > 0 ? { borderLeft: '3px solid var(--danger)' } : { borderLeft: '3px solid var(--success)' }}
      >
        <Activity className="w-6 h-6" style={{ color: attention > 0 ? 'var(--danger)' : 'var(--success)' }} />
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
            {attention > 0 ? `${attention} item${attention === 1 ? '' : 's'} need attention today` : 'All quiet — nothing urgent'}
          </p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Pulse as of {new Date(pulse.generatedAt).toLocaleTimeString()}
          </p>
        </div>
      </div>

      {/* Tickets */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4">
          <p className="text-xs flex items-center gap-1.5 mb-1" style={{ color: 'var(--muted)' }}><Ticket className="w-3.5 h-3.5" /> Open tickets</p>
          <p className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>{pulse.tickets.open}</p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Oldest open {pulse.tickets.oldestOpenDays}d</p>
        </div>
        <div className="card p-4">
          <p className="text-xs flex items-center gap-1.5 mb-1" style={{ color: 'var(--muted)' }}><AlertTriangle className="w-3.5 h-3.5" /> SLA breached</p>
          <p className="text-2xl font-bold" style={{ color: pulse.tickets.breached > 0 ? 'var(--danger)' : 'var(--foreground)' }}>
            {pulse.tickets.breached}
          </p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>awaiting first response</p>
        </div>
        <div className="card p-4">
          <p className="text-xs flex items-center gap-1.5 mb-1" style={{ color: 'var(--muted)' }}><Server className="w-3.5 h-3.5" /> Offline agents</p>
          <p className="text-2xl font-bold" style={{ color: pulse.offlineAgents.length > 0 ? 'var(--warning)' : 'var(--foreground)' }}>
            {pulse.offlineAgents.length}
          </p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>silent &gt; 24h</p>
        </div>
      </div>

      {/* Expiring soon */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--foreground)' }}>Expiring within 30 days</h3>
        {pulse.expiringSoon.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Nothing expires soon.</p>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--card-border)' }}>
            {pulse.expiringSoon.map((e, i) => {
              const meta = KIND_META[e.kind];
              const Icon = meta?.icon ?? Globe;
              return (
                <li key={`${e.kind}-${i}`} className="flex items-center gap-3 py-2">
                  <Icon className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
                  <span className="text-sm truncate flex-1" style={{ color: 'var(--foreground)' }}>{e.name}</span>
                  {e.cost != null && (
                    <span className="text-xs hidden sm:block" style={{ color: 'var(--muted)' }}>${e.cost.toLocaleString()}</span>
                  )}
                  <span className={`badge ${daysTone(e.daysLeft)} shrink-0`}>{e.daysLeft <= 0 ? 'expired' : `${e.daysLeft}d`}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Stale docs + offline agents */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5" style={{ color: 'var(--foreground)' }}>
            <FileText className="w-4 h-4" style={{ color: 'var(--accent)' }} /> Stale documentation
          </h3>
          {pulse.staleDocs.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>All docs reviewed within 180 days.</p>
          ) : (
            <ul className="space-y-1.5">
              {pulse.staleDocs.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2">
                  <Link href={`/dashboard/documents/${d.id}`} className="text-xs truncate hover:underline" style={{ color: 'var(--foreground)' }}>
                    {d.title}
                  </Link>
                  <span className="badge badge-amber shrink-0">{d.daysSinceUpdate}d old</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card p-5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5" style={{ color: 'var(--foreground)' }}>
            <Server className="w-4 h-4" style={{ color: 'var(--accent)' }} /> Agents offline
          </h3>
          {pulse.offlineAgents.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>All agents phoning home.</p>
          ) : (
            <ul className="space-y-1.5">
              {pulse.offlineAgents.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2">
                  <Link href={`/dashboard/servers/${a.id}`} className="text-xs truncate hover:underline" style={{ color: 'var(--foreground)' }}>
                    {a.name}
                  </Link>
                  <span className="badge badge-yellow shrink-0">{a.hoursSilent}h silent</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
