'use client';

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';
type AccentColor = 'blue' | 'purple' | 'teal' | 'green' | 'orange' | 'red' | 'pink' | 'indigo' | 'custom';
type BorderEffect = 'none' | 'star' | 'glow' | 'glass' | 'gradient';
type Density = 'comfortable' | 'compact';
type FontScale = 'sm' | 'md' | 'lg';

interface ThemeContextType {
  theme: Theme;
  accent: AccentColor;
  customAccent: string | null;
  effect: BorderEffect;
  density: Density;
  fontScale: FontScale;
  highContrast: boolean;
  reducedMotion: boolean;
  setTheme: (theme: Theme) => void;
  setAccent: (accent: AccentColor) => void;
  setCustomAccent: (hex: string | null) => void;
  setEffect: (effect: BorderEffect) => void;
  setDensity: (density: Density) => void;
  setFontScale: (scale: FontScale) => void;
  setHighContrast: (on: boolean) => void;
  setReducedMotion: (on: boolean) => void;
  resolvedMode: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

type PresetAccent = Exclude<AccentColor, 'custom'>;

const ACCENT_COLORS: Record<PresetAccent, { light: string; dark: string; ring: string; bg: string; text: string }> = {
  blue:   { light: '#2563eb', dark: '#60a5fa', ring: 'ring-blue-500',   bg: 'bg-blue-600',   text: 'text-blue-600' },
  purple: { light: '#9333ea', dark: '#c084fc', ring: 'ring-purple-500', bg: 'bg-purple-600', text: 'text-purple-600' },
  teal:   { light: '#0d9488', dark: '#2dd4bf', ring: 'ring-teal-500',   bg: 'bg-teal-600',   text: 'text-teal-600' },
  green:  { light: '#16a34a', dark: '#4ade80', ring: 'ring-green-500',  bg: 'bg-green-600',  text: 'text-green-600' },
  orange: { light: '#ea580c', dark: '#fb923c', ring: 'ring-orange-500', bg: 'bg-orange-600', text: 'text-orange-600' },
  red:    { light: '#dc2626', dark: '#f87171', ring: 'ring-red-500',    bg: 'bg-red-600',    text: 'text-red-600' },
  pink:   { light: '#db2777', dark: '#f472b6', ring: 'ring-pink-500',   bg: 'bg-pink-600',   text: 'text-pink-600' },
  indigo: { light: '#4f46e5', dark: '#818cf8', ring: 'ring-indigo-500', bg: 'bg-indigo-600', text: 'text-indigo-600' },
};

const FONT_PX: Record<FontScale, string> = { sm: '14px', md: '', lg: '17.5px' };

// --- Color math (no dependencies) ---
function hexToHsl(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [217, 0.83, 0.53];
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h * 360, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = Math.min(1, Math.max(0, s));
  l = Math.min(1, Math.max(0, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// Derive the full accent variable set from a single hex, tuned per mode for contrast
export function deriveAccentVars(hex: string, mode: 'light' | 'dark') {
  const [h, rawS, rawL] = hexToHsl(hex);
  const s = Math.min(rawS, 0.85);
  let base: string, hover: string;
  if (mode === 'light') {
    const l = Math.min(rawL, 0.42);
    base = hslToHex(h, s, l);
    hover = hslToHex(h, s, Math.max(0, l - 0.07));
  } else {
    const l = Math.max(rawL, 0.66);
    base = hslToHex(h, Math.min(s, 0.75), l);
    hover = hslToHex(h, Math.min(s, 0.75), Math.min(1, l + 0.09));
  }
  return {
    '--accent': base,
    '--accent-hover': hover,
    '--accent-light': rgba(base, mode === 'light' ? 0.1 : 0.14),
    '--accent-muted': rgba(base, 0.09),
  };
}

interface PersistedPrefs {
  theme?: Theme; accent?: AccentColor; customAccent?: string | null; effect?: BorderEffect;
  density?: Density; fontScale?: FontScale; highContrast?: boolean; reducedMotion?: boolean;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [accent, setAccentState] = useState<AccentColor>('blue');
  const [customAccent, setCustomAccentState] = useState<string | null>(null);
  const [effect, setEffectState] = useState<BorderEffect>('none');
  const [density, setDensityState] = useState<Density>('comfortable');
  const [fontScale, setFontScaleState] = useState<FontScale>('md');
  const [highContrast, setHighContrastState] = useState(false);
  const [reducedMotion, setReducedMotionState] = useState(false);
  const [resolvedMode, setResolvedMode] = useState<'light' | 'dark'>('light');

  // Server sync: pull once after mount (server wins), then debounce-save changes
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncedOnce = useRef(false);
  const skipNextSave = useRef(true);

  useEffect(() => {
    const ls = localStorage;
    const savedTheme = ls.getItem('theme') as Theme | null;
    const savedAccent = ls.getItem('accent') as AccentColor | null;
    const savedEffect = ls.getItem('effect') as BorderEffect | null;
    const savedCustom = ls.getItem('customAccent');
    const savedDensity = ls.getItem('density') as Density | null;
    const savedFont = ls.getItem('fontScale') as FontScale | null;
    if (savedTheme) setThemeState(savedTheme);
    if (savedAccent === 'custom') {
      setAccentState('custom');
      if (savedCustom && /^#[0-9a-fA-F]{6}$/.test(savedCustom)) setCustomAccentState(savedCustom.toLowerCase());
      else setAccentState('blue');
    } else if (savedAccent) setAccentState(savedAccent);
    if (savedEffect && ['none', 'star', 'glow', 'glass', 'gradient'].includes(savedEffect)) setEffectState(savedEffect as BorderEffect);
    if (savedDensity === 'compact') setDensityState('compact');
    if (savedFont && ['sm', 'md', 'lg'].includes(savedFont)) setFontScaleState(savedFont as FontScale);
    if (ls.getItem('highContrast') === 'true') setHighContrastState(true);
    if (ls.getItem('reducedMotion') === 'true') setReducedMotionState(true);

    // Pull profile prefs once; they override local defaults when present
    fetch('/api/me/theme')
      .then((r) => (r.ok ? r.json() : null))
      .then((prefs: PersistedPrefs | null) => {
        syncedOnce.current = true;
        if (!prefs || Object.keys(prefs).length === 0) return;
        if (prefs.theme) { setThemeState(prefs.theme); ls.setItem('theme', prefs.theme); }
        if (prefs.accent) {
          setAccentState(prefs.accent); ls.setItem('accent', prefs.accent);
          if (prefs.customAccent) {
            setCustomAccentState(prefs.customAccent); ls.setItem('customAccent', prefs.customAccent);
          }
        }
        if (prefs.effect) { setEffectState(prefs.effect); ls.setItem('effect', prefs.effect); }
        if (prefs.density) { setDensityState(prefs.density); ls.setItem('density', prefs.density); }
        if (prefs.fontScale) { setFontScaleState(prefs.fontScale); ls.setItem('fontScale', prefs.fontScale); }
        if (typeof prefs.highContrast === 'boolean') {
          setHighContrastState(prefs.highContrast); ls.setItem('highContrast', String(prefs.highContrast));
        }
        if (typeof prefs.reducedMotion === 'boolean') {
          setReducedMotionState(prefs.reducedMotion); ls.setItem('reducedMotion', String(prefs.reducedMotion));
        }
        skipNextSave.current = true;
      })
      .catch(() => { syncedOnce.current = true; });
  }, []);

  const currentPrefs = (): PersistedPrefs => ({
    theme, accent, customAccent, effect, density, fontScale, highContrast, reducedMotion,
  });

  // Debounced save to profile after any local change
  useEffect(() => {
    if (!syncedOnce.current || skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch('/api/me/theme', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentPrefs()),
      }).catch(() => {});
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, accent, customAccent, effect, density, fontScale, highContrast, reducedMotion]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');

    function resolve() {
      const mode = theme === 'system' ? (mq.matches ? 'dark' : 'light') : theme;
      setResolvedMode(mode);
      const root = document.documentElement;
      root.classList.remove('light', 'dark');
      root.classList.add(mode);

      // Resolve the effective accent hex
      let hex: string;
      if (accent === 'custom' && customAccent) {
        hex = customAccent;
      } else {
        const preset: PresetAccent = (accent === 'custom' ? 'blue' : accent) as PresetAccent;
        hex = ACCENT_COLORS[preset][mode === 'dark' ? 'dark' : 'light'];
      }

      const vars = deriveAccentVars(hex, mode);
      for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);

      root.setAttribute('data-effect', effect);
      root.setAttribute('data-density', density);
      if (highContrast) root.setAttribute('data-contrast', 'high');
      else root.removeAttribute('data-contrast');
      if (reducedMotion) root.setAttribute('data-motion', 'reduced');
      else root.removeAttribute('data-motion');
      root.style.fontSize = FONT_PX[fontScale];
    }

    resolve();
    mq.addEventListener('change', resolve);
    return () => mq.removeEventListener('change', resolve);
  }, [theme, accent, customAccent, effect, density, fontScale, highContrast, reducedMotion]);

  function setTheme(t: Theme) { setThemeState(t); localStorage.setItem('theme', t); }
  function setAccent(a: AccentColor) {
    setAccentState(a);
    localStorage.setItem('accent', a);
    if (a !== 'custom') setCustomAccentState(null);
    if (a === 'custom' && !customAccent) return; // need a hex first
  }
  function setCustomAccent(hex: string | null) {
    const clean = hex && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toLowerCase() : null;
    setCustomAccentState(clean);
    if (clean) {
      localStorage.setItem('customAccent', clean);
      localStorage.setItem('accent', 'custom');
      setAccentState('custom');
    } else {
      localStorage.removeItem('customAccent');
      if (accent === 'custom') { localStorage.setItem('accent', 'blue'); setAccentState('blue'); }
    }
  }
  function setEffect(e: BorderEffect) { setEffectState(e); localStorage.setItem('effect', e); }
  function setDensity(d: Density) { setDensityState(d); localStorage.setItem('density', d); }
  function setFontScale(f: FontScale) { setFontScaleState(f); localStorage.setItem('fontScale', f); }
  function setHighContrast(on: boolean) { setHighContrastState(on); localStorage.setItem('highContrast', String(on)); }
  function setReducedMotion(on: boolean) { setReducedMotionState(on); localStorage.setItem('reducedMotion', String(on)); }

  return (
    <ThemeContext.Provider
      value={{
        theme, accent, customAccent, effect, density, fontScale, highContrast, reducedMotion,
        setTheme, setAccent, setCustomAccent, setEffect, setDensity, setFontScale, setHighContrast, setReducedMotion,
        resolvedMode,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

export { ACCENT_COLORS };
export type { Theme, AccentColor, BorderEffect, Density, FontScale, PresetAccent };
