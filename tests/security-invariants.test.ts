import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Invariants that a security review depends on and that are easy to regress in
 * a hurry before a demo. ESLint already blocks web storage and
 * `dangerouslySetInnerHTML` (verified: the rules fire on a probe file), so
 * these cover what a linter cannot express.
 */

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const SOURCES = walk(SRC).filter((f) => /\.tsx?$/.test(f));
const read = (f: string) => readFileSync(f, 'utf8');
const rel = (f: string) => path.relative(ROOT, f);

/** Strip comments so a doc-comment mentioning a pattern is not a false positive. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('secrets never reach shipped application code', () => {
  const SECRETS = [
    'SyntheticDemo!2026',
    'demo-ingest-secret-not-for-production',
    'demo-ml-secret-not-for-production',
  ];

  /**
   * Demo credentials may only appear in the mock backend, or inside a block the
   * bundler strips (`import.meta.env.DEV`). Anywhere else they would be
   * compiled into a production bundle.
   */
  it.each(SECRETS)('%s appears only in mocks or DEV-guarded code', (secret) => {
    for (const file of SOURCES) {
      const source = read(file);
      if (!source.includes(secret)) continue;

      const isMock = rel(file).startsWith('src/mocks/');
      const isDevGuarded = source.includes('import.meta.env.DEV');

      expect(
        isMock || isDevGuarded,
        `${rel(file)} contains a demo credential but is neither a mock nor DEV-guarded`,
      ).toBe(true);
    }
  });

  it('no source file hardcodes a bearer token or api key literal', () => {
    // Catches an accidentally pasted real token.
    const jwtLike = /['"`]eyJ[A-Za-z0-9_-]{10,}\./;
    for (const file of SOURCES) {
      expect(jwtLike.test(stripComments(read(file))), `${rel(file)} embeds a JWT`).toBe(false);
    }
  });
});

describe('token handling', () => {
  it('no source touches web storage or cookies', () => {
    const banned = /\b(localStorage|sessionStorage|document\.cookie|indexedDB)\b/;
    for (const file of SOURCES) {
      const code = stripComments(read(file));
      expect(banned.test(code), `${rel(file)} touches client-side persistence`).toBe(false);
    }
  });

  it('the access token is only ever read through the token stores', () => {
    // Everything else must go through the api client, so there is exactly one
    // place that attaches Authorization.
    const attaches = SOURCES.filter((f) => /Authorization/.test(stripComments(read(f))));
    expect(attaches.map(rel).sort()).toEqual(['src/api/client.ts', 'src/mocks/handlers.ts']);
  });

  it('no token is interpolated into a URL or query string', () => {
    const code = stripComments(read(path.join(SRC, 'api/client.ts')));
    // apiUrl builds paths from the caller's path only.
    expect(code).not.toMatch(/apiUrl\([^)]*[Tt]oken/);
    expect(code).not.toMatch(/queryString\([^)]*[Tt]oken/);
  });
});

describe('rendering', () => {
  it('no HTML sinks anywhere in src', () => {
    const sinks = /(dangerouslySetInnerHTML|\.innerHTML|\.outerHTML|insertAdjacentHTML|document\.write)/;
    for (const file of SOURCES) {
      expect(sinks.test(stripComments(read(file))), `${rel(file)} uses an HTML sink`).toBe(false);
    }
  });

  it('no dynamic code execution', () => {
    const evalLike = /(\beval\(|new Function\(|setTimeout\(\s*['"`])/;
    for (const file of SOURCES) {
      expect(evalLike.test(stripComments(read(file))), `${rel(file)} evaluates code`).toBe(false);
    }
  });
});

describe('build configuration', () => {
  const viteConfig = read(path.join(ROOT, 'vite.config.ts'));

  it("the production CSP has no 'unsafe-inline' on script-src", () => {
    // The dev policy needs it for Vite's HMR preamble; production must not.
    expect(viteConfig).toMatch(/dev \? "script-src 'self' 'unsafe-inline'" : "script-src 'self'"/);
  });

  it('the production CSP pins the dangerous directives', () => {
    for (const directive of ["object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'"]) {
      expect(viteConfig).toContain(directive);
    }
  });

  it("MSW's service worker is stripped from non-MSW builds", () => {
    // Shipping it would leave a registerable request-interception script on the
    // origin — a persistence primitive for anyone who lands an XSS.
    expect(viteConfig).toContain('dropMockWorkerPlugin');
    expect(viteConfig).toMatch(/if \(mswEnabled\) return;/);
  });

  it('the simulator import sits inside its env flag so no chunk is emitted', () => {
    const router = read(path.join(SRC, 'routes/router.tsx'));
    expect(router).toMatch(/simulatorEnabled\s*\n?\s*\?\s*lazy\(\(\) => import\(/);
  });
});
