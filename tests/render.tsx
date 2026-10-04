import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DirectoryUser } from '@/api/schemas/users';
import { AuthProvider } from '@/auth/AuthProvider';
import { tokenStore } from '@/auth/tokenStore';
import { ToastProvider } from '@/components/Toasts';
import { directoryKey } from '@/features/users/directory';

/**
 * Render inside the providers the app gives a page: a session holding
 * `scopes`, a query client and toasts. The people directory is pre-filled, so
 * no request is made for it; pass `directory: null` to leave it unfetched.
 */
export function renderWithProviders(
  ui: ReactElement,
  {
    scopes = ['alerts:read'],
    directory = [],
  }: { scopes?: string[]; directory?: DirectoryUser[] | null } = {},
) {
  tokenStore.set({
    access_token: 'header.payload.signature',
    refresh_token: 'refresh-test',
    token_type: 'bearer',
    expires_in: 900,
    scopes,
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  if (directory) client.setQueryData(directoryKey, directory);
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>{ui}</ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}
