'use client';

import { useTheme, ACCENT_COLORS, Theme, AccentColor, BorderEffect } from '@/lib/ThemeContext';
import { Sun, Moon, Monitor, Check, Sparkles, Zap, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StarBorder } from '@/components/StarBorder';

const themes: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

const effects: { value: BorderEffect; label: string; icon: typeof Sparkles; description: string }[] = [
  { value: 'none', label: 'None', icon: Circle, description: 'Clean card borders' },
  { value: 'star', label: 'Star Border', icon: Sparkles, description: 'Animated orbiting stars' },
  { value: 'glow', label: 'Glow', icon: Zap, description: 'Subtle accent glow' },
];

const accentLabels: Record<AccentColor, string> = {
  blue: 'Blue',
  purple: 'Purple',
  teal: 'Teal',
  green: 'Green',
  orange: 'Orange',
  red: 'Red',
  pink: 'Pink',
  indigo: 'Indigo',
};

export default function ThemeSettingsPage() {
  const { theme, accent, effect, setTheme, setAccent, setEffect, resolvedMode } = useTheme();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Theme Settings</h1>
        <p style={{ color: 'var(--muted)' }}>Customize the look and feel of FlexDocs</p>
      </div>

      {/* Mode Selection */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--foreground)' }}>Appearance</h2>
        <div className="grid grid-cols-3 gap-4">
          {themes.map((t) => {
            const Icon = t.icon;
            const isActive = theme === t.value;
            return (
              <button
                key={t.value}
                onClick={() => setTheme(t.value)}
                className={cn(
                  'relative flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all',
                  isActive ? 'ring-2' : 'hover:scale-105'
                )}
                style={{
                  borderColor: isActive ? 'var(--accent)' : 'var(--card-border)',
                  backgroundColor: isActive ? 'color-mix(in srgb, var(--accent) 8%, var(--card-bg))' : 'var(--card-bg)',
                  boxShadow: isActive ? '0 0 0 2px var(--accent)' : 'none',
                }}
              >
                {isActive && (
                  <div
                    className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-white"
                    style={{ backgroundColor: 'var(--accent)' }}
                  >
                    <Check className="w-3 h-3" />
                  </div>
                )}
                <Icon className="w-8 h-8" style={{ color: isActive ? 'var(--accent)' : 'var(--muted)' }} />
                <span className="font-medium" style={{ color: isActive ? 'var(--foreground)' : 'var(--muted)' }}>
                  {t.label}
                </span>
                {t.value === 'system' && (
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>
                    Currently: {resolvedMode}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Accent Color */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--foreground)' }}>Accent Color</h2>
        <div className="grid grid-cols-4 gap-3">
          {(Object.keys(ACCENT_COLORS) as AccentColor[]).map((color) => {
            const isActive = accent === color;
            const colors = ACCENT_COLORS[color];
            return (
              <button
                key={color}
                onClick={() => setAccent(color)}
                className={cn(
                  'relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all',
                  isActive ? 'scale-105' : 'hover:scale-105'
                )}
                style={{
                  borderColor: isActive ? colors.light : 'var(--card-border)',
                  backgroundColor: isActive ? `color-mix(in srgb, ${colors.light} 10%, var(--card-bg))` : 'var(--card-bg)',
                }}
              >
                {isActive && (
                  <div
                    className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center text-white"
                    style={{ backgroundColor: colors.light }}
                  >
                    <Check className="w-2.5 h-2.5" />
                  </div>
                )}
                <div
                  className="w-10 h-10 rounded-full shadow-inner"
                  style={{ backgroundColor: colors.light }}
                />
                <span
                  className="text-sm font-medium"
                  style={{ color: isActive ? 'var(--foreground)' : 'var(--muted)' }}
                >
                  {accentLabels[color]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Border Effect */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--foreground)' }}>Card Effect</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>Add an animated border effect to cards</p>
        <div className="grid grid-cols-3 gap-4">
          {effects.map((e) => {
            const Icon = e.icon;
            const isActive = effect === e.value;
            return (
              <button
                key={e.value}
                onClick={() => setEffect(e.value)}
                className={cn(
                  'relative flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all',
                  isActive ? 'ring-2' : 'hover:scale-105'
                )}
                style={{
                  borderColor: isActive ? 'var(--accent)' : 'var(--card-border)',
                  backgroundColor: isActive ? 'color-mix(in srgb, var(--accent) 8%, var(--card-bg))' : 'var(--card-bg)',
                  boxShadow: isActive ? '0 0 0 2px var(--accent)' : 'none',
                }}
              >
                {isActive && (
                  <div
                    className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-white"
                    style={{ backgroundColor: 'var(--accent)' }}
                  >
                    <Check className="w-3 h-3" />
                  </div>
                )}
                <Icon className="w-8 h-8" style={{ color: isActive ? 'var(--accent)' : 'var(--muted)' }} />
                <span className="font-medium" style={{ color: isActive ? 'var(--foreground)' : 'var(--muted)' }}>
                  {e.label}
                </span>
                <span className="text-xs text-center" style={{ color: 'var(--muted)' }}>
                  {e.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Preview */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--foreground)' }}>Preview</h2>
        <div className="space-y-4">
          {effect === 'star' ? (
            <StarBorder>
              <div className="p-4">
                <p className="font-medium" style={{ color: 'var(--foreground)' }}>Star Border Card</p>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>This card has the star border animation</p>
              </div>
            </StarBorder>
          ) : effect === 'glow' ? (
            <div
              className="rounded-xl p-4"
              style={{
                boxShadow: '0 0 20px color-mix(in srgb, var(--accent) 30%, transparent)',
                border: '1px solid color-mix(in srgb, var(--accent) 30%, var(--card-border))',
                backgroundColor: 'var(--card-bg)',
              }}
            >
              <p className="font-medium" style={{ color: 'var(--foreground)' }}>Glow Card</p>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>This card has a subtle accent glow</p>
            </div>
          ) : (
            <div className="rounded-xl p-4" style={{ border: '1px solid var(--card-border)', backgroundColor: 'var(--card-bg)' }}>
              <p className="font-medium" style={{ color: 'var(--foreground)' }}>Default Card</p>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>Clean borders with no animation</p>
            </div>
          )}
          <div className="flex gap-3">
            <button className="btn-primary">Primary Button</button>
            <button className="btn-secondary">Secondary Button</button>
            <button className="btn-danger">Danger Button</button>
          </div>
          <div>
            <input
              type="text"
              placeholder="Sample input field..."
              className="input-field"
            />
          </div>
          <div className="flex gap-2">
            <span className="badge badge-green">Active</span>
            <span className="badge badge-yellow">Expiring</span>
            <span className="badge badge-red">Expired</span>
            <span className="badge badge-blue">Info</span>
            <span className="badge badge-slate">Default</span>
          </div>
        </div>
      </div>
    </div>
  );
}
