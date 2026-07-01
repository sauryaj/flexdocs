'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Save,
  Loader2,
  Trash2,
  Globe,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Shield,
  ShieldOff,
  FileText,
  Link2,
  Lock,
  Key,
  Server,
  ExternalLink,
  Clock,
} from 'lucide-react';
import { formatDate, timeAgo, getDaysUntilExpiry, cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/UIComponents';

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
  whoisCreated?: string | null;
  whoisCountry?: string | null;
  whoisState?: string | null;
  dnsRecords?: string | null;
  lastWhoisCheck?: string | null;
  lastDnsCheck?: string | null;
  createdAt: string;
  updatedAt: string;
  tags: { id: string; name: string; color: string }[];
  organization?: { id: string; name: string } | null;
  sslCertificates?: SslCert[];
  revisions?: DomainRevision[];
  linkedDocuments?: { id: string; title: string }[];
  linkedPasswords?: { id: string; name: string }[];
  linkedAssets?: { id: string; name: string }[];
}

interface SslCert {
  id: string;
  hostname: string;
  issuer: string | null;
  subject: string | null;
  validFrom: string | null;
  validTo: string | null;
  serialNumber: string | null;
  keySize: number | null;
  san: string | null;
  isExpired: boolean;
  isSelfSigned: boolean;
}

interface DomainRevision {
  id: string;
  source: string;
  data: string;
  createdAt: string;
}

interface DnsRecord {
  type: string;
  name: string;
  value: string;
  ttl: number;
}

const statuses = ['active', 'expired', 'suspended', 'pending', 'transferred'];

