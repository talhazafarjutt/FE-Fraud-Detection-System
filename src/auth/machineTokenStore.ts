import type { TokenResponse } from '@/api/schemas/auth';

/**
 * A SECOND, deliberately separate in-memory store for machine tokens.
 *
 * Why this exists: `transactions:write` is held only by the INGEST_CLIENT
 * machine client. No human role has it — verified against the running backend,
 * where both analyst@ and supervisor@ get 403 with
 * `required_scopes: ["transactions:write"]` on POST /v1/transactions. So a
 * transaction cannot be submitted from a human session at all.
 *
 * The rule this respects: machine credentials never touch the human login flow
 * and are never mixed into the human session. They are typed by hand on a
 * clearly-labelled panel, held here, and never compiled into the bundle or
 * committed to .env.
 *
 * Machine tokens carry `refresh_token: ""` — machines re-authenticate rather
 * than refresh — so there is no refresh path here on purpose.
 */

export interface MachineSession {
  accessToken: string;
  scopes: readonly string[];
  expiresAt: number;
  clientId: string;
}

type Listener = (session: MachineSession | null) => void;

let session: MachineSession | null = null;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener(session);
}

export const machineTokenStore = {
  get(): MachineSession | null {
    return session;
  },

  getAccessToken(): string | null {
    if (!session) return null;
    // Expired machine tokens are dropped rather than sent — the server would
    // 401 and there is no refresh family to fall back on.
    if (session.expiresAt <= Date.now()) {
      session = null;
      notify();
      return null;
    }
    return session.accessToken;
  },

  set(token: TokenResponse, clientId: string): MachineSession {
    session = {
      accessToken: token.access_token,
      scopes: token.scopes,
      expiresAt: Date.now() + token.expires_in * 1000,
      clientId,
    };
    notify();
    return session;
  },

  clear(): void {
    session = null;
    notify();
  },

  hasScope(scope: string): boolean {
    return session?.scopes.includes(scope) ?? false;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
