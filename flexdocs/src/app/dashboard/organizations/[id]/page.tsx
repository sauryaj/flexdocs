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
  Globe2,
  MapPin,
  X,
} from 'lucide-react';
import { ConfirmDialog, Modal } from '@/components/UIComponents';

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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/organizations"
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{org.name}</h1>
          {org.description && (
            <p className="text-slate-500">{org.description}</p>
          )}
        </div>
        <button
          onClick={() => setShowEditModal(true)}
          className="btn-secondary flex items-center gap-2"
        >
          <Pencil className="w-4 h-4" />
          Edit
        </button>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="btn-danger flex items-center gap-2"
        >
          <Trash2 className="w-4 h-4" />
          Delete
        </button>
      </div>

      {(org.website || org.phone || org.email || org.address) && (
        <div className="card p-4">
          <div className="flex flex-wrap gap-4 text-sm">
            {org.website && (
              <a
                href={org.website.startsWith('http') ? org.website : `https://${org.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-blue-600 hover:underline"
              >
                <Globe2 className="w-4 h-4" />
                {org.website}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {org.phone && (
              <span className="flex items-center gap-2 text-slate-600">
                <Phone className="w-4 h-4" />
                {org.phone}
              </span>
            )}
            {org.email && (
              <span className="flex items-center gap-2 text-slate-600">
                <Mail className="w-4 h-4" />
                {org.email}
              </span>
            )}
            {org.address && (
              <span className="flex items-center gap-2 text-slate-600">
                <MapPin className="w-4 h-4" />
                {org.address}
              </span>
            )}
          </div>
        </div>
      )}

      <ResourceSection
        title="Documents"
        icon={<FileText className="w-5 h-5 text-blue-500" />}
        items={org.documents}
        emptyText="No documents linked"
        renderName={(item: any) => (
          <Link href={`/dashboard/documents/${item.id}`} className="hover:text-blue-600 transition-colors">
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
        icon={<Key className="w-5 h-5 text-green-500" />}
        items={org.passwords}
        emptyText="No passwords linked"
        renderName={(item: any) => (
          <Link href={`/dashboard/passwords/${item.id}`} className="hover:text-blue-600 transition-colors">
            {item.name}
          </Link>
        )}
        renderMeta={(item: any) => (
          <>
            <span className="text-sm text-slate-500">{item.username}</span>
          </>
        )}
        onLink={() => openLinkModal('password')}
        onUnlink={(itemId) => handleUnlink('password', itemId)}
      />

      <ResourceSection
        title="Domains"
        icon={<Globe className="w-5 h-5 text-purple-500" />}
        items={org.domains}
        emptyText="No domains linked"
        renderName={(item: any) => (
          <Link href={`/dashboard/domains/${item.id}`} className="hover:text-blue-600 transition-colors">
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
        title="Assets"
        icon={<HardDrive className="w-5 h-5 text-amber-500" />}
        items={org.assets}
        emptyText="No assets linked"
        renderName={(item: any) => (
          <Link href={`/dashboard/assets/${item.id}`} className="hover:text-blue-600 transition-colors">
            {item.name}
          </Link>
        )}
        renderMeta={(item: any) => (
          <>
            <span className="badge badge-yellow">{item.assetType}</span>
          </>
        )}
        onLink={() => openLinkModal('asset')}
        onUnlink={(itemId) => handleUnlink('asset', itemId)}
      />

      <ResourceSection
        title="Checklists"
        icon={<CheckSquare className="w-5 h-5 text-rose-500" />}
        items={org.checklists}
        emptyText="No checklists linked"
        renderName={(item: any) => (
          <Link href={`/dashboard/checklists/${item.id}`} className="hover:text-blue-600 transition-colors">
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
        title="Edit Organization"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Name
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
              Description
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
              Website
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
                Phone
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
                Email
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
              Address
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
    <div className="card">
      <div className="p-4 border-b flex items-center justify-between">
        <h2 className="font-semibold text-slate-900 flex items-center gap-2">
          {icon}
          {title}
          <span className="text-sm font-normal text-slate-400">
            ({items.length})
          </span>
        </h2>
        <button
          onClick={onLink}
          className="text-sm text-blue-600 hover:underline flex items-center gap-1"
        >
          <LinkIcon className="w-4 h-4" />
          Link {title.slice(0, -1)}
        </button>
      </div>
      <div className="divide-y">
        {items.length === 0 ? (
          <p className="p-4 text-slate-500 text-sm">{emptyText}</p>
        ) : (
          items.map((item: any) => (
            <div
              key={item.id}
              className="flex items-center gap-3 p-4 hover:bg-slate-50 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {renderName(item)}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {renderMeta(item)}
                </div>
              </div>
              <button
                onClick={() => onUnlink(item.id)}
                className="p-1 opacity-0 group-hover:opacity-100 hover:bg-slate-100 rounded transition-opacity"
                title="Unlink"
              >
                <X className="w-4 h-4 text-red-500" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
