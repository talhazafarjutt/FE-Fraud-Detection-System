import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every lazy route must actually resolve.
 *
 * THE BUG THIS EXISTS FOR: a route pointed at a module that did not exist. The
 * build passed — a dynamic `import()` is not checked against the filesystem by
 * the type checker — and the screen failed only at runtime, as
 * "Failed to fetch dynamically imported module … AuditLogPage.tsx". It looked
 * like a crashed feature; it was a dangling import.
 *
 * Importing every route module here turns that into a test failure, at the same
 * moment the rename happens, instead of a support ticket after a deploy.
 */

const ROOT = path.resolve(__dirname, '..');
const routerSource = readFileSync(path.join(ROOT, 'src/routes/router.tsx'), 'utf8');

/** Every `import('@/...')` specifier in the router, lazy or not. */
const SPECIFIERS = [...routerSource.matchAll(/import\(\s*'(@\/[^']+)'\s*\)/g)]
  .map((match) => match[1])
  .filter((value): value is string => Boolean(value));

describe('route modules', () => {
  it('the router declares a meaningful number of routes', () => {
    expect(SPECIFIERS.length).toBeGreaterThanOrEqual(14);
  });

  it.each(SPECIFIERS)('%s resolves and default-exports a component', async (specifier) => {
    const relative = specifier.replace(/^@\//, '');
    const module = (await import(/* @vite-ignore */ `../src/${relative}`)) as {
      default?: unknown;
    };
    expect(typeof module.default, `${specifier} has no default export`).toBe('function');
  });
});

describe('route table', () => {
  const paths = [...routerSource.matchAll(/path:\s*'([^']+)'/g)]
    .map((m) => m[1])
    .filter((v): v is string => Boolean(v));

  it('covers all nine sections plus the workflow view', () => {
    for (const expected of [
      'flow',
      'dashboard',
      'alerts',
      'transactions',
      'investigations',
      'cases',
      'network',
      'entities',
      'audit',
      'users',
    ]) {
      expect(paths, `${expected} is not routed`).toContain(expected);
    }
  });

  it('routes every detail screen its list links to', () => {
    for (const expected of ['alerts/:alertId', 'cases/:caseId', 'entities/:partyId']) {
      expect(paths).toContain(expected);
    }
  });

  it('guards audit on audit:read, not on alerts:read', () => {
    // An ANALYST holds alerts:read and gets 403 from /v1/audit-logs. Guarding
    // this route on the wrong scope is how the nav item came back for them.
    expect(routerSource).toMatch(/path: 'audit', element: guarded\('audit:read'/);
    expect(routerSource).toMatch(/path: 'entities', element: guarded\('entities:read'/);
  });

  it('wraps every lazy import so a stale chunk recovers instead of crashing', () => {
    // The simulator is the one deliberate exception: its import sits inside the
    // env-flag branch so no chunk is emitted at all when the flag is off.
    const wrapped = [...routerSource.matchAll(/lazyRoute\(\s*'[^']+',\s*\(\) => import\(\s*'(@\/[^']+)'/g)]
      .map((m) => m[1])
      .filter((v): v is string => Boolean(v));

    const unwrapped = SPECIFIERS.filter((s) => !wrapped.includes(s));
    expect(unwrapped).toEqual(['@/features/simulator/SimulatorPage']);

    // And the exception really is inside the flag branch, so the bundler emits
    // no chunk for it when the flag is off.
    expect(routerSource).toMatch(/simulatorEnabled\s*\n?\s*\?\s*lazy\(\(\) => import\(/);
  });
});
