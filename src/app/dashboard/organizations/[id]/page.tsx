'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FileText,
  Key,
  Globe,
  HardDrive,
  CheckSquare,
  ArrowLeft,
  Pencil,
  Trash2,
  Link as LinkIcon,
  ExternalLink,
  Phone,
  Mail,
  MapPin,
  Plus,
  X,
} from 'lucide-react';
import { ConfirmDialog, Modal } from '@/components/UIComponents';
import { MagicDashboard } from '@/components/MagicDashboard';

interface Organization {
  id: string;
  name: string;
  description: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  logo: string | null;
  createdAt: string;
  updatedAt: string;
  contacts?: { id: string; name: string; title: string | null; email: string | null; phone: string | null; mobile: string | null }[];
  locations?: { id: string; name: string; address: string | null; city: string | null; state: string | null; country: string | null }[];
  documents: { id: string; title: string; category: string; updatedAt: string }[];
  passwords: { id: string; name: string; username: string; updatedAt: string }[];
  domains: { id: string; name: string; expiresAt: string | null }[];
  assets: { id: string; name: string; assetType: string; updatedAt: string }[];
  checklists: {
    id: string;
    name: string;
    items: { id: string; text: string; checked: boolean }[];
  }[];
}

interface UnlinkedResource {
  id: string;
  name: string;
}

