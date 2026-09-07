import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import fs from 'node:fs';
import path from 'node:path';

// Vite 8 loads this config natively, where the CJS `__dirname` does not exist.
// `import.meta.dirname` is the supported replacement (Node 20.11+).
const rootDir = import.meta.dirname;

/**
 * CORS decision (see README): we use the Vite dev proxy (option 2 in the brief).
 * The browser only ever talks to the Vite origin, so the backend's empty
 * CORS_ORIGINS allowlist never comes into play and there is one less moving
 * part on stage.
 */

interface CspOptions {
  /** API origin to allow in connect-src when not proxying (production builds). */
  apiOrigin: string;
  /**
   * Dev only. Vite's HMR client injects an inline preamble script and
   * `style-src` receives injected style tags; `script-src 'self'` blocks the
   * preamble and the app never mounts. The production policy below has no such
   * allowance — do not copy the dev value into it.
   */
  dev: boolean;
}

function buildCsp({ apiOrigin, dev }: CspOptions): string {
  const connectSrc = ["'self'", apiOrigin, dev ? 'ws://localhost:5173' : ''].filter(Boolean);
  return [
    "default-src 'self'",
    `connect-src ${connectSrc.join(' ')}`,
    "img-src 'self' data:",
    "font-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    dev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
    /*
     * Vite 8's dev pipeline spawns a Worker from a blob: URL. `worker-src`
     * falls back to `script-src` when unset, so without this the browser blocks
     * it and logs a CSP violation on every page load. Dev only — the production
     * build creates no such worker and keeps `worker-src` inheriting the strict
     * `script-src 'self'`.
     */
    ...(dev ? ["worker-src 'self' blob:"] : []),
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * `frame-ancestors` is only honoured as a real header; in a <meta> tag browsers
 * ignore it AND log an error. We ship it in the headers and strip it from the
 * meta copy so the demo console stays clean.
 */
function metaCsp(policy: string): string {
  return policy
    .split('; ')
    .filter((directive) => !directive.startsWith('frame-ancestors'))
    .join('; ');
}

/**
 * Keep MSW's service worker out of any build that cannot use it.
 *
 * `msw init` puts `mockServiceWorker.js` in `public/`, and Vite copies `public/`
 * verbatim into `dist/`. The worker is never registered when `VITE_USE_MSW` is
 * off — `worker.start()` sits behind a dead branch — but shipping the file
 * still leaves a request-interception script at a predictable path on the
 * origin. Anyone who achieves script execution could register it and gain
 * persistent, origin-wide control of every request and response, surviving
 * reloads: it turns a transient XSS into durable MitM. It also advertises the
 * mocking layer to anyone who looks.
 *
 * Neither is acceptable in a build a government buyer deploys, so the file is
 * removed unless the build is explicitly an MSW build.
 */
function dropMockWorkerPlugin(mswEnabled: boolean): Plugin {
  return {
    name: 'civitas-drop-mock-worker',
    apply: 'build',
    // publicDir is copied outside the rollup graph, so this has to run after
    // the whole build rather than in generateBundle.
    closeBundle() {
      if (mswEnabled) return;
      const target = path.resolve(rootDir, 'dist/mockServiceWorker.js');
      if (fs.existsSync(target)) {
        fs.rmSync(target);
        this.warn('Removed mockServiceWorker.js from the production build.');
      }
    },
  };
}

/**
 * Injects the policy into the `<!--CSP-->` placeholder in index.html. Keeping it
 * out of the static file is what lets dev and production differ without anyone
 * hand-editing a security header before a build.
 */
function cspPlugin(policy: string): Plugin {
  return {
    name: 'civitas-csp',
    transformIndexHtml(html) {
      return html.replace(
        '<!--CSP-->',
        `<meta http-equiv="Content-Security-Policy" content="${policy}" />`,
      );
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiTarget = env['VITE_API_PROXY_TARGET'] ?? 'http://localhost:8000';
  const apiOrigin = env['VITE_API_BASE_URL'] ?? '';
  const isDev = command === 'serve';
  const mswEnabled = env['VITE_USE_MSW'] === 'true';

  const devCsp = buildCsp({ apiOrigin, dev: true });
  const prodCsp = buildCsp({ apiOrigin, dev: false });

  // frame-ancestors is ignored when delivered via <meta>, so it only takes
  // effect through these headers. Whatever serves dist/ in production must send
  // the same three headers.
  const headersFor = (policy: string) => ({
    'Content-Security-Policy': policy,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });

  const proxy = {
    '/v1': { target: apiTarget, changeOrigin: true },
    '/healthz': { target: apiTarget, changeOrigin: true },
    '/readyz': { target: apiTarget, changeOrigin: true },
  };

  return {
    plugins: [
      react(),
      cspPlugin(metaCsp(isDev ? devCsp : prodCsp)),
      dropMockWorkerPlugin(mswEnabled),
      process.env['ANALYZE'] === 'true' &&
        visualizer({ filename: 'dist/bundle-stats.html', gzipSize: true, brotliSize: true }),
    ].filter(Boolean),
    resolve: { alias: { '@': path.resolve(rootDir, './src') } },
    server: { port: 5173, strictPort: true, proxy, headers: headersFor(devCsp) },
    // `preview` serves the real build, so it gets the real policy. Use
    // `npm run build && npm run preview` to verify the strict CSP before a demo.
    preview: { port: 4173, strictPort: true, proxy, headers: headersFor(prodCsp) },
    build: {
      target: 'es2022',
      sourcemap: false,
      rollupOptions: {
        output: {
          /*
           * Rolldown (Vite 8) accepts only the function form of manualChunks;
           * the object form was a Rollup-ism. Matching is on an exact package
           * directory — `node_modules/react/` must not also swallow
           * `react-router` or `@tanstack/react-query`.
           */
          manualChunks(id: string) {
            const path = id.replace(/\\/g, '/');
            if (!path.includes('/node_modules/')) return;
            const pkg = /\/node_modules\/(@[^/]+\/[^/]+|[^/]+)\//.exec(path)?.[1];
            if (!pkg) return;
            if (['react', 'react-dom', 'scheduler'].includes(pkg)) return 'react';
            if (['react-router', 'react-router-dom'].includes(pkg)) return 'react';
            if (pkg === '@tanstack/react-query') return 'query';
            return;
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./tests/setup.ts'],
      css: false,
    },
  };
});
