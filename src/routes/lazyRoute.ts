import { lazy, type ComponentType } from 'react';

/**
 * `React.lazy` with one recovery attempt for a chunk that cannot be fetched.
 *
 * THE FAILURE THIS FIXES — observed as:
 *   "Failed to fetch dynamically imported module … AuditLogPage.tsx"
 *
 * Route chunks are content-hashed, so a deploy changes their filenames. A
 * browser that had the console open across a deploy still holds the previous
 * `index.html` and asks for chunk names the server no longer has. The import
 * rejects, the error boundary catches it, and a page that is perfectly fine in
 * the new build looks broken — which is exactly how a stub route ends up
 * reported as a crash.
 *
 * On failure we reload once, which pulls the current `index.html` and its
 * current chunk names. A sessionStorage key makes it once and only once: if the
 * reload does not fix it the failure is real, and the error boundary should show
 * it rather than the page reloading forever.
 */

const RELOAD_KEY = 'civitas.chunk-reload';

function alreadyReloadedFor(name: string): boolean {
  try {
    // eslint-disable-next-line no-restricted-syntax -- not session data: a
    // single short-lived marker preventing an infinite reload loop. It holds a
    // route name, never anything about the user.
    return window.sessionStorage.getItem(RELOAD_KEY) === name;
  } catch {
    // Storage unavailable (private mode, sandboxed frame). Without a marker we
    // cannot guarantee a single reload, so do not reload at all — a visible
    // error beats a loop.
    return true;
  }
}

function markReloadFor(name: string): void {
  try {
    // eslint-disable-next-line no-restricted-syntax -- see the note above.
    window.sessionStorage.setItem(RELOAD_KEY, name);
  } catch {
    /* nothing to do */
  }
}

export function clearChunkReloadMarker(): void {
  try {
    // eslint-disable-next-line no-restricted-syntax -- see the note above.
    window.sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    /* nothing to do */
  }
}

/*
 * React.lazy's own signature is ComponentType<any>. Narrowing the parameter
 * here would reject every page component that takes props, so the looseness is
 * inherited rather than introduced.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyRoute<T extends ComponentType<any>>(
  name: string,
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      const mod = await factory();
      // Loaded cleanly — drop any marker so a genuine failure later can still
      // use its one reload.
      clearChunkReloadMarker();
      return mod;
    } catch (error) {
      if (alreadyReloadedFor(name)) throw error;
      markReloadFor(name);
      window.location.reload();
      // Never resolves; the reload takes over. Returning here would render a
      // half-built tree in the moments before navigation.
      return new Promise<{ default: T }>(() => {});
    }
  });
}