export default function OrganizationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<'health' | 'overview' | 'documents' | 'passwords' | 'domains' | 'assets' | 'checklists' | 'contacts' | 'locations'>('health');

  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    website: '',
    phone: '',
    email: '',
    address: '',
  });
  const [saving, setSaving] = useState(false);

  const [linkModal, setLinkModal] = useState<{
    open: boolean;
    resourceType: string;
    unlinked: UnlinkedResource[];
  }>({ open: false, resourceType: '', unlinked: [] });

  useEffect(() => {
    fetchOrg();
  }, [id]);

  const fetchOrg = async () => {
    const res = await fetch(`/api/organizations/${id}`);
    if (!res.ok) {
      router.push('/dashboard/organizations');
      return;
    }
    const data = await res.json();
    setOrg(data);
    setEditForm({
      name: data.name,
      description: data.description || '',
      website: data.website || '',
      phone: data.phone || '',
      email: data.email || '',
      address: data.address || '',
    });
    setLoading(false);
  };

  const handleUpdate = async () => {
    setSaving(true);
    const res = await fetch(`/api/organizations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editForm.name,
        description: editForm.description || null,
        website: editForm.website || null,
        phone: editForm.phone || null,
        email: editForm.email || null,
        address: editForm.address || null,
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      setOrg((prev) => (prev ? { ...prev, ...updated } : prev));
      setShowEditModal(false);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    await fetch(`/api/organizations/${id}`, { method: 'DELETE' });
    router.push('/dashboard/organizations');
  };

  const openLinkModal = async (resourceType: string) => {
    const res = await fetch(`/api/organizations/${id}/link?resourceType=${resourceType}`);
    const data = await res.json();
    setLinkModal({ open: true, resourceType, unlinked: data });
  };

  const handleLink = async (resourceId: string) => {
    await fetch(`/api/organizations/${id}/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resourceType: linkModal.resourceType,
        resourceId,
      }),
    });
    setLinkModal({ open: false, resourceType: '', unlinked: [] });
    fetchOrg();
  };

  const handleUnlink = async (resourceType: string, resourceId: string) => {
    await fetch(`/api/organizations/${id}/unlink`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resourceType, resourceId }),
    });
    fetchOrg();
  };

  if (loading || !org) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  const initials = org.name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="space-y-6">
      {/* Top Navigation Back Button */}
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard/organizations"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Organizations
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowEditModal(true)}
            className="btn-secondary text-xs flex items-center gap-1.5"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit Profile
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="btn-danger text-xs flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete Org
          </button>
        </div>
      </div>

      {/* IT Glue Hero Client Profile Card */}
      <div className="card p-6 border-l-4 border-blue-600 bg-gradient-to-r from-blue-600/5 via-transparent to-transparent">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-bold text-xl flex items-center justify-center shadow-lg flex-shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white truncate">
                  {org.name}
                </h1>
                <span className="badge badge-blue">Managed Client</span>
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-xl line-clamp-2">
                {org.description || 'Enterprise Organization profile & documentation hub.'}
              </p>

              {/* Contact Chips */}
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-3">
                {org.website && (
                  <a
                    href={org.website.startsWith('http') ? org.website : `https://${org.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline font-medium"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    {org.website.replace(/^https?:\/\//, '')}
                    <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                  </a>
                )}
                {org.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    {org.phone}
                  </span>
                )}
                {org.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    {org.email}
                  </span>
                )}
                {org.address && (
                  <span className="flex items-center gap-1 truncate max-w-xs">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <span className="truncate">{org.address}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quick Actions Dropdown Bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/dashboard/passwords/new?organizationId=${org.id}`}
              className="btn-primary text-xs flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Password
            </Link>
            <Link
              href={`/dashboard/documents/new?organizationId=${org.id}`}
              className="btn-secondary text-xs flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              SOP Document
            </Link>
          </div>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <button
          onClick={() => setActiveTab('documents')}
          className={`p-4 rounded-xl border transition-all text-left ${
            activeTab === 'documents'
              ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/40'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <FileText className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-semibold">Docs</span>
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white">
            {org.documents.length}
          </div>
          <span className="text-[11px] text-slate-400">SOPs & Guides</span>
        </button>

        <button
          onClick={() => setActiveTab('passwords')}
          className={`p-4 rounded-xl border transition-all text-left ${
            activeTab === 'passwords'
              ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/40'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <Key className="w-4 h-4 text-emerald-500" />
            <span className="text-xs font-semibold">Passwords</span>
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white">
            {org.passwords.length}
          </div>
          <span className="text-[11px] text-slate-400">Vault Items</span>
        </button>

        <button
          onClick={() => setActiveTab('domains')}
          className={`p-4 rounded-xl border transition-all text-left ${
            activeTab === 'domains'
              ? 'border-purple-500 bg-purple-50/50 dark:bg-purple-950/40'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <Globe className="w-4 h-4 text-purple-500" />
            <span className="text-xs font-semibold">Domains</span>
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white">
            {org.domains.length}
          </div>
          <span className="text-[11px] text-slate-400">Tracked Domains</span>
        </button>

        <button
          onClick={() => setActiveTab('assets')}
          className={`p-4 rounded-xl border transition-all text-left ${
            activeTab === 'assets'
              ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/40'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <HardDrive className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-semibold">Assets</span>
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white">
            {org.assets.length}
          </div>
          <span className="text-[11px] text-slate-400">Flexible Assets</span>
        </button>

        <button
          onClick={() => setActiveTab('checklists')}
          className={`p-4 rounded-xl border transition-all text-left ${
            activeTab === 'checklists'
              ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-950/40'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <CheckSquare className="w-4 h-4 text-rose-500" />
            <span className="text-xs font-semibold">Checklists</span>
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white">
            {org.checklists.length}
          </div>
          <span className="text-[11px] text-slate-400">SOP Runbooks</span>
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b pb-2 dark:border-slate-800">
        {[
          { key: 'health', label: '⚡ Health' },
          { key: 'overview', label: 'All Core Assets Hub' },
          { key: 'documents', label: `Documents (${org.documents.length})` },
          { key: 'passwords', label: `Passwords (${org.passwords.length})` },
          { key: 'domains', label: `Domains (${org.domains.length})` },
          { key: 'assets', label: `Flexible Assets (${org.assets.length})` },
          { key: 'checklists', label: `Checklists (${org.checklists.length})` },
          { key: 'contacts', label: `Contacts (${org.contacts?.length ?? 0})` },
          { key: 'locations', label: `Locations (${org.locations?.length ?? 0})` },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === tab.key
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Tabbed Content */}
      {activeTab === 'health' ? (
        <MagicDashboard orgId={id} />
      ) : activeTab === 'overview' ? (
        <div className="space-y-6">
          <ResourceSection
            title="Documents"
            icon={<FileText className="w-5 h-5 text-blue-500" />}
            items={org.documents}
            emptyText="No documents linked to this organization."
            renderName={(item: any) => (
              <Link href={`/dashboard/documents/${item.id}`} className="hover:text-blue-600 transition-colors font-semibold">
                {item.title}
              </Link>
            )}
            renderMeta={(item: any) => (
              <>
                <span className="badge badge-blue">{item.category}</span>
                <span className="text-xs text-slate-400">
                  Updated {new Date(item.updatedAt).toLocaleDateString()}
                </span>
              </>
            )}
            onLink={() => openLinkModal('document')}
            onUnlink={(itemId) => handleUnlink('document', itemId)}
          />

          <ResourceSection
            title="Passwords"
            icon={<Key className="w-5 h-5 text-emerald-500" />}
            items={org.passwords}
            emptyText="No credentials stored for this organization."
            renderName={(item: any) => (
              <Link href={`/dashboard/passwords/${item.id}`} className="hover:text-blue-600 transition-colors font-semibold">
                {item.name}
              </Link>
            )}
            renderMeta={(item: any) => (
              <span className="text-xs font-mono text-slate-400">{item.username}</span>
            )}
            onLink={() => openLinkModal('password')}
            onUnlink={(itemId) => handleUnlink('password', itemId)}
          />

          <ResourceSection
            title="Domains"
            icon={<Globe className="w-5 h-5 text-purple-500" />}
            items={org.domains}
            emptyText="No domains tracked for this organization."
            renderName={(item: any) => (
              <Link href={`/dashboard/domains/${item.id}`} className="hover:text-blue-600 transition-colors font-semibold">
                {item.name}
              </Link>
            )}
            renderMeta={(item: any) =>
              item.expiresAt ? (
                <span className="text-xs text-slate-400">
                  Expires {new Date(item.expiresAt).toLocaleDateString()}
                </span>
              ) : null
            }
            onLink={() => openLinkModal('domain')}
            onUnlink={(itemId) => handleUnlink('domain', itemId)}
          />

          <ResourceSection
            title="Flexible Assets"
            icon={<HardDrive className="w-5 h-5 text-amber-500" />}
            items={org.assets}
            emptyText="No custom flexible assets configured."
            renderName={(item: any) => (
              <Link href={`/dashboard/assets/${item.id}`} className="hover:text-blue-600 transition-colors font-semibold">
                {item.name}
              </Link>
            )}
            renderMeta={(item: any) => (
              <span className="badge badge-yellow">{item.assetType}</span>
            )}
            onLink={() => openLinkModal('asset')}
            onUnlink={(itemId) => handleUnlink('asset', itemId)}
          />

          <ResourceSection
            title="Checklists"
            icon={<CheckSquare className="w-5 h-5 text-rose-500" />}
            items={org.checklists}
            emptyText="No SOP runbooks or checklists assigned."
            renderName={(item: any) => (
              <Link href={`/dashboard/checklists/${item.id}`} className="hover:text-blue-600 transition-colors font-semibold">
                {item.name}
              </Link>
            )}
            renderMeta={(item: any) => {
              const checked = item.items.filter((i: any) => i.checked).length;
              const total = item.items.length;
              return (
                <span className="text-xs text-slate-400">
                  {checked}/{total} completed
                </span>
              );
            }}
            onLink={() => openLinkModal('checklist')}
            onUnlink={(itemId) => handleUnlink('checklist', itemId)}
          />
        </div>
      ) : activeTab === 'documents' ? (
        <ResourceSection
          title="Documents"
          icon={<FileText className="w-5 h-5 text-blue-500" />}
          items={org.documents}
          emptyText="No documents linked to this organization."
          renderName={(item: any) => (
            <Link href={`/dashboard/documents/${item.id}`} className="hover:text-blue-600 transition-colors font-semibold">
              {item.title}
            </Link>
          )}
          renderMeta={(item: any) => (
            <>
              <span className="badge badge-blue">{item.category}</span>
              <span className="text-xs text-slate-400">
                Updated {new Date(item.updatedAt).toLocaleDateString()}
              </span>
            </>
          )}
          onLink={() => openLinkModal('document')}
          onUnlink={(itemId) => handleUnlink('document', itemId)}
        />
      ) : activeTab === 'passwords' ? (
        <ResourceSection
          title="Passwords"
          icon={<Key className="w-5 h-5 text-emerald-500" />}
          items={org.passwords}
          emptyText="No credentials stored for this organization."
          renderName={(item: any) => (
            <Link href={`/dashboard/passwords/${item.id}`} className="hover:text-blue-600 transition-colors font-semibold">
              {item.name}
            </Link>
          )}
          renderMeta={(item: any) => (
            <span className="text-xs font-mono text-slate-400">{item.username}</span>
          )}
          onLink={() => openLinkModal('password')}
          onUnlink={(itemId) => handleUnlink('password', itemId)}
        />
      ) : activeTab === 'domains' ? (
        <ResourceSection
          title="Domains"
          icon={<Globe className="w-5 h-5 text-purple-500" />}
          items={org.domains}
          emptyText="No domains tracked for this organization."
          renderName={(item: any) => (
            <Link href={`/dashboard/domains/${item.id}`} className="hover:text-blue-600 transition-colors font-semibold">
              {item.name}
            </Link>
          )}
          renderMeta={(item: any) =>
            item.expiresAt ? (
              <span className="text-xs text-slate-400">
                Expires {new Date(item.expiresAt).toLocaleDateString()}
              </span>
            ) : null
          }
          onLink={() => openLinkModal('domain')}
          onUnlink={(itemId) => handleUnlink('domain', itemId)}
        />
      ) : activeTab === 'assets' ? (
        <ResourceSection
          title="Flexible Assets"
          icon={<HardDrive className="w-5 h-5 text-amber-500" />}
          items={org.assets}
          emptyText="No custom flexible assets configured."
          renderName={(item: any) => (
            <Link href={`/dashboard/assets/${item.id}`} className="hover:text-blue-600 transition-colors font-semibold">
              {item.name}
            </Link>
          )}
          renderMeta={(item: any) => (
            <span className="badge badge-yellow">{item.assetType}</span>
          )}
          onLink={() => openLinkModal('asset')}
          onUnlink={(itemId) => handleUnlink('asset', itemId)}
        />
      ) : activeTab === 'contacts' ? (
        <ContactsPanel orgId={org.id} contacts={org.contacts ?? []} onChanged={fetchOrg} />
      ) : activeTab === 'locations' ? (
        <LocationsPanel orgId={org.id} locations={org.locations ?? []} onChanged={fetchOrg} />
      ) : (
        <ResourceSection
          title="Checklists"
          icon={<CheckSquare className="w-5 h-5 text-rose-500" />}
          items={org.checklists}
          emptyText="No SOP runbooks or checklists assigned."
          renderName={(item: any) => (
            <Link href={`/dashboard/checklists/${item.id}`} className="hover:text-blue-600 transition-colors font-semibold">
              {item.name}
            </Link>
          )}
          renderMeta={(item: any) => {
            const checked = item.items.filter((i: any) => i.checked).length;
            const total = item.items.length;
            return (
              <span className="text-xs text-slate-400">
                {checked}/{total} completed
              </span>
            );
          }}
          onLink={() => openLinkModal('checklist')}
          onUnlink={(itemId) => handleUnlink('checklist', itemId)}
        />
      )}

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Delete Organization"
        message="Are you sure you want to delete this organization? All linked resources will be unlinked but not deleted. This action cannot be undone."
      />

      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Organization Profile"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Organization Name
            </label>
            <input
              type="text"
              value={editForm.name}
              onChange={(e) =>
                setEditForm({ ...editForm, name: e.target.value })
              }
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Description & Notes
            </label>
            <textarea
              value={editForm.description}
              onChange={(e) =>
                setEditForm({ ...editForm, description: e.target.value })
              }
              className="input-field"
              rows={3}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Website Domain
            </label>
            <input
              type="text"
              value={editForm.website}
              onChange={(e) =>
                setEditForm({ ...editForm, website: e.target.value })
              }
              className="input-field"
              placeholder="https://example.com"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Phone Number
              </label>
              <input
                type="text"
                value={editForm.phone}
                onChange={(e) =>
                  setEditForm({ ...editForm, phone: e.target.value })
                }
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Primary Contact Email
              </label>
              <input
                type="email"
                value={editForm.email}
                onChange={(e) =>
                  setEditForm({ ...editForm, email: e.target.value })
                }
                className="input-field"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Physical Address
            </label>
            <input
              type="text"
              value={editForm.address}
              onChange={(e) =>
                setEditForm({ ...editForm, address: e.target.value })
              }
              className="input-field"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setShowEditModal(false)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleUpdate}
              disabled={!editForm.name.trim() || saving}
              className="btn-primary disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={linkModal.open}
        onClose={() =>
          setLinkModal({ open: false, resourceType: '', unlinked: [] })
        }
        title={`Link ${linkModal.resourceType.charAt(0).toUpperCase() + linkModal.resourceType.slice(1)}`}
      >
        {linkModal.unlinked.length === 0 ? (
          <p className="text-slate-500 text-center py-4">
            No unlinked {linkModal.resourceType}s available
          </p>
        ) : (
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {linkModal.unlinked.map((resource) => (
              <button
                key={resource.id}
                onClick={() => handleLink(resource.id)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm hover:bg-slate-50 transition-colors"
              >
                <LinkIcon className="w-4 h-4 text-blue-500 flex-shrink-0" />
                <span className="flex-1">{resource.name}</span>
              </button>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

function ResourceSection({
  title,
  icon,
  items,
  emptyText,
  renderName,
  renderMeta,
  onLink,
  onUnlink,
}: {
  title: string;
  icon: React.ReactNode;
  items: any[];
  emptyText: string;
  renderName: (item: any) => React.ReactNode;
  renderMeta: (item: any) => React.ReactNode;
  onLink: () => void;
  onUnlink: (itemId: string) => void;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="p-4 border-b flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
        <h2 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
          {icon}
          {title}
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            {items.length}
          </span>
        </h2>
        <button
          onClick={onLink}
          className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 bg-blue-50 dark:bg-blue-950/60 px-2.5 py-1 rounded-md border border-blue-200 dark:border-blue-900"
        >
          <LinkIcon className="w-3.5 h-3.5" />
          Link Existing {title.slice(0, -1)}
        </button>
      </div>

      <div className="divide-y border-t dark:border-slate-800">
        {items.length === 0 ? (
          <div className="p-6 text-center space-y-2">
            <p className="text-xs text-slate-400 font-medium">{emptyText}</p>
            <button
              onClick={onLink}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Link or Add New {title.slice(0, -1)}
            </button>
          </div>
        ) : (
          items.map((item: any) => (
            <div
              key={item.id}
              className="flex items-center gap-3 p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm text-slate-900 dark:text-white">
                  {renderName(item)}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {renderMeta(item)}
                </div>
              </div>
              <button
                onClick={() => onUnlink(item.id)}
                className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-50 text-red-500 rounded transition-opacity"
                title="Unlink"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ================= Contacts & Locations panels ================= */

function ContactsPanel({
  orgId,
  contacts,
  onChanged,
}: {
  orgId: string;
  contacts: { id: string; name: string; title: string | null; email: string | null; phone: string | null; mobile: string | null }[];
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', title: '', email: '', phone: '', mobile: '' });
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, organizationId: orgId }),
    });
    setForm({ name: '', title: '', email: '', phone: '', mobile: '' });
    setAdding(false);
    setBusy(false);
    onChanged();
  };

  const remove = async (id: string) => {
    await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
    onChanged();
  };

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900 dark:text-white">People</h3>
        <button onClick={() => setAdding((v) => !v)} className="btn-secondary text-xs flex items-center gap-1">
          {adding ? 'Cancel' : '+ Add Contact'}
        </button>
      </div>
      {adding && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4 p-3 rounded-lg" style={{ backgroundColor: 'var(--surface-2)' }}>
          {(['name', 'title', 'email', 'phone', 'mobile'] as const).map((k) => (
            <input
              key={k}
              value={form[k]}
              onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              placeholder={k === 'name' ? 'Full name *' : k.charAt(0).toUpperCase() + k.slice(1)}
              aria-label={k}
              className="input-field text-xs"
            />
          ))}
          <button onClick={add} disabled={busy || !form.name.trim()} className="btn-primary text-xs disabled:opacity-50">
            Save Contact
          </button>
        </div>
      )}
      {contacts.length === 0 ? (
        <p className="text-sm text-slate-500">No contacts yet. Add the people who answer when things break.</p>
      ) : (
        <div className="divide-y" style={{ borderColor: 'var(--card-border)' }}>
          {contacts.map((c) => (
            <div key={c.id} className="py-3 flex items-start justify-between gap-3 group">
              <div className="min-w-0">
                <p className="font-medium text-sm text-slate-900 dark:text-white">
                  {c.name} {c.title && <span className="text-slate-500 font-normal">· {c.title}</span>}
                </p>
                <p className="text-xs text-slate-500 flex flex-wrap gap-x-4">
                  {c.email && <span>{c.email}</span>}
                  {c.phone && <span>☎ {c.phone}</span>}
                  {c.mobile && <span>📱 {c.mobile}</span>}
                </p>
              </div>
              <button
                onClick={() => remove(c.id)}
                aria-label={`Delete ${c.name}`}
                className="opacity-0 group-hover:opacity-100 text-xs text-red-500 hover:underline transition-opacity"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LocationsPanel({
  orgId,
  locations,
  onChanged,
}: {
  orgId: string;
  locations: { id: string; name: string; address: string | null; city: string | null; state: string | null; country: string | null }[];
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', address: '', city: '', state: '', country: '' });
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    await fetch('/api/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, organizationId: orgId }),
    });
    setForm({ name: '', address: '', city: '', state: '', country: '' });
    setAdding(false);
    setBusy(false);
    onChanged();
  };

  const remove = async (id: string) => {
    await fetch(`/api/locations/${id}`, { method: 'DELETE' });
    onChanged();
  };

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900 dark:text-white">Sites</h3>
        <button onClick={() => setAdding((v) => !v)} className="btn-secondary text-xs flex items-center gap-1">
          {adding ? 'Cancel' : '+ Add Location'}
        </button>
      </div>
      {adding && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4 p-3 rounded-lg" style={{ backgroundColor: 'var(--surface-2)' }}>
          {(['name', 'address', 'city', 'state', 'country'] as const).map((k) => (
            <input
              key={k}
              value={form[k]}
              onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              placeholder={k === 'name' ? 'Site name *' : k.charAt(0).toUpperCase() + k.slice(1)}
              aria-label={k}
              className="input-field text-xs"
            />
          ))}
          <button onClick={add} disabled={busy || !form.name.trim()} className="btn-primary text-xs disabled:opacity-50">
            Save Location
          </button>
        </div>
      )}
      {locations.length === 0 ? (
        <p className="text-sm text-slate-500">No locations yet. Add the sites you support.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {locations.map((l) => (
            <div key={l.id} className="p-3 rounded-lg group" style={{ backgroundColor: 'var(--surface-2)' }}>
              <div className="flex items-start justify-between">
                <p className="font-medium text-sm text-slate-900 dark:text-white">{l.name}</p>
                <button
                  onClick={() => remove(l.id)}
                  aria-label={`Delete ${l.name}`}
                  className="opacity-0 group-hover:opacity-100 text-xs text-red-500 hover:underline transition-opacity"
                >
                  Remove
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {[l.address, l.city, l.state, l.country].filter(Boolean).join(', ') || '—'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
