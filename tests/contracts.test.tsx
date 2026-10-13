import { type ReactElement, useEffect, useState } from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  contractDetailSchema,
  contractPageSchema,
  contractSchema,
} from '@/api/schemas/contracts';
import { layerFindingsSchema } from '@/api/schemas/layers';
import { metaSchema } from '@/api/schemas/meta';
import { AppShell } from '@/components/AppShell';
import { ThemeProvider } from '@/components/ThemeToggle';
import ContractDetailPage from '@/features/contracts/ContractDetailPage';
import ContractsPage from '@/features/contracts/ContractsPage';
import { LayerFindings } from '@/features/layers/LayerFindings';
import { metaKey } from '@/features/layers/useMeta';
import {
  ContractLookup,
  NOT_REGISTERED_TEXT,
  registeredText,
} from '@/features/transactions/ContractLookup';
import { CONTRACT_FIXTURES, PAYMENT_FIXTURES, contractDetail, contractListItem } from '@/mocks/contracts';
import { handlers } from '@/mocks/handlers';
import { WIRE_META_OFF, WIRE_META_ON } from './islamic-wire';
import { renderWithProviders } from './render';

const META_ON = metaSchema.parse(WIRE_META_ON);
const META_OFF = metaSchema.parse(WIRE_META_OFF);
const ON: Array<[readonly unknown[], unknown]> = [[metaKey, META_ON]];
const OFF: Array<[readonly unknown[], unknown]> = [[metaKey, META_OFF]];

const SETTLEMENT = CONTRACT_FIXTURES.find((c) => c.contract_id === 'MRB-2026-0187')!;
const REPAYMENT = CONTRACT_FIXTURES.find((c) => c.contract_id === 'MRB-2026-0412')!;
const RENTAL = CONTRACT_FIXTURES.find((c) => c.contract_id === 'IJR-2025-0093')!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status < 400 ? 'application/json' : 'application/problem+json' },
  });
}

/** Serves `routes` by path (a function sees the full URL); 404s the rest. Returns every URL asked for. */
function stubApi(routes: Record<string, unknown | ((url: URL) => Response)>) {
  const requested: URL[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://console.test');
      requested.push(url);
      const route = routes[url.pathname];
      if (typeof route === 'function') return (route as (u: URL) => Response)(url);
      if (route !== undefined) return json(route);
      return json({ title: 'Not found', status: 404, detail: 'Not found.' }, 404);
    }),
  );
  return requested;
}

function renderAt(path: string, ui: ReactElement, pattern: string, seed = ON, scopes = ['alerts:read']) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={pattern} element={ui} />
      </Routes>
    </MemoryRouter>,
    { seed, scopes },
  );
}

afterEach(() => vi.unstubAllGlobals());

/* ------------------------------------------------------------------ */

