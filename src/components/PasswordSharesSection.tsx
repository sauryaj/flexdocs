'use client';

import { useState, useEffect } from 'react';
import { Share2, Trash2, Loader2, UserPlus, Eye, Edit3 } from 'lucide-react';

interface SharedPassword {
  id: string;
  passwordId: string;
  permission: string;
  createdAt: string;
  password: { id: string; name: string; username: string };
}

export default function PasswordSharesSection({ passwordId }: { passwordId?: string }) {
  const [shares, setShares] = useState<SharedPassword[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState('read');
  const [sharing, setSharing] = useState(false);

  useEffect(() => { fetchShares(); }, []);

  const fetchShares = async () => {
    const res = await fetch('/api/passwords/share');
    if (res.ok) setShares(await res.json());
    setLoading(false);
  };

  const handleShare = async () => {
    if (!passwordId || !email) return;
    setSharing(true);
    const res = await fetch('/api/passwords/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passwordId, email, permission }),
    });
    if (res.ok) {
      await fetchShares();
      setEmail('');
      setShowForm(false);
    }
    setSharing(false);
  };

  const handleRevoke = async (shareId: string) => {
    await fetch('/api/passwords/share', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shareId }),
    });
    setShares((prev) => prev.filter((s) => s.id !== shareId));
  };

  const relevantShares = passwordId ? shares.filter((s) => s.passwordId === passwordId) : shares;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Share2 className="w-5 h-5 text-purple-500" />
          <h3 className="font-semibold text-slate-900">Shared With</h3>
        </div>
        {passwordId && (
          <button onClick={() => setShowForm(!showForm)} className="btn-secondary text-sm flex items-center gap-1">
            <UserPlus className="w-3.5 h-3.5" /> Share
          </button>
        )}
      </div>

      {showForm && (
        <div className="flex gap-2 items-end p-3 bg-slate-50 rounded-lg">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" className="input-field flex-1" />
          <select value={permission} onChange={(e) => setPermission(e.target.value)} className="input-field w-28">
            <option value="read">Read</option>
            <option value="write">Write</option>
          </select>
          <button onClick={handleShare} disabled={sharing || !email} className="btn-primary flex items-center gap-1">
            {sharing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Share'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /></div>
      ) : relevantShares.length === 0 ? (
        <p className="text-slate-500 text-sm">Not shared with anyone</p>
      ) : (
        <div className="space-y-2">
          {relevantShares.map((share) => (
            <div key={share.id} className="flex items-center justify-between p-2 bg-white border rounded">
              <div className="flex items-center gap-2">
                {share.permission === 'read' ? <Eye className="w-4 h-4 text-slate-400" /> : <Edit3 className="w-4 h-4 text-blue-400" />}
                <div>
                  <p className="text-sm font-medium text-slate-900">{share.password.name}</p>
                  <p className="text-xs text-slate-500">{share.permission} access</p>
                </div>
              </div>
              <button onClick={() => handleRevoke(share.id)} className="text-slate-400 hover:text-red-500 p-1">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
