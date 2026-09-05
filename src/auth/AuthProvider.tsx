import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { cancelProactiveRefresh, setSessionLostHandler } from '@/api/client';
import * as authApi from '@/api/endpoints/auth';
import type { LoginInput } from '@/api/schemas/auth';
import { type Session, tokenStore } from './tokenStore';

interface AuthContextValue {
  session: Session | null;
  isAuthenticated: boolean;
  scopes: readonly string[];
  hasScope: (scope: string) => boolean;
  hasAnyScope: (...scopes: string[]) => boolean;
  signIn: (input: LoginInput) => Promise<Session>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => tokenStore.get());
  const queryClient = useQueryClient();

  useEffect(() => tokenStore.subscribe(setSession), []);

  const clearEverything = useCallback(() => {
    cancelProactiveRefresh();
    tokenStore.clear();
    // Logout kills every refresh family for this user server-side, so any
    // cached response is both stale and no longer ours to hold.
    queryClient.clear();
  }, [queryClient]);

  // A refresh that fails server-side must land the user back on /login rather
  // than leaving the UI in a half-authenticated state.
  useEffect(() => {
    setSessionLostHandler(clearEverything);
    return () => setSessionLostHandler(null);
  }, [clearEverything]);

  const signIn = useCallback(
    async (input: LoginInput) => {
      await authApi.login(input);
      const next = tokenStore.get();
      if (!next) throw new Error('Sign-in did not produce a session.');
      return next;
    },
    [],
  );

  const signOut = useCallback(async () => {
    try {
      if (tokenStore.getAccessToken()) await authApi.logout();
    } catch {
      // A failed logout still means we drop local state — the token is useless
      // to us either way and holding it is strictly worse.
    } finally {
      clearEverything();
    }
  }, [clearEverything]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isAuthenticated: session !== null,
      scopes: session?.scopes ?? [],
      hasScope: (scope) => session?.scopes.includes(scope) ?? false,
      hasAnyScope: (...scopes) => scopes.some((s) => session?.scopes.includes(s) ?? false),
      signIn,
      signOut,
    }),
    [session, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}

/** Scope checks here are UX only. The server remains the authority. */
export function useScopes() {
  const { scopes, hasScope, hasAnyScope } = useAuth();
  return { scopes, hasScope, hasAnyScope };
}
