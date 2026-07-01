'use client';

import { useState, useEffect } from 'react';
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
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const togglePasswordVisibility = (id: string) => {
    const newVisible = new Set(visiblePasswords);
    if (newVisible.has(id)) {
      newVisible.delete(id);
    } else {
      newVisible.add(id);
    }
    setVisiblePasswords(newVisible);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Password Vault</h1>
          <p className="text-slate-500">Securely store and manage credentials</p>
        </div>
        <Link href="/dashboard/passwords/new" className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Add Password
        </Link>
      </div>

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
                    onToggleVisibility={() => togglePasswordVisibility(pass.id)}
                    onToggleFavorite={() => toggleFavorite(pass.id, pass.isFavorite)}
                    onCopy={copyToClipboard}
                    onDelete={setDeleteId}
                    copiedId={copiedId}
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
                    onToggleVisibility={() => togglePasswordVisibility(pass.id)}
                    onToggleFavorite={() => toggleFavorite(pass.id, pass.isFavorite)}
                    onCopy={copyToClipboard}
                    onDelete={setDeleteId}
                    copiedId={copiedId}
                  />
                ))}
              </div>
            </div>
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
    </div>
  );
}

function PasswordRow({
  pass,
  visible,
  onToggleVisibility,
  onToggleFavorite,
  onCopy,
  onDelete,
  copiedId,
}: {
  pass: PasswordEntry;
  visible: boolean;
  onToggleVisibility: () => void;
  onToggleFavorite: () => void;
  onCopy: (text: string, id: string) => void;
  onDelete: (id: string) => void;
  copiedId: string | null;
}) {
  return (
    <div className="flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors">
      <button
        onClick={() => onToggleFavorite()}
        className={cn(
          'p-1 rounded transition-colors',
          pass.isFavorite ? 'text-amber-500' : 'text-slate-300 hover:text-amber-500'
        )}
      >
        <Star className={cn('w-5 h-5', pass.isFavorite && 'fill-current')} />
      </button>

      <div
        className="flex-1 min-w-0 cursor-pointer"
        onClick={() => window.location.href = `/dashboard/passwords/${pass.id}`}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-slate-900">{pass.name}</span>
          <span className="badge badge-slate">{pass.category}</span>
          {pass.totpSecret && <span className="badge badge-blue"><Lock className="w-3 h-3 inline" /></span>}
          {pass.breachCount > 0 && (
            <span className="badge badge-red"><AlertTriangle className="w-3 h-3 inline" /> {pass.breachCount}</span>
          )}
          {pass.expiresAt && new Date(pass.expiresAt) < new Date(Date.now() + 30 * 86400000) && (
            <span className="badge badge-amber"><Clock className="w-3 h-3 inline" /> Expiring</span>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm text-slate-500">
          <span>{pass.username}</span>
          {pass.url && (
            <a
              href={pass.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-blue-500 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="w-3 h-3" />
              Visit
            </a>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg px-3 py-1.5">
          <code className="text-sm font-mono">
            {visible ? pass.password : '•'.repeat(12)}
          </code>
          <button onClick={onToggleVisibility} className="p-0.5 hover:bg-slate-200 rounded">
            {visible ? (
              <EyeOff className="w-4 h-4 text-slate-500" />
            ) : (
              <Eye className="w-4 h-4 text-slate-500" />
            )}
          </button>
          <button
            onClick={() => onCopy(pass.password, pass.id)}
            className="p-0.5 hover:bg-slate-200 rounded"
          >
            {copiedId === pass.id ? (
              <Check className="w-4 h-4 text-green-500" />
            ) : (
              <Copy className="w-4 h-4 text-slate-500" />
            )}
          </button>
        </div>
        <button
          onClick={() => onDelete(pass.id)}
          className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
