'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, Globe, ShieldAlert, BookOpen, Server, ArrowRight, CalendarClock, Ticket as TicketIcon } from 'lucide-react';

interface Summary {
  orgs: { id: string; name: string }[];
  serverCount: number;
  kb: { id: string; title: string; updatedAt: string }[];
  expiries: { kind: string; name: string; when: string; days: number | null }[];
}

export default function ClientPortalPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/portal/summary')
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="py-16 text-center text-sm" style={{ color: 'var(--muted)' }}>Loading portal…</div>;
  }
  if (!data || data.orgs.length === 0) {
    return (
      <div className="card p-12 text-center max-w-xl mx-auto mt-10">
        <ShieldAlert className="w-10 h-10 mx-auto mb-3 opacity-40" style={{ color: 'var(--muted)' }} />
        <h1 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>No organization linked</h1>
        <p className="text-sm mt-2" style={{ color: 'var(--muted)' }}>
          Your account isn&apos;t a member of any organization yet. Ask your IT provider to grant you access.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" style={{ color: 'var(--foreground)' }}>
          <Building2 className="w-6 h-6" /> Client Portal
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
          {data.orgs.map((o) => o.name).join(', ')}
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Knowledge articles', value: data.kb.length, icon: BookOpen },
          { label: 'Expiring in 90 days', value: data.expiries.length, icon: CalendarClock },
          { label: 'Managed servers', value: data.serverCount, icon: Server },
          { label: 'Organizations', value: data.orgs.length, icon: Building2 },
        ].map((s) => (
          <div key={s.label} className="card p-5">
            <s.icon className="w-5 h-5 mb-2" style={{ color: 'var(--accent)' }} />
            <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--foreground)' }}>{s.value}</p>
            <p className="text-xs font-medium" style={{ color: 'var(--muted)' }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Expiries */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 border-b flex items-center gap-2" style={{ borderColor: 'var(--card-border)' }}>
          <Globe className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <h2 className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>Upcoming expiries & renewals</h2>
        </div>
        <div className="divide-y" style={{ borderColor: 'var(--card-border)' }}>
          {data.expiries.length === 0 ? (
            <p className="px-5 py-6 text-sm text-center" style={{ color: 'var(--muted)' }}>
              Nothing expires in the next 90 days.
            </p>
          ) : (
            data.expiries.slice(0, 10).map((e, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="badge shrink-0"
                    style={{
                      backgroundColor: e.kind === 'domain' ? 'rgba(139,92,246,.12)' : e.kind === 'ssl' ? 'rgba(245,158,11,.12)' : 'rgba(59,130,246,.12)',
                      color: e.kind === 'domain' ? '#8b5cf6' : e.kind === 'ssl' ? '#f59e0b' : '#3b82f6',
                    }}
                  >
                    {e.kind}
                  </span>
                  <span className="text-sm truncate" style={{ color: 'var(--foreground)' }}>{e.name}</span>
                </div>
                <span className={`text-xs font-semibold shrink-0 ml-3 ${e.days! <= 30 ? 'text-red-500' : ''}`}>
                  {e.days}d
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Support */}
      <Link
        href="/dashboard/portal/tickets"
        className="card px-5 py-4 flex items-center justify-between gap-3 transition-colors hover:bg-[var(--surface-1)]"
      >
        <div className="flex items-center gap-3">
          <TicketIcon className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>Need help? Open a support ticket</p>
        </div>
        <ArrowRight className="w-4 h-4 shrink-0" style={{ color: 'var(--muted)' }} />
      </Link>

      {/* Knowledge base */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--card-border)' }}>
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <h2 className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>Knowledge base</h2>
          </div>
          <Link href="/dashboard/portal/kb" className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>
            View all →
          </Link>        </div>
        <div className="divide-y" style={{ borderColor: 'var(--card-border)' }}>
          {data.kb.length === 0 ? (
            <p className="px-5 py-6 text-sm text-center" style={{ color: 'var(--muted)' }}>No published articles yet.</p>
          ) : (
            data.kb.slice(0, 5).map((a) => (
              <Link key={a.id} href={`/dashboard/portal/kb/${a.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-[var(--surface-1)] transition-colors">
                <span className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>{a.title}</span>
                <ArrowRight className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--muted)' }} />
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
