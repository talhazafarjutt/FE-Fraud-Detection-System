import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { tokenResponseSchema } from '@/api/schemas/auth';
import { contractPageSchema } from '@/api/schemas/contracts';
import { AuthProvider } from '@/auth/AuthProvider';
import { tokenStore } from '@/auth/tokenStore';
import { ToastProvider } from '@/components/Toasts';
import ContractDetailPage from '@/features/contracts/ContractDetailPage';
import ContractsPage from '@/features/contracts/ContractsPage';

/**
 * Opens the Contracts screens in jsdom against the LIVE API, signed in as the
 * seeded analyst: the list must return rows and a contract's page must render
 * its terms, schedule and payments. Skipped unless LIVE_API is set; the
 * password comes from LIVE_ANALYST_PASSWORD, never from this file.
 */

const LIVE_API = process.env.LIVE_API;
const BASE =
  LIVE_API && LIVE_API !== '1' && LIVE_API !== 'true' ? LIVE_API.replace(/\/$/, '') : 'http://localhost:8000';

describe.skipIf(!LIVE_API)('Contracts screens against the live API', () => {
  const realFetch = globalThis.fetch;
  let token = '';

  beforeAll(async () => {
    const password = process.env.LIVE_ANALYST_PASSWORD;
    if (!password) throw new Error('Set LIVE_ANALYST_PASSWORD to run this suite.');
    const response = await realFetch(`${BASE}/v1/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'analyst@civitas.ai', password }),
    });
    if (!response.ok) throw new Error(`POST /v1/auth/token -> ${response.status}`);
    const issued = tokenResponseSchema.parse(await response.json());
    token = issued.access_token;
    tokenStore.set(issued, 'analyst@civitas.ai');
    // The console calls same-origin paths; send them to the live API.
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
      realFetch(new URL(String(input), BASE), init),
    );
  }, 30_000);

  afterAll(() => {
    vi.unstubAllGlobals();
    tokenStore.clear();
  });

  function renderAt(path: string) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={[path]}>
              <Routes>
                <Route path="/contracts" element={<ContractsPage />} />
                <Route path="/contracts/:contractId" element={<ContractDetailPage />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>,
    );
  }

  it('lists registered contracts', async () => {
    renderAt('/contracts');
    const table = await screen.findByRole('table', { name: 'Registered contracts' }, { timeout: 15_000 });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.length).toBeGreaterThan(0);
    expect(screen.getByText(/of \d+$/)).toBeInTheDocument();
  }, 30_000);

  it('opens a contract with payments: terms, schedule and payments', async () => {
    const response = await realFetch(`${BASE}/v1/islamic/contracts?limit=200`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const page = contractPageSchema.parse(await response.json());
    const withPayments = page.items.find((c) => c.payments_seen > 0 && c.tenor && c.first_due_date);
    expect(withPayments, 'a registered contract with a schedule and payments').toBeTruthy();
    const id = withPayments!.contract_id;

    renderAt(`/contracts/${encodeURIComponent(id)}`);
    expect(await screen.findByRole('heading', { name: id }, { timeout: 15_000 })).toBeInTheDocument();
    const terms = screen.getByRole('region', { name: 'Terms' });
    expect(within(terms).getByText(`•••• ${withPayments!.customer_iban_last4}`)).toBeInTheDocument();
    const schedule = screen.getByRole('table', { name: 'Schedule' });
    expect(within(schedule).getAllByRole('row').length).toBeGreaterThan(1);
    const payments = screen.getByRole('table', { name: 'Payments' });
    expect(within(payments).getAllByRole('row').length - 1).toBe(withPayments!.payments_seen);
  }, 30_000);
});
