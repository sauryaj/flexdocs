'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Link2,
  Plus,
  Trash2,
  FileText,
  Key,
  Globe,
  HardDrive,
  CheckSquare,
  Server,
  ExternalLink,
  Search,
} from 'lucide-react';
import { Modal } from '@/components/UIComponents';

interface Relationship {
  id: string;
  name: string;
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  sourceName?: string;
  targetName?: string;
  notes?: string;
}

interface RelatedItemsPanelProps {
  entityType: string;
  entityId: string;
  entityName?: string;
  organizationId?: string | null;
}

export function RelatedItemsPanel({
  entityType,
  entityId,
}: RelatedItemsPanelProps) {
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const [targetType, setTargetType] = useState('password');
  const [targetId, setTargetId] = useState('');
  const [relName, setRelName] = useState('related_to');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [availableTargets, setAvailableTargets] = useState<{ id: string; name: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingTargets, setLoadingTargets] = useState(false);

  useEffect(() => {
    fetchRelationships();
  }, [entityType, entityId]);

  const fetchRelationships = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/relationships?entityType=${entityType}&entityId=${entityId}`);
      if (res.ok) {
        const data = await res.json();
        setRelationships(Array.isArray(data) ? data : []);
      }
    } catch {
      // Error fetching
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!showAddModal) return;
    fetchAvailableTargets(targetType);
  }, [showAddModal, targetType]);

  const fetchAvailableTargets = async (type: string) => {
    setLoadingTargets(true);
    try {
      let endpoint = '';
      switch (type) {
        case 'document':
          endpoint = '/api/documents';
          break;
        case 'password':
          endpoint = '/api/passwords';
          break;
        case 'domain':
          endpoint = '/api/domains';
          break;
        case 'asset':
          endpoint = '/api/assets';
          break;
        case 'server':
          endpoint = '/api/servers';
          break;
        case 'checklist':
          endpoint = '/api/checklists';
          break;
      }
      if (!endpoint) return;

      const res = await fetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : data.documents || data.passwords || data.domains || data.assets || data.servers || data.checklists || [];
        setAvailableTargets(
          items
            .filter((i: any) => i.id !== entityId)
            .map((i: any) => ({ id: i.id, name: i.title || i.name || i.hostname || i.id }))
        );
      }
    } catch {
      // Error loading targets
    } finally {
      setLoadingTargets(false);
    }
  };

  const handleAddRelationship = async () => {
    if (!targetId) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/relationships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: relName,
          sourceType: entityType,
          sourceId: entityId,
          targetType,
          targetId,
          notes,
        }),
      });

      if (res.ok) {
        setShowAddModal(false);
        setTargetId('');
        setNotes('');
        fetchRelationships();
      }
    } catch {
      // Error adding relationship
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRelationship = async (relId: string) => {
    try {
      const res = await fetch(`/api/relationships/${relId}`, { method: 'DELETE' });
      if (res.ok) {
        setRelationships((prev) => prev.filter((r) => r.id !== relId));
      }
    } catch {
      // Error deleting
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'document':
        return <FileText className="w-4 h-4 text-blue-500" />;
      case 'password':
        return <Key className="w-4 h-4 text-emerald-500" />;
      case 'domain':
        return <Globe className="w-4 h-4 text-purple-500" />;
      case 'asset':
        return <HardDrive className="w-4 h-4 text-amber-500" />;
      case 'server':
        return <Server className="w-4 h-4 text-indigo-500" />;
      case 'checklist':
        return <CheckSquare className="w-4 h-4 text-rose-500" />;
      default:
        return <Link2 className="w-4 h-4 text-slate-400" />;
    }
  };

  const getHref = (type: string, id: string) => {
    switch (type) {
      case 'document':
        return `/dashboard/documents/${id}`;
      case 'password':
        return `/dashboard/passwords/${id}`;
      case 'domain':
        return `/dashboard/domains/${id}`;
      case 'asset':
        return `/dashboard/assets/${id}`;
      case 'server':
        return `/dashboard/servers/${id}`;
      case 'checklist':
        return `/dashboard/checklists/${id}`;
      default:
        return '#';
    }
  };

  const filteredTargets = availableTargets.filter((t) =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="card p-4 space-y-4" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
      <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--card-border)' }}>
        <h3 className="font-semibold text-sm flex items-center gap-2" style={{ color: 'var(--foreground)' }}>
          <Link2 className="w-4 h-4 text-blue-500" />
          Related Items
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
            {relationships.length}
          </span>
        </h3>
        <button
          onClick={() => setShowAddModal(true)}
          className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1 hover:underline"
        >
          <Plus className="w-3.5 h-3.5" />
          Link Item
        </button>
      </div>

      {loading ? (
        <div className="py-4 text-center">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mx-auto" />
        </div>
      ) : relationships.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-3 italic">
          No items linked to this {entityType} yet.
        </p>
      ) : (
        <div className="space-y-2">
          {relationships.map((rel) => {
            const isSource = rel.sourceType === entityType && rel.sourceId === entityId;
            const otherType = isSource ? rel.targetType : rel.sourceType;
            const otherId = isSource ? rel.targetId : rel.sourceId;
            const otherName = isSource ? rel.targetName : rel.sourceName;

            return (
              <div
                key={rel.id}
                className="flex items-center justify-between p-2.5 rounded-lg border text-sm hover:bg-slate-50 transition-colors group"
                style={{ borderColor: 'var(--card-border)' }}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {getIcon(otherType)}
                  <div className="min-w-0 flex-1">
                    <Link
                      href={getHref(otherType, otherId)}
                      className="font-medium text-xs text-slate-800 hover:text-blue-600 truncate flex items-center gap-1"
                    >
                      <span className="truncate">{otherName || otherId}</span>
                      <ExternalLink className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                    <div className="text-[10px] text-slate-400 capitalize">
                      {rel.name || 'related'} • {otherType}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleDeleteRelationship(rel.id)}
                  className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-50 text-red-500 rounded transition-opacity"
                  title="Unlink"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Related Item Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Link Related Item"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Asset Type to Link
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { type: 'password', label: 'Password', icon: Key },
                { type: 'document', label: 'Document', icon: FileText },
                { type: 'asset', label: 'Flexible Asset', icon: HardDrive },
                { type: 'domain', label: 'Domain', icon: Globe },
                { type: 'server', label: 'Server', icon: Server },
                { type: 'checklist', label: 'Checklist', icon: CheckSquare },
              ].map((item) => (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => {
                    setTargetType(item.type);
                    setTargetId('');
                  }}
                  className={`p-2 rounded-lg border text-xs font-medium flex items-center gap-2 transition-all ${
                    targetType === item.type
                      ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-sm'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <item.icon className="w-3.5 h-3.5" />
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Select {targetType.charAt(0).toUpperCase() + targetType.slice(1)}
            </label>
            <div className="relative mb-2">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder={`Search ${targetType}s...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-field pl-8 text-xs py-1.5"
              />
            </div>

            {loadingTargets ? (
              <div className="py-4 text-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mx-auto" />
              </div>
            ) : filteredTargets.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-3">
                No available {targetType}s found.
              </p>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1 border rounded-lg p-1">
                {filteredTargets.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTargetId(item.id)}
                    className={`w-full text-left px-3 py-2 rounded-md text-xs font-medium transition-colors flex items-center justify-between ${
                      targetId === item.id
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span>{item.name}</span>
                    {targetId === item.id && <span className="text-[10px]">Selected</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Relationship Type
            </label>
            <select
              value={relName}
              onChange={(e) => setRelName(e.target.value)}
              className="input-field text-xs py-1.5"
            >
              <option value="related_to">Related To</option>
              <option value="hosted_on">Hosted On</option>
              <option value="managed_by">Managed By</option>
              <option value="uses_credential">Uses Credential</option>
              <option value="documents_architecture">Documents Architecture</option>
              <option value="depends_on">Depends On</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Notes (Optional)
            </label>
            <input
              type="text"
              placeholder="Context or description of link..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input-field text-xs py-1.5"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="btn-secondary text-xs py-1.5 px-3"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddRelationship}
              disabled={!targetId || submitting}
              className="btn-primary text-xs py-1.5 px-4 disabled:opacity-50"
            >
              {submitting ? 'Linking...' : 'Link Relationship'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
