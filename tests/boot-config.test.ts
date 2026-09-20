import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Importing the API client must never throw, whatever the environment.
 *
 * THE FAILURE THIS PINS: the base URL was resolved at module scope and threw
 * when `VITE_API_BASE_URL` was absent. `.env` is gitignored, so on a CI runner
 * and on a fresh clone the variable IS absent — and the throw happened during
 * import, taking down every module that transitively pulled in the client. In
 * CI that was eight test files at once; in a browser it would have been a blank
 * page with one console line, from a build where somebody merely forgot a
 * setting.
 *
 * A misconfiguration has to be reported on screen, at the point a request is
 * attempted. It must not be able to prevent the application loading at all.
 */

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function importClientWith(value: string | undefined) {
  vi.resetModules();
  if (value === undefined) vi.stubEnv('VITE_API_BASE_URL', undefined as unknown as string);
  else vi.stubEnv('VITE_API_BASE_URL', value);
  return import('@/api/client');
}

describe('the client loads in any environment', () => {
  it('imports cleanly with the variable unset, and reports the problem', async () => {
    const client = await importClientWith(undefined);
    expect(client.API_BASE_PROBLEM).toMatch(/VITE_API_BASE_URL/);
    expect(client.API_BASE_LABEL).toBe('not configured');
    // No invented fallback, and above all never a production URL.
    expect(client.API_BASE_URL).toBe('');
  });

  it('imports cleanly with the variable empty, and reports no problem', async () => {
    const client = await importClientWith('');
    expect(client.API_BASE_PROBLEM).toBeNull();
    expect(client.API_BASE_URL).toBe('');
  });

  it('a request made by a misconfigured build fails with a legible reason', async () => {
    const client = await importClientWith(undefined);
    const { isConfigError } = await import('@/lib/problem');

    // Nothing is attempted, so this cannot be mistaken for an outage.
    const calls = vi.fn();
    vi.stubGlobal('fetch', calls);

    await expect(
      client.requestData(client.unsafeRoute('/v1/transactions')),
    ).rejects.toSatisfy(isConfigError);

    expect(calls, 'a misconfigured build should not reach the network').not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('the failure renders as its own state, distinct from an outage', async () => {
    const { ConfigError, describeFailure, NetworkError } = await import('@/lib/problem');

    expect(describeFailure(new ConfigError('VITE_API_BASE_URL is not set.')).kind).toBe('config');
    // Not conflated with a network error: retrying a config problem is useless.
    expect(describeFailure(new NetworkError('http://localhost:8000')).kind).toBe('network');
  });
});
