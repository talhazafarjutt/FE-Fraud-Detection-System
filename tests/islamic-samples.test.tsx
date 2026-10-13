import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { isValidIban } from '@/lib/iban';
import {
  islamicContractSchema,
  riskSchema,
  transactionFormSchema,
  type TransactionFormParsed,
} from '@/api/schemas/transactions';
import { buildTransactionPayload } from '@/features/transactions/payload';
import { EMPTY_FORM, SAMPLES, __test__, keptOnVerdict } from '@/features/transactions/samples';
import TransactionsPage from '@/features/transactions/TransactionsPage';
import { machineTokenStore } from '@/auth/machineTokenStore';
import { metaKey } from '@/features/layers/useMeta';
import { metaSchema } from '@/api/schemas/meta';
import { WIRE_META_OFF, WIRE_META_ON } from './islamic-wire';
import { renderWithProviders } from './render';

vi.mock('@/api/endpoints/transactions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/endpoints/transactions')>();
  return { ...actual, createTransaction: vi.fn() };
});

const { createTransaction } = await import('@/api/endpoints/transactions');
const mockedCreateTransaction = vi.mocked(createTransaction);

const META_ON = metaSchema.parse(WIRE_META_ON);
const META_OFF = metaSchema.parse(WIRE_META_OFF);

function parse(values: unknown): TransactionFormParsed {
  const result = transactionFormSchema.safeParse(values);
  if (!result.success) {
    throw new Error(`Form schema rejected sample: ${JSON.stringify(result.error.issues)}`);
  }
  return result.data;
}

/* ------------------------------------------------------------------ *
 * Payload — metadata typing
 * ------------------------------------------------------------------ */

const SOURCE_ACCOUNT = {
  ...EMPTY_FORM.source_account,
  iban: 'AE070331234567890123456',
  holder: { ...EMPTY_FORM.source_account.holder, display_name: 'Test Sender' },
};
const DEST_ACCOUNT = {
  ...EMPTY_FORM.destination_account,
  iban: 'AE460090000000123456789',
  holder: { ...EMPTY_FORM.destination_account.holder, display_name: 'Test Receiver' },
};

describe('Islamic metadata in the payload', () => {
  it('sends instalment_no and tenor as JSON integers, not strings', () => {
    const values = parse({
      ...EMPTY_FORM,
      amount: '4215.60',
      sender_balance_before: '62480.00',
      receiver_balance_before: '1250340.00',
      source_account: SOURCE_ACCOUNT,
      destination_account: DEST_ACCOUNT,
      islamic: {
        ...EMPTY_FORM.islamic,
        product: 'MURABAHA',
        event: 'INSTALMENT',
        contract_id: 'MRB-TEST-1',
        instalment_no: 8,
        tenor: 36,
        scheduled_amount: '4215.60',
        contract_start: '2025-01-01',
        customer_iban: 'AE070331234567890123456',
      },
    });
    const body = buildTransactionPayload(values);
    const metadata = body['metadata'] as Record<string, unknown>;
    expect(metadata.instalment_no).toBe(8);
    expect(typeof metadata.instalment_no).toBe('number');
    expect(metadata.tenor).toBe(36);
    expect(typeof metadata.tenor).toBe('number');
    expect(metadata.product).toBe('MURABAHA');
    expect(metadata.event).toBe('INSTALMENT');
    expect(metadata.scheduled_amount).toBe('4215.60');
    expect(metadata.customer_iban).toBe('AE070331234567890123456');
    expect(metadata).not.toHaveProperty('supplier_iban');
  });

  it('omits the Islamic keys entirely for a conventional payment', () => {
    const values = parse({
      ...EMPTY_FORM,
      amount: '100.00',
      sender_balance_before: '1000.00',
      receiver_balance_before: '1000.00',
      source_account: SOURCE_ACCOUNT,
      destination_account: DEST_ACCOUNT,
      metadata: [{ key: 'channel', value: 'MOBILE' }],
    });
    const body = buildTransactionPayload(values);
    expect(body['metadata']).toEqual({ channel: 'MOBILE' });
  });

  it('merges free-form metadata and the Islamic contract into one object', () => {
    const values = parse({
      ...EMPTY_FORM,
      amount: '1000.00',
      sender_balance_before: '1000.00',
      receiver_balance_before: '1000.00',
      source_account: SOURCE_ACCOUNT,
      destination_account: DEST_ACCOUNT,
      islamic: { ...EMPTY_FORM.islamic, product: 'ZAKAT', event: 'CHARITY' },
      metadata: [{ key: 'channel', value: 'MOBILE' }],
    });
    const body = buildTransactionPayload(values);
    expect(body['metadata']).toEqual({ channel: 'MOBILE', product: 'ZAKAT', event: 'CHARITY' });
  });
});