export default function DomainDetailPage() {
  const router = useRouter();
  const params = useParams();
  const [domain, setDomain] = useState<Domain | null>(null);
  const [name, setName] = useState('');
  const [registrar, setRegistrar] = useState('');
  const [nameservers, setNameservers] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [autoRenew, setAutoRenew] = useState(true);
  const [status, setStatus] = useState('active');
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const [whoisLoading, setWhoisLoading] = useState(false);
  const [dnsLoading, setDnsLoading] = useState(false);
  const [dnsRecords, setDnsRecords] = useState<DnsRecord[]>([]);

  const [sslLoading, setSslLoading] = useState(false);
  const [sslCheckResult, setSslCheckResult] = useState<SslCert | null>(null);
  const [showSslSave, setShowSslSave] = useState(false);
  const [sslFormIssuer, setSslFormIssuer] = useState('');
  const [sslFormSubject, setSslFormSubject] = useState('');
  const [sslFormValidFrom, setSslFormValidFrom] = useState('');
  const [sslFormValidTo, setSslFormValidTo] = useState('');
  const [sslFormSerial, setSslFormSerial] = useState('');
  const [sslFormKeySize, setSslFormKeySize] = useState('');
  const [sslFormSan, setSslFormSan] = useState('');

  useEffect(() => {
    fetch(`/api/domains/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        setDomain(data);
        setName(data.name);
        setRegistrar(data.registrar || '');
        setNameservers(data.nameservers || '');
        setExpiresAt(
          data.expiresAt ? new Date(data.expiresAt).toISOString().split('T')[0] : ''
        );
        setAutoRenew(data.autoRenew);
        setStatus(data.status);
        setNotes(data.notes || '');
        setTags(data.tags.map((t: any) => t.name).join(', '));
        // Parse stored DNS records
        if (data.dnsRecords) {
          try {
            const dns = typeof data.dnsRecords === 'string' ? JSON.parse(data.dnsRecords) : data.dnsRecords;
            const records: DnsRecord[] = [];
            for (const a of (dns.A || [])) records.push({ type: 'A', name: data.name, value: a, ttl: 0 });
            for (const a of (dns.AAAA || [])) records.push({ type: 'AAAA', name: data.name, value: a, ttl: 0 });
            for (const m of (dns.MX || [])) records.push({ type: 'MX', name: data.name, value: m.exchange, ttl: m.priority });
            for (const n of (dns.NS || [])) records.push({ type: 'NS', name: data.name, value: n, ttl: 0 });
            for (const t of (dns.TXT || [])) records.push({ type: 'TXT', name: data.name, value: t, ttl: 0 });
            for (const c of (dns.CNAME || [])) records.push({ type: 'CNAME', name: data.name, value: c, ttl: 0 });
            setDnsRecords(records);
          } catch { /* ignore DNS parse error */ }
        }
        setLoading(false);
      });
  }, [params.id]);

  const handleSave = async () => {
    setSaving(true);
    const tagList = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    await fetch(`/api/domains/${params.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        registrar: registrar || null,
        nameservers: nameservers || null,
        expiresAt: expiresAt || null,
        autoRenew,
        status,
        notes: notes || null,
        tags: tagList,
      }),
    });

    const updated = await fetch(`/api/domains/${params.id}`).then((r) => r.json());
    setDomain(updated);
    setSaving(false);
  };

  const handleDelete = async () => {
    await fetch(`/api/domains/${params.id}`, { method: 'DELETE' });
    router.push('/dashboard/domains');
  };

  const handleRefreshWhois = async () => {
    setWhoisLoading(true);
    try {
      const res = await fetch('/api/domains/whois', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domainId: params.id }),
      });
      if (res.ok) {
        const data = await res.json();
        const w = data.whois || data;
        if (w.registrar) setRegistrar(w.registrar);
        if (w.nameservers) setNameservers(Array.isArray(w.nameservers) ? w.nameservers.join(', ') : w.nameservers);
        if (w.expiryDate) setExpiresAt(new Date(w.expiryDate).toISOString().split('T')[0]);
        if (data.dns) {
          const records: DnsRecord[] = [];
          const dns = data.dns;
          for (const a of (dns.A || [])) records.push({ type: 'A', name: domain?.name || '', value: a, ttl: 0 });
          for (const a of (dns.AAAA || [])) records.push({ type: 'AAAA', name: domain?.name || '', value: a, ttl: 0 });
          for (const m of (dns.MX || [])) records.push({ type: 'MX', name: domain?.name || '', value: m.exchange, ttl: m.priority });
          for (const n of (dns.NS || [])) records.push({ type: 'NS', name: domain?.name || '', value: n, ttl: 0 });
          for (const t of (dns.TXT || [])) records.push({ type: 'TXT', name: domain?.name || '', value: t, ttl: 0 });
          for (const c of (dns.CNAME || [])) records.push({ type: 'CNAME', name: domain?.name || '', value: c, ttl: 0 });
          setDnsRecords(records);
        }
        // Re-fetch domain from DB to get updated WHOIS fields
        const updated = await fetch(`/api/domains/${params.id}`).then((r) => r.json());
        setDomain(updated);
      }
    } catch {
      // ignore
    }
    setWhoisLoading(false);
  };

  const handleRefreshDns = async () => {
    setDnsLoading(true);
    try {
      const res = await fetch('/api/domains/whois', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domainId: params.id }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.dns) {
          const records: DnsRecord[] = [];
          const dns = data.dns;
          for (const a of (dns.A || [])) records.push({ type: 'A', name: domain?.name || '', value: a, ttl: 0 });
          for (const a of (dns.AAAA || [])) records.push({ type: 'AAAA', name: domain?.name || '', value: a, ttl: 0 });
          for (const m of (dns.MX || [])) records.push({ type: 'MX', name: domain?.name || '', value: m.exchange, ttl: m.priority });
          for (const n of (dns.NS || [])) records.push({ type: 'NS', name: domain?.name || '', value: n, ttl: 0 });
          for (const t of (dns.TXT || [])) records.push({ type: 'TXT', name: domain?.name || '', value: t, ttl: 0 });
          for (const c of (dns.CNAME || [])) records.push({ type: 'CNAME', name: domain?.name || '', value: c, ttl: 0 });
          setDnsRecords(records);
        }
        // Re-fetch domain from DB
        const updated = await fetch(`/api/domains/${params.id}`).then((r) => r.json());
        setDomain(updated);
      }
    } catch {
      // ignore
    }
    setDnsLoading(false);
  };

  const handleCheckSsl = async () => {
    setSslLoading(true);
    try {
      const res = await fetch(`/api/ssl/check?hostname=${encodeURIComponent(domain?.name || '')}`);
      if (res.ok) {
        const data = await res.json();
        setSslCheckResult(data);
        setSslFormIssuer(data.issuer || '');
        setSslFormSubject(data.subject || '');
        setSslFormValidFrom(data.validFrom ? new Date(data.validFrom).toISOString().split('T')[0] : '');
        setSslFormValidTo(data.validTo ? new Date(data.validTo).toISOString().split('T')[0] : '');
        setSslFormSerial(data.serialNumber || '');
        setSslFormKeySize(data.keySize?.toString() || '');
        setSslFormSan(data.san || '');
        setShowSslSave(true);
      }
    } catch {
      // ignore
    }
    setSslLoading(false);
  };

  const handleSaveSsl = async () => {
    if (!domain) return;
    await fetch('/api/ssl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hostname: domain.name,
        issuer: sslFormIssuer || null,
        subject: sslFormSubject || null,
        validFrom: sslFormValidFrom || null,
        validTo: sslFormValidTo || null,
        serialNumber: sslFormSerial || null,
        keySize: sslFormKeySize ? parseInt(sslFormKeySize) : null,
        san: sslFormSan || null,
        domainId: domain.id,
        organizationId: domain.organizationId,
      }),
    });
    setShowSslSave(false);
    setSslCheckResult(null);
    const updated = await fetch(`/api/domains/${params.id}`).then((r) => r.json());
    setDomain(updated);
  };

  const getStatusInfo = () => {
    if (status === 'expired' || status === 'suspended') {
      return { icon: XCircle, color: 'text-red-500', badge: 'badge-red', label: status };
    }
    if (expiresAt) {
      const daysLeft = getDaysUntilExpiry(expiresAt);
      if (daysLeft < 0) {
        return { icon: XCircle, color: 'text-red-500', badge: 'badge-red', label: 'Expired' };
      }
      if (daysLeft < 30) {
        return { icon: AlertTriangle, color: 'text-amber-500', badge: 'badge-yellow', label: `${daysLeft}d left` };
      }
      if (daysLeft < 90) {
        return { icon: Clock, color: 'text-amber-500', badge: 'badge-yellow', label: `${daysLeft}d left` };
      }
    }
    return { icon: CheckCircle, color: 'text-green-500', badge: 'badge-green', label: 'Active' };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!domain) {
    return (
      <div className="text-center py-20">
        <Globe className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-slate-900">Domain not found</h2>
        <Link href="/dashboard/domains" className="text-blue-600 hover:underline mt-2 inline-block">
          Back to domains
        </Link>
      </div>
    );
  }

  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/domains" className="p-2 hover:bg-slate-100 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{domain.name}</h1>
            <p className="text-sm text-slate-500">
              Last updated {timeAgo(domain.updatedAt)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('badge flex items-center gap-1', statusInfo.badge)}>
            <StatusIcon className="w-3 h-3" />
            {statusInfo.label}
          </span>
          <button
            onClick={() => setShowDelete(true)}
            className="p-2 hover:bg-red-50 text-red-500 rounded-lg"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="card p-6 space-y-6">
        <h2 className="text-lg font-semibold text-slate-900">Domain Details</h2>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Domain Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-field text-lg"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Registrar</label>
            <input
              type="text"
              value={registrar}
              onChange={(e) => setRegistrar(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Expiration Date</label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="input-field"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Nameservers</label>
          <textarea
            value={nameservers}
            onChange={(e) => setNameservers(e.target.value)}
            className="input-field"
            rows={2}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="input-field"
            >
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer pb-2">
              <input
                type="checkbox"
                checked={autoRenew}
                onChange={(e) => setAutoRenew(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600"
              />
              <span className="text-sm font-medium text-slate-700">Auto-Renew</span>
            </label>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Tags (comma separated)
          </label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="input-field"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input-field"
            rows={4}
          />
        </div>

        <div className="flex justify-end gap-3">
          <Link href="/dashboard/domains" className="btn-secondary">
            Cancel
          </Link>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </button>
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Globe className="w-5 h-5 text-slate-500" />
            WHOIS Information
          </h2>
          <button
            onClick={handleRefreshWhois}
            disabled={whoisLoading}
            className="btn-secondary text-sm flex items-center gap-2"
          >
            {whoisLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh WHOIS
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-slate-500">Registrar</span>
            <p className="font-medium text-slate-900">{domain.registrar || '—'}</p>
          </div>
          <div>
            <span className="text-slate-500">Country</span>
            <p className="font-medium text-slate-900">{domain.whoisCountry || '—'}</p>
          </div>
          <div>
            <span className="text-slate-500">State</span>
            <p className="font-medium text-slate-900">{domain.whoisState || '—'}</p>
          </div>
          <div>
            <span className="text-slate-500">Created</span>
            <p className="font-medium text-slate-900">
              {domain.whoisCreated ? formatDate(domain.whoisCreated) : formatDate(domain.createdAt)}
              {domain.whoisCreated && (
                <span className="text-xs text-slate-400 ml-1">(WHOIS)</span>
              )}
            </p>
          </div>
          <div>
            <span className="text-slate-500">Privacy Protection</span>
            <p className="font-medium text-slate-900 flex items-center gap-1">
              {domain.privacyProtection ? (
                <>
                  <Shield className="w-4 h-4 text-green-500" /> Enabled
                </>
              ) : (
                <>
                  <ShieldOff className="w-4 h-4 text-slate-400" /> Disabled
                </>
              )}
            </p>
          </div>
          <div>
            <span className="text-slate-500">Nameservers</span>
            <p className="font-medium text-slate-900 text-xs break-all">
              {domain.nameservers || '—'}
            </p>
          </div>
          {domain.lastWhoisCheck && (
            <div>
              <span className="text-slate-500">Last WHOIS Check</span>
              <p className="font-medium text-slate-900 text-xs">{timeAgo(domain.lastWhoisCheck)}</p>
            </div>
          )}
          {domain.lastDnsCheck && (
            <div>
              <span className="text-slate-500">Last DNS Check</span>
              <p className="font-medium text-slate-900 text-xs">{timeAgo(domain.lastDnsCheck)}</p>
            </div>
          )}
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Server className="w-5 h-5 text-slate-500" />
            DNS Records
          </h2>
          <button
            onClick={handleRefreshDns}
            disabled={dnsLoading}
            className="btn-secondary text-sm flex items-center gap-2"
          >
            {dnsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh DNS
          </button>
        </div>
        {dnsRecords.length === 0 ? (
          <p className="text-sm text-slate-500">No DNS records loaded. Click Refresh to fetch.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Type</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Name</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">Value</th>
                  <th className="text-right px-3 py-2 font-medium text-slate-600">TTL</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {dnsRecords.map((record, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2">
                      <span className="badge badge-blue text-xs">{record.type}</span>
                    </td>
                    <td className="px-3 py-2 text-slate-600 font-mono text-xs">{record.name}</td>
                    <td className="px-3 py-2 text-slate-600 text-xs break-all">{record.value}</td>
                    <td className="px-3 py-2 text-slate-500 text-right">{record.ttl}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Lock className="w-5 h-5 text-slate-500" />
            SSL Certificate
          </h2>
          <button
            onClick={handleCheckSsl}
            disabled={sslLoading}
            className="btn-secondary text-sm flex items-center gap-2"
          >
            {sslLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Check SSL
          </button>
        </div>

        {domain.sslCertificates && domain.sslCertificates.length > 0 ? (
          <div className="space-y-3">
            {domain.sslCertificates.map((cert) => (
              <div key={cert.id} className="border border-slate-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-green-500" />
                    <span className="font-medium text-slate-900">{cert.hostname}</span>
                  </div>
                  <Link
                    href={`/dashboard/ssl/${cert.id}`}
                    className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                  >
                    View Details <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <span className="text-slate-500">Issuer</span>
                    <p className="font-medium text-slate-700">{cert.issuer || '—'}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Valid From</span>
                    <p className="font-medium text-slate-700">
                      {cert.validFrom ? formatDate(cert.validFrom) : '—'}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Valid To</span>
                    <p className="font-medium text-slate-700">
                      {cert.validTo ? formatDate(cert.validTo) : '—'}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Days Left</span>
                    <p className={cn(
                      'font-medium',
                      cert.validTo
                        ? getDaysUntilExpiry(cert.validTo) < 0
                          ? 'text-red-500'
                          : getDaysUntilExpiry(cert.validTo) < 30
                            ? 'text-amber-500'
                            : 'text-green-500'
                        : 'text-slate-700'
                    )}>
                      {cert.validTo
                        ? getDaysUntilExpiry(cert.validTo) < 0
                          ? 'Expired'
                          : `${getDaysUntilExpiry(cert.validTo)}d`
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Key Size</span>
                    <p className="font-medium text-slate-700">{cert.keySize ? `${cert.keySize} bit` : '—'}</p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-500">SAN</span>
                    <p className="font-medium text-slate-700 text-xs break-all">{cert.san || '—'}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : showSslSave && sslCheckResult ? (
          <div className="border border-blue-200 rounded-lg p-4 bg-blue-50 space-y-3">
            <p className="text-sm font-medium text-blue-800">Certificate found! Save it?</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-600">Issuer</label>
                <input
                  type="text"
                  value={sslFormIssuer}
                  onChange={(e) => setSslFormIssuer(e.target.value)}
                  className="input-field text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-600">Subject</label>
                <input
                  type="text"
                  value={sslFormSubject}
                  onChange={(e) => setSslFormSubject(e.target.value)}
                  className="input-field text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-600">Valid From</label>
                <input
                  type="date"
                  value={sslFormValidFrom}
                  onChange={(e) => setSslFormValidFrom(e.target.value)}
                  className="input-field text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-600">Valid To</label>
                <input
                  type="date"
                  value={sslFormValidTo}
                  onChange={(e) => setSslFormValidTo(e.target.value)}
                  className="input-field text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-600">Serial Number</label>
                <input
                  type="text"
                  value={sslFormSerial}
                  onChange={(e) => setSslFormSerial(e.target.value)}
                  className="input-field text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-600">Key Size</label>
                <input
                  type="text"
                  value={sslFormKeySize}
                  onChange={(e) => setSslFormKeySize(e.target.value)}
                  className="input-field text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-slate-600">SAN</label>
                <input
                  type="text"
                  value={sslFormSan}
                  onChange={(e) => setSslFormSan(e.target.value)}
                  className="input-field text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowSslSave(false); setSslCheckResult(null); }} className="btn-secondary text-sm">
                Cancel
              </button>
              <button onClick={handleSaveSsl} className="btn-primary text-sm">
                Save Certificate
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">No SSL certificate linked. Click Check SSL to scan.</p>
        )}
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <Clock className="w-5 h-5 text-slate-500" />
          Revisions
        </h2>
        {!domain.revisions || domain.revisions.length === 0 ? (
          <p className="text-sm text-slate-500">No revisions recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {domain.revisions.map((rev) => (
              <div key={rev.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className={cn(
                    'badge text-xs',
                    rev.source === 'whois' ? 'badge-blue' :
                    rev.source === 'dns' ? 'badge-green' :
                    'badge-slate'
                  )}>
                    {rev.source}
                  </span>
                  <span className="text-sm text-slate-600">{timeAgo(rev.createdAt)}</span>
                </div>
                <span className="text-xs text-slate-400">
                  {new Date(rev.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <Link2 className="w-5 h-5 text-slate-500" />
          Linked Resources
        </h2>
        {(!domain.linkedDocuments?.length &&
          !domain.linkedPasswords?.length &&
          !domain.linkedAssets?.length) ? (
          <p className="text-sm text-slate-500">No linked resources.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {domain.linkedDocuments && domain.linkedDocuments.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-1">
                  <FileText className="w-4 h-4" /> Documents
                </h3>
                <div className="space-y-1">
                  {domain.linkedDocuments.map((doc) => (
                    <Link
                      key={doc.id}
                      href={`/dashboard/documents/${doc.id}`}
                      className="block text-sm text-blue-600 hover:underline"
                    >
                      {doc.title}
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {domain.linkedPasswords && domain.linkedPasswords.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-1">
                  <Key className="w-4 h-4" /> Passwords
                </h3>
                <div className="space-y-1">
                  {domain.linkedPasswords.map((pw) => (
                    <Link
                      key={pw.id}
                      href={`/dashboard/passwords/${pw.id}`}
                      className="block text-sm text-blue-600 hover:underline"
                    >
                      {pw.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {domain.linkedAssets && domain.linkedAssets.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-1">
                  <Server className="w-4 h-4" /> Assets
                </h3>
                <div className="space-y-1">
                  {domain.linkedAssets.map((asset) => (
                    <Link
                      key={asset.id}
                      href={`/dashboard/assets/${asset.id}`}
                      className="block text-sm text-blue-600 hover:underline"
                    >
                      {asset.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Delete Domain"
        message="Are you sure you want to delete this domain? This action cannot be undone."
      />
    </div>
  );
}
