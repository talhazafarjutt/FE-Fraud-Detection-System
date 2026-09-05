import type { TransactionFormValues } from '@/api/schemas/transactions';

/**
 * Three scenarios for the live demo. Every IBAN below passes the ISO 13616
 * mod-97 checksum (verified, not invented) so "Load sample" never produces a
 * form that fails its own validation on stage.
 *
 * `booked_at` is generated relative to now so a sample is never rejected for
 * being stale, and never lands more than 5 minutes in the future.
 */

export interface Sample {
  id: string;
  label: string;
  summary: string;
  build: () => TransactionFormValues;
}

/** datetime-local wants `YYYY-MM-DDTHH:mm`, in local time. */
function localDateTime(offsetMinutes: number): string {
  const at = new Date(Date.now() + offsetMinutes * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(
    at.getHours(),
  )}:${pad(at.getMinutes())}`;
}

function reference(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

export const SAMPLES: readonly Sample[] = [
  {
    id: 'benign',
    label: 'Benign payment',
    summary: 'A modest retail payment between two established accounts. Expect a low score.',
    build: () => ({
      external_ref: reference('DEMO-BENIGN'),
      amount: '240.50',
      currency: 'AED',
      booked_at: localDateTime(-15),
      transaction_type: 'PAYMENT',
      mcc: 5411,
      sender_balance_before: '18400.00',
      receiver_balance_before: '96250.75',
      source_account: {
        iban: 'AE070331234567890123456',
        institution_bic: 'EBILAEAD',
        currency: 'AED',
        opened_on: '2019-06-12',
        holder: {
          party_type: 'PERSON',
          display_name: 'Layla Haddad',
          country_code: 'AE',
          external_ref: 'P-1001',
          risk_tier: 1,
          national_id: '784-1988-1234567-1',
          date_of_birth: '1988-04-11',
          pep_flag: false,
          registration_no: '',
          legal_form: '',
          sector_code: '',
        },
      },
      destination_account: {
        iban: 'AE750260001015079880701',
        institution_bic: 'NBADAEAA',
        currency: 'AED',
        opened_on: '2016-02-03',
        holder: {
          party_type: 'COMPANY',
          display_name: 'Al Manara Grocers LLC',
          country_code: 'AE',
          external_ref: 'C-2201',
          risk_tier: 1,
          national_id: '',
          date_of_birth: '',
          pep_flag: false,
          registration_no: 'CN-1140882',
          legal_form: 'LLC',
          sector_code: '5411',
        },
      },
      metadata: [
        { key: 'channel', value: 'MOBILE' },
        { key: 'device_id', value: 'd-4410' },
      ],
    }),
  },
  {
    id: 'structuring',
    label: 'Structuring-shaped transfer',
    summary:
      'A large transfer to a recently-opened company account holding almost nothing. Expect a high score.',
    build: () => ({
      external_ref: reference('DEMO-STRUCT'),
      amount: '48500.00',
      currency: 'AED',
      booked_at: localDateTime(-3),
      transaction_type: 'TRANSFER',
      mcc: 6011,
      sender_balance_before: '52000.00',
      receiver_balance_before: '150.00',
      source_account: {
        iban: 'AE070331234567890123456',
        institution_bic: 'EBILAEAD',
        currency: 'AED',
        opened_on: '2021-03-04',
        holder: {
          party_type: 'PERSON',
          display_name: 'Layla Haddad',
          country_code: 'AE',
          external_ref: 'P-1001',
          risk_tier: 2,
          national_id: '784-1988-1234567-1',
          date_of_birth: '1988-04-11',
          pep_flag: false,
          registration_no: '',
          legal_form: '',
          sector_code: '',
        },
      },
      destination_account: {
        iban: 'AE460090000000123456789',
        institution_bic: 'NBADAEAA',
        currency: 'AED',
        opened_on: '2026-08-20',
        holder: {
          party_type: 'COMPANY',
          display_name: 'Falcon Trading LLC',
          country_code: 'AE',
          external_ref: 'C-9910',
          risk_tier: 3,
          national_id: '',
          date_of_birth: '',
          pep_flag: false,
          registration_no: 'CN-2291884',
          legal_form: 'LLC',
          sector_code: '4789',
        },
      },
      metadata: [
        { key: 'channel', value: 'ONLINE' },
        { key: 'device_id', value: 'd-8891' },
      ],
    }),
  },
  {
    id: 'dormant-cashout',
    label: 'Dormant-account cash-out',
    summary:
      'A cash-out that empties a long-idle account into one with a zero balance. Expect a critical score.',
    build: () => ({
      external_ref: reference('DEMO-DORMANT'),
      amount: '9000.00',
      currency: 'AED',
      booked_at: localDateTime(-2),
      transaction_type: 'CASH_OUT',
      mcc: 6011,
      sender_balance_before: '9000.00',
      receiver_balance_before: '0.00',
      source_account: {
        iban: 'AE750331000012345678901',
        institution_bic: 'EBILAEAD',
        currency: 'AED',
        opened_on: '2013-11-02',
        holder: {
          party_type: 'PERSON',
          display_name: 'Omar Nasser',
          country_code: 'AE',
          external_ref: 'P-3312',
          risk_tier: 4,
          national_id: '784-1975-7654321-9',
          date_of_birth: '1975-09-30',
          pep_flag: false,
          registration_no: '',
          legal_form: '',
          sector_code: '',
        },
      },
      destination_account: {
        iban: 'AE400500000000987654321',
        institution_bic: 'ADCBAEAA',
        currency: 'AED',
        opened_on: '2026-08-29',
        holder: {
          party_type: 'PERSON',
          display_name: 'Rami Suleiman',
          country_code: 'AE',
          external_ref: 'P-7781',
          risk_tier: 5,
          national_id: '784-1996-1122334-4',
          date_of_birth: '1996-01-22',
          pep_flag: false,
          registration_no: '',
          legal_form: '',
          sector_code: '',
        },
      },
      metadata: [
        { key: 'channel', value: 'ATM' },
        { key: 'device_id', value: 'atm-0093' },
      ],
    }),
  },
];

export const EMPTY_FORM: TransactionFormValues = {
  external_ref: '',
  amount: '',
  currency: 'AED',
  booked_at: localDateTime(0),
  transaction_type: 'TRANSFER',
  mcc: '',
  sender_balance_before: '',
  receiver_balance_before: '',
  source_account: {
    iban: '',
    institution_bic: '',
    currency: 'AED',
    opened_on: '',
    holder: {
      party_type: 'PERSON',
      display_name: '',
      country_code: 'AE',
      external_ref: '',
      risk_tier: 1,
      national_id: '',
      date_of_birth: '',
      pep_flag: false,
      registration_no: '',
      legal_form: '',
      sector_code: '',
    },
  },
  destination_account: {
    iban: '',
    institution_bic: '',
    currency: 'AED',
    opened_on: '',
    holder: {
      party_type: 'COMPANY',
      display_name: '',
      country_code: 'AE',
      external_ref: '',
      risk_tier: 1,
      national_id: '',
      date_of_birth: '',
      pep_flag: false,
      registration_no: '',
      legal_form: '',
      sector_code: '',
    },
  },
  metadata: [],
};