/* ------------------------------------------------------------------ *
 * Required-field logic per event
 * ------------------------------------------------------------------ */

describe('islamicContractSchema required fields', () => {
  const BASE = { contract_id: 'X-1', instalment_no: '', tenor: '', scheduled_amount: '', contract_start: '', customer_iban: '', supplier_iban: '' };

  it('requires contract_start for a disbursement', () => {
    const result = islamicContractSchema.safeParse({ ...BASE, product: 'MURABAHA', event: 'DISBURSEMENT', supplier_iban: 'AE460090000000123456789' });
    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues.map((i) => i.path.join('.'))).toContain(
      'contract_start',
    );
  });

  it('requires supplier_iban in addition to contract_start for a Murabaha disbursement', () => {
    const result = islamicContractSchema.safeParse({
      ...BASE,
      product: 'MURABAHA',
      event: 'DISBURSEMENT',
      contract_start: '2025-01-01',
    });
    expect(result.success).toBe(false);
    const paths = result.success ? [] : result.error.issues.map((i) => i.path.join('.'));
    expect(paths).toContain('supplier_iban');
  });

  it('requires the four scheduled fields for an instalment', () => {
    const result = islamicContractSchema.safeParse({ ...BASE, product: 'MURABAHA', event: 'INSTALMENT' });
    expect(result.success).toBe(false);
    const paths = result.success ? [] : result.error.issues.map((i) => i.path.join('.'));
    expect(paths).toEqual(
      expect.arrayContaining(['customer_iban', 'instalment_no', 'tenor', 'scheduled_amount']),
    );
  });

  it('requires only customer_iban for an early settlement', () => {
    const missing = islamicContractSchema.safeParse({ ...BASE, product: 'MURABAHA', event: 'EARLY_SETTLEMENT' });
    expect(missing.success).toBe(false);
    const ok = islamicContractSchema.safeParse({
      ...BASE,
      product: 'MURABAHA',
      event: 'EARLY_SETTLEMENT',
      customer_iban: 'AE460090000000123456789',
    });
    expect(ok.success).toBe(true);
  });

  it('does not require contract_id for Zakat', () => {
    const result = islamicContractSchema.safeParse({ ...BASE, contract_id: '', product: 'ZAKAT', event: 'CHARITY' });
    expect(result.success).toBe(true);
  });

  it('requires contract_id for every non-Zakat product', () => {
    const result = islamicContractSchema.safeParse({
      ...BASE,
      contract_id: '',
      product: 'MUDARABA',
      event: 'PROFIT_DISTRIBUTION',
    });
    expect(result.success).toBe(false);
    const paths = result.success ? [] : result.error.issues.map((i) => i.path.join('.'));
    expect(paths).toContain('contract_id');
  });

  it('rejects an event that does not belong to the product', () => {
    const result = islamicContractSchema.safeParse({ ...BASE, product: 'ZAKAT', event: 'CLAIM' });
    expect(result.success).toBe(false);
  });

  it('is a no-op for a conventional payment (no product chosen)', () => {
    const result = islamicContractSchema.safeParse({ ...BASE, contract_id: '', product: '', event: '' });
    expect(result.success).toBe(true);
  });
});

