'use client';

import { useState, useEffect } from 'react';
import { FileText, Plus, Trash2, Copy, Loader2 } from 'lucide-react';

interface Template {
  id: string;
  name: string;
  description: string | null;
  category: string;
  content: string;
  icon: string;
  isPublic: boolean;
  createdAt: string;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formCategory, setFormCategory] = useState('general');
  const [formContent, setFormContent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchTemplates(); }, []);

  const fetchTemplates = async () => {
    const res = await fetch('/api/templates');
    if (res.ok) setTemplates(await res.json());
    setLoading(false);
  };

  const handleCreate = async () => {
    setSaving(true);
    const res = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: formName, description: formDesc, category: formCategory, content: formContent }),
    });
    if (res.ok) {
      const newTemplate = await res.json();
      setTemplates((prev) => [newTemplate, ...prev]);
      setFormName(''); setFormDesc(''); setFormContent('');
      setShowForm(false);
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this template?')) return;
    await fetch(`/api/templates/${id}`, { method: 'DELETE' });
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  const handleUseTemplate = (template: Template) => {
    const params = new URLSearchParams({ template: template.id });
    window.location.href = `/dashboard/documents/new?${params}`;
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Document Templates</h1>
          <p className="text-slate-500">Create reusable templates for common documents</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Template
        </button>
      </div>

      {showForm && (
        <div className="card p-6 space-y-4">
          <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Template name" className="input-field" />
          <input value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Description (optional)" className="input-field" />
          <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)} className="input-field">
            <option value="general">General</option>
            <option value="runbook">Runbook</option>
            <option value="policy">Policy</option>
            <option value="sop">SOP</option>
            <option value="incident">Incident Response</option>
          </select>
          <textarea value={formContent} onChange={(e) => setFormContent(e.target.value)} placeholder="Template content (supports Markdown)" className="input-field font-mono text-sm" rows={10} />
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={saving || !formName} className="btn-primary flex items-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create
            </button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
      ) : templates.length === 0 ? (
        <div className="card p-12 text-center">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">No templates yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <div key={template.id} className="card p-5 flex flex-col">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-500" />
                  <h3 className="font-semibold text-slate-900">{template.name}</h3>
                </div>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">{template.category}</span>
              </div>
              {template.description && <p className="text-sm text-slate-500 mb-3">{template.description}</p>}
              <pre className="text-xs text-slate-600 bg-slate-50 p-2 rounded flex-1 overflow-hidden font-mono line-clamp-4 mb-3">
                {template.content.slice(0, 200)}...
              </pre>
              <div className="flex gap-2 mt-auto">
                <button onClick={() => handleUseTemplate(template)} className="btn-primary text-sm flex-1 flex items-center justify-center gap-1">
                  <Copy className="w-3 h-3" /> Use Template
                </button>
                <button onClick={() => handleDelete(template.id)} className="btn-secondary text-red-600 hover:bg-red-50 p-2">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
