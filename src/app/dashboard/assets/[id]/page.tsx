'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Save, Loader2, Trash2, Plus, X, LayoutGrid,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { ConfirmDialog } from '@/components/UIComponents';
import { RelatedItems } from '@/components/RelatedItems';

interface FieldDef {
  name: string;
  type: 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'url';
  required?: boolean;
  options?: string[];
}

interface AssetType {
  id: string;
  name: string;
  fields: string;
}

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
  const [types, setTypes] = useState<AssetType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/assets/${params.id}`).then((r) => r.json()),
      fetch('/api/asset-types').then((r) => (r.ok ? r.json() : [])),
    ]).then(([data, typeList]: [Asset & { fields: string }, AssetType[]]) => {
      setAsset(data);
      setName(data.name);
      setAssetType(data.assetType);
      setNotes(data.notes || '');
      setTags((data.tags || []).map((t) => t.name).join(', '));
      try { setFields(JSON.parse(data.fields || '{}')); } catch { setFields({}); }
      setTypes(Array.isArray(typeList) ? typeList : []);
      setLoading(false);
    });
  }, [params.id]);

  // Schema for the selected type, if it still exists
  const schema: FieldDef[] = (() => {
    const t = types.find((x) => x.name === assetType);
    if (!t) return [];
    try {
      const parsed = JSON.parse(t.fields || '[]');
      return Array.isArray(parsed)
        ? parsed.filter((f): f is FieldDef => typeof f === 'object' && f !== null && !!f.name)
        : [];
    } catch {
      return [];
    }
  })();
  const schemaNames = new Set(schema.map((f) => f.name));
  // Values not covered by the current schema (legacy or schema changed)
  const extraEntries = Object.entries(fields).filter(([k]) => !schemaNames.has(k));

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
            <label className="block text-sm font-medium text-slate-700 mb-1">Layout</label>
            <select
              value={schema.length > 0 || types.some((t) => t.name === assetType) ? assetType : '__custom__'}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '__custom__') return;
                setAssetType(v);
                setFields({});
              }}
              className="input-field"
            >
              {types.map((t) => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
              {!types.some((t) => t.name === assetType) && (
                <option value="__custom__">{assetType} (custom)</option>
              )}
            </select>
          </div>
        </div>

        {/* Structured layout fields */}
        {schema.length > 0 && (
          <div className="space-y-4 border-t pt-4">
            <h3 className="font-semibold text-sm text-slate-800 flex items-center gap-1.5">
              <LayoutGrid className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              {assetType} fields
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {schema.map((f) => (
                <div key={f.name}>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {f.name} {f.required && <span className="text-red-500">*</span>}
                  </label>
                  {f.type === 'select' ? (
                    <select
                      value={fields[f.name] ?? ''}
                      onChange={(e) => setFields({ ...fields, [f.name]: e.target.value })}
                      className="input-field"
                      required={f.required}
                    >
                      <option value="">Select…</option>
                      {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : f.type === 'checkbox' ? (
                    <label className="flex items-center gap-2 text-sm cursor-pointer mt-1">
                      <input
                        type="checkbox"
                        role="checkbox"
                        checked={fields[f.name] === 'true'}
                        onChange={(e) => setFields({ ...fields, [f.name]: e.target.checked ? 'true' : 'false' })}
                      />
                      Yes
                    </label>
                  ) : (
                    <input
                      type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                      value={fields[f.name] ?? ''}
                      onChange={(e) => setFields({ ...fields, [f.name]: e.target.value })}
                      className="input-field"
                      required={f.required}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Legacy / off-schema custom values */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-slate-700">
              {schema.length > 0 ? 'Additional fields' : 'Custom Fields'}
            </label>
            <button type="button" onClick={() => setFields({ ...fields, '': '' })} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add Field
            </button>
          </div>
          {(schema.length > 0 ? extraEntries : Object.entries(fields)).map(([key, value], i) => (
            <div key={`${key}-${i}`} className="flex gap-2 mb-2">
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
          {schema.length > 0 && types.some((t) => t.name === assetType) && (
            <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
              Editing the schema?{' '}
              <Link href="/dashboard/asset-layouts" className="underline hover:text-blue-600 transition-colors">Manage layouts →</Link>
            </p>
          )}
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

      <RelatedItems entityType="asset" entityId={String(params.id)} />

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
