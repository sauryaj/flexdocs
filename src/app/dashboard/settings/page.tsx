'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Globe, Save, Loader2, ArrowRight,
  FileText, KeyRound, Key, Tag, Shield, Activity, Lock,
  Palette, Bell, Zap, FileBarChart, BookOpen, LayoutGrid,
  CheckCircle2, AlertCircle,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { KeyboardShortcutsHelp } from '@/components/KeyboardShortcuts';

interface Profile {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  bio: string | null;
  phone: string | null;
  timezone: string;
  role: string;
  emailVerified: string | null;
  createdAt: string;
  _count: { documents: number; passwords: number; domains: number; tags: number };
}

const TIMEZONES = ['UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Singapore', 'Australia/Sydney'];

const QUICK_LINKS = [
  { name: 'Appearance', desc: 'Theme, accents, density', href: '/dashboard/settings/theme', icon: Palette },
  { name: 'Notifications', desc: 'Channels & muted types', href: '/dashboard/settings/notifications', icon: Bell },
  { name: 'Two-Factor Auth', desc: 'TOTP & recovery codes', href: '/dashboard/settings/mfa', icon: Shield },
  { name: 'Sessions', desc: 'Active devices', href: '/dashboard/settings/sessions', icon: Activity },
  { name: 'Emergency Access', desc: 'Trusted contacts', href: '/dashboard/settings/emergency-access', icon: Lock },
  { name: 'API Keys', desc: 'Programmatic access', href: '/dashboard/settings/api-keys', icon: Key },
  { name: 'Webhooks', desc: 'Event integrations', href: '/dashboard/settings/webhooks', icon: Zap },
  { name: 'Import / Export', desc: 'Vault & data portability', href: '/dashboard/settings/import-export', icon: FileBarChart },
  { name: 'Asset Layouts', desc: 'Custom asset schemas', href: '/dashboard/asset-layouts', icon: LayoutGrid },
  { name: 'API Docs', desc: 'Endpoint reference', href: '/dashboard/settings/api-docs', icon: BookOpen },
];

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // password change state
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/profile')
      .then((r) => r.json())
      .then((data) => {
        setProfile(data);
        setName(data.name || '');
        setPhone(data.phone || '');
        setTimezone(data.timezone || 'UTC');
        setBio(data.bio || '');
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, timezone, bio }),
    });
    if (res.ok) {
      setProfile((p) => (p ? { ...p, name, phone, timezone, bio } : p));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
    setSaving(false);
  };

  const changePassword = async () => {
    setPwMsg(null);
    if (newPw.length < 8) {
      setPwMsg({ ok: false, text: 'New password must be at least 8 characters.' });
      return;
    }
    if (newPw !== confirmPw) {
      setPwMsg({ ok: false, text: 'New passwords do not match.' });
      return;
    }
    setPwBusy(true);
    try {
      const res = await fetch('/api/profile/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setPwMsg({ ok: true, text: 'Password changed.' });
        setCurrentPw(''); setNewPw(''); setConfirmPw('');
      } else {
        setPwMsg({ ok: false, text: data.error || 'Failed to change password.' });
      }
    } finally {
      setPwBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }
  if (!profile) return null;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Profile</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Your account information and preferences</p>
      </div>

      {/* Identity + form */}
      <div className="card p-6">
        <div className="flex items-center gap-5 mb-6">
          <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-bold shrink-0">
            {(profile.name || profile.email).charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 dark:text-white truncate">{profile.name || 'Unnamed'}</p>
            <p className="text-sm text-slate-500 truncate">{profile.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Display Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input-field" placeholder="Your name" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>
            <input value={profile.email} disabled className="input-field opacity-60" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input-field" placeholder="+1 (555) 000-0000" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Timezone</label>
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="input-field">
              {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Bio</label>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} className="input-field" rows={3} placeholder="A short bio about yourself…" />
        </div>
        <div className="flex justify-end items-center gap-3 mt-4">
          {saved && <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Saved</span>}
          <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </button>
        </div>
      </div>

      {/* Account info */}
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Account Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--surface-2)' }}>
            <p className="text-xs text-slate-500">Role</p>
            <p className="font-medium capitalize text-slate-900 dark:text-white">{profile.role}</p>
          </div>
          <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--surface-2)' }}>
            <p className="text-xs text-slate-500">Member Since</p>
            <p className="font-medium text-slate-900 dark:text-white">{formatDate(profile.createdAt)}</p>
          </div>
          <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--surface-2)' }}>
            <p className="text-xs text-slate-500">Email Verified</p>
            <p className={`font-medium ${profile.emailVerified ? 'text-green-600' : 'text-amber-600'}`}>
              {profile.emailVerified ? 'Verified' : 'Not Verified'}
            </p>
          </div>
          <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--surface-2)' }}>
            <p className="text-xs text-slate-500">Auth Provider</p>
            <p className="font-medium text-slate-900 dark:text-white">Password</p>
          </div>
        </div>
      </div>

      {/* Change password */}
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Change Password</h3>
        <p className="text-xs text-slate-500 mb-4">Requires your current password. Minimum 8 characters.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            type="password"
            value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
            placeholder="Current password"
            aria-label="Current password"
            autoComplete="current-password"
            className="input-field"
          />
          <input
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            placeholder="New password"
            aria-label="New password"
            autoComplete="new-password"
            className="input-field"
          />
          <input
            type="password"
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            placeholder="Confirm new password"
            aria-label="Confirm new password"
            autoComplete="new-password"
            className="input-field"
          />
        </div>
        <div className="flex justify-end items-center gap-3 mt-4">
          {pwMsg && (
            <span className={`text-xs flex items-center gap-1 ${pwMsg.ok ? 'text-green-600' : 'text-red-600'}`}>
              {pwMsg.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
              {pwMsg.text}
            </span>
          )}
          <button
            onClick={changePassword}
            disabled={pwBusy || !currentPw || !newPw || !confirmPw}
            className="btn-secondary disabled:opacity-50 flex items-center gap-2"
          >
            {pwBusy && <Loader2 className="w-4 h-4 animate-spin" />}
            Update Password
          </button>
        </div>
      </div>

      {/* Your assets */}
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Your Assets</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: FileText, label: 'Documents', value: profile._count.documents, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/40' },
            { icon: KeyRound, label: 'Passwords', value: profile._count.passwords, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950/40' },
            { icon: Globe, label: 'Domains', value: profile._count.domains, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-950/40' },
            { icon: Tag, label: 'Tags', value: profile._count.tags, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/40' },
          ].map((s) => (
            <div key={s.label} className={`text-center p-4 ${s.bg} rounded-lg`}>
              <s.icon className={`w-6 h-6 ${s.color} mx-auto mb-2`} />
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Quick links to dedicated pages (replaces the old duplicated sections) */}
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">More Settings</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {QUICK_LINKS.map((l) => (
            <Link
              key={l.name}
              href={l.href}
              className="flex items-center gap-3 p-3 rounded-lg transition-colors hover:bg-[var(--surface-2)] group"
            >
              <l.icon className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 dark:text-white">{l.name}</p>
                <p className="text-xs text-slate-500 truncate">{l.desc}</p>
              </div>
              <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: 'var(--muted)' }} />
            </Link>
          ))}
        </div>
      </div>

      <KeyboardShortcutsHelp />
    </div>
  );
}
