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
  const rawFields = currentType?.fields ? JSON.parse(currentType.fields) : [];
  const structuredFields: any[] = Array.isArray(rawFields) ? rawFields : [];

  const addField = () => {
    setFields({ ...fields, [`Custom Field ${Object.keys(fields).length + 1}`]: '' });
  };

  const handleFieldChange = (key: string, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
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
            <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
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
            <label className="block text-sm font-medium text-slate-700 mb-1">Asset Type *</label>
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

        {/* Structured Schema Fields */}
        {structuredFields.length > 0 && (
          <div className="space-y-4 border-t pt-4">
            <h3 className="font-semibold text-sm text-slate-800">
              {assetType} Custom Schema Fields
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {structuredFields.map((f: any, idx: number) => {
                const isObj = typeof f === 'object' && f !== null;
                const fieldName = isObj ? f.name : String(f);
                const fieldType = isObj ? f.type || 'text' : 'text';
                const options = isObj && Array.isArray(f.options) ? f.options : [];

                return (
                  <div key={idx}>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {fieldName} {isObj && f.required && <span className="text-red-500">*</span>}
                    </label>

                    {fieldType === 'select' ? (
                      <select
                        value={fields[fieldName] || ''}
                        onChange={(e) => handleFieldChange(fieldName, e.target.value)}
                        className="input-field text-xs py-1.5"
                        required={isObj && f.required}
                      >
                        <option value="">Select option...</option>
                        {options.map((opt: string) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : fieldType === 'date' ? (
                      <input
                        type="date"
                        value={fields[fieldName] || ''}
                        onChange={(e) => handleFieldChange(fieldName, e.target.value)}
                        className="input-field text-xs py-1.5"
                        required={isObj && f.required}
                      />
                    ) : fieldType === 'password' ? (
                      <input
                        type="password"
                        value={fields[fieldName] || ''}
                        onChange={(e) => handleFieldChange(fieldName, e.target.value)}
                        className="input-field text-xs py-1.5 font-mono"
                        placeholder="••••••••"
                        required={isObj && f.required}
                      />
                    ) : (
                      <input
                        type={fieldType === 'link' ? 'url' : 'text'}
                        value={fields[fieldName] || ''}
                        onChange={(e) => handleFieldChange(fieldName, e.target.value)}
                        className="input-field text-xs py-1.5"
                        placeholder={`Enter ${fieldName.toLowerCase()}...`}
                        required={isObj && f.required}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Freeform Additional Fields */}
        <div className="border-t pt-4">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-slate-700">Additional Fields</label>
            <button type="button" onClick={addField} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add Field
            </button>
          </div>
          {Object.entries(fields)
            .filter(([k]) => !structuredFields.some((sf: any) => (typeof sf === 'object' ? sf.name : sf) === k))
            .map(([key, value], i) => (
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
