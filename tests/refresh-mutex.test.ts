import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRefreshState, request } from '@/api/client';
import { tokenStore } from '@/auth/tokenStore';

/**
 * The backend implements refresh-token REUSE DETECTION: presenting the same
 * refresh token twice revokes the whole family and forces a re-login. So when
 * several requests 401 at once they must all await ONE shared refresh, not
 * start their own.
 *
 * The brief calls this the single most likely bug in the frontend. These tests
 * pin the behaviour.
 */

function tokenPayload(scopes: string[] = ['alerts:read']) {
  const claims = { sub: 'user-1', scopes };
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode({ alg: 'HS256' })}.${encode(claims)}.signature`;
}

function seedSession(expiresIn = 900) {
  tokenStore.set({
    access_token: tokenPayload(),
    refresh_token: 'refresh-1',
    token_type: 'bearer',
    expires_in: expiresIn,
    scopes: ['alerts:read'],
  });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function problemResponse(status: number, detail: string) {
  return new Response(
    JSON.stringify({ type: 'about:blank', title: 'Error', status, detail, instance: '/x' }),
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );
}

describe('refresh mutex', () => {
  beforeEach(() => {
    __resetRefreshState();
    tokenStore.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetRefreshState();
    tokenStore.clear();
  });

  it('collapses concurrent 401s into exactly one refresh call', async () => {
    seedSession();

    let refreshCalls = 0;
    let releaseRefresh: (() => void) | undefined;
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/v1/auth/refresh')) {
        refreshCalls += 1;
        // Hold the refresh open so all three requests are definitely in flight
        // at the same time — this is the race the mutex has to survive.
        await refreshGate;
        return jsonResponse({
          access_token: tokenPayload(),
          refresh_token: 'refresh-2',
          token_type: 'bearer',
          expires_in: 900,
          scopes: ['alerts:read'],
        });
      }

      // Every protected call 401s until the refresh has completed.
      if (refreshCalls === 0 || releaseRefresh !== undefined) {
        return problemResponse(401, 'Token expired.');
      }
      return jsonResponse({ ok: true });
    });

    vi.stubGlobal('fetch', fetchMock);

    const pending = [
      request('/v1/fraud-alerts'),
      request('/v1/fraud-alerts/abc'),
      request('/v1/transactions/xyz'),
    ];

    // Let all three reach their 401 and queue on the shared refresh.
    await vi.waitFor(() => expect(refreshCalls).toBe(1));

    releaseRefresh?.();
    releaseRefresh = undefined;

    await Promise.allSettled(pending);

    expect(refreshCalls).toBe(1);
  });

  it('retries a request at most once after a refresh', async () => {
    seedSession();

    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('/v1/auth/refresh')) {
        return jsonResponse({
          access_token: tokenPayload(),
          refresh_token: 'refresh-2',
          token_type: 'bearer',
          expires_in: 900,
          scopes: ['alerts:read'],
        });
      }
      // Persistent 401 — the client must not loop.
      return problemResponse(401, 'Token expired.');
    });

    vi.stubGlobal('fetch', fetchMock);

    await expect(request('/v1/fraud-alerts')).rejects.toMatchObject({ status: 401 });

    const alertCalls = calls.filter((url) => url.includes('/v1/fraud-alerts'));
    const refreshCalls = calls.filter((url) => url.includes('/v1/auth/refresh'));

    expect(alertCalls).toHaveLength(2); // original + one retry, never more
    expect(refreshCalls).toHaveLength(1);
  });

  it('clears the session when the refresh itself is rejected', async () => {
    seedSession();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/auth/refresh')) {
          // Reuse detection fired: the family is gone.
          return problemResponse(401, 'Refresh token reuse detected.');
        }
        return problemResponse(401, 'Token expired.');
      }),
    );

    await expect(request('/v1/fraud-alerts')).rejects.toBeDefined();
    expect(tokenStore.get()).toBeNull();
  });

  it('does not refresh for a request that carries a machine bearer override', async () => {
    seedSession();

    let refreshCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/auth/refresh')) {
          refreshCalls += 1;
          return jsonResponse({});
        }
        return problemResponse(401, 'Token expired.');
      }),
    );

    await expect(
      request('/v1/transactions', { method: 'POST', bearerOverride: 'machine-token' }),
    ).rejects.toMatchObject({ status: 401 });

    // Machine tokens have no refresh family — refreshing would be meaningless.
    expect(refreshCalls).toBe(0);
  });
});
