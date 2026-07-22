'use client';

import { useState } from 'react';
import { Plus, Trash2, Box, Layers, Check } from 'lucide-react';
import { Modal } from '@/components/UIComponents';

export interface FieldDefinition {
  name: string;
  type: 'text' | 'password' | 'select' | 'link' | 'date' | 'file';
  required?: boolean;
  options?: string[]; // for select type
  description?: string;
}

interface AssetTypeBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AssetTypeBuilderModal({
  isOpen,
  onClose,
  onSuccess,
}: AssetTypeBuilderModalProps) {
  const [typeName, setTypeName] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [icon, setIcon] = useState('box');
  const [fields, setFields] = useState<FieldDefinition[]>([
    { name: 'Vendor / Provider', type: 'text', required: false },
    { name: 'Primary Contact', type: 'text', required: false },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addField = () => {
    setFields([...fields, { name: '', type: 'text', required: false }]);
  };

  const removeField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  const updateField = (index: number, patch: Partial<FieldDefinition>) => {
    const updated = [...fields];
    updated[index] = { ...updated[index], ...patch };
    setFields(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!typeName.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/asset-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: typeName.trim(),
          color,
          icon,
          fields: JSON.stringify(fields),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create asset type');
      }

      setTypeName('');
      setFields([]);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Flexible Asset Type">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 text-xs bg-red-50 text-red-600 rounded-lg border border-red-200">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Asset Type Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. LAN Infrastructure, Applications, Vendor Contact"
              value={typeName}
              onChange={(e) => setTypeName(e.target.value)}
              className="input-field text-xs py-1.5"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Badge Color
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-8 h-8 rounded border p-0.5 cursor-pointer"
              />
              <span className="text-xs font-mono text-slate-500">{color}</span>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-medium text-slate-700">
              Custom Field Definitions ({fields.length})
            </label>
            <button
              type="button"
              onClick={addField}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 hover:underline"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Field
            </button>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {fields.map((field, i) => (
              <div
                key={i}
                className="p-3 bg-slate-50 border rounded-lg space-y-2 relative group"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Field Name"
                    value={field.name}
                    onChange={(e) => updateField(i, { name: e.target.value })}
                    className="input-field text-xs py-1 flex-1"
                  />

                  <select
                    value={field.type}
                    onChange={(e) =>
                      updateField(i, { type: e.target.value as FieldDefinition['type'] })
                    }
                    className="input-field text-xs py-1 w-28"
                  >
                    <option value="text">Text</option>
                    <option value="password">Password</option>
                    <option value="select">Dropdown</option>
                    <option value="date">Date</option>
                    <option value="link">URL / Link</option>
                    <option value="file">Attachment</option>
                  </select>

                  <label className="flex items-center gap-1 text-xs text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={field.required || false}
                      onChange={(e) => updateField(i, { required: e.target.checked })}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    Req
                  </label>

                  <button
                    type="button"
                    onClick={() => removeField(i)}
                    className="p-1 hover:bg-red-50 text-red-500 rounded transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {field.type === 'select' && (
                  <div>
                    <input
                      type="text"
                      placeholder="Options (comma separated, e.g. Active, Inactive, Pending)"
                      value={field.options?.join(', ') || ''}
                      onChange={(e) =>
                        updateField(i, {
                          options: e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      className="input-field text-xs py-1"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary text-xs py-1.5 px-3"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!typeName.trim() || submitting}
            className="btn-primary text-xs py-1.5 px-4 disabled:opacity-50 flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            {submitting ? 'Creating...' : 'Create Asset Type'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
