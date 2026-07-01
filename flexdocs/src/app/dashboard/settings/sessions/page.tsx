'use client';

import { useEffect, useState, useCallback } from 'react';

interface Session {
  id: string;
  device: string;
  ip: string;
  location: string;
  lastActive: string;
  current: boolean;
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/sessions');
      if (!res.ok) throw new Error('Failed to load sessions');
      const data = await res.json();
      setSessions(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const revokeSession = async (sessionId: string) => {
    if (!confirm('Revoke this session? The user will be logged out.')) return;
    try {
      setError(null);
      const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to revoke session');
      setSuccess('Session revoked');
      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke session');
    }
  };

  const revokeAll = async () => {
    if (!confirm('Revoke all other sessions? All users will be logged out.')) return;
    try {
      setError(null);
      const res = await fetch('/api/sessions', { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to revoke sessions');
      setSuccess('All other sessions revoked');
      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke sessions');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Sessions</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Manage active sessions across devices
          </p>
        </div>
        <button
          onClick={revokeAll}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          Revoke All Other Sessions
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
        ) : sessions.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            <div className="text-4xl mb-3">🔐</div>
            <p>No active sessions.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {sessions.map((session) => (
              <div key={session.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xl">
                      {session.device.includes('Mac') ? '💻' : session.device.includes('iPhone') ? '📱' : '🖥️'}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">
                        {session.device}
                        {session.current && (
                          <span className="ml-2 px-2 py-0.5 text-xs bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400 rounded-full">
                            Current
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        IP: {session.ip} • {session.location || 'Unknown location'}
                      </div>
                      <div className="text-xs text-gray-400 dark:text-gray-500">
                        Last active: {new Date(session.lastActive).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  {!session.current && (
                    <button
                      onClick={() => revokeSession(session.id)}
                      className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
