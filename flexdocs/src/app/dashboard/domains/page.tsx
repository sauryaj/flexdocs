'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  Globe,
  Plus,
  Search,
  Trash2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Upload,
  RefreshCw,
  Shield,
  Lock,
  Building2,
  FileDown,
} from 'lucide-react';
import { formatDate, getDaysUntilExpiry, cn } from '@/lib/utils';
import { EmptyState, ConfirmDialog, Modal } from '@/components/UIComponents';
import { useOrganization } from '@/lib/OrganizationContext';

interface Domain {
  id: string;
  name: string;
  registrar: string | null;
  nameservers: string | null;
  expiresAt: string | null;
  autoRenew: boolean;
  status: string;
  notes: string | null;
  organizationId: string | null;
  privacyProtection?: boolean;
  createdAt: string;
  updatedAt: string;
  tags: { id: string; name: string; color: string }[];
  sslCertificates?: { id: string; hostname: string }[];
  organization?: { id: string; name: string } | null;
}

type GroupMode = 'all' | 'registrar' | 'tld' | 'expiry' | 'organization';

const TABS: { key: GroupMode; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'registrar', label: 'By Registrar' },
  { key: 'tld', label: 'By TLD' },
  { key: 'expiry', label: 'By Expiry Month' },
  { key: 'organization', label: 'By Organization' },
];

function getExpiryStatus(domain: Domain) {
  if (domain.status === 'expired' || domain.status === 'suspended') {
    return { badge: 'badge-red', label: domain.status };
  }
  if (domain.expiresAt) {
    const daysLeft = getDaysUntilExpiry(domain.expiresAt);
    if (daysLeft < 0) {
      return { badge: 'badge-red', label: 'Expired' };
    }
    if (daysLeft < 30) {
      return { badge: 'badge-red', label: `${daysLeft}d left` };
    }
    if (daysLeft < 90) {
      return { badge: 'badge-yellow', label: `${daysLeft}d left` };
    }
    return { badge: 'badge-green', label: `${daysLeft}d left` };
  }
  return { badge: 'badge-green', label: 'Active' };
}

function getStatusBadge(domain: Domain) {
  if (domain.status === 'expired' || domain.status === 'suspended') {
    return { icon: XCircle, className: 'text-red-500', badge: 'badge-red', label: domain.status };
  }
  if (domain.expiresAt) {
    const daysLeft = getDaysUntilExpiry(domain.expiresAt);
    if (daysLeft < 0) {
      return { icon: XCircle, className: 'text-red-500', badge: 'badge-red', label: 'Expired' };
    }
    if (daysLeft < 30) {
      return { icon: AlertTriangle, className: 'text-amber-500', badge: 'badge-yellow', label: 'Expiring' };
    }
  }
  return { icon: CheckCircle, className: 'text-green-500', badge: 'badge-green', label: 'Active' };
}

function extractTld(name: string): string {
  const parts = name.split('.');
  return '.' + (parts.length > 1 ? parts[parts.length - 1] : 'unknown');
}

