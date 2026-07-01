'use client';

import { useState, useEffect } from 'react';
import { Monitor, Smartphone, Trash2, Loader2 } from 'lucide-react';

interface SessionData {
  id: string;
  ip: string | null;
  userAgent: string | null;
  lastActive: string;
  createdAt: string;
}

function parseUserAgent(ua: string | null): { device: string; browser: string } {
  if (!ua) return { device: 'Unknown', browser: 'Unknown' };
  const device = /Mobile|Android|iPhone/i.test(ua) ? 'Mobile' : 'Desktop';
  let browser = 'Other';
  if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Safari')) browser = 'Safari';
  else if (ua.includes('Edge')) browser = 'Edge';
  return { device, browser };
}

export default function SessionsSection() {
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => { fetchSessions(); }, []);

  const fetchSessions = async () => {
    const res = await fetch('/api/sessions');
    if (res.ok) setSessions(await res.json());
    setLoading(false);
  };

  const handleRevoke = async (sessionId: string) => {
    setRevoking(sessionId);
    await fetch('/api/sessions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    setRevoking(null);
  };

  const handleRevokeAll = async () => {
    if (!confirm('Revoke all sessions? You will be logged out everywhere.')) return;
    setRevoking('all');
    await fetch('/api/sessions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'all' }),
    });
    setSessions([]);
    setRevoking(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Monitor className="w-8 h-8 text-indigo-500" />
          <div>
            <h3 className="font-semibold text-slate-900">Sessions</h3>
            <p className="text-sm text-slate-500">Manage your active sessions</p>
          </div>
        </div>
        {sessions.length > 1 && (
          <button onClick={handleRevokeAll} disabled={revoking === 'all'} className="btn-secondary text-red-600 hover:bg-red-50 text-sm">
            {revoking === 'all' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Revoke All'}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
      ) : sessions.length === 0 ? (
        <p className="text-slate-500 text-sm">No active sessions</p>
      ) : (
        <div className="space-y-2">
          {sessions.map((session) => {
            const { device, browser } = parseUserAgent(session.userAgent);
            return (
              <div key={session.id} className="flex items-center justify-between p-3 bg-white border rounded-lg">
                <div className="flex items-center gap-3">
                  {device === 'Mobile' ? <Smartphone className="w-5 h-5 text-slate-400" /> : <Monitor className="w-5 h-5 text-slate-400" />}
                  <div>
                    <p className="font-medium text-slate-900 text-sm">{browser} on {device}</p>
                    <p className="text-xs text-slate-500">
                      {session.ip || 'Unknown IP'} &middot; Last active {new Date(session.lastActive).toLocaleString()}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleRevoke(session.id)}
                  disabled={revoking === session.id}
                  className="text-slate-400 hover:text-red-500 p-1"
                >
                  {revoking === session.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
