'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Edit3, Loader2, ClipboardList } from 'lucide-react';
import { RequireStaff } from '@/components/RequireStaff';

interface TemplateField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'boolean';
  required: boolean;
  options?: string[];
}

interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  priority: string;
  active: boolean;
  fields: TemplateField[];
  organizationId: string | null;
  organization?: { name: string } | null;
}

const FIELD_TYPES: TemplateField['type'][] = ['text', 'textarea', 'select', 'boolean'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

const emptyField = (): TemplateField => ({ key: '', label: '', type: 'text', required: false, options: [] });

export default function ServiceRequestsPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
  const [editing, setEditing] = useState<Template | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [priority, setPriority] = useState('medium');
  const [active, setActive] = useState(true);
  const [orgId, setOrgId] = useState('');
  const [fields, setFields] = useState<TemplateField[]>([]);

  const load = useCallback(async () => {
    const res = await fetch('/api/service-request-templates');
    if (res.ok) setTemplates(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    fetch('/api/organizations')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setOrgs((Array.isArray(data) ? data : data?.organizations || []).map((o: any) => ({ id: o.id, name: o.name }))))
      .catch(() => {});
  }, [load]);

  const openNew = () => {
    setIsNew(true);
    setEditing(null);
    setName(''); setDescription(''); setCategory('general'); setPriority('medium');
    setActive(true); setOrgId(''); setFields([emptyField()]);
  };

  const openEdit = (t: Template) => {
    setIsNew(false);
    setEditing(t);
    setName(t.name); setDescription(t.description); setCategory(t.category); setPriority(t.priority);
    setActive(t.active); setOrgId(t.organizationId || ''); setFields(t.fields?.length ? t.fields : [emptyField()]);
  };

  const setField = (i: number, patch: Partial<TemplateField>) => {
    setFields((fs) => fs.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  };

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const base = {
      name, description, category, priority, active,
      organizationId: orgId || null,
      fields: fields.map((f) => ({ ...f, key: f.key.trim() || f.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_') })),
    };
    const res = editing
      ? await fetch(`/api/service-request-templates/${editing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(base) })
      : await fetch('/api/service-request-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(base) });
    setSaving(false);
    if (res.ok) {
      setEditing(null);
      load();
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this request template?')) return;
    await fetch(`/api/service-request-templates/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <RequireStaff>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Service Requests</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Catalog items clients pick from in the portal. Submissions open structured tickets.
            </p>
          </div>
          <button
            onClick={openNew}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" /> New Template
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
        ) : templates.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
            <ClipboardList className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400">No request templates yet. Create your first catalog item.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {templates.map((t) => (
              <div key={t.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 flex flex-col">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">{t.name}</h3>
                    <p className="text-xs text-gray-400 uppercase tracking-wide mt-0.5">
                      {t.category} · {t.priority}
                      {t.organization ? ` · ${t.organization.name}` : ' · All tenants'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" title="Edit">
                      <Edit3 className="w-4 h-4 text-gray-500" />
                    </button>
                    <button onClick={() => remove(t.id)} className="p-1.5 rounded-lg hover:bg-red-50" title="Delete">
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 flex-1">{t.description}</p>
                <div className="flex items-center gap-2 mt-3 text-xs">
                  <span className={`px-2 py-0.5 rounded-full ${t.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {t.active ? 'Active' : 'Hidden'}
                  </span>
                  <span className="text-gray-400">{t.fields?.length || 0} fields</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {(editing || isNew) && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setEditing(null); setIsNew(false); }}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                {isNew ? 'New Request Template' : 'Edit Template'}
              </h2>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">Name</label>
                    <input value={name} onChange={(e) => setName(e.target.value)} className="input-field" placeholder="e.g. New User Setup" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">Category</label>
                    <select value={category} onChange={(e) => setCategory(e.target.value)} className="input-field">
                      <option value="general">General</option>
                      <option value="support">Support</option>
                      <option value="hardware">Hardware</option>
                      <option value="software">Software</option>
                      <option value="network">Network</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">Description</label>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input-field" rows={2} placeholder="What should the client expect?" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">Default priority</label>
                    <select value={priority} onChange={(e) => setPriority(e.target.value)} className="input-field">
                      {PRIORITIES.map((p) => <option key={p} value={p} className="capitalize">{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">Tenant</label>
                    <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className="input-field">
                      <option value="">All tenants</option>
                      {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 pb-2">
                      <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="w-4 h-4" />
                      Active
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-300 mb-2">Request fields</label>
                  <div className="space-y-2">
                    {fields.map((f, i) => (
                      <div key={i} className="grid grid-cols-12 gap-2 items-center bg-gray-50 dark:bg-gray-700/40 rounded-lg p-2">
                        <input
                          value={f.label}
                          onChange={(e) => setField(i, { label: e.target.value })}
                          className="col-span-3 input-field"
                          placeholder="Label"
                        />
                        <select value={f.type} onChange={(e) => setField(i, { type: e.target.value as TemplateField['type'] })} className="col-span-2 input-field">
                          {FIELD_TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
                        </select>
                        {f.type === 'select' ? (
                          <input
                            value={f.options?.join(', ') || ''}
                            onChange={(e) => setField(i, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                            className="col-span-4 input-field"
                            placeholder="Option1, Option2"
                          />
                        ) : (
                          <span className="col-span-4 text-xs text-gray-400">{f.type === 'text' ? 'Single line' : f.type === 'textarea' ? 'Multi line' : 'Yes / No'}</span>
                        )}
                        <label className="col-span-1 flex items-center gap-1 text-xs text-gray-500">
                          <input type="checkbox" checked={f.required} onChange={(e) => setField(i, { required: e.target.checked })} className="w-3.5 h-3.5" />
                          req
                        </label>
                        <button onClick={() => setFields((fs) => fs.filter((_, idx) => idx !== i))} className="col-span-1 p-1.5 rounded hover:bg-red-50">
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </button>
                        {f.type === 'select' && (
                          <div className="col-span-12" />
                        )}
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setFields((fs) => [...fs, emptyField()])} className="mt-2 text-sm text-blue-600 inline-flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Add field
                  </button>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button onClick={() => { setEditing(null); setIsNew(false); }} className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm">
                    Cancel
                  </button>
                  <button onClick={save} disabled={!name.trim() || saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm">
                    {saving ? 'Saving…' : 'Save Template'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </RequireStaff>
  );
}