describe('due date', () => {
  const BASE_DUE = {
    contract_id: 'X-1',
    instalment_no: '8',
    tenor: '36',
    scheduled_amount: '5000.00',
    contract_start: '',
    customer_iban: 'AE460090000000123456789',
    supplier_iban: '',
  };

  it.each(['INSTALMENT', 'RENTAL'] as const)('is accepted on a scheduled %s', (event) => {
    const product = event === 'RENTAL' ? 'IJARA' : 'MURABAHA';
    const result = islamicContractSchema.safeParse({ ...BASE_DUE, product, event, due_date: '2026-10-13' });
    expect(result.success).toBe(true);
  });

  it('is refused on an event that is not a scheduled payment, as the backend 422s it', () => {
    const result = islamicContractSchema.safeParse({
      ...BASE_DUE,
      product: 'MURABAHA',
      event: 'EARLY_SETTLEMENT',
      due_date: '2026-10-13',
    });
    expect(result.success).toBe(false);
    const paths = result.success ? [] : result.error.issues.map((i) => i.path.join('.'));
    expect(paths).toEqual(['due_date']);
  });

  it('travels in metadata as due_date', () => {
    const scenario = SAMPLES.find((s) => s.id === 'l3-instalment-matches-schedule')!.generate();
    const body = buildTransactionPayload(parse(scenario.final));
    expect((body['metadata'] as Record<string, unknown>)['due_date']).toBe(__test__.isoDateOffset(0));
  });

  it('is a reserved key', () => {
    const result = transactionFormSchema.safeParse({
      ...EMPTY_FORM,
      amount: '100.00',
      sender_balance_before: '1000.00',
      receiver_balance_before: '1000.00',
      source_account: { ...EMPTY_FORM.source_account, iban: 'AE070331234567890123456' },
      destination_account: { ...EMPTY_FORM.destination_account, iban: 'AE460090000000123456789' },
      metadata: [{ key: 'due_date', value: '2026-10-13' }],
    });
    expect(result.success).toBe(false);
  });
});

describe('false-alarm samples', () => {
  function islamicOf(id: string) {
    return SAMPLES.find((s) => s.id === id)!.generate().final.islamic;
  }

  it('L2 and V3 settle exactly what the schedule says is left; V1 does not', () => {
    for (const id of ['l2-early-settlement-own-drain', 'v3-verified-settlement-after-inflow']) {
      const terms = islamicOf(id);
      const left = Number(terms.scheduled_amount) * (Number(terms.tenor) - Number(terms.instalment_no) + 1);
      expect(left).toBe(156_600);
    }
    const v1 = islamicOf('v1-settlement-short-of-schedule');
    expect(Number(v1.scheduled_amount) * (Number(v1.tenor) - Number(v1.instalment_no) + 1)).toBe(200_000);
  });

  it('V2 is due about three months out; L3 is due today', () => {
    expect(islamicOf('v2-instalment-paid-months-early').due_date).toBe(__test__.isoDateOffset(90));
    expect(islamicOf('l3-instalment-matches-schedule').due_date).toBe(__test__.isoDateOffset(0));
  });

  it('predict what still counts', () => {
    const expected = Object.fromEntries(SAMPLES.map((s) => [s.id, s.expected]));
    expect(expected['v1-settlement-short-of-schedule']).toEqual({
      alert: true,
      kept: ['ORIGIN_ACCOUNT_DRAIN'],
    });
    expect(expected['v2-instalment-paid-months-early']).toEqual({
      alert: false,
      kept: ['ROUND_AMOUNT_BURST'],
    });
    expect(expected['v3-verified-settlement-after-inflow']).toEqual({
      alert: true,
      setAside: ['ORIGIN_ACCOUNT_DRAIN'],
      kept: ['RAPID_PASS_THROUGH'],
    });
  });

  it('keptOnVerdict lists engine rules, network evidence and the anomaly flag, never layer rules', () => {
    const risk = riskSchema.parse({
      risk_level: 'HIGH',
      model_name: 'm',
      model_version: 'v',
      explanation: [],
      triggered_rules: [
        { rule: 'ROUND_AMOUNT_BURST', severity: 'MEDIUM', description: 'x', source: null },
        { rule: 'THIRD_PARTY_REPAYMENT', severity: 'HIGH', description: 'y', source: 'islamic' },
      ],
      network: { network_score: 30, evidence: [{ code: 'RAPID_PASS_THROUGH', score: 30 }] },
      anomaly: { is_anomaly: true, anomaly_score: 90 },
    });
    expect(keptOnVerdict(risk)).toEqual(['ROUND_AMOUNT_BURST', 'RAPID_PASS_THROUGH', 'anomaly']);
    expect(keptOnVerdict(riskSchema.parse({ risk_level: 'LOW', model_name: 'm', model_version: 'v' }))).toEqual(
      [],
    );
  });
});

describe('reserved metadata keys', () => {
  it('rejects a free-form metadata row that reuses one of the ten Islamic keys', () => {
    const values = {
      ...EMPTY_FORM,
      amount: '100.00',
      sender_balance_before: '1000.00',
      receiver_balance_before: '1000.00',
      source_account: { ...EMPTY_FORM.source_account, iban: 'AE070331234567890123456' },
      destination_account: { ...EMPTY_FORM.destination_account, iban: 'AE460090000000123456789' },
      metadata: [{ key: 'contract_id', value: 'should not be allowed here' }],
    };
    const result = transactionFormSchema.safeParse(values);
    expect(result.success).toBe(false);
    const paths = result.success ? [] : result.error.issues.map((i) => i.path.join('.'));
    expect(paths).toContain('metadata.0.key');
  });
});

