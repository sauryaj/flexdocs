'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Save,
  Loader2,
  Trash2,
  Lock,
  Globe,
  ExternalLink,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { formatDate, getDaysUntilExpiry, cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/UIComponents';

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
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function SslCertificateDetailPage() {
  const router = useRouter();
  const params = useParams();
  const [cert, setCert] = useState<SslCertificate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const [hostname, setHostname] = useState('');
  const [issuer, setIssuer] = useState('');
  const [subject, setSubject] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [keySize, setKeySize] = useState('');
  const [san, setSan] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetch(`/api/ssl/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        setCert(data);
        setHostname(data.hostname);
        setIssuer(data.issuer || '');
        setSubject(data.subject || '');
        setValidFrom(data.validFrom ? new Date(data.validFrom).toISOString().split('T')[0] : '');
        setValidTo(data.validTo ? new Date(data.validTo).toISOString().split('T')[0] : '');
        setSerialNumber(data.serialNumber || '');
        setKeySize(data.keySize?.toString() || '');
        setSan(data.san || '');
        setNotes(data.notes || '');
        setLoading(false);
      });
  }, [params.id]);

  const handleSave = async () => {
    setSaving(true);
    await fetch(`/api/ssl/${params.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hostname,
        issuer: issuer || null,
        subject: subject || null,
        validFrom: validFrom || null,
        validTo: validTo || null,
        serialNumber: serialNumber || null,
        keySize: keySize ? parseInt(keySize) : null,
        san: san || null,
        notes: notes || null,
      }),
    });
    const updated = await fetch(`/api/ssl/${params.id}`).then((r) => r.json());
    setCert(updated);
    setSaving(false);
  };

  const handleDelete = async () => {
    await fetch(`/api/ssl/${params.id}`, { method: 'DELETE' });
    router.push('/dashboard/ssl');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!cert) {
    return (
      <div className="text-center py-20">
        <Lock className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-slate-900">Certificate not found</h2>
        <Link href="/dashboard/ssl" className="text-blue-600 hover:underline mt-2 inline-block">
          Back to certificates
        </Link>
      </div>
    );
  }

  const daysLeft = cert.validTo ? getDaysUntilExpiry(cert.validTo) : null;
  const expiryBadge =
    daysLeft === null
      ? 'badge-slate'
      : daysLeft < 0
        ? 'badge-red'
        : daysLeft < 30
          ? 'badge-red'
          : daysLeft < 90
            ? 'badge-yellow'
            : 'badge-green';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/ssl" className="p-2 hover:bg-slate-100 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Lock className={cn('w-6 h-6', cert.isExpired ? 'text-red-500' : 'text-green-500')} />
              {cert.hostname}
            </h1>
            <p className="text-sm text-slate-500">
              Created {formatDate(cert.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {daysLeft !== null && (
            <span className={cn('badge flex items-center gap-1', expiryBadge)}>
              {daysLeft < 0 ? (
                <><XCircle className="w-3 h-3" /> Expired</>
              ) : daysLeft < 30 ? (
                <><AlertTriangle className="w-3 h-3" /> {daysLeft}d left</>
              ) : (
                <><CheckCircle className="w-3 h-3" /> {daysLeft}d left</>
              )}
            </span>
          )}
          <button
            onClick={() => setShowDelete(true)}
            className="p-2 hover:bg-red-50 text-red-500 rounded-lg"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="card p-6 space-y-6">
        <h2 className="text-lg font-semibold text-slate-900">Certificate Details</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Hostname</label>
            <input
              type="text"
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Issuer</label>
            <input
              type="text"
              value={issuer}
              onChange={(e) => setIssuer(e.target.value)}
              className="input-field"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="input-field"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Valid From</label>
            <input
              type="date"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Valid To</label>
            <input
              type="date"
              value={validTo}
              onChange={(e) => setValidTo(e.target.value)}
              className="input-field"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Serial Number</label>
            <input
              type="text"
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              className="input-field font-mono text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Key Size (bits)</label>
            <input
              type="text"
              value={keySize}
              onChange={(e) => setKeySize(e.target.value)}
              className="input-field"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Subject Alternative Names (SAN)</label>
          <textarea
            value={san}
            onChange={(e) => setSan(e.target.value)}
            className="input-field font-mono text-sm"
            rows={2}
          />
        </div>

        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-slate-500">Self-Signed</span>
            <p className="font-medium text-slate-900">{cert.isSelfSigned ? 'Yes' : 'No'}</p>
          </div>
          <div>
            <span className="text-slate-500">Signature Algorithm</span>
            <p className="font-medium text-slate-900">{cert.signatureAlgo || '—'}</p>
          </div>
          <div>
            <span className="text-slate-500">Organization</span>
            <p className="font-medium text-slate-900">{cert.organization?.name || '—'}</p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input-field"
            rows={3}
          />
        </div>

        <div className="flex justify-end gap-3">
          <Link href="/dashboard/ssl" className="btn-secondary">
            Cancel
          </Link>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </button>
        </div>
      </div>

      {cert.domains && cert.domains.length > 0 && (
        <div className="card p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Globe className="w-5 h-5 text-slate-500" />
            Linked Domains ({cert.domains.length})
          </h2>
          <div className="space-y-2">
            {cert.domains.map((domain) => (
              <Link
                key={domain.id}
                href={`/dashboard/domains/${domain.id}`}
                className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <span className="font-medium text-slate-900">{domain.name}</span>
                <ExternalLink className="w-4 h-4 text-slate-400" />
              </Link>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Delete Certificate"
        message="Are you sure you want to delete this SSL certificate? This action cannot be undone."
      />
    </div>
  );
}
