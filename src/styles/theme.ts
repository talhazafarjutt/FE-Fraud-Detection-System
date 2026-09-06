/**
 * Theme preference.
 *
 * SECURITY NOTE — this is the one place in the codebase that touches web
 * storage, and the exception is deliberate and narrow.
 *
 * The blanket ESLint ban on `localStorage`/`sessionStorage` exists to keep
 * tokens and session data out of storage that any injected script can read.
 * A colour-scheme preference is neither: it is a single enum with three legal
 * values, it carries no user data, and a hostile value cannot do anything worse
 * than fall back to "system" (`readStored` validates against the allow-list
 * before use). `tests/security-invariants.test.ts` pins the exception to this
 * file and asserts it stores nothing else.
 */

export const THEMES = ['light', 'dark', 'system'] as const;
export type ThemePreference = (typeof THEMES)[number];

const STORAGE_KEY = 'civitas.theme';

function isTheme(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

export function readStoredTheme(): ThemePreference {
  try {
    // eslint-disable-next-line no-restricted-syntax -- see the note above: a
    // colour-scheme enum, validated on read, never session data.
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isTheme(raw) ? raw : 'system';
  } catch {
    // Private mode, disabled storage, or a sandboxed iframe — not fatal.
    return 'system';
  }
}

export function storeTheme(preference: ThemePreference): void {
  try {
    // eslint-disable-next-line no-restricted-syntax -- see the note above.
    window.localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Preference simply will not persist. The UI still works.
  }
}

/**
 * "system" removes the attribute entirely rather than resolving it here, so the
 * `prefers-color-scheme` media query in theme.css stays in charge and the page
 * follows the OS live — including when the user changes it mid-session.
 */
export function applyTheme(preference: ThemePreference): void {
  const root = document.documentElement;

  // See the `.theme-switching` rule in theme.css: transitions must be off
  // across the swap or Chromium keeps painting the previous palette.
  root.classList.add('theme-switching');

  if (preference === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', preference);

  // Two frames: one for the attribute change to be applied, one for styles to
  // settle, before transitions are allowed back.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => root.classList.remove('theme-switching'));
  });
}

/** What the user will actually see, once the system preference is resolved. */
export function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference !== 'system') return preference;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
