'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Search, Moon, Sun, FileText, Key, Globe, Box, CheckSquare, LogOut } from 'lucide-react';
import { ListTodo, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useTheme } from '@/lib/ThemeContext';
import { useOrganization } from '@/lib/OrganizationContext';
import { NotificationBell } from '@/components/NotificationBell';
import { CommandPalette } from '@/components/CommandPalette';
import { clearBrowserDocumentDrafts } from '@/lib/document-drafts';
import { requestNavigation } from '@/lib/navigation-request';

export function Header() {
  const { selectedOrg } = useOrganization();
  const router = useRouter();
  const pathname = usePathname();
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
  const quickAdd = (url: string) => {
    if (!requestNavigation()) return;
    setQuickAddOpen(false);
    router.push(url);
  };

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
      className="min-h-14 border-b flex flex-wrap items-center gap-3 px-3 py-2 lg:flex-nowrap lg:px-6 backdrop-blur-md sticky top-0 z-30"
      style={{
        borderColor: 'var(--card-border)',
        backgroundColor: 'color-mix(in srgb, var(--background) 80%, transparent)',
      }}
    >
      <div className="order-2 flex w-full min-w-0 items-center gap-2 lg:order-1 lg:flex-1">
        <button
          onClick={() => setPaletteOpen(true)}
          aria-label="Open global search"
          className="group relative min-w-0 flex-1 max-w-lg flex items-center gap-2 pl-3 pr-2 py-2 rounded-lg text-sm transition-all duration-150 hover:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
          style={{
            backgroundColor: 'var(--input-bg)',
            color: 'var(--muted)',
            border: '1px solid var(--input-border)',
          }}
        >
          <Search className="w-4 h-4" />
          <span className="flex-1 truncate text-left">Search anything…</span>
          <span
            className="hidden xl:flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
            style={{ backgroundColor: 'var(--surface-2)', color: 'var(--muted)' }}
          >
            ⌘ K
          </span>
        </button>
        <nav aria-label="Workspace shortcuts" className="flex shrink-0 items-center gap-1">
          {[
            { href: '/dashboard/my-day', label: 'My Day', icon: ListTodo },
            { href: '/dashboard/assistant', label: 'Ask the Docs', icon: Sparkles },
          ].map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-label={label} title={label}
              aria-current={pathname === href ? 'page' : undefined}
              className="inline-flex min-h-10 min-w-10 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              style={{ color: pathname === href ? 'var(--accent)' : 'var(--foreground)', backgroundColor: pathname === href ? 'var(--surface-2)' : undefined }}>
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}
        </nav>
      </div>

      <div className="order-1 ml-auto flex min-h-10 shrink-0 items-center gap-2 pl-12 lg:order-2 lg:pl-0">
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
                  quickAdd('/dashboard/passwords/new');
                }}
                className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-[var(--surface-2)] font-medium"
                style={{ color: 'var(--foreground)' }}
              >
                <Key className="w-3.5 h-3.5 text-emerald-500" />
                New Password
              </button>
              <button
                onClick={() => {
                  quickAdd(`/dashboard/documents/new${selectedOrg?.id ? `?organizationId=${selectedOrg.id}` : ''}`);
                }}
                className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-[var(--surface-2)] font-medium"
                style={{ color: 'var(--foreground)' }}
              >
                <FileText className="w-3.5 h-3.5 text-blue-500" />
                New Document
              </button>
              <button
                onClick={() => {
                  quickAdd('/dashboard/assets/new');
                }}
                className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-[var(--surface-2)] font-medium"
                style={{ color: 'var(--foreground)' }}
              >
                <Box className="w-3.5 h-3.5 text-amber-500" />
                New Flexible Asset
              </button>
              <button
                onClick={() => {
                  quickAdd('/dashboard/domains/new');
                }}
                className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-[var(--surface-2)] font-medium"
                style={{ color: 'var(--foreground)' }}
              >
                <Globe className="w-3.5 h-3.5 text-purple-500" />
                New Domain
              </button>
              <button
                onClick={() => {
                  quickAdd('/dashboard/checklists/new');
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
            try { clearBrowserDocumentDrafts(); }
            catch { window.alert('Browser drafts could not be cleared. Clear this site’s browser data before sharing this browser with another person.'); }
            await fetch('/api/logout', { method: 'POST' });
            router.push('/login');
            router.refresh();
          }}
          title="Sign Out"
          aria-label="Sign out"
          className="p-2 rounded-lg transition-all duration-150 hover:bg-red-50 dark:hover:bg-red-950/50 text-red-500"
        >
          <LogOut className="w-[18px] h-[18px]" />
        </button>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </header>
  );
}
