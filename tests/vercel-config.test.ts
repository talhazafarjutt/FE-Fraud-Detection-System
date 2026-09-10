import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Pins the fix for a real production bug: Vercel serves the build as static
 * files, so any client-routed path without a matching physical file — `/login`,
 * `/dashboard`, `/alerts/{id}` — returned Vercel's own 404 before `index.html`,
 * and therefore React Router, ever loaded. Confirmed on the live deployment
 * before `vercel.json` existed: `content-type: text/plain`, `server: Vercel`.
 *
 * The same file also closes a header gap: the live deployment was sending none
 * of the three production security headers the README requires, because the
 * `<meta>` CSP only covers what a browser enforces in-page — it was never told
 * to send real HTTP headers.
 */

const ROOT = path.resolve(__dirname, '..');
const config = JSON.parse(readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));

describe('vercel.json — SPA rewrite', () => {
  it('rewrites every path to index.html so client-side routes are reachable', () => {
    const rewrites = config.rewrites ?? [];
    const catchAll = rewrites.find((r: { source: string }) => r.source === '/(.*)');
    expect(catchAll?.destination).toBe('/index.html');
  });
});

describe('vercel.json — production security headers', () => {
  const rule = (config.headers ?? []).find((h: { source: string }) => h.source === '/(.*)');
  const byKey = Object.fromEntries(
    (rule?.headers ?? []).map((h: { key: string; value: string }) => [h.key, h.value]),
  );

  it('sends nosniff and no-referrer', () => {
    expect(byKey['X-Content-Type-Options']).toBe('nosniff');
    expect(byKey['Referrer-Policy']).toBe('no-referrer');
  });

  it('sends a CSP with frame-ancestors none — the one directive a <meta> tag cannot carry', () => {
    const csp: string = byKey['Content-Security-Policy'] ?? '';
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("script-src 'self'");
    // The dev-only inline allowance must never leak into the header CSP.
    expect(csp).not.toContain('unsafe-inline\' \'unsafe-inline');
    expect(csp.includes("script-src 'self' 'unsafe-inline'")).toBe(false);
  });

  it('pins connect-src to the live API origin, so a drift is caught rather than silently deployed', () => {
    // If VITE_API_BASE_URL ever changes on Vercel, this value must be updated
    // alongside it — see the README section on deploying to Vercel.
    const csp: string = byKey['Content-Security-Policy'] ?? '';
    expect(csp).toContain('https://fraud-detection-system-fmh3.onrender.com');
  });
});
