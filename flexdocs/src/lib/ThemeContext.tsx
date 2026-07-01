'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';
type AccentColor = 'blue' | 'purple' | 'teal' | 'green' | 'orange' | 'red' | 'pink' | 'indigo';

interface ThemeContextType {
  theme: Theme;
  accent: AccentColor;
  setTheme: (theme: Theme) => void;
  setAccent: (accent: AccentColor) => void;
  resolvedMode: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const ACCENT_COLORS: Record<AccentColor, { light: string; dark: string; ring: string; bg: string; text: string }> = {
  blue:   { light: '#2563eb', dark: '#60a5fa', ring: 'ring-blue-500',   bg: 'bg-blue-600',   text: 'text-blue-600' },
  purple: { light: '#9333ea', dark: '#c084fc', ring: 'ring-purple-500', bg: 'bg-purple-600', text: 'text-purple-600' },
  teal:   { light: '#0d9488', dark: '#2dd4bf', ring: 'ring-teal-500',   bg: 'bg-teal-600',   text: 'text-teal-600' },
  green:  { light: '#16a34a', dark: '#4ade80', ring: 'ring-green-500',  bg: 'bg-green-600',  text: 'text-green-600' },
  orange: { light: '#ea580c', dark: '#fb923c', ring: 'ring-orange-500', bg: 'bg-orange-600', text: 'text-orange-600' },
  red:    { light: '#dc2626', dark: '#f87171', ring: 'ring-red-500',    bg: 'bg-red-600',    text: 'text-red-600' },
  pink:   { light: '#db2777', dark: '#f472b6', ring: 'ring-pink-500',   bg: 'bg-pink-600',   text: 'text-pink-600' },
  indigo: { light: '#4f46e5', dark: '#818cf8', ring: 'ring-indigo-500', bg: 'bg-indigo-600', text: 'text-indigo-600' },
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [accent, setAccentState] = useState<AccentColor>('blue');
  const [resolvedMode, setResolvedMode] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as Theme | null;
    const savedAccent = localStorage.getItem('accent') as AccentColor | null;
    if (savedTheme) setThemeState(savedTheme);
    if (savedAccent) setAccentState(savedAccent);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');

    function resolve() {
      const mode = theme === 'system' ? (mq.matches ? 'dark' : 'light') : theme;
      setResolvedMode(mode);
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.classList.add(mode);

      const colors = ACCENT_COLORS[accent];
      const accentVal = mode === 'dark' ? colors.dark : colors.light;
      document.documentElement.style.setProperty('--accent', accentVal);
    }

    resolve();
    mq.addEventListener('change', resolve);
    return () => mq.removeEventListener('change', resolve);
  }, [theme, accent]);

  function setTheme(t: Theme) {
    setThemeState(t);
    localStorage.setItem('theme', t);
  }

  function setAccent(a: AccentColor) {
    setAccentState(a);
    localStorage.setItem('accent', a);
  }

  return (
    <ThemeContext.Provider value={{ theme, accent, setTheme, setAccent, resolvedMode }}>
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
export type { Theme, AccentColor };
