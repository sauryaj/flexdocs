'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function useKeyboardShortcuts() {
  const router = useRouter();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>('input[placeholder*="Search"]');
        if (searchInput) searchInput.focus();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        router.push('/dashboard/documents/new');
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault();
        router.push('/dashboard/passwords/new');
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        router.push('/dashboard/domains/new');
      }
      if (e.key === 'Escape') {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [router]);
}

export function KeyboardShortcutsHelp() {
  const shortcutsList = [
    { keys: 'Ctrl+K', action: 'Focus search' },
    { keys: 'Ctrl+N', action: 'New document' },
    { keys: 'Ctrl+P', action: 'New password' },
    { keys: 'Ctrl+Shift+D', action: 'New domain' },
    { keys: 'Esc', action: 'Blur input' },
  ];

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-slate-700">Keyboard Shortcuts</h4>
      <div className="grid grid-cols-2 gap-2">
        {shortcutsList.map((s) => (
          <div key={s.keys} className="flex items-center justify-between text-sm">
            <span className="text-slate-600">{s.action}</span>
            <kbd className="px-1.5 py-0.5 bg-slate-100 border rounded text-xs font-mono text-slate-500">
              {s.keys}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  );
}
