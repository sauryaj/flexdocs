'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, ExternalLink, Loader2, CheckCircle, XCircle, Bell } from 'lucide-react';
import { WEBHOOK_EVENTS } from '@/lib/webhook-events';

interface WebhookItem {
  id: string;
  name: string;
  url: string;
  events: string;
  isActive: boolean;
  lastTriggered: string | null;
  lastStatus: number | null;
}

export default function WebhooksSection() {
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formSecret, setFormSecret] = useState('');
  const [formEvents, setFormEvents] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchWebhooks(); }, []);

  const fetchWebhooks = async () => {
    const res = await fetch('/api/webhooks');
    if (res.ok) setWebhooks(await res.json());
    setLoading(false);
  };

  const handleCreate = async () => {
    setSaving(true);
    const res = await fetch('/api/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: formName, url: formUrl, secret: formSecret, events: formEvents }),
    });
    if (res.ok) {
      const newWebhook = await res.json();
      setWebhooks((prev) => [...prev, newWebhook]);
      setFormName(''); setFormUrl(''); setFormSecret(''); setFormEvents([]);
      setShowForm(false);
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this webhook?')) return;
    await fetch(`/api/webhooks/${id}`, { method: 'DELETE' });
    setWebhooks((prev) => prev.filter((w) => w.id !== id));
  };

  const toggleEvent = (event: string) => {
    setFormEvents((prev) => prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="w-8 h-8 text-blue-500" />
          <div>
            <h3 className="font-semibold text-slate-900">Webhooks</h3>
            <p className="text-sm text-slate-500">Notify external systems on events</p>
          </div>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Webhook
        </button>
      </div>

      {showForm && (
        <div className="p-4 bg-slate-50 rounded-lg border space-y-3">
          <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Webhook name" className="input-field" />
          <input value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="https://example.com/webhook" className="input-field" />
          <input value={formSecret} onChange={(e) => setFormSecret(e.target.value)} placeholder="Signing secret (optional)" className="input-field" />
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Subscribe to events:</p>
            <div className="flex flex-wrap gap-2">
              {WEBHOOK_EVENTS.map((event) => (
                <button
                  key={event}
                  onClick={() => toggleEvent(event)}
                  className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${
                    formEvents.includes(event) ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {event}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-1">Leave empty to subscribe to all events</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={saving || !formName || !formUrl} className="btn-primary flex items-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create
            </button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
      ) : webhooks.length === 0 ? (
        <p className="text-slate-500 text-sm">No webhooks configured</p>
      ) : (
        <div className="space-y-2">
          {webhooks.map((wh) => (
            <div key={wh.id} className="flex items-center justify-between p-3 bg-white border rounded-lg">
              <div className="flex items-center gap-3">
                <ExternalLink className="w-4 h-4 text-slate-400" />
                <div>
                  <p className="font-medium text-slate-900">{wh.name}</p>
                  <p className="text-xs text-slate-500">{wh.url}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {wh.lastStatus !== null && (
                  wh.lastStatus >= 200 && wh.lastStatus < 300
                    ? <CheckCircle className="w-4 h-4 text-green-500" />
                    : <XCircle className="w-4 h-4 text-red-500" />
                )}
                <button onClick={() => handleDelete(wh.id)} className="text-slate-400 hover:text-red-500">
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
