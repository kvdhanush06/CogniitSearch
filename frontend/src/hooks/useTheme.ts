import { useEffect, useCallback } from 'react';
import { useUIStore } from '../store/index.js';

const THEME_STORAGE_KEY = 'cogniit.theme';
type Theme = 'light' | 'dark';

function readInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // ignore — localStorage may be unavailable (private mode, etc.)
  }
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

/**
 * Bridges the Zustand `useUIStore.theme` to the `dark` class on <html>.
 * Persists to localStorage. Also exposes a toggle/set helper that updates
 * the store; the DOM sync happens in a single effect.
 */
export function useTheme() {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  // Apply the theme class to <html> on every change.
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme };
}

/**
 * Call this once at module top-level (before React mounts) to apply the
 * stored theme synchronously, preventing a light-mode flash on reload.
 */
export function applyInitialTheme(): void {
  if (typeof window === 'undefined') return;
  const theme = readInitialTheme();
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}
