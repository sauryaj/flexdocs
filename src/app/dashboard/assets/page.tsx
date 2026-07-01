'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Box,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { formatDate, cn } from '@/lib/utils';
import { EmptyState, ConfirmDialog } from '@/components/UIComponents';
import { useOrganization } from '@/lib/OrganizationContext';

interface Asset {
  id: string;
  name: string;
  assetType: string;
  fields: string;
  notes: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  tags: { id: string; name: string; color: string }[];
}

interface AssetType {
  id: string;
  name: string;
  color: string;
  icon: string;
  fields: string;
}

const assetTypeColors: Record<string, string> = {
  firewall: '#ef4444',
  switch: '#3b82f6',
  router: '#10b981',
  server: '#f59e0b',
  workstation: '#8b5cf6',
  printer: '#ec4899',
  access_point: '#06b6d4',
  nas: '#f97316',
  ups: '#6366f1',
  other: '#64748b',
};

export default function AssetsPage() {
  const { selectedOrg } = useOrganization();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showNewType, setShowNewType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeColor, setNewTypeColor] = useState('#6366f1');

  useEffect(() => {
    fetchAssets();
    fetchTypes();
  }, [selectedOrg]);

  const fetchAssets = async () => {
    const params = new URLSearchParams();
    if (selectedOrg?.id) {
      params.set('organizationId', selectedOrg.id);
    }
    const res = await fetch(`/api/assets?${params.toString()}`);
    const data = await res.json();
    setAssets(data.items || data);
    setLoading(false);
  };

  const fetchTypes = async () => {
    const res = await fetch('/api/asset-types');
    const data = await res.json();
    setAssetTypes(data);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await fetch(`/api/assets/${deleteId}`, { method: 'DELETE' });
    setAssets(assets.filter((a) => a.id !== deleteId));
    setDeleteId(null);
  };

  const handleCreateType = async () => {
    if (!newTypeName.trim()) return;
    const res = await fetch('/api/asset-types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newTypeName.trim(), color: newTypeColor }),
    });
    if (res.ok) {
      await fetchTypes();
      setNewTypeName('');
      setShowNewType(false);
    }
  };

  const filtered = assets.filter((a) => {
    const matchesSearch = a.name.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === 'all' || a.assetType === typeFilter;
    return matchesSearch && matchesType && !a.isArchived;
  });

  const types = [...new Set(assets.map((a) => a.assetType))];

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
          <h1 className="text-2xl font-bold text-slate-900">Flexible Assets</h1>
          <p className="text-slate-500">Track hardware, network devices, and custom assets</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowNewType(true)} className="btn-secondary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            New Type
          </button>
          <Link href="/dashboard/assets/new" className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            New Asset
          </Link>
        </div>
      </div>

      {/* Asset Type Badges */}
      {assetTypes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {assetTypes.map((type) => (
            <span
              key={type.id}
              className="badge flex items-center gap-1"
              style={{ backgroundColor: type.color + '20', color: type.color }}
            >
              <Box className="w-3 h-3" />
              {type.name}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search assets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-10"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="input-field w-auto"
        >
          <option value="all">All Types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t.charAt(0).toUpperCase() + t.slice(1).replace('_', ' ')}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Box className="w-8 h-8 text-slate-400" />}
          title="No assets found"
          description="Add your first flexible asset to start tracking"
          action={
            <Link href="/dashboard/assets/new" className="btn-primary">
              <Plus className="w-4 h-4 mr-2 inline" />
              New Asset
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((asset) => {
            const color = assetTypeColors[asset.assetType] || '#64748b';
            const fields = JSON.parse(asset.fields || '{}');
            return (
              <Link
                key={asset.id}
                href={`/dashboard/assets/${asset.id}`}
                className="card p-4 hover:shadow-md transition-shadow group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Box className="w-5 h-5" style={{ color }} />
                    <span
                      className="badge"
                      style={{ backgroundColor: color + '20', color }}
                    >
                      {asset.assetType.replace('_', ' ')}
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setDeleteId(asset.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-100 rounded transition-opacity"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>
                <h3 className="font-semibold text-slate-900 mb-1">{asset.name}</h3>
                {Object.keys(fields).length > 0 && (
                  <div className="text-sm text-slate-500 mb-3 space-y-0.5">
                    {Object.entries(fields).slice(0, 3).map(([key, value]) => (
                      <div key={key} className="flex gap-2">
                        <span className="text-slate-400">{key}:</span>
                        <span className="truncate">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div className="flex gap-1">
                    {asset.tags.slice(0, 2).map((tag) => (
                      <span
                        key={tag.id}
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: tag.color + '20', color: tag.color }}
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                  <span className="text-xs text-slate-400">{formatDate(asset.updatedAt)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Asset"
        message="Are you sure you want to delete this asset?"
      />

      {/* New Type Modal */}
      {showNewType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowNewType(false)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h2 className="text-lg font-semibold mb-4">New Asset Type</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Type Name</label>
                <input
                  type="text"
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  className="input-field"
                  placeholder="e.g., Firewall, Switch"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Color</label>
                <div className="flex gap-2">
                  {Object.values(assetTypeColors).map((c) => (
                    <button
                      key={c}
                      onClick={() => setNewTypeColor(c)}
                      className={cn(
                        'w-8 h-8 rounded-full border-2',
                        newTypeColor === c ? 'border-slate-900' : 'border-transparent'
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowNewType(false)} className="btn-secondary">Cancel</button>
                <button onClick={handleCreateType} className="btn-primary">Create</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
