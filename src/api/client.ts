import { z } from 'zod';
import { tokenStore } from '@/auth/tokenStore';
import { ApiError, NetworkError, SchemaError, parseProblem } from '@/lib/problem';
import { tokenResponseSchema } from './schemas/auth';
import type { ApiRoute } from './route';

export { queryString, route, unsafeRoute } from './route';
export type { ApiRoute } from './route';

/**
 * Where requests go — resolved once, printed in the header.
 *
 * Three cases, and they are deliberately not the same:
 *   - UNSET        → throw at boot. A console that silently invents a backend
 *                    is how a demo ends up pointed at the wrong environment.
 *                    Never fall back to a production URL.
 *   - EMPTY STRING → same-origin. Requests go to `/v1/...` on whatever host is
 *                    serving the app, which the Vite dev proxy (and the hosting
 *                    rewrite) forwards to the API. This is an explicit choice
 *                    made in `.env`, not a missing value, and it means the
 *                    browser never performs a cross-origin preflight.
 *   - A URL        → used as-is.
 */
function resolveBaseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (raw === undefined) {
    throw new Error(
      'VITE_API_BASE_URL is not set. Copy .env.example to .env. Leave it empty to use the ' +
        'dev proxy, or point it at your API (http://localhost:8000 for a local backend).',
    );
  }
  return raw.trim().replace(/\/$/, '');
}

export const API_BASE_URL = resolveBaseUrl();

/** What to show a human. An empty base URL is same-origin, not "nowhere". */
export const API_BASE_LABEL =
  API_BASE_URL === ''
    ? `${typeof window === 'undefined' ? 'this origin' : window.location.origin} (proxied)`
    : API_BASE_URL;

const BASE_URL = API_BASE_URL;

/** Refresh this long before the access token actually expires. */
const PROACTIVE_REFRESH_MS = 60_000;

export function apiUrl(path: string): string {
  return `${BASE_URL}${path}`;
}

/**
 * `fetch` rejects — with no status and no body — for CORS, DNS, offline and a
 * dead server alike. That rejection used to surface as "UNREACHABLE" while the
 * API was perfectly healthy and the real problem was a preflight. Wrapping it
 * here keeps "the server said no" and "we never reached the server" as two
 * different things all the way up to the UI.
 */
async function fetchOrNetworkError(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new NetworkError(API_BASE_LABEL, cause);
  }
}

/* ------------------------------------------------------------------ *
 * Refresh mutex
 *
 * The backend implements refresh-token REUSE DETECTION: presenting the same
 * refresh token twice revokes the entire token family and forces a re-login.
 * So two concurrent 401s must NOT each start their own refresh. All callers
 * await one shared in-flight promise. This is the single most likely bug in
 * this frontend; tests/refresh-mutex.test.ts pins the behaviour.
 * ------------------------------------------------------------------ */

let inFlightRefresh: Promise<string> | null = null;
let onSessionLost: (() => void) | null = null;

export function setSessionLostHandler(handler: (() => void) | null): void {
  onSessionLost = handler;
}

async function performRefresh(): Promise<string> {
  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) throw new Error('No refresh token available.');

  const response = await fetchOrNetworkError(apiUrl('/v1/auth/refresh'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!response.ok) {
    // A failed refresh means the family is gone. Nothing to salvage.
    tokenStore.clear();
    onSessionLost?.();
    throw new ApiError(await parseProblem(response));
  }

  const parsed = tokenResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    tokenStore.clear();
    onSessionLost?.();
    throw new SchemaError('/v1/auth/refresh', parsed.error.issues.map((i) => i.message).join('; '));
  }

  tokenStore.set(parsed.data);
  scheduleProactiveRefresh();
  return parsed.data.access_token;
}

/** Every concurrent caller gets the same promise. */
export function refreshAccessToken(): Promise<string> {
  if (!inFlightRefresh) {
    inFlightRefresh = performRefresh().finally(() => {
      inFlightRefresh = null;
    });
  }
  return inFlightRefresh;
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleProactiveRefresh(): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  const session = tokenStore.get();
  if (!session) return;
  const delay = Math.max(1_000, session.expiresAt - Date.now() - PROACTIVE_REFRESH_MS);
  refreshTimer = setTimeout(() => {
    // A failure here is not fatal: the reactive 401 path will try again.
    void refreshAccessToken().catch(() => undefined);
  }, delay);
}

export function cancelProactiveRefresh(): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
}

/** Test-only: drop any in-flight refresh so cases do not leak into each other. */
export function __resetRefreshState(): void {
  inFlightRefresh = null;
  cancelProactiveRefresh();
}

/* ------------------------------------------------------------------ *
 * Request
 * ------------------------------------------------------------------ */

export interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Output type is T; input is unknown because it comes off the wire. */
  schema?: z.ZodType<T, z.ZodTypeDef, unknown>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Skip the Authorization header (login, refresh, health). */
  anonymous?: boolean;
  /**
   * Send this bearer token instead of the human session's. Used only by the
   * ingest path, where `transactions:write` is held by a machine client and no
   * human role has it. A request made with an override never triggers the
   * human refresh flow — machine tokens have no refresh family.
   */
  bearerOverride?: string;
  /** Expose selected response headers to the caller (e.g. Idempotent-Replay). */
  wantHeaders?: readonly string[];
}

export interface ApiResult<T> {
  data: T;
  status: number;
  headers: Record<string, string>;
}

async function send(path: ApiRoute, options: RequestOptions<unknown>, token: string | null) {
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token && !options.anonymous) headers['Authorization'] = `Bearer ${token}`;
  // No token ever goes into a URL, a query string or a log line.

  return fetchOrNetworkError(apiUrl(path), {
    method: options.method ?? 'GET',
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

/**
 * One request, at most one refresh, at most one retry. Never more — a retry
 * loop against a 401 is how you lock an account out mid-demo.
 */
export async function request<T>(
  path: ApiRoute,
  options: RequestOptions<T> = {},
): Promise<ApiResult<T>> {
  const override = options.bearerOverride;

  // If we are already inside the expiry window, refresh before spending the
  // request rather than paying for a guaranteed 401 first.
  if (
    !override &&
    !options.anonymous &&
    tokenStore.get() &&
    tokenStore.isExpiringWithin(PROACTIVE_REFRESH_MS)
  ) {
    await refreshAccessToken().catch(() => undefined);
  }

  let response = await send(path, options, override ?? tokenStore.getAccessToken());

  if (
    response.status === 401 &&
    !override &&
    !options.anonymous &&
    tokenStore.getRefreshToken()
  ) {
    const refreshed = await refreshAccessToken();
    response = await send(path, options, refreshed);
  }

  if (!response.ok) {
    throw new ApiError(await parseProblem(response));
  }

  const collected: Record<string, string> = {};
  for (const name of options.wantHeaders ?? []) {
    const value = response.headers.get(name);
    if (value !== null) collected[name] = value;
  }

  if (response.status === 204) {
    return { data: undefined as T, status: response.status, headers: collected };
  }

  const text = await response.text();
  const payload: unknown = text ? JSON.parse(text) : null;

  if (!options.schema) {
    return { data: payload as T, status: response.status, headers: collected };
  }

  const parsed = options.schema.safeParse(payload);
  if (!parsed.success) {
    throw new SchemaError(path, parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; '));
  }

  return { data: parsed.data, status: response.status, headers: collected };
}

/** Convenience wrapper for the common case where only the body matters. */
export async function requestData<T>(
  path: ApiRoute,
  options: RequestOptions<T> = {},
): Promise<T> {
  const result = await request<T>(path, options);
  return result.data;
}