describe('contracts list', () => {
  const visible = CONTRACT_FIXTURES.filter((c) => c.team === 'team-alpha');
  const page = {
    items: visible.map((c) => contractListItem(c, PAYMENT_FIXTURES)),
    total: 120,
    limit: 50,
    offset: 0,
  };

  it('parses as the console reads it', () => {
    expect(contractPageSchema.parse(page).items).toHaveLength(visible.length);
  });

  it('lists each contract with its product, status, schedule and activity, and says it is read-only', async () => {
    stubApi({ '/v1/islamic/contracts': page });
    renderAt('/contracts', <ContractsPage />, '/contracts');

    const table = await screen.findByRole('table', { name: 'Registered contracts' });
    const row = within(table).getByRole('row', { name: /MRB-2026-0412/ });
    expect(within(row).getByRole('link', { name: 'MRB-2026-0412' })).toHaveAttribute(
      'href',
      '/contracts/MRB-2026-0412',
    );
    expect(within(row).getByText('Murabaha')).toBeInTheDocument();
    expect(within(row).getByText('ACTIVE')).toBeInTheDocument();
    expect(within(row).getByText('•••• 6650')).toBeInTheDocument();
    expect(within(row).getByText('36 × 4,215.60')).toBeInTheDocument();
    const settled = within(table).getByRole('row', { name: /QRD-2024-0311/ });
    expect(within(settled).getByText('SETTLED')).toBeInTheDocument();
    expect(screen.getByText(/^Read-only — the bank/)).toBeInTheDocument();
    expect(screen.getByText(`1–${visible.length} of 120`)).toBeInTheDocument();
  });

  it('sends the status, product and search filters, and pages by offset', async () => {
    const requested = stubApi({ '/v1/islamic/contracts': page });
    renderAt('/contracts', <ContractsPage />, '/contracts');
    await screen.findByRole('table', { name: 'Registered contracts' });

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'SETTLED' } });
    fireEvent.change(screen.getByLabelText('Product'), { target: { value: 'IJARA' } });
    fireEvent.change(screen.getByLabelText('Contract number'), { target: { value: 'IJR' } });
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    await waitFor(() => {
      const last = requested.at(-1)!;
      expect(last.searchParams.get('status')).toBe('SETTLED');
      expect(last.searchParams.get('product')).toBe('IJARA');
      expect(last.searchParams.get('q')).toBe('IJR');
      expect(last.searchParams.get('offset')).toBe('0');
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
    await waitFor(() => expect(requested.at(-1)!.searchParams.get('offset')).toBe('50'));
  });

  it('reads nothing with the layer off, and says why', async () => {
    const requested = stubApi({});
    renderAt('/contracts', <ContractsPage />, '/contracts', OFF);
    expect(await screen.findByText('The Islamic layer is off')).toBeInTheDocument();
    expect(requested.map((u) => u.pathname)).not.toContain('/v1/islamic/contracts');
  });

  it('explains an empty register by team', async () => {
    stubApi({ '/v1/islamic/contracts': { items: [], total: 0, limit: 50, offset: 0 } });
    renderAt('/contracts', <ContractsPage />, '/contracts');
    expect(await screen.findByText('No contracts')).toBeInTheDocument();
  });
});

