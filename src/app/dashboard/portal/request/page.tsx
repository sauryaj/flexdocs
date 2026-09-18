'use client';

import { useState, useEffect } from 'react';
import { Loader2, ClipboardList, CheckCircle2 } from 'lucide-react';

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
  fields: TemplateField[];
  organizationId: string | null;
  organization?: { name: string } | null;
}

const CATEGORY_ICONS: Record<string, string> = {
  general: 'Service',
  support: 'Support',
  hardware: 'Hardware',
  software: 'Software',
  network: 'Network',
  other: 'Other',
};

export default function PortalRequestPage() {
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
  const [baseTemplates, setBaseTemplates] = useState<Template[]>([]);
  const [selectedOrg, setSelectedOrg] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/portal/summary')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list = d?.orgs || [];
        setOrgs(list);
        if (list.length) setSelectedOrg(list[0].id);
      })
      .catch(() => {});
    fetch('/api/service-request-templates')
      .then((r) => (r.ok ? r.json() : []))
      .then((t) => setBaseTemplates(t))
      .finally(() => setLoading(false));
  }, []);

  const templates = selectedOrg
    ? baseTemplates.filter((t) => !t.organizationId || t.organizationId === selectedOrg)
    : baseTemplates.filter((t) => !t.organizationId);

  const submit = async () => {
    if (!selectedTemplate) return;
    setSubmitting(true);
    setError(null);
    setDone(null);
    const res = await fetch('/api/service-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId: selectedTemplate.id, organizationId: selectedOrg, answers }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (res.ok) {
      setDone(data.ticketId);
      setSelectedTemplate(null);
      setAnswers({});
    } else {
      setError(data.error || 'Could not submit request');
    }
  };

  const missingRequired = selectedTemplate
    ? selectedTemplate.fields.filter((f) => f.required && !String(answers[f.key] ?? '').trim()).length > 0
    : false;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Request Service</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Pick a catalog item and our team will get a structured ticket automatically.
        </p>
      </div>

      {done ? (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl p-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Request received</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Your ticket was filed automatically. Track it under My Tickets.</p>
          <a href="/dashboard/portal/tickets" className="text-sm text-blue-600 dark:text-blue-400 font-medium">View my tickets →</a>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Organization</label>
              <select value={selectedOrg} onChange={(e) => { setSelectedOrg(e.target.value); setSelectedTemplate(null); }} className="input-field w-full">
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              {templates.length === 0 && !loading && (
                <p className="text-xs text-gray-400 mt-3">No request templates available for this organization.</p>
              )}
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
              <div className="space-y-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { setSelectedTemplate(t); setAnswers({}); }}
                    className={`w-full text-left p-3 rounded-xl border transition-colors ${
                      selectedTemplate?.id === t.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-blue-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm text-gray-900 dark:text-white">{t.name}</span>
                      <span className="text-xs text-gray-400 uppercase">{CATEGORY_ICONS[t.category] || t.category}</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t.description}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {selectedTemplate && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="font-semibold text-gray-900 dark:text-white">{selectedTemplate.name}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{selectedTemplate.description}</p>

              {selectedTemplate.fields.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  No extra details needed — submit and our team will follow up.
                </p>
              ) : (
                <div className="space-y-4">
                  {selectedTemplate.fields.map((f, i) => {
                    const id = f.key || `f${i}`;
                    if (f.type === 'boolean') {
                      return (
                        <div key={id}>
                          <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">
                            {f.label}{f.required && <span className="text-red-500 ml-1">*</span>}
                          </label>
                          <select
                            value={answers[id] ? 'yes' : 'no'}
                            onChange={(e) => setAnswers({ ...answers, [id]: e.target.value === 'yes' })}
                            className="input-field"
                          >
                            <option value="no">No</option>
                            <option value="yes">Yes</option>
                          </select>
                        </div>
                      );
                    }
                    if (f.type === 'textarea') {
                      return (
                        <div key={id}>
                          <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">
                            {f.label}{f.required && <span className="text-red-500 ml-1">*</span>}
                          </label>
                          <textarea
                            value={answers[id] || ''}
                            onChange={(e) => setAnswers({ ...answers, [id]: e.target.value })}
                            className="input-field w-full"
                            rows={3}
                          />
                        </div>
                      );
                    }
                    if (f.type === 'select') {
                      return (
                        <div key={id}>
                          <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">
                            {f.label}{f.required && <span className="text-red-500 ml-1">*</span>}
                          </label>
                          <select
                            value={answers[id] || ''}
                            onChange={(e) => setAnswers({ ...answers, [id]: e.target.value })}
                            className="input-field w-full"
                          >
                            <option value="">Select…</option>
                            {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </div>
                      );
                    }
                    return (
                      <div key={id}>
                        <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">
                          {f.label}{f.required && <span className="text-red-500 ml-1">*</span>}
                        </label>
                        <input
                          value={answers[id] || ''}
                          onChange={(e) => setAnswers({ ...answers, [id]: e.target.value })}
                          className="input-field w-full"
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {error && <p className="text-sm text-red-600 mt-4">{error}</p>}

              <button
                onClick={submit}
                disabled={submitting || missingRequired}
                className="mt-5 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
                {submitting ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}