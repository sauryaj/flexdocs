'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Plus, Trash2, Pencil, LayoutGrid, X, GripVertical, Check,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/UIComponents';

interface FieldDef {
  name: string;
  type: 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'url';
  required?: boolean;
  options?: string[];
}

interface AssetType {
  id: string;
  name: string;
  color: string;
  icon: string;
  fields: string;
}

const FIELD_TYPES: FieldDef['type'][] = ['text', 'number', 'date', 'select', 'checkbox', 'url'];

export default function AssetLayoutsPage() {
  const router = useRouter();
  const [types, setTypes] = useState<AssetType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AssetType | null>(null); // null=closed, object=edit
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<AssetType | null>(null);
  const [saving, setSaving] = useState(false);

  // form state
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [icon, setIcon] = useState('box');
  const [fields, setFields] = useState<FieldDef[]>([]);

  const load = useCallback(async () => {
    const res = await fetch('/api/asset-types');
    if (res.ok) setTypes(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setName(''); setColor('#6366f1'); setIcon('box');
    setFields([{ name: '', type: 'text', required: false }]);
    setCreating(true); setEditing(null);
  };

  const openEdit = (t: AssetType) => {
    setName(t.name); setColor(t.color); setIcon(t.icon);
    try {
      const parsed = JSON.parse(t.fields || '[]');
      setFields(
        Array.isArray(parsed) && parsed.length > 0
          ? parsed.map((f: unknown) =>
              typeof f === 'object' && f !== null
                ? (f as FieldDef)
                : { name: String(f), type: 'text' as const },
            )
          : [{ name: '', type: 'text', required: false }],
      );
    } catch {
      setFields([{ name: '', type: 'text', required: false }]);
    }
    setEditing(t); setCreating(false);
  };

  const close = () => { setCreating(false); setEditing(null); };

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const cleanFields = fields
        .filter((f) => f.name.trim())
        .map((f) => ({
          name: f.name.trim(),
          type: f.type,
          ...(f.required ? { required: true } : {}),
          ...(f.type === 'select' && f.options?.length ? { options: f.options } : {}),
        }));
      const payload = { name: name.trim(), color, icon, fields: cleanFields };
      const res = editing
        ? await fetch(`/api/asset-types/${editing.id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
        : await fetch('/api/asset-types', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          });
      if (res.ok) {
        close();
        await load();
      }
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!deleting) return;
    await fetch(`/api/asset-types/${deleting.id}`, { method: 'DELETE' });
    setDeleting(null);
    load();
  };

  const updateField = (idx: number, patch: Partial<FieldDef>) => {
    setFields((prev) => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard/assets')} className="p-2 rounded-lg hover:bg-[var(--surface-2)]" aria-label="Back to assets">
            <ArrowLeft className="w-5 h-5" style={{ color: 'var(--muted)' }} />
          </button>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Asset Layouts</h1>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Define custom asset types with structured fields — printers, licenses, warranties, anything.
            </p>
          </div>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> New Layout
        </button>
      </div>

      {loading ? (
        <div className="card p-8 text-center text-sm" style={{ color: 'var(--muted)' }}>Loading…</div>
      ) : types.length === 0 ? (
        <div className="card p-10 text-center">
          <LayoutGrid className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--accent)' }} />
          <p className="font-medium" style={{ color: 'var(--foreground)' }}>No layouts yet</p>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            Create your first layout to give assets structured fields.
          </p>
          <button onClick={openCreate} className="btn-primary mt-4">Create layout</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {types.map((t) => {
            let fieldCount = 0;
            try { fieldCount = JSON.parse(t.fields || '[]').length; } catch { /* legacy */ }
            return (
              <div key={t.id} className="card p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ backgroundColor: t.color }}>
                      {t.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold truncate" style={{ color: 'var(--foreground)' }}>{t.name}</p>
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>{fieldCount} field{fieldCount === 1 ? '' : 's'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => openEdit(t)} aria-label={`Edit ${t.name}`} className="p-1.5 rounded hover:bg-[var(--surface-2)]" style={{ color: 'var(--muted)' }}>
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => setDeleting(t)} aria-label={`Delete ${t.name}`} className="p-1.5 rounded hover:bg-red-500/10 hover:text-red-500" style={{ color: 'var(--muted)' }}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <ul className="space-y-1">
                  {(Array.isArray(JSON.parse(t.fields || '[]')) ? JSON.parse(t.fields) : []).slice(0, 4).map((f: unknown, i: number) => (
                    <li key={i} className="text-xs flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
                      <Check className="w-3 h-3" style={{ color: t.color }} />
                      {typeof f === 'object' && f !== null
                        ? `${(f as FieldDef).name}${(f as FieldDef).required ? ' *' : ''} · ${(f as FieldDef).type}`
                        : String(f)}
                    </li>
                  ))}
                  {fieldCount > 4 && (
                    <li className="text-xs" style={{ color: 'var(--muted)' }}>+{fieldCount - 4} more</li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit modal */}
      {(creating || editing) && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={editing ? 'Edit layout' : 'New layout'}
          onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
        >
          <div className="w-full max-w-2xl rounded-2xl shadow-2xl max-h-[85vh] overflow-y-auto" style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--card-border)' }}>
              <h2 className="font-semibold" style={{ color: 'var(--foreground)' }}>{editing ? `Edit ${editing.name}` : 'New asset layout'}</h2>
              <button onClick={close} aria-label="Close" className="p-1 rounded hover:bg-[var(--surface-2)]" style={{ color: 'var(--muted)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted)' }}>Layout name *</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Printer, Software License…" className="input-field" autoFocus />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted)' }}>Color</label>
                  <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Layout color" className="input-field h-[38px] p-1" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Fields</label>
                  <button
                    onClick={() => setFields([...fields, { name: '', type: 'text', required: false }])}
                    className="text-xs flex items-center gap-1 hover:underline"
                    style={{ color: 'var(--accent)' }}
                  >
                    <Plus className="w-3 h-3" /> Add field
                  </button>
                </div>
                <div className="space-y-2">
                  {fields.map((f, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 rounded-lg" style={{ backgroundColor: 'var(--surface-2)' }}>
                      <GripVertical className="w-3.5 h-3.5 shrink-0 opacity-40" style={{ color: 'var(--muted)' }} />
                      <input
                        value={f.name}
                        onChange={(e) => updateField(idx, { name: e.target.value })}
                        placeholder="Field label"
                        aria-label={`Field ${idx + 1} label`}
                        className="input-field flex-1 text-xs py-1.5"
                      />
                      <select
                        value={f.type}
                        onChange={(e) => updateField(idx, { type: e.target.value as FieldDef['type'] })}
                        aria-label={`Field ${idx + 1} type`}
                        className="input-field w-auto text-xs py-1.5"
                      >
                        {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      {f.type === 'select' && (
                        <input
                          value={(f.options ?? []).join(', ')}
                          onChange={(e) => updateField(idx, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                          placeholder="Options, comma separated"
                          aria-label={`Field ${idx + 1} options`}
                          className="input-field w-40 text-xs py-1.5"
                        />
                      )}
                      <label className="flex items-center gap-1 text-xs shrink-0 cursor-pointer" style={{ color: 'var(--muted)' }}>
                        <input
                          type="checkbox"
                          role="checkbox"
                          checked={!!f.required}
                          onChange={(e) => updateField(idx, { required: e.target.checked })}
                          aria-label={`Field ${idx + 1} required`}
                        />
                        req
                      </label>
                      <button
                        onClick={() => setFields(fields.filter((_, i) => i !== idx))}
                        aria-label={`Remove field ${idx + 1}`}
                        className="p-1 rounded hover:text-red-500 shrink-0"
                        style={{ color: 'var(--muted)' }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {fields.length === 0 && (
                    <p className="text-xs py-2" style={{ color: 'var(--muted)' }}>No fields — assets of this layout will be name-only.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 px-5 py-4" style={{ borderTop: '1px solid var(--card-border)' }}>
              <button onClick={close} className="btn-secondary">Cancel</button>
              <button onClick={save} disabled={saving || !name.trim()} className="btn-primary disabled:opacity-50">
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Create layout'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={doDelete}
        title="Delete layout"
        message={`Delete the "${deleting?.name}" layout? Existing assets keep their data but lose schema validation.`}
      />

      <p className="text-xs text-center pt-2" style={{ color: 'var(--muted)' }}>
        Layouts appear in the asset picker at <Link href="/dashboard/assets/new" className="underline">New Flexible Asset</Link>.
      </p>
    </div>
  );
}