describe('contract detail', () => {
  const detail = contractDetail(RENTAL, PAYMENT_FIXTURES);
  const repayment = contractDetail(REPAYMENT, PAYMENT_FIXTURES);

  it('parses as the console reads it', () => {
    const parsed = contractDetailSchema.parse(detail);
    expect(parsed.schedule).toHaveLength(60);
    expect(parsed.payments).toHaveLength(1);
  });

  it('shows the terms (last four only), status, approved payers and the schedule with the payment seen', async () => {
    stubApi({ '/v1/islamic/contracts/IJR-2025-0093': detail });
    renderAt('/contracts/IJR-2025-0093', <ContractDetailPage />, '/contracts/:contractId');

    expect(await screen.findByRole('heading', { name: 'IJR-2025-0093' })).toBeInTheDocument();
    expect(screen.getByText('Ijara contract')).toBeInTheDocument();
    const terms = screen.getByRole('region', { name: 'Terms' });
    expect(within(terms).getByText('•••• 1185')).toBeInTheDocument();
    expect(within(terms).getByText('60 × 12,000.00')).toBeInTheDocument();
    expect(within(terms).getByText('Monthly')).toBeInTheDocument();
    expect(screen.getAllByText('ACTIVE').length).toBeGreaterThan(0);
    expect(within(screen.getByRole('region', { name: 'Approved payers' })).getByText('•••• 7342')).toBeInTheDocument();

    const schedule = screen.getByRole('table', { name: 'Schedule' });
    const fourteenth = within(schedule).getAllByRole('row')[14]!;
    expect(within(fourteenth).getAllByRole('cell')[0]).toHaveTextContent('14');
    expect(fourteenth).toHaveTextContent(/Paid · \d{4}-\d{2}-\d{2}/);
    const thirteenth = within(schedule).getAllByRole('row')[13]!;
    expect(thirteenth).not.toHaveTextContent('Paid');

    const payments = screen.getByRole('table', { name: 'Payments' });
    const [, row] = within(payments).getAllByRole('row');
    expect(row).toHaveTextContent('rental 14');
    expect(row).toHaveTextContent('12,000.00');
    expect(row).toHaveTextContent('ROUND_AMOUNT_BURST');
    expect(row).toHaveTextContent('No alert');
    expect(screen.getByText(/^Read-only — the bank/)).toBeInTheDocument();
  });

  it('links a payment to its alert, with the alert severity, score and the rule the layer added', async () => {
    stubApi({ '/v1/islamic/contracts/MRB-2026-0412': repayment });
    renderAt('/contracts/MRB-2026-0412', <ContractDetailPage />, '/contracts/:contractId');
    const payments = await screen.findByRole('table', { name: 'Payments' });
    const [, row] = within(payments).getAllByRole('row');
    const payment = repayment.payments[0]!;
    const links = within(row!).getAllByRole('link');
    expect(links.every((link) => link.getAttribute('href') === `/alerts/${payment.alert_id}`)).toBe(true);
    expect(within(row!).getByText(payment.alert_severity!)).toBeInTheDocument();
    expect(within(row!).getByText('THIRD_PARTY_REPAYMENT')).toBeInTheDocument();
    expect(within(row!).getByText(String(Math.floor(payment.risk_score!)))).toBeInTheDocument();
    expect(screen.getByText('None declared: only the customer’s own account pays.')).toBeInTheDocument();
  });

  it('says a contract is not registered on a 404 (another team’s looks the same)', async () => {
    stubApi({});
    renderAt('/contracts/TKF-2026-0044', <ContractDetailPage />, '/contracts/:contractId');
    expect(await screen.findByText('Contract TKF-2026-0044 is not registered')).toBeInTheDocument();
  });

  it('marks instalments an early settlement covers', async () => {
    const settled = contractDetail(SETTLEMENT, PAYMENT_FIXTURES);
    stubApi({ '/v1/islamic/contracts/MRB-2026-0187': settled });
    renderAt('/contracts/MRB-2026-0187', <ContractDetailPage />, '/contracts/:contractId');
    const schedule = await screen.findByRole('table', { name: 'Schedule' });
    const rows = within(schedule).getAllByRole('row');
    expect(rows[21]).not.toHaveTextContent('Settled early');
    expect(rows[22]).toHaveTextContent('Settled early');
    expect(rows[36]).toHaveTextContent('Settled early');
  });
});

/* ------------------------------------------------------------------ */

describe('nav', () => {
  function renderShell(seed: typeof ON, scopes: string[]) {
    stubApi({});
    return renderWithProviders(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/flow']}>
          <Routes>
            <Route path="/" element={<AppShell />}>
              <Route path="flow" element={<p>flow</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
      { seed, scopes },
    );
  }

  it('offers Contracts to alerts:read with the Islamic layer on', () => {
    renderShell(ON, ['alerts:read', 'transactions:read']);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Contracts' })).toHaveAttribute('href', '/contracts');
  });

  it('hides it with the layer off', () => {
    renderShell(OFF, ['alerts:read', 'transactions:read']);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).queryByRole('link', { name: 'Contracts' })).toBeNull();
    expect(within(nav).getByRole('link', { name: 'Alerts' })).toBeInTheDocument();
  });

  it('hides it without alerts:read, even with the layer on', () => {
    renderShell(ON, ['users:manage', 'audit:read']);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).queryByRole('link', { name: 'Contracts' })).toBeNull();
  });
});

/* ------------------------------------------------------------------ */

/** Types one id after another, a keystroke every 50 ms — faster than the debounce. */
function Typing({ ids }: { ids: string[] }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (index >= ids.length - 1) return undefined;
    const timer = setTimeout(() => setIndex(index + 1), 50);
    return () => clearTimeout(timer);
  }, [index, ids.length]);
  return <ContractLookup contractId={ids[index]!} />;
}

