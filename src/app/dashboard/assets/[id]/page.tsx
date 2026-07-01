'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Save, Loader2, Trash2, Plus, X,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { ConfirmDialog } from '@/components/UIComponents';

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

export default function AssetDetailPage() {
  const router = useRouter();
  const params = useParams();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [name, setName] = useState('');
  const [assetType, setAssetType] = useState('');
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    fetch(`/api/assets/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        setAsset(data);
        setName(data.name);
        setAssetType(data.assetType);
        setNotes(data.notes || '');
        setTags(data.tags.map((t: any) => t.name).join(', '));
        setFields(JSON.parse(data.fields || '{}'));
        setLoading(false);
      });
  }, [params.id]);

  const handleSave = async () => {
    setSaving(true);
    const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);
    await fetch(`/api/assets/${params.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, assetType, fields, notes, tags: tagList }),
    });
    setSaving(false);
  };

  const handleDelete = async () => {
    await fetch(`/api/assets/${params.id}`, { method: 'DELETE' });
    router.push('/dashboard/assets');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!asset) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/assets" className="p-2 hover:bg-slate-100 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Edit Asset</h1>
            <p className="text-sm text-slate-500">Last updated {formatDate(asset.updatedAt)}</p>
          </div>
        </div>
        <button onClick={() => setShowDelete(true)} className="p-2 hover:bg-red-50 text-red-500 rounded-lg">
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      <div className="card p-6 space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Asset Type</label>
            <input type="text" value={assetType} onChange={(e) => setAssetType(e.target.value)} className="input-field" />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-slate-700">Custom Fields</label>
            <button type="button" onClick={() => setFields({ ...fields, '': '' })} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add Field
            </button>
          </div>
          {Object.entries(fields).map(([key, value], i) => (
            <div key={i} className="flex gap-2 mb-2">
              <input
                type="text"
                value={key}
                onChange={(e) => {
                  const val = fields[key];
                  const newFields = { ...fields };
                  delete newFields[key];
                  newFields[e.target.value] = val;
                  setFields(newFields);
                }}
                className="input-field flex-1"
                placeholder="Field name"
              />
              <input
                type="text"
                value={value}
                onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
                className="input-field flex-1"
                placeholder="Value"
              />
              <button
                type="button"
                onClick={() => {
                  const newFields = { ...fields };
                  delete newFields[key];
                  setFields(newFields);
                }}
                className="p-2 hover:bg-red-50 text-red-500 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Tags (comma separated)</label>
          <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} className="input-field" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input-field" rows={4} />
        </div>

        <div className="flex justify-end gap-3">
          <Link href="/dashboard/assets" className="btn-secondary">Cancel</Link>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Delete Asset"
        message="Are you sure you want to delete this asset?"
      />
    </div>
  );
}
