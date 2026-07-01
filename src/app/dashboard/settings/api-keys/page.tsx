'use client';

import { useEffect, useState, useCallback } from 'react';

interface APIKey {
  id: string;
  name: string;
  keyPreview: string;
  createdAt: string;
  lastUsed?: string;
  expiresAt?: string;
}

export default function APIKeysPage() {
  const [keys, setKeys] = useState<APIKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/api-keys');
      if (!res.ok) throw new Error('Failed to load API keys');
      const data = await res.json();
      setKeys(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadKeys(); }, [loadKeys]);

  const createKey = async () => {
    try {
      setError(null);
      if (!newKeyName.trim()) {
        setError('Key name is required');
        return;
      }
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName }),
      });
      if (!res.ok) throw new Error('Failed to create API key');
      const data = await res.json();
      setNewKey(data.key);
      setNewKeyName('');
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create API key');
    }
  };

  const deleteKey = async (key: APIKey) => {
    if (!confirm(`Delete API key "${key.name}"?`)) return;
    try {
      setError(null);
      const res = await fetch(`/api/api-keys/${key.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete API key');
      setSuccess('API key deleted');
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete API key');
    }
  };

  const copyKey = () => {
    if (newKey) navigator.clipboard.writeText(newKey);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">API Keys</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Manage API keys for programmatic access
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Create API Key
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

      {newKey && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <h3 className="font-medium text-yellow-900 dark:text-yellow-200 mb-2">API Key Created</h3>
          <p className="text-sm text-yellow-800 dark:text-yellow-300 mb-3">
            Copy this key now. You won&apos;t be able to see it again.
          </p>
          <div className="flex items-center gap-3">
            <code className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-sm font-mono text-gray-900 dark:text-white select-all">
              {newKey}
            </code>
            <button
              onClick={copyKey}
              className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700"
            >
              Copy
            </button>
            <button
              onClick={() => setNewKey(null)}
              className="px-3 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        {loading ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">Loading...</div>
        ) : keys.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            <div className="text-4xl mb-3">🔑</div>
            <p>No API keys yet.</p>
            <p className="text-sm mt-2">Create an API key to access the API programmatically.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {keys.map((key) => (
              <div key={key.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">{key.name}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      <code className="font-mono">{key.keyPreview}</code>
                      {key.lastUsed && (
                        <span className="ml-2">Last used: {new Date(key.lastUsed).toLocaleDateString()}</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500">
                      Created: {new Date(key.createdAt).toLocaleDateString()}
                      {key.expiresAt && ` • Expires: ${new Date(key.expiresAt).toLocaleDateString()}`}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteKey(key)}
                    className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h3 className="font-medium text-blue-900 dark:text-blue-200">API Usage</h3>
        <div className="mt-2 text-sm text-blue-800 dark:text-blue-300 space-y-1">
          <p>Include the API key in the <code>X-API-Key</code> header:</p>
          <pre className="bg-blue-100 dark:bg-blue-800/50 p-2 rounded mt-1 font-mono text-xs">
{`curl -H "X-API-Key: your-api-key" https://your-instance.com/api/documents`}
          </pre>
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Create API Key</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Key Name</label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="e.g., Production Server"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => { setShowCreateModal(false); setNewKeyName(''); }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={createKey}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
