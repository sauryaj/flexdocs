'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Plus,
  FileText,
  Key,
  Globe,
  HardDrive,
  CheckSquare,
  Search,
} from 'lucide-react';
import { EmptyState, Modal } from '@/components/UIComponents';

interface Organization {
  id: string;
  name: string;
  description: string | null;
  _count: {
    documents: number;
    passwords: number;
    domains: number;
    assets: number;
    checklists: number;
  };
}

export default function OrganizationsPage() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    website: '',
    phone: '',
    email: '',
    address: '',
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const fetchOrganizations = async () => {
    const res = await fetch('/api/organizations');
    const data = await res.json();
    setOrganizations(data);
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!createForm.name.trim()) return;
    setCreating(true);
    const res = await fetch('/api/organizations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: createForm.name.trim(),
        description: createForm.description.trim() || null,
        website: createForm.website.trim() || null,
        phone: createForm.phone.trim() || null,
        email: createForm.email.trim() || null,
        address: createForm.address.trim() || null,
      }),
    });
    if (res.ok) {
      const newOrg = await res.json();
      setOrganizations([...organizations, newOrg]);
      setCreateForm({ name: '', description: '', website: '', phone: '', email: '', address: '' });
      setShowCreateModal(false);
      router.push(`/dashboard/organizations/${newOrg.id}`);
    }
    setCreating(false);
  };

  const filtered = organizations.filter(
    (org) =>
      org.name.toLowerCase().includes(search.toLowerCase()) ||
      org.description?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Organizations</h1>
          <p className="text-slate-500">
            {organizations.length} organization{organizations.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Organization
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search organizations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field pl-10"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Building2 className="w-8 h-8 text-slate-400" />}
          title="No organizations found"
          description="Create your first organization to group related resources"
          action={
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary"
            >
              <Plus className="w-4 h-4 mr-2 inline" />
              New Organization
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((org) => (
            <Link
              key={org.id}
              href={`/dashboard/organizations/${org.id}`}
              className="card p-6 hover:shadow-md transition-shadow group"
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-5 h-5 text-blue-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors truncate">
                    {org.name}
                  </h3>
                  {org.description && (
                    <p className="text-sm text-slate-500 line-clamp-2 mt-1">
                      {org.description}
                    </p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-5 gap-2 text-center">
                <div>
                  <FileText className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                  <p className="text-sm font-medium text-slate-900">
                    {org._count.documents}
                  </p>
                  <p className="text-xs text-slate-400">Docs</p>
                </div>
                <div>
                  <Key className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                  <p className="text-sm font-medium text-slate-900">
                    {org._count.passwords}
                  </p>
                  <p className="text-xs text-slate-400">Passwords</p>
                </div>
                <div>
                  <Globe className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                  <p className="text-sm font-medium text-slate-900">
                    {org._count.domains}
                  </p>
                  <p className="text-xs text-slate-400">Domains</p>
                </div>
                <div>
                  <HardDrive className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                  <p className="text-sm font-medium text-slate-900">
                    {org._count.assets}
                  </p>
                  <p className="text-xs text-slate-400">Assets</p>
                </div>
                <div>
                  <CheckSquare className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                  <p className="text-sm font-medium text-slate-900">
                    {org._count.checklists}
                  </p>
                  <p className="text-xs text-slate-400">Checks</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setCreateForm({ name: '', description: '', website: '', phone: '', email: '', address: '' });
        }}
        title="New Organization"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Name *
            </label>
            <input
              type="text"
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              className="input-field"
              placeholder="e.g. Acme Corp"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Description
            </label>
            <textarea
              value={createForm.description}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              className="input-field"
              rows={3}
              placeholder="Optional description"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Website
            </label>
            <input
              type="text"
              value={createForm.website}
              onChange={(e) => setCreateForm({ ...createForm, website: e.target.value })}
              className="input-field"
              placeholder="https://example.com"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Phone
              </label>
              <input
                type="text"
                value={createForm.phone}
                onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                className="input-field"
                placeholder="+1 (555) 123-4567"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                className="input-field"
                placeholder="contact@example.com"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Address
            </label>
            <input
              type="text"
              value={createForm.address}
              onChange={(e) => setCreateForm({ ...createForm, address: e.target.value })}
              className="input-field"
              placeholder="123 Main St, City, State, ZIP"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => {
                setShowCreateModal(false);
                setCreateForm({ name: '', description: '', website: '', phone: '', email: '', address: '' });
              }}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!createForm.name.trim() || creating}
              className="btn-primary disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create Organization'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
