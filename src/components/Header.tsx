'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Moon, Sun, FileText, Key, Globe, Box, CheckSquare, LogOut } from 'lucide-react';
import { useTheme } from '@/lib/ThemeContext';
import { useOrganization } from '@/lib/OrganizationContext';
import { NotificationBell } from '@/components/NotificationBell';
import { CommandPalette } from '@/components/CommandPalette';

export function Header() {
  const { selectedOrg } = useOrganization();
  const router = useRouter();
  const { resolvedMode, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(resolvedMode === 'dark' ? 'light' : 'dark');
  };

  // Command palette
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
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
        <button
          onClick={() => setPaletteOpen(true)}
          aria-label="Open global search"
          className="group relative w-full flex items-center gap-2 pl-3 pr-2 py-2 rounded-lg text-sm transition-all duration-150 hover:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
          style={{
            backgroundColor: 'var(--input-bg)',
            color: 'var(--muted)',
            border: '1px solid var(--input-border)',
          }}
        >
          <Search className="w-4 h-4" />
          <span className="flex-1 text-left">Search anything…</span>
          <span
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
            style={{ backgroundColor: 'var(--surface-2)', color: 'var(--muted)' }}
          >
            ⌘ K
          </span>
        </button>
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
                  router.push(`/dashboard/documents/new${selectedOrg?.id ? `?organizationId=${selectedOrg.id}` : ''}`);
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

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </header>
  );
}
