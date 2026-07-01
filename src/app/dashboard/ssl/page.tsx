'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Lock,
  Search,
  RefreshCw,
  ExternalLink,
  Globe,
  Building2,
} from 'lucide-react';
import { formatDate, getDaysUntilExpiry, cn } from '@/lib/utils';
import { EmptyState, Modal } from '@/components/UIComponents';

interface SslCertificate {
  id: string;
  hostname: string;
  issuer: string | null;
  subject: string | null;
  validFrom: string | null;
  validTo: string | null;
  serialNumber: string | null;
  signatureAlgo: string | null;
  keySize: number | null;
  san: string | null;
  isExpired: boolean;
  isSelfSigned: boolean;
  organizationId: string | null;
  organization?: { id: string; name: string } | null;
  domains?: { id: string; name: string }[];
  createdAt: string;
  updatedAt: string;
}

export default function SslCertificatesPage() {
  const [certs, setCerts] = useState<SslCertificate[]>([]);
  const [search, setSearch] = useState('');
  const [organizationFilter, setOrganizationFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const [checkOpen, setCheckOpen] = useState(false);
  const [checkHostname, setCheckHostname] = useState('');
  const [checkLoading, setCheckLoading] = useState(false);
  const [checkResult, setCheckResult] = useState<SslCertificate | null>(null);

  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveIssuer, setSaveIssuer] = useState('');
  const [saveSubject, setSaveSubject] = useState('');
  const [saveValidFrom, setSaveValidFrom] = useState('');
  const [saveValidTo, setSaveValidTo] = useState('');
  const [saveSerial, setSaveSerial] = useState('');
  const [saveKeySize, setSaveKeySize] = useState('');
  const [saveSan, setSaveSan] = useState('');
  const [saveSaving, setSaveSaving] = useState(false);

  useEffect(() => {
    fetchCerts();
  }, []);

  const fetchCerts = async () => {
    const res = await fetch('/api/ssl');
    const data = await res.json();
    setCerts(data);
    setLoading(false);
  };

  const organizations = useMemo(() => {
    const map = new Map<string, string>();
    certs.forEach((c) => {
      if (c.organizationId && c.organization) {
        map.set(c.organizationId, c.organization.name);
      }
    });
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [certs]);

  const filtered = useMemo(() => {
    return certs.filter((c) => {
      const matchesSearch =
        c.hostname.toLowerCase().includes(search.toLowerCase()) ||
        (c.issuer && c.issuer.toLowerCase().includes(search.toLowerCase()));
      const matchesOrg =
        organizationFilter === 'all' || (c.organizationId ?? 'none') === organizationFilter;
      return matchesSearch && matchesOrg;
    });
  }, [certs, search, organizationFilter]);

  const handleCheck = async () => {
    if (!checkHostname.trim()) return;
    setCheckLoading(true);
    setCheckResult(null);
    try {
      const res = await fetch(`/api/ssl/check?hostname=${encodeURIComponent(checkHostname.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setCheckResult(data);
        setSaveIssuer(data.issuer || '');
        setSaveSubject(data.subject || '');
        setSaveValidFrom(data.validFrom ? new Date(data.validFrom).toISOString().split('T')[0] : '');
        setSaveValidTo(data.validTo ? new Date(data.validTo).toISOString().split('T')[0] : '');
        setSaveSerial(data.serialNumber || '');
        setSaveKeySize(data.keySize?.toString() || '');
        setSaveSan(data.san || '');
        setShowSaveForm(true);
      }
    } catch {
      // ignore
    }
    setCheckLoading(false);
  };

  const handleSaveCert = async () => {
    setSaveSaving(true);
    await fetch('/api/ssl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hostname: checkHostname.trim(),
        issuer: saveIssuer || null,
        subject: saveSubject || null,
        validFrom: saveValidFrom || null,
        validTo: saveValidTo || null,
        serialNumber: saveSerial || null,
        keySize: saveKeySize ? parseInt(saveKeySize) : null,
        san: saveSan || null,
      }),
    });
    setSaveSaving(false);
    setShowSaveForm(false);
    setCheckResult(null);
    setCheckHostname('');
    setCheckOpen(false);
    fetchCerts();
  };

  const getExpiryInfo = (cert: SslCertificate) => {
    if (!cert.validTo) return { badge: 'badge-slate', label: 'Unknown' };
    const daysLeft = getDaysUntilExpiry(cert.validTo);
    if (daysLeft < 0) return { badge: 'badge-red', label: 'Expired' };
    if (daysLeft < 30) return { badge: 'badge-red', label: `${daysLeft}d left` };
    if (daysLeft < 90) return { badge: 'badge-yellow', label: `${daysLeft}d left` };
    return { badge: 'badge-green', label: `${daysLeft}d left` };
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
          <h1 className="text-2xl font-bold text-slate-900">SSL Certificates ({filtered.length})</h1>
          <p className="text-slate-500">Track and monitor SSL/TLS certificates</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setCheckOpen(true)} className="btn-secondary flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Check Certificate
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by hostname or issuer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-10"
          />
        </div>
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

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Lock className="w-8 h-8 text-slate-400" />}
          title="No SSL certificates found"
          description="Check a certificate to start tracking"
          action={
            <button onClick={() => setCheckOpen(true)} className="btn-primary">
              <RefreshCw className="w-4 h-4 mr-2 inline" />
              Check Certificate
            </button>
          }
        />
      ) : (
        <div className="grid gap-3">
          {filtered.map((cert) => {
            const expiryInfo = getExpiryInfo(cert);
            return (
              <Link
                key={cert.id}
                href={`/dashboard/ssl/${cert.id}`}
                className="card p-4 hover:shadow-md transition-shadow block"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Lock className={cn(
                        'w-5 h-5',
                        cert.isExpired ? 'text-red-500' : 'text-green-500'
                      )} />
                      <span className="text-lg font-semibold text-slate-900">{cert.hostname}</span>
                      {cert.isSelfSigned && (
                        <span className="badge badge-yellow text-xs">Self-Signed</span>
                      )}
                      {cert.organization && (
                        <span className="badge badge-blue flex items-center gap-1 text-xs">
                          <Building2 className="w-3 h-3" />
                          {cert.organization.name}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                      {cert.issuer && <span>{cert.issuer}</span>}
                      {cert.validTo && (
                        <span className="flex items-center gap-1">
                          Expires {formatDate(cert.validTo)}
                          <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', expiryInfo.badge)}>
                            {expiryInfo.label}
                          </span>
                        </span>
                      )}
                      {cert.keySize && <span>{cert.keySize} bit</span>}
                    </div>

                    {cert.domains && cert.domains.length > 0 && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-slate-400">
                        <Globe className="w-3 h-3" />
                        Linked to {cert.domains.length} domain{cert.domains.length > 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                  <ExternalLink className="w-4 h-4 text-slate-400" />
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <Modal isOpen={checkOpen} onClose={() => { setCheckOpen(false); setShowSaveForm(false); setCheckResult(null); }} title="Check SSL Certificate">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Enter a hostname to fetch its SSL certificate information.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={checkHostname}
              onChange={(e) => setCheckHostname(e.target.value)}
              placeholder="example.com"
              className="input-field flex-1"
              onKeyDown={(e) => e.key === 'Enter' && handleCheck()}
            />
            <button onClick={handleCheck} disabled={checkLoading} className="btn-primary flex items-center gap-2">
              {checkLoading ? <LoaderIcon className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Check
            </button>
          </div>

          {showSaveForm && checkResult && (
            <div className="border border-blue-200 rounded-lg p-4 bg-blue-50 space-y-3">
              <p className="text-sm font-medium text-blue-800">Certificate found! Review and save.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-600">Issuer</label>
                  <input type="text" value={saveIssuer} onChange={(e) => setSaveIssuer(e.target.value)} className="input-field text-sm" />
                </div>
                <div>
                  <label className="text-xs text-slate-600">Subject</label>
                  <input type="text" value={saveSubject} onChange={(e) => setSaveSubject(e.target.value)} className="input-field text-sm" />
                </div>
                <div>
                  <label className="text-xs text-slate-600">Valid From</label>
                  <input type="date" value={saveValidFrom} onChange={(e) => setSaveValidFrom(e.target.value)} className="input-field text-sm" />
                </div>
                <div>
                  <label className="text-xs text-slate-600">Valid To</label>
                  <input type="date" value={saveValidTo} onChange={(e) => setSaveValidTo(e.target.value)} className="input-field text-sm" />
                </div>
                <div>
                  <label className="text-xs text-slate-600">Serial Number</label>
                  <input type="text" value={saveSerial} onChange={(e) => setSaveSerial(e.target.value)} className="input-field text-sm" />
                </div>
                <div>
                  <label className="text-xs text-slate-600">Key Size</label>
                  <input type="text" value={saveKeySize} onChange={(e) => setSaveKeySize(e.target.value)} className="input-field text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-slate-600">SAN</label>
                  <input type="text" value={saveSan} onChange={(e) => setSaveSan(e.target.value)} className="input-field text-sm" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => { setShowSaveForm(false); setCheckResult(null); }} className="btn-secondary text-sm">
                  Cancel
                </button>
                <button onClick={handleSaveCert} disabled={saveSaving} className="btn-primary text-sm flex items-center gap-2">
                  {saveSaving && <LoaderIcon className="w-4 h-4 animate-spin" />}
                  Save Certificate
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>
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
