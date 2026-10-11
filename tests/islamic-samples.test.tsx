import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { isValidIban } from '@/lib/iban';
import {
  islamicContractSchema,
  transactionFormSchema,
  type TransactionFormParsed,
} from '@/api/schemas/transactions';
import { buildTransactionPayload } from '@/features/transactions/payload';
import { EMPTY_FORM, SAMPLES, __test__ } from '@/features/transactions/samples';
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

describe('reserved metadata keys', () => {
  it('rejects a free-form metadata row that reuses one of the nine Islamic keys', () => {
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

  it('groups into exactly seven legitimate and eight fraud scenarios', () => {
    expect(SAMPLES.filter((s) => s.group === 'legitimate')).toHaveLength(7);
    expect(SAMPLES.filter((s) => s.group === 'fraud')).toHaveLength(8);
  });

  it('marks only L3, F3 and F6 as needing setup transactions', () => {
    const withSetup = SAMPLES.filter((s) => s.hasSetup).map((s) => s.id);
    expect(withSetup).toEqual([
      'l3-instalment-matches-schedule',
      'f3-settlement-funded-by-fan-in',
      'f6-charity-diversion',
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
});

describe('sample select', () => {
  it('groups samples into legitimate and fraud optgroups', () => {
    renderPage([[metaKey, META_ON]]);
    const select = screen.getByLabelText('Load sample') as HTMLSelectElement;
    const groups = [...select.querySelectorAll('optgroup')].map((g) => g.label);
    expect(groups).toEqual(['Legitimate — no alert expected', 'Fraud — alert expected']);
    const legit = select.querySelector('optgroup[label^="Legitimate"]')!;
    expect(legit.querySelectorAll('option')).toHaveLength(7);
    const fraud = select.querySelector('optgroup[label^="Fraud"]')!;
    expect(fraud.querySelectorAll('option')).toHaveLength(8);
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
