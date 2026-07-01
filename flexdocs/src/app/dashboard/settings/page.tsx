'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  User,
  Mail,
  Phone,
  Globe,
  Shield,
  Camera,
  Save,
  Loader2,
  Key,
  FileText,
  KeyRound,
  Calendar,
  CheckCircle,
  AlertCircle,
  Palette,
  Link2,
  Clock,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import MFASection from '@/components/MFASection';
import WebhooksSection from '@/components/WebhooksSection';
import BackupSection from '@/components/BackupSection';
import SessionsSection from '@/components/SessionsSection';
import { KeyboardShortcutsHelp } from '@/components/KeyboardShortcuts';

interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  bio: string | null;
  phone: string | null;
  timezone: string | null;
  role: string;
  emailVerified: string | null;
  createdAt: string;
  _count: {
    documents: number;
    passwords: number;
    domains: number;
    tags: number;
  };
}

const timezones = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Australia/Sydney',
  'Pacific/Auckland',
];

export default function SettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [phone, setPhone] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [avatar, setAvatar] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    const res = await fetch('/api/profile');
    const data = await res.json();
    setProfile(data);
    setName(data.name || '');
    setBio(data.bio || '');
    setPhone(data.phone || '');
    setTimezone(data.timezone || 'UTC');
    setAvatar(data.avatar || '');
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);

    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, bio, phone, timezone, avatar }),
    });

    if (res.ok) {
      const updated = await res.json();
      setProfile((prev) => (prev ? { ...prev, ...updated } : null));
      // Profile updated
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!profile) return null;

  // Auth provider info

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Profile Settings</h1>
        <p className="text-slate-500">Manage your account information and preferences</p>
      </div>

      {/* Profile Card */}
      <div className="card p-6">
        <div className="flex items-start gap-6">
          {/* Avatar */}
          <div className="relative group">
            <div className="w-24 h-24 rounded-full bg-slate-200 flex items-center justify-center overflow-hidden border-4 border-white shadow-lg">
              {avatar ? (
                <img src={avatar} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-3xl font-bold text-slate-400">
                  {(name || profile.email)?.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <label className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
              <Camera className="w-6 h-6 text-white" />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onloadend = () => setAvatar(reader.result as string);
                    reader.readAsDataURL(file);
                  }
                }}
              />
            </label>
          </div>

          {/* Basic Info */}
          <div className="flex-1 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  <User className="w-4 h-4 inline mr-1" />
                  Display Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-field"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  <Mail className="w-4 h-4 inline mr-1" />
                  Email
                </label>
                <input
                  type="email"
                  value={profile.email}
                  className="input-field bg-slate-50"
                  disabled
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  <Phone className="w-4 h-4 inline mr-1" />
                  Phone
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="input-field"
                  placeholder="+1 (555) 000-0000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  <Globe className="w-4 h-4 inline mr-1" />
                  Timezone
                </label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="input-field"
                >
                  {timezones.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Bio</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="input-field"
                rows={3}
                placeholder="A short bio about yourself..."
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end mt-6">
          <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saved ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Account Info */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Account Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
            <Shield className="w-5 h-5 text-slate-500" />
            <div>
              <p className="text-sm text-slate-500">Role</p>
              <p className="font-medium capitalize">{profile.role}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
            <Key className="w-5 h-5 text-slate-500" />
            <div>
              <p className="text-sm text-slate-500">Auth Provider</p>
              <p className="font-medium capitalize">
                Password
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
            <Calendar className="w-5 h-5 text-slate-500" />
            <div>
              <p className="text-sm text-slate-500">Member Since</p>
              <p className="font-medium">{formatDate(profile.createdAt)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
            {profile.emailVerified ? (
              <CheckCircle className="w-5 h-5 text-green-500" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-500" />
            )}
            <div>
              <p className="text-sm text-slate-500">Email Verified</p>
              <p className="font-medium">
                {profile.emailVerified ? 'Verified' : 'Not Verified'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Your Assets</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <FileText className="w-6 h-6 text-blue-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-blue-600">{profile._count.documents}</p>
            <p className="text-sm text-slate-500">Documents</p>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <KeyRound className="w-6 h-6 text-green-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-green-600">{profile._count.passwords}</p>
            <p className="text-sm text-slate-500">Passwords</p>
          </div>
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <Globe className="w-6 h-6 text-purple-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-purple-600">{profile._count.domains}</p>
            <p className="text-sm text-slate-500">Domains</p>
          </div>
          <div className="text-center p-4 bg-amber-50 rounded-lg">
            <Key className="w-6 h-6 text-amber-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-amber-600">{profile._count.tags}</p>
            <p className="text-sm text-slate-500">Tags</p>
          </div>
        </div>
      </div>

      {/* Theme Settings Link */}
      <div className="card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Palette className="w-5 h-5 text-slate-500" />
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Theme Settings</h2>
              <p className="text-sm text-slate-500">Customize appearance, colors, and dark mode</p>
            </div>
          </div>
          <Link href="/dashboard/settings/theme" className="btn-primary flex items-center gap-2">
            <Palette className="w-4 h-4" />
            Customize
          </Link>
        </div>
      </div>

      {/* Security Section */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Security
        </h2>
        <MFASection />
      </div>

      {/* Sessions */}
      <div className="card p-6">
        <SessionsSection />
      </div>

      {/* Keyboard Shortcuts */}
      <div className="card p-6">
        <KeyboardShortcutsHelp />
      </div>

      {/* Notifications & Integrations */}
      <div className="card p-6">
        <WebhooksSection />
      </div>

      {/* Backups */}
      <div className="card p-6">
        <BackupSection />
      </div>

      {/* API Keys */}
      <ApiKeySection />

      {/* SSO */}
      <SsoSection />

      {/* Webhook Retries */}
      <WebhookRetriesSection />
    </div>
  );
}

function ApiKeySection() {
  const [keys, setKeys] = useState<{ id: string; name: string; permissions: string; isActive: boolean; lastUsedAt: string | null; createdAt: string }[]>([]);
  const [name, setName] = useState('');
  const [permissions, setPermissions] = useState('read');
  const [newKey, setNewKey] = useState('');
  const [showNewKey, setShowNewKey] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadKeys(); }, []);

  const loadKeys = async () => {
    const res = await fetch('/api/api-keys');
    if (res.ok) setKeys(await res.json());
    setLoading(false);
  };

  const createKey = async () => {
    if (!name) return;
    const res = await fetch('/api/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, permissions }),
    });
    if (res.ok) {
      const data = await res.json();
      setNewKey(data.key);
      setShowNewKey(true);
      setName('');
      loadKeys();
    }
  };

  const deleteKey = async (id: string) => {
    if (!confirm('Delete this API key?')) return;
    await fetch(`/api/api-keys?id=${id}`, { method: 'DELETE' });
    loadKeys();
  };

  return (
    <div className="card p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
        <KeyRound className="w-5 h-5" /> API Keys
      </h2>

      {showNewKey && (
        <div className="mb-4 p-4 bg-green-50 rounded-lg border border-green-200">
          <p className="text-sm font-medium text-green-800 mb-2">New API Key (copy now, it won&apos;t be shown again):</p>
          <code className="block p-2 bg-white rounded text-sm break-all">{newKey}</code>
          <button onClick={() => setShowNewKey(false)} className="mt-2 text-sm text-green-700">Dismiss</button>
        </div>
      )}

      <div className="flex gap-3 mb-4">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Key name"
          className="input-field flex-1"
        />
        <select value={permissions} onChange={(e) => setPermissions(e.target.value)} className="input-field w-32">
          <option value="read">Read Only</option>
          <option value="read,write">Read + Write</option>
          <option value="read,write,admin">Admin</option>
        </select>
        <button onClick={createKey} className="btn-primary">Create Key</button>
      </div>

      {loading ? (
        <div className="py-4 text-center text-slate-500">Loading...</div>
      ) : keys.length === 0 ? (
        <p className="text-sm text-slate-500">No API keys yet. Create one above.</p>
      ) : (
        <div className="space-y-2">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <div>
                <p className="font-medium">{k.name}</p>
                <p className="text-xs text-slate-500">
                  {k.permissions} | {k.lastUsedAt ? `Last used ${new Date(k.lastUsedAt).toLocaleDateString()}` : 'Never used'}
                </p>
              </div>
              <button onClick={() => deleteKey(k.id)} className="text-red-500 hover:text-red-700 text-sm">Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SsoSection() {
  const [config, setConfig] = useState<{ enabled: boolean; name?: string; type?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/sso').then(r => r.json()).then(setConfig).finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  return (
    <div className="card p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
        <Link2 className="w-5 h-5" /> SSO / SAML
      </h2>
      {config?.enabled ? (
        <div className="p-4 bg-green-50 rounded-lg">
          <p className="text-green-800 font-medium">SSO Enabled ({config.type?.toUpperCase()})</p>
          <p className="text-sm text-green-600">Provider: {config.name}</p>
        </div>
      ) : (
        <div className="p-4 bg-slate-50 rounded-lg">
          <p className="text-slate-600">SSO is not configured.</p>
          <p className="text-sm text-slate-500 mt-1">
            Set environment variables to enable SSO: SSO_TYPE, SSO_URL, SSO_ISSUER, SSO_CLIENT_ID, SSO_CLIENT_SECRET
          </p>
        </div>
      )}
    </div>
  );
}

function WebhookRetriesSection() {
  const [deliveries, setDeliveries] = useState<{ id: string; event: string; status: string; attempts: number; error: string | null; createdAt: string; webhook: { name: string } }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadDeliveries(); }, []);

  const loadDeliveries = async () => {
    const res = await fetch('/api/webhooks/retry');
    if (res.ok) setDeliveries(await res.json());
    setLoading(false);
  };

  const processRetries = async () => {
    await fetch('/api/webhooks/retry', { method: 'POST' });
    loadDeliveries();
  };

  const failed = deliveries.filter(d => d.status === 'failed' || d.status === 'retrying');

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <Clock className="w-5 h-5" /> Webhook Delivery Queue
        </h2>
        <button onClick={processRetries} className="btn-secondary text-sm">Process Retries</button>
      </div>

      {loading ? (
        <div className="py-4 text-center text-slate-500">Loading...</div>
      ) : failed.length === 0 ? (
        <p className="text-sm text-slate-500">No pending or failed deliveries.</p>
      ) : (
        <div className="space-y-2">
          {failed.map((d) => (
            <div key={d.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <div>
                <p className="font-medium">{d.event}</p>
                <p className="text-xs text-slate-500">
                  {d.webhook.name} | Attempt {d.attempts}/5 | {d.error?.slice(0, 50)}
                </p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${d.status === 'retrying' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>
                {d.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