describe('register lookup on the submit form', () => {
  const detail = contractDetail(REPAYMENT, PAYMENT_FIXTURES);

  it('says what the register holds for a registered contract', async () => {
    const requested = stubApi({ '/v1/islamic/contracts/MRB-2026-0412': detail });
    renderWithProviders(<ContractLookup contractId="MRB-2026-0412" />, { seed: ON });
    const parsed = contractDetailSchema.parse(detail);
    const line = await screen.findByText(registeredText(parsed));
    expect(line.textContent).toMatch(/^Registered: ACTIVE · 36 × 4,215\.60 · next due \d{4}-\d{2}-\d{2}$/);
    expect(requested.filter((u) => u.pathname.startsWith('/v1/islamic/contracts/'))).toHaveLength(1);
  });

  it('says an unregistered contract is checked against labels only (404)', async () => {
    stubApi({});
    renderWithProviders(<ContractLookup contractId="MRB-UNKNOWN-1" />, { seed: ON });
    expect(await screen.findByText(NOT_REGISTERED_TEXT)).toBeInTheDocument();
  });

  it('says nothing on a 403', async () => {
    stubApi({
      '/v1/islamic/contracts/MRB-2026-0412': () =>
        json({ title: 'Forbidden', status: 403, detail: 'No.', required_scopes: ['alerts:read'] }, 403),
    });
    renderWithProviders(
      <div data-testid="host">
        <ContractLookup contractId="MRB-2026-0412" />
      </div>,
      { seed: ON },
    );
    await waitFor(() => expect(screen.queryByText(/Checking the contract register/)).toBeNull(), {
      timeout: 2_000,
    });
    expect(screen.getByTestId('host')).toBeEmptyDOMElement();
  });

  it('waits for typing to stop before asking (debounced)', async () => {
    const requested = stubApi({});
    renderWithProviders(<Typing ids={['M', 'MR', 'MRB', 'MRB-', 'MRB-1']} />, { seed: ON });
    await screen.findByText(NOT_REGISTERED_TEXT, undefined, { timeout: 2_000 });
    const asked = requested.filter((u) => u.pathname.startsWith('/v1/islamic/contracts/'));
    expect(asked.map((u) => u.pathname)).toEqual(['/v1/islamic/contracts/MRB-1']);
  });

  it('dates the next instalment from the registered schedule', () => {
    const parsed = contractDetailSchema.parse({
      ...detail,
      tenor: 48,
      scheduled_amount: '4350.00',
      schedule: [
        { instalment_no: 1, due_date: '2026-09-01', amount: '4350.00' },
        { instalment_no: 2, due_date: '2026-10-01', amount: '4350.00' },
        { instalment_no: 3, due_date: '2026-11-01', amount: '4350.00' },
      ],
    });
    expect(registeredText(parsed, '2026-10-13')).toBe('Registered: ACTIVE · 48 × 4,350.00 · next due 2026-11-01');
  });
});

/* ------------------------------------------------------------------ */

