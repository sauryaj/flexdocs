'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Save, Loader2, Star, Trash2, Key, RefreshCw, ExternalLink,
  Shield, Clock, Copy, Check, AlertTriangle, Lock, History, Settings,
  Plus, X, ChevronDown, ChevronUp,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { ConfirmDialog } from '@/components/UIComponents';

interface PasswordEntry {
  id: string;
  name: string;
  username: string;
  password: string;
  url: string | null;
  notes: string | null;
  category: string;
  isFavorite: boolean;
  rotationDays: number | null;
  expiresAt: string | null;
  lastRotatedAt: string | null;
  totpSecret: string | null;
  totpIssuer: string | null;
  totpPeriod: number;
  totpDigits: number;
  customFields: CustomField[];
  autofillSelector: string | null;
  autofillNotes: string | null;
  breachCount: number;
  lastBreachCheck: string | null;
  createdAt: string;
  updatedAt: string;
  tags: { id: string; name: string; color: string }[];
}

interface CustomField {
  key: string;
  value: string;
  type: 'text' | 'password' | 'url';
}

interface HistoryEntry {
  id: string;
  oldPassword: string;
  newPassword: string;
  reason: string | null;
  createdAt: string;
}

interface TotpInfo {
  configured: boolean;
  code?: string;
  remaining?: number;
  uri?: string;
}

const categories = ['general', 'email', 'social', 'financial', 'server', 'database', 'api', 'ssh', 'vpn', 'cloud'];

function calculateStrength(pw: string) {
  if (!pw) return { score: 0, label: 'None', color: '#dc2626', width: '0%' };
  let score = 0;
  if (pw.length >= 8) score += 20;
  if (pw.length >= 12) score += 15;
  if (pw.length >= 16) score += 10;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 15;
  if (/[0-9]/.test(pw)) score += 15;
  if (/[^a-zA-Z0-9]/.test(pw)) score += 15;
  if (!/(.)\1{2,}/.test(pw)) score += 10;
  score = Math.min(100, score);

  if (score < 30) return { score, label: 'Weak', color: '#dc2626', width: `${score}%` };
  if (score < 60) return { score, label: 'Fair', color: '#f97316', width: `${score}%` };
  if (score < 80) return { score, label: 'Strong', color: '#22c55e', width: `${score}%` };
  return { score, label: 'Very Strong', color: '#16a34a', width: `${score}%` };
}

function generatePassword(length = 20): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
  let password = '';
  const array = new Uint32Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) password += chars[array[i] % chars.length];
  return password;
}

