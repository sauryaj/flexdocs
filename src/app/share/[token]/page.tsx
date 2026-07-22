'use client';

import { useState, useEffect, use } from 'react';
import { Shield, Key, Copy, Check, Lock, AlertTriangle, Eye, EyeOff } from 'lucide-react';

interface SharedSecret {
  name: string;
  username: string;
  password: string;
  url?: string | null;
  notes?: string | null;
  burned?: boolean;
}

export default function PublicSharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [secret, setSecret] = useState<SharedSecret | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    fetchSecret();
  }, [token]);

  const fetchSecret = async () => {
    try {
      const res = await fetch(`/api/passwords/share-link?token=${token}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to retrieve shared credential');
      }
      setSecret(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-slate-100 font-sans">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Flexdocs Secure QuickShare</h1>
          <p className="text-xs text-slate-400">
            Encrypted self-destructing credential view
          </p>
        </div>

        {loading ? (
          <div className="py-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto" />
            <p className="text-xs text-slate-400 mt-3">Decrypting shared credential...</p>
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl bg-red-950/60 border border-red-800 text-center space-y-2">
            <AlertTriangle className="w-6 h-6 text-red-400 mx-auto" />
            <h2 className="font-semibold text-sm text-red-200">Link Unavailable</h2>
            <p className="text-xs text-red-300/80">{error}</p>
          </div>
        ) : secret ? (
          <div className="space-y-4">
            {secret.burned && (
              <div className="p-3 rounded-lg bg-amber-950/50 border border-amber-800 text-amber-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span>This link was single-view only and has now been permanently burned.</span>
              </div>
            )}

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Credential Name
                </span>
                <p className="text-sm font-semibold text-slate-200 mt-0.5">{secret.name}</p>
              </div>

              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Username / Identity
                </span>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-sm font-mono text-slate-300 select-all">{secret.username}</span>
                  <button
                    onClick={() => copyToClipboard(secret.username, 'user')}
                    className="p-1.5 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition-colors"
                  >
                    {copiedField === 'user' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Password
                </span>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-sm font-mono text-emerald-400 select-all">
                    {showPassword ? secret.password : '••••••••••••••••'}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setShowPassword(!showPassword)}
                      className="p-1.5 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => copyToClipboard(secret.password, 'pass')}
                      className="p-1.5 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition-colors"
                    >
                      {copiedField === 'pass' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {secret.url && (
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Target URL
                  </span>
                  <p className="text-xs font-mono text-blue-400 truncate mt-0.5">{secret.url}</p>
                </div>
              )}

              {secret.notes && (
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Notes
                  </span>
                  <p className="text-xs text-slate-400 mt-0.5 whitespace-pre-wrap">{secret.notes}</p>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
