'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  FileText,
  Key,
  Globe,
  AlertTriangle,
  ArrowRight,
  Shield,
} from 'lucide-react';
import { formatDate, getDaysUntilExpiry } from '@/lib/utils';
import { useOrganization } from '@/lib/OrganizationContext';

interface DashboardData {
  docCount: number;
  passCount: number;
  domainCount: number;
  expiringDomains: any[];
  recentDocs: any[];
  recentPasswords: any[];
}

export default function DashboardPage() {
  const { selectedOrg } = useOrganization();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedOrg?.id) {
      params.set('organizationId', selectedOrg.id);
    }
    fetch(`/api/dashboard?${params.toString()}`)
      .then((res) => res.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedOrg]);

  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <div className="h-8 w-48 rounded-lg animate-shimmer" />
          <div className="h-4 w-64 rounded-lg mt-2 animate-shimmer" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card p-5">
              <div className="h-11 w-11 rounded-xl animate-shimmer" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--foreground)' }}>
            Dashboard
          </h1>
          <p style={{ color: 'var(--muted)' }}>Welcome to FlexDocs</p>
        </div>
      </div>
    );
  }

  const { docCount, passCount, domainCount, expiringDomains, recentDocs, recentPasswords } = data;

  const stats = [
    {
      label: 'Documents',
      value: docCount,
      icon: FileText,
      color: '#3b82f6',
      bg: 'rgba(59, 130, 246, 0.08)',
      href: '/dashboard/documents',
    },
    {
      label: 'Passwords',
      value: passCount,
      icon: Shield,
      color: '#10b981',
      bg: 'rgba(16, 185, 129, 0.08)',
      href: '/dashboard/passwords',
    },
    {
      label: 'Domains',
      value: domainCount,
      icon: Globe,
      color: '#8b5cf6',
      bg: 'rgba(139, 92, 246, 0.08)',
      href: '/dashboard/domains',
    },
    {
      label: 'Expiring Soon',
      value: expiringDomains.length,
      icon: AlertTriangle,
      color: '#f59e0b',
      bg: 'rgba(245, 158, 11, 0.08)',
      href: '/dashboard/domains',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--foreground)', letterSpacing: '-0.025em' }}>
          Dashboard
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
          {selectedOrg ? `${selectedOrg.name} — overview` : 'All organizations — overview'}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="group card card-interactive p-5"
          >
            <div className="flex items-center gap-4">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center transition-transform duration-200 group-hover:scale-110"
                style={{ backgroundColor: stat.bg }}
              >
                <stat.icon className="w-5 h-5" style={{ color: stat.color }} />
              </div>
              <div>
                <p
                  className="text-3xl font-bold tracking-tight"
                  style={{ color: 'var(--foreground)' }}
                >
                  {stat.value}
                </p>
                <p
                  className="text-sm font-medium"
                  style={{ color: 'var(--muted)' }}
                >
                  {stat.label}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Documents */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--card-border)' }}>
            <h2 className="font-semibold" style={{ color: 'var(--foreground)' }}>Recent Documents</h2>
            <Link
              href="/dashboard/documents"
              className="text-xs font-medium flex items-center gap-1 transition-colors hover:gap-2"
              style={{ color: 'var(--accent)' }}
            >
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--card-border)' }}>
            {recentDocs.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <FileText className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--muted)', opacity: 0.4 }} />
                <p className="text-sm" style={{ color: 'var(--muted)' }}>No documents yet</p>
              </div>
            ) : (
              recentDocs.map((doc) => (
                <Link
                  key={doc.id}
                  href={`/dashboard/documents/${doc.id}`}
                  className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-[var(--surface-2)]"
                >
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(59, 130, 246, 0.08)' }}>
                    <FileText className="w-4 h-4" style={{ color: '#3b82f6' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>{doc.title}</p>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>{formatDate(doc.updatedAt)}</p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Recent Passwords */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--card-border)' }}>
            <h2 className="font-semibold" style={{ color: 'var(--foreground)' }}>Recent Passwords</h2>
            <Link
              href="/dashboard/passwords"
              className="text-xs font-medium flex items-center gap-1 transition-colors hover:gap-2"
              style={{ color: 'var(--accent)' }}
            >
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--card-border)' }}>
            {recentPasswords.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <Key className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--muted)', opacity: 0.4 }} />
                <p className="text-sm" style={{ color: 'var(--muted)' }}>No passwords yet</p>
              </div>
            ) : (
              recentPasswords.map((pass) => (
                <Link
                  key={pass.id}
                  href={`/dashboard/passwords/${pass.id}`}
                  className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-[var(--surface-2)]"
                >
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(16, 185, 129, 0.08)' }}>
                    <Key className="w-4 h-4" style={{ color: '#10b981' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>{pass.name}</p>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>{pass.username}</p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Expiring Domains Alert */}
      {expiringDomains.length > 0 && (
        <div
          className="card overflow-hidden"
          style={{
            border: '1px solid rgba(245, 158, 11, 0.2)',
            backgroundColor: 'var(--warning-light)',
          }}
        >
          <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(245, 158, 11, 0.15)' }}>
            <AlertTriangle className="w-4 h-4" style={{ color: 'var(--warning)' }} />
            <h2 className="font-semibold" style={{ color: 'var(--warning)' }}>Domains Expiring Soon</h2>
          </div>
          <div className="divide-y" style={{ borderColor: 'rgba(245, 158, 11, 0.1)' }}>
            {expiringDomains.map((domain) => {
              const daysLeft = domain.expiresAt ? getDaysUntilExpiry(domain.expiresAt) : 0;
              return (
                <Link
                  key={domain.id}
                  href={`/dashboard/domains/${domain.id}`}
                  className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-[var(--warning-light)]"
                >
                  <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{domain.name}</span>
                  <span className={`badge ${daysLeft < 7 ? 'badge-red' : 'badge-yellow'}`}>
                    {daysLeft} days left
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