function formatExpiryMonth(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

export default function DomainsPage() {
  const { selectedOrg } = useOrganization();
  const [domains, setDomains] = useState<Domain[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [registrarFilter, setRegistrarFilter] = useState('all');
  const [organizationFilter, setOrganizationFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [groupMode, setGroupMode] = useState<GroupMode>('all');

  const [importOpen, setImportOpen] = useState(false);
  const [, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [importing, setImporting] = useState(false);

  const [bulkWhoisActive, setBulkWhoisActive] = useState(false);
  const [bulkWhoisProgress, setBulkWhoisProgress] = useState({ done: 0, total: 0 });

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchDomains();
  }, [selectedOrg]);

  const fetchDomains = async () => {
    const params = new URLSearchParams();
    if (selectedOrg?.id) {
      params.set('organizationId', selectedOrg.id);
    }
    const res = await fetch(`/api/domains?${params.toString()}`);
    const data = await res.json();
    setDomains(data.items || data);
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await fetch(`/api/domains/${deleteId}`, { method: 'DELETE' });
    setDomains(domains.filter((d) => d.id !== deleteId));
    setDeleteId(null);
  };

  const registrars = useMemo(
    () => [...new Set(domains.map((d) => d.registrar).filter(Boolean))] as string[],
    [domains]
  );

  const organizations = useMemo(() => {
    const map = new Map<string, string>();
    domains.forEach((d) => {
      if (d.organizationId && d.organization) {
        map.set(d.organizationId, d.organization.name);
      }
    });
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [domains]);

  const filtered = useMemo(() => {
    return domains.filter((d) => {
      const matchesSearch = d.name.toLowerCase().includes(search.toLowerCase());
      const matchesStatus =
        statusFilter === 'all' ||
        d.status === statusFilter ||
        (statusFilter === 'expiring' &&
          d.expiresAt &&
          getDaysUntilExpiry(d.expiresAt) >= 0 &&
          getDaysUntilExpiry(d.expiresAt) < 30) ||
        (statusFilter === 'active' &&
          d.status === 'active' &&
          (!d.expiresAt || getDaysUntilExpiry(d.expiresAt) >= 30));
      const matchesRegistrar = registrarFilter === 'all' || d.registrar === registrarFilter;
      const matchesOrg =
        organizationFilter === 'all' || (d.organizationId ?? 'none') === organizationFilter;
      return matchesSearch && matchesStatus && matchesRegistrar && matchesOrg;
    });
  }, [domains, search, statusFilter, registrarFilter, organizationFilter]);

  const groupedData = useMemo(() => {
    if (groupMode === 'all') return { All: filtered };

    const groups: Record<string, Domain[]> = {};

    if (groupMode === 'registrar') {
      filtered.forEach((d) => {
        const key = d.registrar || 'No Registrar';
        if (!groups[key]) groups[key] = [];
        groups[key].push(d);
      });
    } else if (groupMode === 'tld') {
      filtered.forEach((d) => {
        const key = extractTld(d.name);
        if (!groups[key]) groups[key] = [];
        groups[key].push(d);
      });
    } else if (groupMode === 'expiry') {
      filtered.forEach((d) => {
        const key = d.expiresAt ? formatExpiryMonth(d.expiresAt) : 'No Expiry';
        if (!groups[key]) groups[key] = [];
        groups[key].push(d);
      });
    } else if (groupMode === 'organization') {
      filtered.forEach((d) => {
        const key = d.organization?.name || 'Unorganized';
        if (!groups[key]) groups[key] = [];
        groups[key].push(d);
      });
    }

    const sorted = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(sorted);
  }, [filtered, groupMode]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').filter((l) => l.trim());
      if (lines.length === 0) return;
      const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
      const rows = lines.slice(1).map((line) =>
        line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
      );
      setImportPreview({ headers, rows });
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!importPreview) return;
    setImporting(true);

    const nameIdx = importPreview.headers.findIndex(
      (h) => h.toLowerCase() === 'name' || h.toLowerCase() === 'domain'
    );
    const regIdx = importPreview.headers.findIndex(
      (h) => h.toLowerCase() === 'registrar'
    );
    const expIdx = importPreview.headers.findIndex(
      (h) => h.toLowerCase() === 'expires' || h.toLowerCase() === 'expiry' || h.toLowerCase() === 'expiresat'
    );
    const nsIdx = importPreview.headers.findIndex(
      (h) => h.toLowerCase() === 'nameservers' || h.toLowerCase() === 'nameserver'
    );

    for (const row of importPreview.rows) {
      const name = nameIdx >= 0 ? row[nameIdx]?.trim() : row[0]?.trim();
      if (!name) continue;

      await fetch('/api/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          registrar: regIdx >= 0 ? row[regIdx]?.trim() || null : null,
          nameservers: nsIdx >= 0 ? row[nsIdx]?.trim() || null : null,
          expiresAt: expIdx >= 0 ? row[expIdx]?.trim() || null : null,
          autoRenew: true,
        }),
      });
    }

    setImporting(false);
    setImportOpen(false);
    setImportFile(null);
    setImportPreview(null);
    fetchDomains();
  };

  const handleExport = useCallback(() => {
    const headers = ['name', 'registrar', 'expiresAt', 'nameservers', 'autoRenew', 'status', 'tags', 'organization'];
    const rows = filtered.map((d) => [
      d.name,
      d.registrar || '',
      d.expiresAt || '',
      d.nameservers || '',
      d.autoRenew ? 'true' : 'false',
      d.status,
      d.tags.map((t) => t.name).join(';'),
      d.organization?.name || '',
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `domains-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered]);

  const handleBulkWhois = async () => {
    setBulkWhoisActive(true);
    setBulkWhoisProgress({ done: 0, total: filtered.length });

    for (let i = 0; i < filtered.length; i++) {
      try {
        await fetch(`/api/domains/${filtered[i].id}/whois`, { method: 'POST' });
      } catch {
        // skip errors
      }
      setBulkWhoisProgress({ done: i + 1, total: filtered.length });
    }

    setBulkWhoisActive(false);
    fetchDomains();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Domains ({filtered.length})</h1>
          <p className="text-slate-500">Track and manage domain registrations</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/domains/new" className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            New Domain
          </Link>
          <button onClick={() => setImportOpen(true)} className="btn-secondary flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Import CSV
          </button>
          <button onClick={handleExport} className="btn-secondary flex items-center gap-2">
            <FileDown className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={handleBulkWhois}
            disabled={bulkWhoisActive}
            className="btn-secondary flex items-center gap-2"
          >
            {bulkWhoisActive ? (
              <LoaderIcon className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Bulk WHOIS
          </button>
        </div>
      </div>

      {bulkWhoisActive && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700">Refreshing WHOIS data...</span>
            <span className="text-sm text-slate-500">
              {bulkWhoisProgress.done}/{bulkWhoisProgress.total}
            </span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{
                width: `${bulkWhoisProgress.total > 0 ? (bulkWhoisProgress.done / bulkWhoisProgress.total) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search domains..."
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
          <option value="active">Active</option>
          <option value="expiring">Expiring (&lt;30d)</option>
          <option value="expired">Expired</option>
          <option value="suspended">Suspended</option>
          <option value="pending">Pending</option>
          <option value="transferred">Transferred</option>
        </select>
        <select
          value={registrarFilter}
          onChange={(e) => setRegistrarFilter(e.target.value)}
          className="input-field w-auto"
        >
          <option value="all">All Registrars</option>
          {registrars.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          value={organizationFilter}
          onChange={(e) => setOrganizationFilter(e.target.value)}
          className="input-field w-auto"
        >
          <option value="all">All Organizations</option>
          <option value="none">Unorganized</option>
          {organizations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setGroupMode(tab.key)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
              groupMode === tab.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Globe className="w-8 h-8 text-slate-400" />}
          title="No domains found"
          description="Add your first domain to start tracking"
          action={
            <Link href="/dashboard/domains/new" className="btn-primary">
              <Plus className="w-4 h-4 mr-2 inline" />
              Add Domain
            </Link>
          }
        />
      ) : (
        Object.entries(groupedData).map(([groupName, groupDomains]) => (
          <div key={groupName} className="space-y-3">
            {groupMode !== 'all' && (
              <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-2">
                {groupName}
                <span className="text-xs font-normal text-slate-400">({groupDomains.length})</span>
              </h2>
            )}
            <div className="grid gap-3">
              {groupDomains.map((domain) => {
                const statusInfo = getStatusBadge(domain);
                const expiryInfo = getExpiryStatus(domain);
                const StatusIcon = statusInfo.icon;
                const hasSsl = domain.sslCertificates && domain.sslCertificates.length > 0;

                return (
                  <div
                    key={domain.id}
                    className="card p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={`/dashboard/domains/${domain.id}`}
                            className="text-lg font-semibold text-slate-900 hover:text-blue-600"
                          >
                            {domain.name}
                          </Link>
                          <span className={cn('badge flex items-center gap-1', statusInfo.badge)}>
                            <StatusIcon className="w-3 h-3" />
                            {statusInfo.label}
                          </span>
                          {domain.privacyProtection && (
                            <span className="badge badge-purple flex items-center gap-1">
                              <Shield className="w-3 h-3" />
                              Privacy
                            </span>
                          )}
                          {hasSsl && (
                            <span className="badge badge-green flex items-center gap-1">
                              <Lock className="w-3 h-3" />
                              SSL
                            </span>
                          )}
                          {domain.organization && (
                            <span className="badge badge-blue flex items-center gap-1">
                              <Building2 className="w-3 h-3" />
                              {domain.organization.name}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                          {domain.registrar && <span>{domain.registrar}</span>}
                          {domain.expiresAt && (
                            <span className="flex items-center gap-1">
                              Expires {formatDate(domain.expiresAt)}
                              <span
                                className={cn(
                                  'text-xs px-1.5 py-0.5 rounded-full font-medium',
                                  expiryInfo.badge
                                )}
                              >
                                {expiryInfo.label}
                              </span>
                            </span>
                          )}
                        </div>

                        {domain.tags.length > 0 && (
                          <div className="flex gap-1 mt-2">
                            {domain.tags.slice(0, 4).map((tag) => (
                              <span
                                key={tag.id}
                                className="text-xs px-1.5 py-0.5 rounded"
                                style={{ backgroundColor: tag.color + '20', color: tag.color }}
                              >
                                {tag.name}
                              </span>
                            ))}
                            {domain.tags.length > 4 && (
                              <span className="text-xs text-slate-400">+{domain.tags.length - 4}</span>
                            )}
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => setDeleteId(domain.id)}
                        className="p-2 hover:bg-red-50 text-red-500 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      <Modal isOpen={importOpen} onClose={() => setImportOpen(false)} title="Import Domains from CSV">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Upload a CSV file with columns: name (required), registrar, expiresAt, nameservers.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-600 hover:file:bg-blue-100"
          />
          {importPreview && (
            <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-64">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    {importPreview.headers.map((h, i) => (
                      <th key={i} className="px-3 py-2 text-left font-medium text-slate-600">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {importPreview.rows.slice(0, 20).map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j} className="px-3 py-2 text-slate-600">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {importPreview.rows.length > 20 && (
                <p className="text-xs text-slate-500 text-center py-2">
                  Showing 20 of {importPreview.rows.length} rows
                </p>
              )}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setImportOpen(false)} className="btn-secondary">
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={!importPreview || importing}
              className="btn-primary flex items-center gap-2"
            >
              {importing ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              Import {importPreview ? importPreview.rows.length : ''} Domains
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Domain"
        message="Are you sure you want to delete this domain? This action cannot be undone."
      />
    </div>
  );
}

function LoaderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
    </svg>
  );
}