export default function PasswordDetailPage() {
  const router = useRouter();
  const params = useParams();
  const [pass, setPass] = useState<PasswordEntry | null>(null);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [category, setCategory] = useState('general');
  const [tags, setTags] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  // New fields
  const [rotationDays, setRotationDays] = useState<number | ''>('');
  const [totpSecret, setTotpSecret] = useState('');
  const [totpIssuer, setTotpIssuer] = useState('');
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [autofillSelector, setAutofillSelector] = useState('');
  const [autofillNotes, setAutofillNotes] = useState('');

  // UI state
  const [showTotp, setShowTotp] = useState(false);
  const [totpInfo, setTotpInfo] = useState<TotpInfo | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showBreach, setShowBreach] = useState(false);
  const [breachResult, setBreachResult] = useState<{ breached: boolean; count: number } | null>(null);
  const [breachLoading, setBreachLoading] = useState(false);
  const [showCustomFields, setShowCustomFields] = useState(false);
  const [showAutoFill, setShowAutoFill] = useState(false);
  const [showRotation, setShowRotation] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const strength = calculateStrength(password);

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/passwords/${params.id}`);
    if (res.ok) {
      const data = await res.json();
      setPass(data);
      setName(data.name);
      setUsername(data.username);
      setPassword(data.password);
      setUrl(data.url || '');
      setNotes(data.notes || '');
      setCategory(data.category);
      setTags(data.tags.map((t: { name: string }) => t.name).join(', '));
      setRotationDays(data.rotationDays || '');
      setTotpIssuer(data.totpIssuer || '');
      setCustomFields(data.customFields || []);
      setAutofillSelector(data.autofillSelector || '');
      setAutofillNotes(data.autofillNotes || '');
    }
    setLoading(false);
  }, [params.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-load TOTP info when password loads and has a secret
  useEffect(() => {
    if (pass?.totpSecret) {
      loadTotp();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pass?.totpSecret]);

  // Auto-refresh TOTP code every second when configured
  useEffect(() => {
    if (!totpInfo?.configured) return;
    const interval = setInterval(() => {
      loadTotp();
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totpInfo?.configured]);

  const handleSave = async () => {
    setSaving(true);
    const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);

    await fetch(`/api/passwords/${params.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, username, password, url: url || null, notes: notes || null,
        category, isFavorite: pass?.isFavorite, tags: tagList,
        rotationDays: rotationDays || null,
        totpSecret: totpSecret || undefined, totpIssuer: totpIssuer || null,
        customFields, autofillSelector: autofillSelector || null,
        autofillNotes: autofillNotes || null,
      }),
    });
    setSaving(false);
    fetchData();
  };

  const toggleFavorite = async () => {
    if (!pass) return;
    const updated = { ...pass, isFavorite: !pass.isFavorite };
    await fetch(`/api/passwords/${params.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, username, password, url: url || null, notes: notes || null,
        category, isFavorite: updated.isFavorite,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      }),
    });
    setPass(updated);
  };

  const handleDelete = async () => {
    await fetch(`/api/passwords/${params.id}`, { method: 'DELETE' });
    router.push('/dashboard/passwords');
  };

  const loadTotp = async () => {
    const res = await fetch(`/api/passwords/${params.id}/totp`);
    if (res.ok) {
      const data = await res.json();
      setTotpInfo(data);
    }
  };

  const saveTotp = async () => {
    if (!totpSecret) return;
    await fetch(`/api/passwords/${params.id}/totp`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ totpSecret, totpIssuer }),
    });
    await fetchData();
    await loadTotp();
    setTotpSecret('');
    setTotpIssuer('');
  };

  const removeTotp = async () => {
    if (!confirm('Remove TOTP secret? This cannot be undone.')) return;
    await fetch(`/api/passwords/${params.id}/totp`, { method: 'DELETE' });
    setTotpInfo(null);
    setShowTotp(false);
    fetchData();
  };

  const loadHistory = async () => {
    const res = await fetch(`/api/passwords/${params.id}/history`);
    if (res.ok) setHistory(await res.json());
    setShowHistory(true);
  };

  const revertToVersion = async (historyId: string) => {
    if (!confirm('Revert to this password version?')) return;
    await fetch(`/api/passwords/${params.id}/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revertToHistoryId: historyId }),
    });
    fetchData();
    loadHistory();
  };

  const checkBreach = async () => {
    setBreachLoading(true);
    const res = await fetch(`/api/passwords/${params.id}/breach`, { method: 'POST' });
    if (res.ok) setBreachResult(await res.json());
    setBreachLoading(false);
    setShowBreach(true);
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const addCustomField = () => setCustomFields([...customFields, { key: '', value: '', type: 'text' }]);
  const removeCustomField = (i: number) => setCustomFields(customFields.filter((_, idx) => idx !== i));
  const updateCustomField = (i: number, patch: Partial<CustomField>) => {
    const next = [...customFields];
    next[i] = { ...next[i], ...patch };
    setCustomFields(next);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!pass) {
    return (
      <div className="text-center py-20">
        <Key className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-slate-900">Password not found</h2>
        <Link href="/dashboard/passwords" className="text-blue-600 hover:underline mt-2 inline-block">Back to passwords</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/passwords" className="p-2 hover:bg-slate-100 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Edit Password</h1>
            <p className="text-sm text-slate-500">Last updated {formatDate(pass.updatedAt)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleFavorite} className={`p-2 rounded-lg transition-colors ${pass.isFavorite ? 'bg-amber-100 text-amber-700' : 'hover:bg-slate-100'}`}>
            <Star className={`w-5 h-5 ${pass.isFavorite ? 'fill-current' : ''}`} />
          </button>
          <button onClick={() => setShowDelete(true)} className="p-2 hover:bg-red-50 text-red-500 rounded-lg">
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="card p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input-field" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Username / Email</label>
          <div className="flex gap-2">
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="input-field flex-1" />
            <button onClick={() => copyToClipboard(username, 'user')} className="btn-secondary px-3">
              {copiedField === 'user' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Password with strength meter */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
          <div className="flex gap-2">
            <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} className="input-field flex-1 font-mono" />
            <button type="button" onClick={() => setPassword(generatePassword())} className="btn-secondary flex items-center gap-2 whitespace-nowrap">
              <RefreshCw className="w-4 h-4" /> Generate
            </button>
            <button onClick={() => copyToClipboard(password, 'pass')} className="btn-secondary px-3">
              {copiedField === 'pass' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          {password && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs mb-1">
                <span style={{ color: strength.color }} className="font-medium">{strength.label}</span>
                <span className="text-slate-500">{strength.score}/100</span>
              </div>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300" style={{ width: strength.width, backgroundColor: strength.color }} />
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">URL</label>
          <div className="flex gap-2">
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} className="input-field flex-1" />
            {url && (
              <a href={url} target="_blank" rel="noopener noreferrer" className="btn-secondary flex items-center gap-2">
                <ExternalLink className="w-4 h-4" /> Visit
              </a>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="input-field">
              {categories.map((c) => (<option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tags (comma separated)</label>
            <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} className="input-field" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input-field" rows={3} />
        </div>

        {/* Collapsible sections */}
        <div className="space-y-3">
          {/* Rotation */}
          <button onClick={() => setShowRotation(!showRotation)} className="w-full flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
            <span className="flex items-center gap-2 font-medium text-sm"><Clock className="w-4 h-4" /> Password Rotation</span>
            {showRotation ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showRotation && (
            <div className="p-4 bg-slate-50 rounded-lg space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-600 mb-1">Rotate every (days)</label>
                  <input type="number" value={rotationDays} onChange={(e) => setRotationDays(e.target.value ? Number(e.target.value) : '')} className="input-field" min={1} placeholder="e.g. 90" />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">Expires</label>
                  <p className="text-sm text-slate-500 mt-2">
                    {pass.expiresAt ? new Date(pass.expiresAt).toLocaleDateString() : 'Not set'}
                  </p>
                </div>
              </div>
              {pass.lastRotatedAt && (
                <p className="text-xs text-slate-500">Last rotated: {formatDate(pass.lastRotatedAt)}</p>
              )}
            </div>
          )}

          {/* TOTP/2FA */}
          <button onClick={() => { setShowTotp(!showTotp); if (!showTotp && !totpInfo) loadTotp(); }} className="w-full flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
            <span className="flex items-center gap-2 font-medium text-sm">
              <Lock className="w-4 h-4" /> TOTP / 2FA
              {totpInfo?.configured && (
                <span className="ml-2 px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">Active</span>
              )}
            </span>
            {showTotp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showTotp && (
            <div className="p-4 bg-slate-50 rounded-lg space-y-3">
              {totpInfo?.configured ? (
                <div className="text-center space-y-3">
                  <p className="text-4xl font-mono font-bold tracking-widest text-slate-900" style={{ letterSpacing: '0.2em' }}>
                    {totpInfo.code}
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-48 h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-1000"
                        style={{ width: `${((totpInfo.remaining || 0) / 30) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm text-slate-500 font-mono">{totpInfo.remaining}s</span>
                  </div>
                  {totpInfo.uri && (
                    <p className="text-xs text-slate-400 break-all font-mono">{totpInfo.uri}</p>
                  )}
                  <div className="flex justify-center gap-2">
                    <button onClick={() => copyToClipboard(totpInfo.code || '', 'totp')} className="btn-secondary text-sm">
                      {copiedField === 'totp' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} Copy Code
                    </button>
                    {totpInfo.uri && (
                      <button onClick={() => copyToClipboard(totpInfo.uri || '', 'totp-uri')} className="btn-secondary text-sm">
                        {copiedField === 'totp-uri' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} Copy URI
                      </button>
                    )}
                    <button onClick={removeTotp} className="btn-secondary text-sm text-red-500">Remove</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-slate-600">Enter a TOTP secret from your authenticator app or generate one.</p>
                  <input type="text" value={totpSecret} onChange={(e) => setTotpSecret(e.target.value)} className="input-field font-mono" placeholder="TOTP Secret (base32)" />
                  <input type="text" value={totpIssuer} onChange={(e) => setTotpIssuer(e.target.value)} className="input-field" placeholder="Issuer (e.g., Google)" />
                  <button onClick={saveTotp} className="btn-primary text-sm" disabled={!totpSecret}>Save TOTP</button>
                </div>
              )}
            </div>
          )}

          {/* History */}
          <button onClick={() => { setShowHistory(!showHistory); if (!showHistory) loadHistory(); }} className="w-full flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
            <span className="flex items-center gap-2 font-medium text-sm"><History className="w-4 h-4" /> Password History ({history.length})</span>
            {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showHistory && (
            <div className="p-4 bg-slate-50 rounded-lg space-y-2">
              {history.length === 0 ? (
                <p className="text-sm text-slate-500">No history yet</p>
              ) : (
                history.map((h) => (
                  <div key={h.id} className="flex items-center justify-between p-2 bg-white rounded border text-sm">
                    <div>
                      <span className="font-mono text-xs">{h.newPassword.slice(0, 8)}...</span>
                      <span className="text-slate-500 ml-2">{h.reason || 'manual'}</span>
                      <span className="text-slate-400 ml-2">{formatDate(h.createdAt)}</span>
                    </div>
                    <button onClick={() => revertToVersion(h.id)} className="text-blue-600 hover:text-blue-800 text-xs">Revert</button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Breach Check */}
          <button onClick={() => { checkBreach(); }} className="w-full flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
            <span className="flex items-center gap-2 font-medium text-sm"><Shield className="w-4 h-4" /> Breach Check</span>
            {breachLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
          </button>
          {showBreach && breachResult && (
            <div className={`p-4 rounded-lg ${breachResult.breached ? 'bg-red-50' : 'bg-green-50'}`}>
              {breachResult.breached ? (
                <p className="text-red-700 font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> Found in {breachResult.count.toLocaleString()} data breaches!
                </p>
              ) : (
                <p className="text-green-700 font-medium flex items-center gap-2">
                  <Check className="w-4 h-4" /> Not found in any known breaches
                </p>
              )}
            </div>
          )}

          {/* Custom Fields */}
          <button onClick={() => setShowCustomFields(!showCustomFields)} className="w-full flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
            <span className="flex items-center gap-2 font-medium text-sm"><Settings className="w-4 h-4" /> Custom Fields ({customFields.length})</span>
            {showCustomFields ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showCustomFields && (
            <div className="p-4 bg-slate-50 rounded-lg space-y-2">
              {customFields.map((f, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input type="text" value={f.key} onChange={(e) => updateCustomField(i, { key: e.target.value })} className="input-field flex-1" placeholder="Key" />
                  <input type={f.type === 'password' ? 'password' : 'text'} value={f.value} onChange={(e) => updateCustomField(i, { value: e.target.value })} className="input-field flex-1" placeholder="Value" />
                  <select value={f.type} onChange={(e) => updateCustomField(i, { type: e.target.value as CustomField['type'] })} className="input-field w-24">
                    <option value="text">Text</option>
                    <option value="password">Password</option>
                    <option value="url">URL</option>
                  </select>
                  <button onClick={() => removeCustomField(i)} className="text-red-500 hover:text-red-700"><X className="w-4 h-4" /></button>
                </div>
              ))}
              <button onClick={addCustomField} className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add Field
              </button>
            </div>
          )}

          {/* Auto-fill Hints */}
          <button onClick={() => setShowAutoFill(!showAutoFill)} className="w-full flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
            <span className="flex items-center gap-2 font-medium text-sm"><Key className="w-4 h-4" /> Auto-fill Hints</span>
            {showAutoFill ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showAutoFill && (
            <div className="p-4 bg-slate-50 rounded-lg space-y-3">
              <div>
                <label className="block text-sm text-slate-600 mb-1">CSS Selector</label>
                <input type="text" value={autofillSelector} onChange={(e) => setAutofillSelector(e.target.value)} className="input-field font-mono text-sm" placeholder="#username, input[name=email]" />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Notes</label>
                <input type="text" value={autofillNotes} onChange={(e) => setAutofillNotes(e.target.value)} className="input-field" placeholder="Where to use this credential" />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Link href="/dashboard/passwords" className="btn-secondary">Cancel</Link>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Changes
          </button>
        </div>
      </div>

      <ConfirmDialog isOpen={showDelete} onClose={() => setShowDelete(false)} onConfirm={handleDelete} title="Delete Password" message="Are you sure you want to delete this password? This action cannot be undone." />
    </div>
  );
}