/* ------------------------------------------------------------------ *
 * IBAN generator
 * ------------------------------------------------------------------ */

describe('freshAeIban', () => {
  it('always produces a mod-97-valid AE IBAN, and a fresh one each time', () => {
    const ibans = Array.from({ length: 50 }, () => __test__.freshAeIban('033'));
    for (const iban of ibans) {
      expect(iban).toMatch(/^AE\d{21}$/);
      expect(isValidIban(iban)).toBe(true);
    }
    expect(new Set(ibans).size).toBe(ibans.length);
  });
});

/* ------------------------------------------------------------------ *
 * Every sample passes the form schema
 * ------------------------------------------------------------------ */

describe('every sample', () => {
  it.each(SAMPLES.map((sample) => [sample.id, sample] as const))(
    '%s: setup and final transactions all pass the form schema',
    (_id, sample) => {
      const scenario = sample.generate();
      for (const setupValues of scenario.setup) {
        const result = transactionFormSchema.safeParse(setupValues);
        expect(result.success, JSON.stringify(!result.success && result.error.issues)).toBe(true);
      }
      const result = transactionFormSchema.safeParse(scenario.final);
      expect(result.success, JSON.stringify(!result.success && result.error.issues)).toBe(true);
    },
  );

  it('groups into seven legitimate, eight fraud, three warning and three false-alarm checks', () => {
    expect(SAMPLES.filter((s) => s.group === 'legitimate')).toHaveLength(7);
    expect(SAMPLES.filter((s) => s.group === 'fraud')).toHaveLength(8);
    expect(SAMPLES.filter((s) => s.group === 'warning')).toHaveLength(3);
    expect(SAMPLES.filter((s) => s.group === 'check').map((s) => s.id)).toEqual([
      'v1-settlement-short-of-schedule',
      'v2-instalment-paid-months-early',
      'v3-verified-settlement-after-inflow',
    ]);
  });

  it('marks only L3, F3, F6, W3, V2 and V3 as needing setup transactions', () => {
    const withSetup = SAMPLES.filter((s) => s.hasSetup).map((s) => s.id);
    expect(withSetup).toEqual([
      'l3-instalment-matches-schedule',
      'f3-settlement-funded-by-fan-in',
      'f6-charity-diversion',
      'w3-charity-registered-organisation',
      'v2-instalment-paid-months-early',
      'v3-verified-settlement-after-inflow',
    ]);
    for (const sample of SAMPLES) {
      expect(sample.generate().setup.length > 0).toBe(sample.hasSetup);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Component: contract section visibility, sample select groups
 * ------------------------------------------------------------------ */

function renderPage(seed: Array<[readonly unknown[], unknown]>) {
  return renderWithProviders(
    <MemoryRouter>
      <TransactionsPage />
    </MemoryRouter>,
    { seed },
  );
}

beforeEach(() => {
  mockedCreateTransaction.mockReset();
});

afterEach(() => {
  machineTokenStore.clear();
});

describe('Islamic contract section', () => {
  it('is hidden when the Islamic layer is off', () => {
    renderPage([[metaKey, META_OFF]]);
    expect(screen.queryByText(/Islamic contract/)).toBeNull();
    expect(screen.queryByLabelText('Product')).toBeNull();
  });

  it('is shown when the Islamic layer is on', () => {
    renderPage([[metaKey, META_ON]]);
    expect(screen.getByText(/Islamic contract/)).toBeInTheDocument();
    expect(screen.getByLabelText('Product')).toBeInTheDocument();
  });

  it('asks for a due date only on a scheduled payment, and says what verifies each set-aside', () => {
    renderPage([[metaKey, META_ON]]);
    fireEvent.change(screen.getByLabelText('Product'), { target: { value: 'MURABAHA' } });
    const event = screen.getByLabelText('Event');

    fireEvent.change(event, { target: { value: 'INSTALMENT' } });
    expect(screen.getByLabelText('Due date')).toBeInTheDocument();
    expect(screen.getByText('Scheduled amount and due date verify the schedule.')).toBeInTheDocument();

    fireEvent.change(event, { target: { value: 'EARLY_SETTLEMENT' } });
    expect(screen.queryByLabelText('Due date')).toBeNull();
    expect(
      screen.getByText(/instalment n of N let the system verify the settlement; without them the "account emptied" warning stays/),
    ).toBeInTheDocument();
  });
});

describe('sample select', () => {
  it('groups samples into legitimate, fraud, warning and false-alarm check optgroups', () => {
    renderPage([[metaKey, META_ON]]);
    const select = screen.getByLabelText('Load sample') as HTMLSelectElement;
    const groups = [...select.querySelectorAll('optgroup')].map((g) => g.label);
    expect(groups).toEqual([
      'Legitimate — no alert expected',
      'Fraud — alert expected',
      'Warning — signal only, no alert',
      'False-alarm checks',
    ]);
    const checks = select.querySelector('optgroup[label="False-alarm checks"]')!;
    expect(checks.querySelectorAll('option')).toHaveLength(3);
    const legit = select.querySelector('optgroup[label^="Legitimate"]')!;
    expect(legit.querySelectorAll('option')).toHaveLength(7);
    const fraud = select.querySelector('optgroup[label^="Fraud"]')!;
    expect(fraud.querySelectorAll('option')).toHaveLength(8);
    const warning = select.querySelector('optgroup[label^="Warning"]')!;
    expect(warning.querySelectorAll('option')).toHaveLength(3);
  });

  it('refuses to load a setup sample without an open ingest session', async () => {
    renderPage([[metaKey, META_ON]]);
    const select = screen.getByLabelText('Load sample') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'f6-charity-diversion' } });
    await waitFor(() => expect(screen.getByText('Cannot load this sample yet')).toBeInTheDocument());
    expect(mockedCreateTransaction).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ *
 * Setup runner — sequential, stops on error
 * ------------------------------------------------------------------ */

describe('loading a sample with setup transactions', () => {
  function openIngestSession() {
    machineTokenStore.set(
      { access_token: 'test-ingest-token', refresh_token: '', token_type: 'bearer', expires_in: 900, scopes: ['transactions:write'] },
      'ingest-loader',
    );
  }

  it('submits every setup transaction in order, with the ingest bearer, then fills the form with the final one', async () => {
    mockedCreateTransaction.mockResolvedValue({
      data: {
        transaction_id: '00000000-0000-0000-0000-000000000000',
        scoring: 'COMPLETE',
        risk: null,
        alert: null,
        links: {},
      },
      status: 201,
      replayed: false,
    });
    openIngestSession();
    renderPage([[metaKey, META_ON]]);

    const select = screen.getByLabelText('Load sample') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'f6-charity-diversion' } });

    await waitFor(() => expect(mockedCreateTransaction).toHaveBeenCalledTimes(4));
    for (const call of mockedCreateTransaction.mock.calls) {
      expect(call[2]).toBe('test-ingest-token');
    }
    // Each setup is booked strictly before the next, and before the final.
    const bookedTimes = mockedCreateTransaction.mock.calls.map(
      (call) => (call[0] as { booked_at: string }).booked_at,
    );
    const sorted = [...bookedTimes].sort();
    expect(bookedTimes).toEqual(sorted);

    await waitFor(() => expect(screen.getByLabelText('Amount')).toHaveValue('2500.00'));
    await waitFor(() =>
      expect(screen.getByText(/Expected — F6/)).toBeInTheDocument(),
    );
  });

  it('stops after the first failed setup transaction and does not fill the form', async () => {
    mockedCreateTransaction
      .mockResolvedValueOnce({
        data: {
          transaction_id: '00000000-0000-0000-0000-000000000001',
          scoring: 'COMPLETE',
          risk: null,
          alert: null,
          links: {},
        },
        status: 201,
        replayed: false,
      })
      .mockRejectedValueOnce(new Error('refused'));
    openIngestSession();
    renderPage([[metaKey, META_ON]]);

    const select = screen.getByLabelText('Load sample') as HTMLSelectElement;
    const amountBefore = (screen.getByLabelText('Amount') as HTMLInputElement).value;
    fireEvent.change(select, { target: { value: 'f6-charity-diversion' } });

    await waitFor(() => expect(mockedCreateTransaction).toHaveBeenCalledTimes(2));
    // Give any further (wrongful) calls a chance to happen before asserting none did.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mockedCreateTransaction).toHaveBeenCalledTimes(2);
    expect((screen.getByLabelText('Amount') as HTMLInputElement).value).toBe(amountBefore);
  });
});
