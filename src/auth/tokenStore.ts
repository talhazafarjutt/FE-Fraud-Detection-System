import type { TokenResponse } from '@/api/schemas/auth';

/**
 * SECURITY — read before changing anything in this file.
 *
 * The access token lives in a module-scoped variable and nowhere else.
 * It is never written to localStorage or sessionStorage: both are readable by
 * any script that gets injected into the page, and this is a financial-crime
 * product for a government buyer. The cost of that decision is that a page
 * refresh logs the user out. That is the correct trade-off here.
 *
 * KNOWN, DELIBERATE GAP: the backend returns the refresh token in the JSON
 * response body, so a pure HttpOnly-cookie design is not available to the
 * frontend alone. The refresh token therefore sits in this same in-memory
 * store. The production hardening step is a BACKEND change: set the refresh
 * token as an `HttpOnly; Secure; SameSite=Strict` cookie and stop returning it
 * in the body. Until that lands, this is a prototype-level gap and it is
 * documented rather than papered over.
 */

export interface Session {
  accessToken: string;
  refreshToken: string;
  scopes: readonly string[];
  /** Epoch ms at which the access token expires. */
  expiresAt: number;
  /** `sub` claim — display only, never trusted for authorisation. */
  subject: string | null;
  /**
   * VERIFIED AGAINST THE RUNNING BACKEND (2026-09-04): the access token carries
   * only sub, typ, scopes, iss, aud, iat, nbf, exp, jti. There is no `email`,
   * `team` or `roles` claim, and no /v1/users/me endpoint to ask for them.
   * So `email` is what the user typed at sign-in, and `team` is discovered from
   * the alert rows the server chose to return (it filters by the caller's team).
   * Neither is decoded from the token, because the token does not carry them.
   */
  email: string | null;
  team: string | null;
}

type Listener = (session: Session | null) => void;

let session: Session | null = null;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener(session);
}

/** Read the `sub` claim for display. Never used to make an access decision. */
function decodeSubject(token: string): string | null {
  const parts = token.split('.');
  const payload = parts[1];
  if (parts.length !== 3 || !payload) return null;
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const claims = JSON.parse(json) as Record<string, unknown>;
    return typeof claims['sub'] === 'string' ? claims['sub'] : null;
  } catch {
    return null;
  }
}

/**
 * The backend authorises on scopes, not role names, and the token carries no
 * role claim — so the label in the header is derived from the scope set exactly
 * the way the seeded roles are defined. It is a display label only.
 */
export function roleLabel(scopes: readonly string[]): string {
  const has = (s: string) => scopes.includes(s);
  if (has('users:manage')) return 'Admin';
  if (has('alerts:close') || has('alerts:assign')) return 'Supervisor';
  if (has('alerts:read')) return 'Analyst';
  if (has('scores:write')) return 'ML service';
  if (has('transactions:write')) return 'Ingest client';
  return 'Signed in';
}

export const tokenStore = {
  get(): Session | null {
    return session;
  },

  getAccessToken(): string | null {
    return session?.accessToken ?? null;
  },

  getRefreshToken(): string | null {
    return session?.refreshToken ?? null;
  },

  /**
   * `email` is supplied by the sign-in form. On a token refresh it is omitted
   * and the previous value is carried forward — a refresh must not blank the
   * header.
   */
  set(token: TokenResponse, email?: string): Session {
    session = {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      scopes: token.scopes,
      expiresAt: Date.now() + token.expires_in * 1000,
      subject: decodeSubject(token.access_token),
      email: email ?? session?.email ?? null,
      team: session?.team ?? null,
    };
    notify();
    return session;
  },

  /**
   * Record the team observed on alert rows. The server scopes the list to the
   * caller's own team unless they hold alerts:read:all, so for a single-team
   * caller this is their team. Display only.
   */
  setObservedTeam(team: string | null): void {
    if (!session || session.team === team) return;
    session = { ...session, team };
    notify();
  },

  clear(): void {
    session = null;
    notify();
  },

  hasScope(scope: string): boolean {
    return session?.scopes.includes(scope) ?? false;
  },

  /** True once we are inside the proactive-refresh window (60s before expiry). */
  isExpiringWithin(ms: number): boolean {
    if (!session) return false;
    return session.expiresAt - Date.now() <= ms;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
