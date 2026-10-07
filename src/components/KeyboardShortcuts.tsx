'use client';

export function KeyboardShortcutsHelp() {
  const shortcutsList = [
    { keys: 'Ctrl/⌘+K', action: 'Open command palette' },
    { keys: '↑ / ↓', action: 'Choose a search result in the palette' },
    { keys: 'Enter', action: 'Open the selected palette result' },
    { keys: 'Esc', action: 'Close the command palette' },
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
