'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';

interface Organization {
  id: string;
  name: string;
}

export default function NewDomainPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [registrar, setRegistrar] = useState('');
  const [nameservers, setNameservers] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [autoRenew, setAutoRenew] = useState(true);
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/organizations')
      .then((r) => r.json())
      .then((data) => setOrganizations(data));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const tagList = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const res = await fetch('/api/domains', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        registrar: registrar || null,
        nameservers: nameservers || null,
        expiresAt: expiresAt || null,
        autoRenew,
        notes: notes || null,
        tags: tagList,
        organizationId: organizationId || null,
      }),
    });

    if (res.ok) {
      const domain = await res.json();
      router.push(`/dashboard/domains/${domain.id}`);
    }
    setLoading(false);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/domains" className="p-2 hover:bg-slate-100 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Add Domain</h1>
          <p className="text-slate-500">Register a new domain to track</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Domain Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-field"
            placeholder="example.com"
            required
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
              placeholder="GoDaddy, Cloudflare, etc."
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
            placeholder="ns1.example.com&#10;ns2.example.com"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Organization</label>
            <select
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
              className="input-field"
            >
              <option value="">None</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
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
            placeholder="production, client-a"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input-field"
            rows={3}
            placeholder="Additional notes about this domain..."
          />
        </div>

        <div className="flex justify-end gap-3">
          <Link href="/dashboard/domains" className="btn-secondary">
            Cancel
          </Link>
          <button type="submit" disabled={loading} className="btn-primary flex items-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Domain
          </button>
        </div>
      </form>
    </div>
  );
}
