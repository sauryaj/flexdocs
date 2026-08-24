'use client';

import { useTheme, ACCENT_COLORS, Theme, BorderEffect, PresetAccent } from '@/lib/ThemeContext';
import { Sun, Moon, Monitor, Check, Sparkles, Zap, Circle, Droplets, Waves, Rows3, Type, Contrast, PersonStanding } from 'lucide-react';
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
  { value: 'glass', label: 'Glass', icon: Droplets, description: 'Frosted translucent cards' },
  { value: 'gradient', label: 'Gradient', icon: Waves, description: 'Ambient accent background' },
];



const accentLabels: Record<PresetAccent, string> = {
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
  const {
    theme, accent, customAccent, effect, density, fontScale, highContrast, reducedMotion,
    setTheme, setAccent, setCustomAccent, setEffect, setDensity, setFontScale, setHighContrast, setReducedMotion,
    resolvedMode,
  } = useTheme();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Theme Settings</h1>
        <p style={{ color: 'var(--muted)' }}>Customize the look and feel of FlexDocs</p>
      </div>

      {/* 1-Click IT Glue Theme Presets */}
      <div className="card p-6 border-l-4 border-blue-600 bg-gradient-to-r from-blue-600/5 to-transparent">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>
              1-Click Theme Presets
            </h2>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Instantly apply curated MSP & IT Glue design palettes
            </p>
          </div>
          <Sparkles className="w-5 h-5 text-blue-500" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => {
              setTheme('dark');
              setAccent('blue');
              setEffect('none');
            }}
            className="p-4 rounded-xl border-2 text-left transition-all hover:scale-[1.02] flex flex-col justify-between space-y-3"
            style={{
              borderColor: accent === 'blue' && theme === 'dark' ? 'var(--accent)' : 'var(--card-border)',
              backgroundColor: 'var(--card-bg)',
            }}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm text-blue-400">IT Glue Classic</span>
              <span className="w-3 h-3 rounded-full bg-blue-600 shadow-sm" />
            </div>
            <p className="text-xs text-slate-400">
              Deep navy sidebar, crisp slate card backgrounds, and electric blue primary accents.
            </p>
            <span className="text-[11px] font-medium text-blue-500 hover:underline">Apply Preset →</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setTheme('dark');
              setAccent('teal');
              setEffect('glow');
            }}
            className="p-4 rounded-xl border-2 text-left transition-all hover:scale-[1.02] flex flex-col justify-between space-y-3"
            style={{
              borderColor: accent === 'teal' && effect === 'glow' ? 'var(--accent)' : 'var(--card-border)',
              backgroundColor: 'var(--card-bg)',
            }}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm text-teal-400">Cyberpunk Teal</span>
              <span className="w-3 h-3 rounded-full bg-teal-500 shadow-sm" />
            </div>
            <p className="text-xs text-slate-400">
              High-tech dark background with glowing cyan borders and technical matrix contrast.
            </p>
            <span className="text-[11px] font-medium text-teal-400 hover:underline">Apply Preset →</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setTheme('dark');
              setAccent('purple');
              setEffect('star');
            }}
            className="p-4 rounded-xl border-2 text-left transition-all hover:scale-[1.02] flex flex-col justify-between space-y-3"
            style={{
              borderColor: accent === 'purple' && effect === 'star' ? 'var(--accent)' : 'var(--card-border)',
              backgroundColor: 'var(--card-bg)',
            }}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm text-purple-400">Enterprise Regal</span>
              <span className="w-3 h-3 rounded-full bg-purple-600 shadow-sm" />
            </div>
            <p className="text-xs text-slate-400">
              Vibrant purple accents paired with animated orbiting star borders on active components.
            </p>
            <span className="text-[11px] font-medium text-purple-400 hover:underline">Apply Preset →</span>
          </button>
        </div>
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
          {(Object.keys(ACCENT_COLORS) as PresetAccent[]).map((color) => {
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

      {/* Custom Accent */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>Custom Accent</h2>
          {accent === 'custom' && (
            <span className="badge badge-blue">Active</span>
          )}
        </div>
        <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
          Pick any color — hover, ring, and tint variants are derived automatically for both light and dark mode.
        </p>
        <div className="flex items-center gap-4 flex-wrap">
          <label className="relative w-14 h-14 rounded-xl cursor-pointer overflow-hidden border-2" style={{ borderColor: accent === 'custom' ? 'var(--accent)' : 'var(--card-border)' }}>
            <input
              type="color"
              aria-label="Pick custom accent color"
              value={customAccent ?? '#2563eb'}
              onChange={(e) => setCustomAccent(e.target.value)}
              className="absolute inset-0 w-[150%] h-[150%] -translate-x-1/4 -translate-y-1/4 cursor-pointer"
            />
          </label>
          <input
            type="text"
            aria-label="Custom accent hex"
            placeholder="#2563eb"
            value={customAccent ?? ''}
            onChange={(e) => {
              const v = e.target.value.trim();
              if (/^#[0-9a-fA-F]{6}$/.test(v)) setCustomAccent(v);
              else if (v === '') setCustomAccent(null);
            }}
            className="input-field w-32 font-mono text-sm"
            maxLength={7}
          />
          {customAccent && (
            <button
              onClick={() => setCustomAccent(null)}
              className="text-sm px-3 py-1.5 rounded-lg border transition-colors hover:bg-red-500/10"
              style={{ borderColor: 'var(--card-border)', color: 'var(--muted)' }}
            >
              Reset to presets
            </button>
          )}
          <div
            aria-hidden
            className="ml-auto hidden sm:flex gap-1.5 rounded-full px-3 py-1.5 border"
            style={{ borderColor: 'var(--card-border)' }}
          >
            {customAccent && [0.42, 0.55, 0.66].map((l, i) => {
              const swatch = (() => {
                const h = customAccent.replace('#','');
                const n = parseInt(h, 16);
                const r = (n>>16&255)/255, g = (n>>8&255)/255, b = (n&255)/255;
                const mx = Math.max(r,g,b), mn = Math.min(r,g,b), li=(mx+mn)/2;
                let s = 0, hd = 0;
                if (mx !== mn) { const dd=mx-mn; s = li>.5?dd/(2-mx-mn):dd/(mx+mn);
                  if (mx===r) hd=((g-b)/dd+(g<b?6:0))/6; else if (mx===g) hd=((b-r)/dd+2)/6; else hd=((r-g)/dd+4)/6; }
                const c = (1-Math.abs(2*l-1))*s, x = c*(1-Math.abs((hd*360/60)%2-1)), m = li-c/2;
                let rr=0,gg=0,bb=0; const hh=hd*360;
                if(hh<60)[rr,gg,bb]=[c,x,0];else if(hh<120)[rr,gg,bb]=[x,c,0];else if(hh<180)[rr,gg,bb]=[0,c,x];
                else if(hh<240)[rr,gg,bb]=[0,x,c];else if(hh<300)[rr,gg,bb]=[x,0,c];else[rr,gg,bb]=[c,0,x];
                const t=(v:number)=>Math.round((v+m)*255).toString(16).padStart(2,'0');
                return `#${t(rr)}${t(gg)}${t(bb)}`;
              })();
              return <div key={i} className="w-5 h-5 rounded-full" style={{ backgroundColor: swatch }} title={`L ${Math.round(l*100)}%`} />;
            })}
            {!customAccent && <span className="text-xs" style={{ color: 'var(--muted)' }}>Derived shades preview</span>}
          </div>
        </div>
      </div>

      {/* Border Effect */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--foreground)' }}>Card Effect</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>Add an animated border or surface effect to cards</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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

      {/* Layout & Typography */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--foreground)' }}>Layout &amp; Type</h2>
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-medium flex items-center gap-1.5" style={{ color: 'var(--foreground)' }}>
                <Rows3 className="w-4 h-4" /> Density
              </p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Compact tightens cards, tables, and inputs</p>
            </div>
            <div className="flex rounded-lg border overflow-hidden" role="group" aria-label="Density" style={{ borderColor: 'var(--card-border)' }}>
              {(['comfortable', 'compact'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDensity(d)}
                  aria-pressed={density === d}
                  className={cn('px-4 py-1.5 text-sm capitalize transition-colors', density === d ? 'font-semibold' : '')}
                  style={{
                    backgroundColor: density === d ? 'var(--accent-light)' : 'transparent',
                    color: density === d ? 'var(--accent)' : 'var(--muted)',
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-medium flex items-center gap-1.5" style={{ color: 'var(--foreground)' }}>
                <Type className="w-4 h-4" /> Font size
              </p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Scales the entire interface</p>
            </div>
            <div className="flex rounded-lg border overflow-hidden" role="group" aria-label="Font size" style={{ borderColor: 'var(--card-border)' }}>
              {(['sm', 'md', 'lg'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFontScale(f)}
                  aria-pressed={fontScale === f}
                  className={cn('px-4 py-1.5 transition-colors', fontScale === f ? 'font-semibold' : '', f === 'sm' ? 'text-xs' : f === 'lg' ? 'text-base' : 'text-sm')}
                  style={{
                    backgroundColor: fontScale === f ? 'var(--accent-light)' : 'transparent',
                    color: fontScale === f ? 'var(--accent)' : 'var(--muted)',
                  }}
                >
                  {f === 'sm' ? 'Small' : f === 'md' ? 'Default' : 'Large'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Accessibility */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--foreground)' }}>Accessibility</h2>
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-medium flex items-center gap-1.5" style={{ color: 'var(--foreground)' }}>
                <Contrast className="w-4 h-4" /> High contrast
              </p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Stronger text and border contrast, visible focus outlines</p>
            </div>
            <button
              role="switch"
              aria-checked={highContrast}
              aria-label="High contrast mode"
              onClick={() => setHighContrast(!highContrast)}
              className={cn('relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0')}
              style={{ backgroundColor: highContrast ? 'var(--accent)' : 'var(--surface-2, #e2e8f0)' }}
            >
              <span
                className={cn('inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform')}
                style={{ transform: highContrast ? 'translateX(1.375rem)' : 'translateX(0.125rem)' }}
              />
            </button>
          </div>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-medium flex items-center gap-1.5" style={{ color: 'var(--foreground)' }}>
                <PersonStanding className="w-4 h-4" /> Reduced motion
              </p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                Disables animations and transitions. Your system preference is respected automatically.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={reducedMotion}
              aria-label="Reduced motion"
              onClick={() => setReducedMotion(!reducedMotion)}
              className={cn('relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0')}
              style={{ backgroundColor: reducedMotion ? 'var(--accent)' : 'var(--surface-2, #e2e8f0)' }}
            >
              <span
                className={cn('inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform')}
                style={{ transform: reducedMotion ? 'translateX(1.375rem)' : 'translateX(0.125rem)' }}
              />
            </button>
          </div>
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