describe('evidence block', () => {
  const base = {
    facts: { product: 'MURABAHA', event: 'INSTALMENT', contract_id: 'MRB-9', instalment_no: 3, tenor: 36 },
    added: [],
    set_aside: [],
    score_before: 20,
    score_after: 20,
  };

  function findings(facts: Record<string, unknown>) {
    return layerFindingsSchema.parse({ islamic: { ...base, facts: { ...base.facts, ...facts } } });
  }

  it('says the contract is registered, with its status, and links it to the register', () => {
    renderWithProviders(
      <MemoryRouter>
        <LayerFindings findings={findings({ contract_registered: true, contract_status: 'SETTLED' })} />
      </MemoryRouter>,
    );
    const block = screen.getByRole('region', { name: 'Islamic layer' });
    expect(within(block).getByText('Contract registered · SETTLED')).toBeInTheDocument();
    expect(within(block).getByRole('link', { name: 'Contract MRB-9' })).toHaveAttribute(
      'href',
      '/contracts/MRB-9',
    );
  });

  it('says an unregistered contract was checked against labels only, without a dead link', () => {
    renderWithProviders(
      <MemoryRouter>
        <LayerFindings findings={findings({ contract_registered: false, contract_status: null })} />
      </MemoryRouter>,
    );
    const block = screen.getByRole('region', { name: 'Islamic layer' });
    expect(within(block).getByText('Contract not registered')).toBeInTheDocument();
    expect(within(block).queryByRole('link')).toBeNull();
    expect(within(block).getByText('Contract MRB-9')).toBeInTheDocument();
  });

  it('claims nothing either way on an older score without the facts', () => {
    renderWithProviders(
      <MemoryRouter>
        <LayerFindings findings={findings({})} />
      </MemoryRouter>,
    );
    const block = screen.getByRole('region', { name: 'Islamic layer' });
    expect(within(block).queryByText(/registered/)).toBeNull();
    expect(within(block).getByRole('link', { name: 'Contract MRB-9' })).toBeInTheDocument();
  });

  it('renders outside a router as plain text', () => {
    renderWithProviders(<LayerFindings findings={findings({ contract_registered: true, contract_status: 'ACTIVE' })} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Contract registered · ACTIVE')).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */

describe('demo mode register', () => {
  const server = setupServer(...handlers);
  const BASE = 'http://demo.test';

  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());

  async function signIn(username: string): Promise<string> {
    const response = await fetch(`${BASE}/v1/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'SyntheticDemo!2026' }),
    });
    return ((await response.json()) as { access_token: string }).access_token;
  }

  async function ingest(): Promise<string> {
    const response = await fetch(`${BASE}/v1/auth/client-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: 'ingest-loader', client_secret: 'demo-ingest-secret-not-for-production' }),
    });
    return ((await response.json()) as { access_token: string }).access_token;
  }

  const call = (token: string, path: string, method = 'GET', body?: unknown) =>
    fetch(`${BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  const IBAN_A = 'AE070331234567890123456';
  const IBAN_B = 'AE460090000000123456789';

  it('lists the caller team’s contracts only, and 404s another team’s', async () => {
    const alpha = await signIn('analyst@civitas.ai');
    const beta = await signIn('other-analyst@civitas.ai');
    const alphaPage = contractPageSchema.parse(await (await call(alpha, '/v1/islamic/contracts')).json());
    const betaPage = contractPageSchema.parse(await (await call(beta, '/v1/islamic/contracts')).json());
    expect(alphaPage.items.map((c) => c.contract_id)).not.toContain('MSK-2026-0007');
    expect(betaPage.items.map((c) => c.contract_id)).toEqual(['MSK-2026-0007']);
    expect((await call(alpha, '/v1/islamic/contracts/MSK-2026-0007')).status).toBe(404);
    expect((await call(beta, '/v1/islamic/contracts/MRB-2026-0412')).status).toBe(404);
    const supervisor = await signIn('supervisor@civitas.ai');
    expect((await call(supervisor, '/v1/islamic/contracts/MSK-2026-0007')).status).toBe(200);
  });

  it('filters by status, product and contract number, and pages', async () => {
    const token = await signIn('supervisor@civitas.ai');
    const settled = contractPageSchema.parse(
      await (await call(token, '/v1/islamic/contracts?status=SETTLED')).json(),
    );
    expect(settled.items.every((c) => c.status === 'SETTLED')).toBe(true);
    const ijara = contractPageSchema.parse(await (await call(token, '/v1/islamic/contracts?product=IJARA')).json());
    expect(ijara.items.map((c) => c.contract_id)).toContain('IJR-2025-0093');
    const q = contractPageSchema.parse(await (await call(token, '/v1/islamic/contracts?q=0412')).json());
    expect(q.items.map((c) => c.contract_id)).toEqual(['MRB-2026-0412']);
    const paged = contractPageSchema.parse(await (await call(token, '/v1/islamic/contracts?limit=2&offset=1')).json());
    expect(paged.items).toHaveLength(2);
    expect(paged.offset).toBe(1);
    expect(paged.total).toBeGreaterThan(2);
  });

  it('registers with the ingest client only: 201, then 409 for the same id; 403 for an analyst', async () => {
    const token = await ingest();
    const body = {
      contract_id: 'MRB-DEMO-REG-1',
      product: 'MURABAHA',
      customer_iban: IBAN_A,
      contract_start: '2026-01-01',
      tenor: 12,
      scheduled_amount: '5000',
      first_due_date: '2026-02-01',
      approved_payer_ibans: [IBAN_B],
    };
    const created = await call(token, '/v1/islamic/contracts', 'POST', body);
    expect(created.status).toBe(201);
    const out = contractSchema.parse(await created.json());
    expect(out).toMatchObject({
      status: 'ACTIVE',
      team: 'team-alpha',
      customer_iban_last4: IBAN_A.slice(-4),
      scheduled_amount: '5000.00',
      approved_payers: [{ iban_last4: IBAN_B.slice(-4) }],
    });
    expect(JSON.stringify(out)).not.toContain(IBAN_A);
    expect((await call(token, '/v1/islamic/contracts', 'POST', body)).status).toBe(409);
    const analyst = await signIn('analyst@civitas.ai');
    expect((await call(analyst, '/v1/islamic/contracts', 'POST', { ...body, contract_id: 'X' })).status).toBe(403);
    // The analyst reads it back with its schedule.
    const detail = contractDetailSchema.parse(
      await (await call(analyst, '/v1/islamic/contracts/MRB-DEMO-REG-1')).json(),
    );
    expect(detail.schedule.map((s) => s.due_date).slice(0, 3)).toEqual(['2026-02-01', '2026-03-01', '2026-04-01']);
  });

  it('422s with field paths', async () => {
    const token = await ingest();
    const response = await call(token, '/v1/islamic/contracts', 'POST', {
      contract_id: 'ZKT-1',
      product: 'ZAKAT',
      customer_iban: IBAN_A,
      contract_start: '2026-01-01',
      first_due_date: '2025-12-01',
      approved_payer_ibans: [IBAN_B, 'NOT-AN-IBAN'],
    });
    expect(response.status).toBe(422);
    const problem = (await response.json()) as { errors: { field: string }[] };
    expect(problem.errors.map((e) => e.field).sort()).toEqual(
      ['approved_payer_ibans.1', 'first_due_date', 'product'].sort(),
    );
  });

  it('changes status only along the allowed transitions; terms are immutable', async () => {
    const token = await ingest();
    await call(token, '/v1/islamic/contracts', 'POST', {
      contract_id: 'MRB-DEMO-PATCH-1',
      product: 'MURABAHA',
      customer_iban: IBAN_A,
      contract_start: '2026-01-01',
    });
    const path = '/v1/islamic/contracts/MRB-DEMO-PATCH-1';
    expect((await call(token, path, 'PATCH', { tenor: 12 })).status).toBe(422);
    expect((await call(token, path, 'PATCH', { status: 'DEFAULTED' })).status).toBe(200);
    expect((await call(token, path, 'PATCH', { status: 'CANCELLED' })).status).toBe(409);
    const settled = await call(token, path, 'PATCH', { status: 'SETTLED' });
    expect(contractSchema.parse(await settled.json()).status).toBe('SETTLED');
    expect((await call(token, path, 'PATCH', { approved_payer_ibans: [IBAN_B] })).status).toBe(409);
    expect((await call(token, '/v1/islamic/contracts/NOPE', 'PATCH', { status: 'SETTLED' })).status).toBe(404);
  });

  it('lists a transaction that names a registered contract among its payments', async () => {
    const token = await ingest();
    const before = contractDetailSchema.parse(
      await (await call(await signIn('analyst@civitas.ai'), '/v1/islamic/contracts/IJR-2025-0093')).json(),
    );
    const response = await fetch(`${BASE}/v1/transactions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        amount: '12000.00',
        booked_at: new Date().toISOString(),
        metadata: { product: 'IJARA', event: 'RENTAL', contract_id: 'IJR-2025-0093', instalment_no: 15 },
      }),
    });
    expect(response.status).toBe(201);
    const after = contractDetailSchema.parse(
      await (await call(await signIn('analyst@civitas.ai'), '/v1/islamic/contracts/IJR-2025-0093')).json(),
    );
    expect(after.payments).toHaveLength(before.payments.length + 1);
    expect(after.payments[0]?.instalment_no).toBe(15);
    expect(after.payments_seen).toBe(before.payments_seen + 1);
  });
});
