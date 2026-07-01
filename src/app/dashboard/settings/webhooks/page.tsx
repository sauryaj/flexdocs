'use client';

import { useEffect, useState, useCallback } from 'react';

interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  secret: string;
  createdAt: string;
  lastTriggered?: string;
  failureCount: number;
}

const AVAILABLE_EVENTS = [
  'document.created', 'document.updated', 'document.deleted',
  'password.created', 'password.updated', 'password.deleted',
  'domain.created', 'domain.updated', 'domain.deleted',
  'asset.created', 'asset.updated', 'asset.deleted',
  'organization.created', 'organization.updated', 'organization.deleted',
];

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    url: '',
    events: [] as string[],
    active: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadWebhooks = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/webhooks');
      if (!res.ok) throw new Error('Failed to load webhooks');
      const data = await res.json();
      setWebhooks(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load webhooks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadWebhooks(); }, [loadWebhooks]);

  const saveWebhook = async () => {
    try {
      setError(null);
      if (!form.name.trim() || !form.url.trim()) {
        setError('Name and URL are required');
        return;
      }
      const method = editingId ? 'PUT' : 'POST';
      const url = editingId ? `/api/webhooks/${editingId}` : '/api/webhooks';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Failed to save webhook');
      setSuccess(editingId ? 'Webhook updated' : 'Webhook created');
      setShowCreateModal(false);
      setEditingId(null);
      setForm({ name: '', url: '', events: [], active: true });
      await loadWebhooks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save webhook');
    }
  };

  const deleteWebhook = async (webhook: Webhook) => {
    if (!confirm(`Delete webhook "${webhook.name}"?`)) return;
    try {
      setError(null);
      const res = await fetch(`/api/webhooks/${webhook.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete webhook');
      setSuccess('Webhook deleted');
      await loadWebhooks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete webhook');
    }
  };

  const toggleActive = async (webhook: Webhook) => {
    try {
      await fetch(`/api/webhooks/${webhook.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...webhook, active: !webhook.active }),
      });
      await loadWebhooks();
    } catch {
      setError('Failed to toggle webhook');
    }
  };

  const testWebhook = async (webhook: Webhook) => {
    try {
      setError(null);
      const res = await fetch(`/api/webhooks/${webhook.id}/test`, { method: 'POST' });
      if (!res.ok) throw new Error('Test failed');
      setSuccess('Test webhook sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test failed');
    }
  };

  const startEdit = (webhook: Webhook) => {
    setForm({
      name: webhook.name,
      url: webhook.url,
      events: webhook.events || [],
      active: webhook.active,
    });
    setEditingId(webhook.id);
    setShowCreateModal(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Webhooks</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Send real-time notifications to external services
          </p>
        </div>
        <button
          onClick={() => { setShowCreateModal(true); setEditingId(null); setForm({ name: '', url: '', events: [], active: true }); }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Add Webhook
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <p className="text-green-600 dark:text-green-400 text-sm">{success}</p>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        {loading ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">Loading...</div>
        ) : webhooks.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            <div className="text-4xl mb-3">🔗</div>
            <p>No webhooks configured.</p>
            <p className="text-sm mt-2">Add a webhook to receive real-time event notifications.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {webhooks.map((webhook) => (
              <div key={webhook.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <div className="font-medium text-gray-900 dark:text-white">{webhook.name}</div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        webhook.active
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                      }`}>
                        {webhook.active ? 'Active' : 'Inactive'}
                      </span>
                      {webhook.failureCount > 0 && (
                        <span className="px-2 py-0.5 text-xs bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400 rounded-full">
                          {webhook.failureCount} failures
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mt-1 font-mono">{webhook.url}</div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {webhook.events.map((event) => (
                        <span key={event} className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400 rounded">
                          {event}
                        </span>
                      ))}
                    </div>
                    {webhook.lastTriggered && (
                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        Last triggered: {new Date(webhook.lastTriggered).toLocaleString()}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 ml-4">
                    <button
                      onClick={() => toggleActive(webhook)}
                      className={`px-3 py-1 text-sm rounded ${
                        webhook.active
                          ? 'bg-yellow-600 text-white hover:bg-yellow-700'
                          : 'bg-green-600 text-white hover:bg-green-700'
                      }`}
                    >
                      {webhook.active ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      onClick={() => testWebhook(webhook)}
                      className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Test
                    </button>
                    <button
                      onClick={() => startEdit(webhook)}
                      className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteWebhook(webhook)}
                      className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-lg">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              {editingId ? 'Edit Webhook' : 'Add Webhook'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="My Webhook"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">URL</label>
                <input
                  type="url"
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="https://example.com/webhook"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Events</label>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg p-3">
                  {AVAILABLE_EVENTS.map((event) => (
                    <label key={event} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={form.events.includes(event)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setForm({ ...form, events: [...form.events, event] });
                          } else {
                            setForm({ ...form, events: form.events.filter((ev) => ev !== event) });
                          }
                        }}
                        className="rounded"
                      />
                      {event}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => { setShowCreateModal(false); setEditingId(null); }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={saveWebhook}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                {editingId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
