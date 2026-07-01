'use client';

import { useEffect, useState, useCallback } from 'react';

interface Backup {
  id: string;
  filename: string;
  size: string;
  createdAt: string;
  status: 'completed' | 'failed' | 'running';
  type: 'full' | 'incremental';
}

export default function BackupsPage() {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadBackups = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/backups');
      if (!res.ok) throw new Error('Failed to load backups');
      const data = await res.json();
      setBackups(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load backups');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadBackups(); }, [loadBackups]);

  const createBackup = async () => {
    try {
      setCreating(true);
      setError(null);
      const res = await fetch('/api/backups', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to create backup');
      const data = await res.json();
      setSuccess(`Backup created: ${data.filename || 'backup'}`);
      await loadBackups();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create backup');
    } finally {
      setCreating(false);
    }
  };

  const downloadBackup = async (backup: Backup) => {
    try {
      setError(null);
      const res = await fetch(`/api/backups/${backup.id}/download`);
      if (!res.ok) throw new Error('Failed to download backup');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = backup.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download backup');
    }
  };

  const deleteBackup = async (backup: Backup) => {
    if (!confirm(`Delete backup ${backup.filename}?`)) return;
    try {
      setError(null);
      const res = await fetch(`/api/backups/${backup.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete backup');
      setSuccess('Backup deleted');
      await loadBackups();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete backup');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Backups</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Create and manage database backups
          </p>
        </div>
        <button
          onClick={createBackup}
          disabled={creating}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {creating ? 'Creating...' : 'Create Backup'}
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
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Backup History</h2>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">Loading...</div>
        ) : backups.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            <div className="text-4xl mb-3">💾</div>
            <p>No backups yet.</p>
            <p className="text-sm mt-2">Create your first backup to protect your data.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {backups.map((backup) => (
              <div key={backup.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-xl">
                      💾
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">{backup.filename}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {backup.size} • {backup.type} • {new Date(backup.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      backup.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' :
                      backup.status === 'failed' ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400' :
                      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                    }`}>
                      {backup.status}
                    </span>
                    <div className="flex gap-1">
                      {backup.status === 'completed' && (
                        <button
                          onClick={() => downloadBackup(backup)}
                          className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          Download
                        </button>
                      )}
                      <button
                        onClick={() => deleteBackup(backup)}
                        className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
        <h3 className="font-medium text-yellow-900 dark:text-yellow-200">Backup Schedule</h3>
        <p className="mt-1 text-sm text-yellow-800 dark:text-yellow-300">
          Backups are stored locally. For production, configure offsite backups to S3 or GCS via environment variables.
        </p>
      </div>
    </div>
  );
}
