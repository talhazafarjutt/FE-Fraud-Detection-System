import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  THEMES,
  type ThemePreference,
  applyTheme,
  readStoredTheme,
  resolveTheme,
  storeTheme,
} from '@/styles/theme';
import { cx } from './primitives';

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: 'light' | 'dark';
  setPreference: (next: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readStoredTheme());
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => resolveTheme(preference));

  // Apply on mount and on every change.
  useEffect(() => {
    applyTheme(preference);
    setResolved(resolveTheme(preference));
  }, [preference]);

  // Follow the OS live while on "system" — the CSS media query already handles
  // the colours; this keeps the label in the toggle honest.
  useEffect(() => {
    if (preference !== 'system' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setResolved(query.matches ? 'dark' : 'light');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    storeTheme(next);
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider.');
  return context;
}

const LABEL: Record<ThemePreference, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'Auto',
};

/**
 * Three-state segmented control, styled as one more mono-uppercase tag so it
 * belongs to the header rather than announcing itself. Sharp corners, 1px rule,
 * no shadow — same rules as everything else.
 */
export function ThemeToggle() {
  const { preference, resolved, setPreference } = useTheme();

  return (
    <div
      className="flex border border-rule"
      role="group"
      aria-label={`Colour scheme, currently ${resolved}`}
    >
      {THEMES.map((option) => {
        const active = preference === option;
        return (
          <button
            key={option}
            type="button"
            onClick={() => setPreference(option)}
            aria-pressed={active}
            title={
              option === 'system'
                ? `Follow the operating system (currently ${resolved})`
                : `Always ${option}`
            }
            className={cx(
              'px-3 py-2 font-mono text-[11px] uppercase leading-none tracking-tag transition-colors',
              active ? 'bg-ultra text-on-ultra' : 'bg-paper text-ink-3 hover:text-ink',
            )}
          >
            {LABEL[option]}
          </button>
        );
      })}
    </div>
  );
}
