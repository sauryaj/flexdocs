'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Key,
  Plus,
  Search,
  Star,
  Trash2,
  ExternalLink,
  Eye,
  EyeOff,
  Copy,
  Check,
  AlertTriangle,
  Clock,
  Lock,
  Shield,
  RefreshCw,
  TrendingDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState, ConfirmDialog } from '@/components/UIComponents';
import { useOrganization } from '@/lib/OrganizationContext';

interface PasswordEntry {
  id: string;
  name: string;
  username: string;
  password: string;
  url: string | null;
  notes: string | null;
  category: string;
  isFavorite: boolean;
  expiresAt: string | null;
  totpSecret: string | null;
  breachCount: number;
  createdAt: string;
  updatedAt: string;
  tags: { id: string; name: string; color: string }[];
}

interface PasswordHealth {
  totalPasswords: number;
  weakPasswords: number;
  reusedPasswords: number;
  oldPasswords: number;
  expiringPasswords: number;
  breachedPasswords: number;
  withTotp: number;
  withoutTotp: number;
  avgAge: number;
  weakest: { name: string; score: number }[];
  oldest: { name: string; daysOld: number }[];
  reused: { name: string; count: number }[];
  expiring: { name: string; daysUntilExpiry: number }[];
}

const categories = [
  'general',
  'email',
  'social',
  'financial',
  'server',
  'database',
  'api',
  'ssh',
  'vpn',
  'cloud',
];

