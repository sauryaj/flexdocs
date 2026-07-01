'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Loader2, Plus, X } from 'lucide-react';

interface AssetType {
  id: string;
  name: string;
  color: string;
  fields: string;
}

export default function NewAssetPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [assetType, setAssetType] = useState('');
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/asset-types').then((r) => r.json()).then(setAssetTypes);
  }, []);

  const currentType = assetTypes.find((t) => t.name === assetType);
  const typeFields: string[] = currentType ? JSON.parse(currentType.fields || '[]') : [];

  const addField = () => {
    setFields({ ...fields, '': '' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);

    const res = await fetch('/api/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, assetType, fields, notes, tags: tagList }),
    });

    if (res.ok) {
      const asset = await res.json();
      router.push(`/dashboard/assets/${asset.id}`);
    }
    setLoading(false);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/assets" className="p-2 hover:bg-slate-100 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">New Asset</h1>
          <p className="text-slate-500">Add a flexible asset to track</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
              placeholder="e.g., Main Firewall"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Asset Type</label>
            <select
              value={assetType}
              onChange={(e) => {
                setAssetType(e.target.value);
                setFields({});
              }}
              className="input-field"
              required
            >
              <option value="">Select type...</option>
              {assetTypes.map((t) => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Dynamic Fields */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-slate-700">Custom Fields</label>
            <button type="button" onClick={addField} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add Field
            </button>
          </div>
          {Object.entries(fields).map(([key, value], i) => (
            <div key={i} className="flex gap-2 mb-2">
              <input
                type="text"
                value={key}
                onChange={(e) => {
                  const newFields = { ...fields };
                  const val = newFields[key];
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
          {typeFields.length > 0 && (
            <div className="mt-2 text-xs text-slate-500">
              Suggested fields: {typeFields.join(', ')}
            </div>
          )}
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
            placeholder="production, rack-a"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input-field"
            rows={3}
            placeholder="Additional notes..."
          />
        </div>

        <div className="flex justify-end gap-3">
          <Link href="/dashboard/assets" className="btn-secondary">Cancel</Link>
          <button type="submit" disabled={loading} className="btn-primary flex items-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Asset
          </button>
        </div>
      </form>
    </div>
  );
}
