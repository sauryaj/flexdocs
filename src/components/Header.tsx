'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Moon, Sun, FileText, Key, Globe, Box, CheckSquare, Command, LogOut } from 'lucide-react';
import { useTheme } from '@/lib/ThemeContext';
import { NotificationBell } from '@/components/NotificationBell';

interface SearchResult {
  id: string;
  name: string;
  type: 'documents' | 'passwords' | 'domains' | 'assets' | 'checklists';
  snippet?: string;
}

const typeLabels: Record<SearchResult['type'], string> = {
  documents: 'Documents',
  passwords: 'Passwords',
  domains: 'Domains',
  assets: 'Assets',
  checklists: 'Checklists',
};

const typeIcons: Record<SearchResult['type'], typeof FileText> = {
  documents: FileText,
  passwords: Key,
  domains: Globe,
  assets: Box,
  checklists: CheckSquare,
};

export function Header() {
  const router = useRouter();
  const { resolvedMode, setTheme } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          const flat: SearchResult[] = [];
          for (const [type, items] of Object.entries(data) as [string, any[]][]) {
            if (Array.isArray(items)) {
              for (const item of items) {
                flat.push({
                  id: item.id,
                  name: item.name || item.title || item.username || 'Untitled',
                  type: type as SearchResult['type'],
                  snippet: item.content?.substring(0, 80) || item.url || item.assetType || item.description || undefined,
                });
              }
            }
          }
          setResults(flat);
          setShowDropdown(true);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [searchQuery]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowDropdown(false);
      inputRef.current?.blur();
    }
  }, []);

  const handleResultClick = useCallback((result: SearchResult) => {
    setShowDropdown(false);
    setSearchQuery('');
    router.push(`/dashboard/${result.type}/${result.id}`);
  }, [router]);

  const toggleTheme = () => {
    setTheme(resolvedMode === 'dark' ? 'light' : 'dark');
  };

  const groupedResults = results.reduce<Record<SearchResult['type'], SearchResult[]>>(
    (acc, item) => {
      if (!acc[item.type]) acc[item.type] = [];
      acc[item.type].push(item);
      return acc;
    },
    {} as Record<SearchResult['type'], SearchResult[]>
  );

  // Global Cmd+K keyboard shortcut listener
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const quickAddRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (quickAddRef.current && !quickAddRef.current.contains(e.target as Node)) {
        setQuickAddOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header
      className="h-14 border-b flex items-center justify-between px-6 backdrop-blur-md sticky top-0 z-30"
      style={{
        borderColor: 'var(--card-border)',
        backgroundColor: 'color-mix(in srgb, var(--background) 80%, transparent)',
      }}
    >
      <div className="flex items-center gap-4 flex-1 max-w-lg">
        <div className="relative w-full" ref={searchRef}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted)' }} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search anything (Cmd + K)..."
            aria-label="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => results.length > 0 && setShowDropdown(true)}
            className="w-full pl-10 pr-12 py-2 rounded-lg text-sm transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)] focus:border-[var(--accent)]"
            style={{
              backgroundColor: 'var(--input-bg)',
              color: 'var(--foreground)',
              border: '1px solid var(--input-border)',
            }}
          />
          <div
            className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
            style={{ backgroundColor: 'var(--surface-2)', color: 'var(--muted)' }}
          >
            <Command className="w-3 h-3" /> K
          </div>
          {showDropdown && (
            <div
              className="absolute top-full left-0 right-0 mt-1.5 rounded-xl shadow-xl z-50 max-h-80 overflow-y-auto"
              style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
            >
              {loading && results.length === 0 ? (
                <div className="p-4 text-sm text-center" style={{ color: 'var(--muted)' }}>Searching...</div>
              ) : results.length === 0 ? (
                <div className="p-4 text-sm text-center" style={{ color: 'var(--muted)' }}>No results found</div>
              ) : (
                Object.entries(groupedResults).map(([type, items]) => (
                  <div key={type}>
                    <div className="px-3 py-2" style={{ backgroundColor: 'var(--surface-2)' }}>
                      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                        {(() => {
                          const Icon = typeIcons[type as SearchResult['type']];
                          return <Icon className="w-3.5 h-3.5" />;
                        })()}
                        {typeLabels[type as SearchResult['type']]}
                      </div>
                    </div>
                    {items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleResultClick(item)}
                        className="w-full text-left px-4 py-2.5 transition-colors border-b last:border-b-0 hover:bg-[var(--surface-2)]"
                        style={{ borderColor: 'var(--card-border)' }}
                      >
                        <div className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>
                          {item.name}
                        </div>
                        {item.snippet && (
                          <div className="text-xs truncate mt-0.5" style={{ color: 'var(--muted)' }}>
                            {item.snippet}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Quick Add Dropdown */}
        <div className="relative" ref={quickAddRef}>
          <button
            onClick={() => setQuickAddOpen(!quickAddOpen)}
            aria-expanded={quickAddOpen}
            aria-haspopup="menu"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white shadow-sm transition-all hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <span>+ Quick Add</span>
          </button>
          {quickAddOpen && (
            <div
              className="absolute right-0 top-full mt-1.5 w-48 rounded-xl shadow-xl z-50 overflow-hidden py-1"
              style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
            >
              <button
                onClick={() => {
                  setQuickAddOpen(false);
                  router.push('/dashboard/passwords/new');
                }}
                className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-[var(--surface-2)] font-medium"
                style={{ color: 'var(--foreground)' }}
              >
                <Key className="w-3.5 h-3.5 text-emerald-500" />
                New Password
              </button>
              <button
                onClick={() => {
                  setQuickAddOpen(false);
                  router.push('/dashboard/documents/new');
                }}
                className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-[var(--surface-2)] font-medium"
                style={{ color: 'var(--foreground)' }}
              >
                <FileText className="w-3.5 h-3.5 text-blue-500" />
                New Document
              </button>
              <button
                onClick={() => {
                  setQuickAddOpen(false);
                  router.push('/dashboard/assets/new');
                }}
                className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-[var(--surface-2)] font-medium"
                style={{ color: 'var(--foreground)' }}
              >
                <Box className="w-3.5 h-3.5 text-amber-500" />
                New Flexible Asset
              </button>
              <button
                onClick={() => {
                  setQuickAddOpen(false);
                  router.push('/dashboard/domains/new');
                }}
                className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-[var(--surface-2)] font-medium"
                style={{ color: 'var(--foreground)' }}
              >
                <Globe className="w-3.5 h-3.5 text-purple-500" />
                New Domain
              </button>
              <button
                onClick={() => {
                  setQuickAddOpen(false);
                  router.push('/dashboard/checklists/new');
                }}
                className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-[var(--surface-2)] font-medium"
                style={{ color: 'var(--foreground)' }}
              >
                <CheckSquare className="w-3.5 h-3.5 text-rose-500" />
                New Checklist
              </button>
            </div>
          )}
        </div>

        <NotificationBell />

        <button
          onClick={toggleTheme}
          aria-label={resolvedMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="p-2 rounded-lg transition-all duration-150 hover:bg-[var(--surface-2)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
          style={{ color: 'var(--muted)' }}
        >
          {resolvedMode === 'dark' ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
        </button>
        <button
          onClick={async () => {
            await fetch('/api/logout', { method: 'POST' });
            router.push('/login');
            router.refresh();
          }}
          title="Sign Out"
          className="p-2 rounded-lg transition-all duration-150 hover:bg-red-50 dark:hover:bg-red-950/50 text-red-500"
        >
          <LogOut className="w-[18px] h-[18px]" />
        </button>
      </div>
    </header>
  );
}