export default function PasswordsPage() {
  const { selectedOrg } = useOrganization();
  const [passwords, setPasswords] = useState<PasswordEntry[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'health'>('list');

  // Health state
  const [health, setHealth] = useState<PasswordHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  useEffect(() => {
    fetchPasswords();
  }, [selectedOrg]);

  const fetchPasswords = async () => {
    const params = new URLSearchParams();
    if (selectedOrg?.id) {
      params.set('organizationId', selectedOrg.id);
    }
    const res = await fetch(`/api/passwords?${params.toString()}`);
    const data = await res.json();
    setPasswords(data.items || data);
    setLoading(false);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runBulk = async (action: 'favorite' | 'unfavorite' | 'tag', tag?: string) => {
    await fetch('/api/passwords/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ids: Array.from(selectedIds), tag }),
    });
    setSelectedIds(new Set());
    fetchPasswords();
    loadHealth();
  };

  const bulkDelete = async (confirmed: boolean) => {
    setBulkConfirmOpen(false);
    if (!confirmed) return;
    await fetch('/api/passwords/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', ids: Array.from(selectedIds) }),
    });
    setSelectedIds(new Set());
    fetchPasswords();
    loadHealth();
  };

  const loadHealth = useCallback(async () => {
    setHealthLoading(true);
    const params = new URLSearchParams();
    if (selectedOrg?.id) {
      params.set('organizationId', selectedOrg.id);
    }
    const res = await fetch(`/api/passwords/health?${params.toString()}`);
    if (res.ok) setHealth(await res.json());
    setHealthLoading(false);
  }, [selectedOrg]);

  useEffect(() => {
    if (viewMode === 'health') {
      loadHealth();
    }
  }, [viewMode, selectedOrg, loadHealth]);

  const handleDelete = async () => {
    if (!deleteId) return;
    await fetch(`/api/passwords/${deleteId}`, { method: 'DELETE' });
    setPasswords(passwords.filter((p) => p.id !== deleteId));
    setDeleteId(null);
  };

  const toggleFavorite = async (id: string, current: boolean) => {
    const pass = passwords.find((p) => p.id === id);
    if (!pass) return;

    await fetch(`/api/passwords/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...pass, isFavorite: !current }),
    });

    setPasswords(
      passwords.map((p) => (p.id === id ? { ...p, isFavorite: !current } : p))
    );
  };

  const fetchRevealed = async (id: string): Promise<string | null> => {
    if (revealed[id]) return revealed[id];
    try {
      const res = await fetch(`/api/passwords/${id}/reveal`);
      if (!res.ok) return null;
      const data = await res.json();
      setRevealed((prev) => ({ ...prev, [id]: data.password }));
      return data.password;
    } catch {
      return null;
    }
  };

  const togglePasswordVisibility = async (id: string) => {
    const password = await fetchRevealed(id);
    if (password === null) return;
    const newVisible = new Set(visiblePasswords);
    if (newVisible.has(id)) {
      newVisible.delete(id);
    } else {
      newVisible.add(id);
    }
    setVisiblePasswords(newVisible);
  };

  const handleCopy = async (password: string, id: string) => {
    const value = password || (await fetchRevealed(id));
    if (value === null || value === '') return;
    await navigator.clipboard.writeText(value);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filtered = passwords.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.username.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === 'all' || p.category === category;
    const matchesFavorite = showFavoritesOnly ? p.isFavorite : true;
    return matchesSearch && matchesCategory && matchesFavorite;
  });

  const favorites = filtered.filter((p) => p.isFavorite);
  const regular = filtered.filter((p) => !p.isFavorite);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  const healthScore = health && health.totalPasswords > 0
    ? Math.round(((health.totalPasswords - health.weakPasswords - health.reusedPasswords - health.breachedPasswords) / health.totalPasswords) * 100)
    : 100;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--foreground)' }}>Password Vault</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>Securely store and manage credentials</p>
        </div>
        <Link href="/dashboard/passwords/new" className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Add Password
        </Link>
      </div>

      {/* Tab toggle */}
      <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ backgroundColor: 'var(--surface-2)' }}>
        <button
          onClick={() => setViewMode('list')}
          className={cn(
            'px-4 py-2 text-sm font-medium rounded-md transition-colors',
            viewMode === 'list'
              ? 'text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          )}
          style={viewMode === 'list' ? { backgroundColor: 'var(--card-bg)', color: 'var(--foreground)' } : undefined}
        >
          <Key className="w-4 h-4 inline mr-1.5" />
          All Passwords
        </button>
        <button
          onClick={() => setViewMode('health')}
          className={cn(
            'px-4 py-2 text-sm font-medium rounded-md transition-colors',
            viewMode === 'health'
              ? 'text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          )}
          style={viewMode === 'health' ? { backgroundColor: 'var(--card-bg)', color: 'var(--foreground)' } : undefined}
        >
          <Shield className="w-4 h-4 inline mr-1.5" />
          Health
          {health && health.totalPasswords > 0 && (
            <span className={cn(
              'ml-1.5 px-1.5 py-0.5 text-xs rounded-full',
              healthScore >= 80 ? 'bg-green-100 text-green-700' :
              healthScore >= 50 ? 'bg-amber-100 text-amber-700' :
              'bg-red-100 text-red-700'
            )}>
              {healthScore}
            </span>
          )}
        </button>
      </div>

      {viewMode === 'list' ? (
        <>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search passwords..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-field pl-10"
              />
            </div>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="input-field w-auto"
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
            <button
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              className={cn(
                'btn-secondary flex items-center gap-2',
                showFavoritesOnly && 'bg-amber-100 text-amber-800'
              )}
            >
              <Star className={cn('w-4 h-4', showFavoritesOnly && 'fill-current')} />
              Favorites
            </button>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<Key className="w-8 h-8 text-slate-400" />}
              title="No passwords found"
              description="Add your first password to the vault"
              action={
                <Link href="/dashboard/passwords/new" className="btn-primary">
                  <Plus className="w-4 h-4 mr-2 inline" />
                  Add Password
                </Link>
              }
            />
          ) : (
            <div className="space-y-6">
              {selectedIds.size > 0 && (
                <div
                  className="sticky top-16 z-20 rounded-xl px-4 py-3 flex items-center justify-between gap-3 shadow-lg"
                  style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--accent)' }}
                >
                  <span className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                    {selectedIds.size} selected
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const tag = window.prompt('Tag to add to selected passwords:');
                        if (tag && tag.trim()) runBulk('tag', tag.trim());
                      }}
                      className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-[var(--surface-2)]"
                      style={{ color: 'var(--foreground)', borderColor: 'var(--card-border)' }}
                    >
                      Add Tag
                    </button>
                    <button
                      onClick={() => runBulk('favorite')}
                      className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-[var(--surface-2)]"
                      style={{ color: 'var(--foreground)', borderColor: 'var(--card-border)' }}
                    >
                      Favorite
                    </button>
                    <button
                      onClick={() => setBulkConfirmOpen(true)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setSelectedIds(new Set())}
                      className="text-xs px-2 py-1.5"
                      style={{ color: 'var(--muted)' }}
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}
              {favorites.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-slate-500 mb-3 flex items-center gap-2">
                    <Star className="w-4 h-4 text-amber-500 fill-current" /> Favorites
                  </h3>
                  <div className="card divide-y">
                    {favorites.map((pass) => (
                      <PasswordRow
                        key={pass.id}
                        pass={pass}
                        visible={visiblePasswords.has(pass.id)}
                        revealedPassword={revealed[pass.id]}
                        onToggleVisibility={() => togglePasswordVisibility(pass.id)}
                        onToggleFavorite={() => toggleFavorite(pass.id, pass.isFavorite)}
                        onCopy={(id) => handleCopy(revealed[pass.id], id)}
                        onDelete={setDeleteId}
                        copiedId={copiedId}
                        selected={selectedIds.has(pass.id)}
                        onToggleSelect={toggleSelect}
                      />
                    ))}
                  </div>
                </div>
              )}

              {regular.length > 0 && (
                <div>
                  {favorites.length > 0 && (
                    <h3 className="text-sm font-medium text-slate-500 mb-3">All Passwords</h3>
                  )}
                  <div className="card divide-y">
                    {regular.map((pass) => (
                      <PasswordRow
                        key={pass.id}
                        pass={pass}
                        visible={visiblePasswords.has(pass.id)}
                        revealedPassword={revealed[pass.id]}
                        onToggleVisibility={() => togglePasswordVisibility(pass.id)}
                        onToggleFavorite={() => toggleFavorite(pass.id, pass.isFavorite)}
                        onCopy={(id) => handleCopy(revealed[pass.id], id)}
                        onDelete={setDeleteId}
                        copiedId={copiedId}
                        selected={selectedIds.has(pass.id)}
                        onToggleSelect={toggleSelect}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        /* Health View */
        <div className="space-y-6">
          {healthLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : !health ? (
            <div className="text-center py-20 text-slate-500">No password data available</div>
          ) : (
            <>
              {/* Health Score */}
              <div className="card p-8 text-center">
                <div className="relative inline-flex items-center justify-center">
                  <svg className="w-32 h-32" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="54" fill="none" stroke="#e2e8f0" strokeWidth="8" />
                    <circle
                      cx="60" cy="60" r="54" fill="none"
                      stroke={healthScore >= 80 ? '#22c55e' : healthScore >= 50 ? '#eab308' : '#dc2626'}
                      strokeWidth="8"
                      strokeDasharray={`${(healthScore / 100) * 339.292} 339.292`}
                      strokeLinecap="round"
                      transform="rotate(-90 60 60)"
                    />
                  </svg>
                  <div className="absolute">
                    <p className="text-4xl font-bold" style={{ color: healthScore >= 80 ? '#22c55e' : healthScore >= 50 ? '#eab308' : '#dc2626' }}>
                      {healthScore}
                    </p>
                    <p className="text-sm text-slate-500">/ 100</p>
                  </div>
                </div>
                <p className="mt-4 text-lg font-medium text-slate-700">
                  {healthScore >= 80 ? 'Good' : healthScore >= 50 ? 'Needs Improvement' : 'Poor'} Password Health
                </p>
                <button onClick={loadHealth} className="mt-4 btn-secondary text-sm inline-flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> Refresh
                </button>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Total', value: health.totalPasswords, icon: Key, color: 'text-blue-600 bg-blue-50' },
                  { label: 'Weak', value: health.weakPasswords, icon: TrendingDown, color: 'text-red-600 bg-red-50' },
                  { label: 'Reused', value: health.reusedPasswords, icon: Copy, color: 'text-orange-600 bg-orange-50' },
                  { label: 'Breached', value: health.breachedPasswords, icon: AlertTriangle, color: 'text-red-600 bg-red-50' },
                  { label: 'Old (90d+)', value: health.oldPasswords, icon: Clock, color: 'text-amber-600 bg-amber-50' },
                  { label: 'Expiring', value: health.expiringPasswords, icon: Clock, color: 'text-orange-600 bg-orange-50' },
                  { label: 'With TOTP', value: health.withTotp, icon: Lock, color: 'text-green-600 bg-green-50' },
                  { label: 'Avg Age', value: `${health.avgAge}d`, icon: Clock, color: 'text-slate-600 bg-slate-50' },
                ].map((item) => (
                  <div key={item.label} className={`card p-4 flex items-center gap-3 ${item.color}`}>
                    <item.icon className="w-5 h-5" />
                    <div>
                      <p className="text-2xl font-bold">{item.value}</p>
                      <p className="text-xs opacity-75">{item.label}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Weak Passwords */}
              {health.weakest.length > 0 && (
                <div className="card p-6">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-red-600">
                    <TrendingDown className="w-5 h-5" /> Weakest Passwords
                  </h2>
                  <div className="space-y-2">
                    {health.weakest.map((p, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                        <span className="font-medium">{p.name}</span>
                        <span className="text-sm text-red-600">Score: {p.score}/100</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Reused Passwords */}
              {health.reused.length > 0 && (
                <div className="card p-6">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-orange-600">
                    <Copy className="w-5 h-5" /> Reused Passwords
                  </h2>
                  <div className="space-y-2">
                    {health.reused.map((p, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                        <span className="font-medium">{p.name}</span>
                        <span className="text-sm text-orange-600">Used {p.count} times</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Expiring Soon */}
              {health.expiring.length > 0 && (
                <div className="card p-6">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-amber-600">
                    <Clock className="w-5 h-5" /> Expiring Soon
                  </h2>
                  <div className="space-y-2">
                    {health.expiring.map((p, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-amber-50 rounded-lg">
                        <span className="font-medium">{p.name}</span>
                        <span className={`text-sm font-medium ${p.daysUntilExpiry <= 7 ? 'text-red-600' : 'text-amber-600'}`}>
                          {p.daysUntilExpiry}d remaining
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Oldest Passwords */}
              {health.oldest.length > 0 && (
                <div className="card p-6">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-600">
                    <Clock className="w-5 h-5" /> Oldest Passwords
                  </h2>
                  <div className="space-y-2">
                    {health.oldest.map((p, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <span className="font-medium">{p.name}</span>
                        <span className="text-sm text-slate-500">{p.daysOld} days old</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Password"
        message="Are you sure you want to delete this password? This action cannot be undone."
      />

      <ConfirmDialog
        isOpen={bulkConfirmOpen}
        onClose={() => setBulkConfirmOpen(false)}
        onConfirm={() => bulkDelete(true)}
        title="Delete Passwords"
        message={`Are you sure you want to delete ${selectedIds.size} passwords? This action cannot be undone.`}
      />
    </div>
  );
}

function PasswordRow({
  pass,
  visible,
  revealedPassword,
  onToggleVisibility,
  onToggleFavorite,
  onCopy,
  onDelete,
  copiedId,
  selected,
  onToggleSelect,
}: {
  pass: PasswordEntry;
  visible: boolean;
  revealedPassword?: string;
  onToggleVisibility: () => void;
  onToggleFavorite: () => void;
  onCopy: (id: string) => void;
  onDelete: (id: string) => void;
  copiedId: string | null;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-4 p-4 hover:bg-[var(--surface-1)] transition-colors">
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        aria-label={`Select ${pass.name}`}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onToggleSelect(pass.id);
        }}
        className="w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors"
        style={{
          borderColor: selected ? 'var(--accent)' : 'var(--card-border)',
          backgroundColor: selected ? 'var(--accent)' : 'transparent',
        }}
      >
        {selected && <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none"><path d="M2.5 6.5l2.5 2.5L9.5 4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      </button>
      <button
        onClick={() => onToggleFavorite()}
        className={cn(
          'p-1 rounded transition-colors',
          pass.isFavorite ? 'text-amber-500' : 'text-slate-300 hover:text-amber-500'
        )}
        aria-label={pass.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      >
        <Star className={cn('w-5 h-5', pass.isFavorite && 'fill-current')} />
      </button>

      <Link
        href={`/dashboard/passwords/${pass.id}`}
        className="flex-1 min-w-0"
      >
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="font-semibold truncate" style={{ color: 'var(--foreground)' }}>{pass.name}</span>
          <span className="badge badge-slate">{pass.category}</span>
          {pass.totpSecret && <span className="badge badge-blue"><Lock className="w-3 h-3 inline" /></span>}
          {pass.breachCount > 0 && (
            <span className="badge badge-red"><AlertTriangle className="w-3 h-3 inline" /> {pass.breachCount}</span>
          )}
          {pass.expiresAt && new Date(pass.expiresAt) < new Date(Date.now() + 30 * 86400000) && (
            <span className="badge badge-amber"><Clock className="w-3 h-3 inline" /> Expiring</span>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm" style={{ color: 'var(--muted)' }}>
          <span>{pass.username}</span>
          {pass.url && (
            <a
              href={pass.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 transition-colors hover:underline"
              style={{ color: 'var(--accent)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="w-3 h-3" />
              Visit
            </a>
          )}
        </div>
      </Link>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg px-3 py-1.5" style={{ backgroundColor: 'var(--surface-2)' }}>
          <code className="text-sm font-mono" style={{ color: 'var(--foreground)' }}>
            {visible && revealedPassword ? revealedPassword : '•'.repeat(12)}
          </code>
          <button onClick={onToggleVisibility} className="p-0.5 rounded transition-colors" style={{ color: 'var(--muted)' }} aria-label={visible ? 'Hide password' : 'Show password'}>
            {visible ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={() => onCopy(pass.id)}
            className="p-0.5 rounded transition-colors"
            style={{ color: 'var(--muted)' }}
            aria-label="Copy password"
          >
            {copiedId === pass.id ? (
              <Check className="w-4 h-4" style={{ color: 'var(--success)' }} />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        </div>
        <button
          onClick={() => onDelete(pass.id)}
          className="p-1.5 rounded-lg transition-colors hover:bg-red-50 dark:hover:bg-red-950/50"
          style={{ color: 'var(--danger)' }}
          aria-label={`Delete ${pass.name}`}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
