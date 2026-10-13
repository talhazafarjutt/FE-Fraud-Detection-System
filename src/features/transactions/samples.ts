import type { TransactionFormValues } from '@/api/schemas/transactions';

/**
 * Eighteen Islamic-first scenarios against the live engine: seven legitimate
 * contracts, each the twin of a fraud pattern; eight fraud scenarios (F7 is a
 * warning-only CONTRACT_INCOHERENT finding that should NOT raise an alert on
 * its own); and three "signal only" warnings (W1-W3) where a risk-signal rule
 * (TAKAFUL_EARLY_CLAIM, CHARITY_DIVERSION, THIRD_PARTY_REPAYMENT) fires MEDIUM
 * with nothing corroborating it to HIGH, so it stays a warning rather than an
 * alert. Core's own network evidence can still open an alert on any sample
 * regardless of the layer's severity (verified against the live API — see
 * W3's note below for where that almost, but does not quite, apply here).
 *
 * Every IBAN below is generated fresh per load (ISO 13616 mod-97 valid — see
 * `freshAeIban`) and every holder gets a fresh `external_ref`, so reloading a
 * sample twice never collides with the previous load's accounts in the same
 * demo database. Display names stay human and recur across loads; only the
 * account numbers behind them change.
 *
 * `booked_at` carries SECONDS precision (the form's input runs `step="1"`)
 * because the network analyzer rejects a transaction booked earlier than one
 * it has already seen: a scenario with setup transactions books them at
 * now−N…now−1 seconds and the transaction that fills the form at now.
 */

export interface SampleExpectation {
  alert: boolean;
  /** Rule names the Islamic layer should add. */
  added?: string[];
  /**
   * The added rule's severity, for the three rules that are risk signals
   * rather than fraud decisions on their own (TAKAFUL_EARLY_CLAIM,
   * CHARITY_DIVERSION, THIRD_PARTY_REPAYMENT): MEDIUM on the base condition
   * alone, HIGH once a second reason corroborates it. Shown as "warning" vs
   * "high" next to Expected/Got.
   */
  severity?: 'MEDIUM' | 'HIGH';
  /** Rule names the Islamic layer should set aside. */
  setAside?: string[];
}

export interface SampleScenario {
  /** Transactions submitted, in order, before the form is filled. */
  setup: TransactionFormValues[];
  /** The transaction the form is filled with. Never auto-submitted. */
  final: TransactionFormValues;
}

export interface Sample {
  id: string;
  label: string;
  group: 'legitimate' | 'fraud' | 'warning';
  summary: string;
  expected: SampleExpectation;
  hasSetup: boolean;
  /**
   * Called once per "load" — not per render — so a scenario with setup
   * transactions (L3, F3, F6) can share one freshly generated account between
   * its setups and its final transaction.
   */
  generate: () => SampleScenario;
}

/* ------------------------------------------------------------------ *
 * Time
 * ------------------------------------------------------------------ */

/** `datetime-local` with `step="1"` wants `YYYY-MM-DDTHH:mm:ss`, local time. */
function localDateTime(offsetSeconds: number): string {
  const at = new Date(Date.now() + offsetSeconds * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(
    at.getHours(),
  )}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`;
}

/** An ISO date `offsetDays` from now, in the UTC day `booked_at`'s instant falls on. */
function isoDateOffset(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ *
 * Freshness
 * ------------------------------------------------------------------ */

let sequence = 0;

/** Digits only, collision-resistant across loads within one page session. */
function freshDigits(length: number): string {
  sequence += 1;
  const time = Date.now().toString().slice(-8);
  const rand = Math.floor(Math.random() * 1e8)
    .toString()
    .padStart(8, '0');
  const seq = String(sequence).padStart(4, '0');
  return `${time}${rand}${seq}`.slice(-length).padStart(length, '0');
}

function fresh(): string {
  return freshDigits(10);
}

function reference(prefix: string): string {
  return `${prefix}-${fresh()}`;
}

/* ------------------------------------------------------------------ *
 * IBAN generation — ISO 13616 check digits, computed rather than guessed.
 *
 * Move the country code and a "00" placeholder to the end of the BBAN, map
 * letters to numbers (A=10 ... Z=35), and the check digits are 98 minus the
 * mod-97 remainder of the result. `tests/islamic-samples.test.ts` verifies
 * every generated IBAN against `isValidIban` (ISO 13616 mod-97), the same
 * function the form itself validates against.
 * ------------------------------------------------------------------ */

function mod97(digits: string): number {
  let remainder = 0;
  for (const ch of digits) remainder = (remainder * 10 + Number(ch)) % 97;
  return remainder;
}

function ibanCheckDigits(countryCode: string, bban: string): string {
  let numeric = '';
  for (const ch of `${bban}${countryCode}00`) {
    const code = ch.charCodeAt(0);
    numeric += code >= 65 && code <= 90 ? String(code - 55) : ch;
  }
  return String(98 - mod97(numeric)).padStart(2, '0');
}

/** A fresh, valid AE IBAN: AE + 2 check digits + 3-digit bank code + 16-digit account. */
function freshAeIban(bankCode: string): string {
  const bban = `${bankCode}${freshDigits(16)}`;
  return `AE${ibanCheckDigits('AE', bban)}${bban}`;
}

/* ------------------------------------------------------------------ *
 * Account builders
 * ------------------------------------------------------------------ */

type Account = TransactionFormValues['source_account'];
type Holder = Account['holder'];

interface HolderSpec {
  type?: 'PERSON' | 'COMPANY';
  name: string;
  refPrefix: string;
  riskTier?: number;
}

function holder(spec: HolderSpec): Holder {
  const type = spec.type ?? 'PERSON';
  return {
    party_type: type,
    display_name: spec.name,
    country_code: 'AE',
    external_ref: reference(spec.refPrefix),
    risk_tier: spec.riskTier ?? 1,
    national_id: type === 'PERSON' ? `784-${fresh()}` : '',
    date_of_birth: type === 'PERSON' ? '1985-04-11' : '',
    pep_flag: false,
    registration_no: type === 'COMPANY' ? `CN-${fresh()}` : '',
    legal_form: type === 'COMPANY' ? 'LLC' : '',
    sector_code: type === 'COMPANY' ? '6120' : '',
  };
}

interface AccountSpec {
  bankCode: string;
  bic?: string;
  openedOffsetDays: number;
  holder: HolderSpec;
}

function account(spec: AccountSpec): Account {
  return {
    iban: freshAeIban(spec.bankCode),
    institution_bic: spec.bic ?? 'EBILAEAD',
    currency: 'AED',
    opened_on: isoDateOffset(spec.openedOffsetDays),
    holder: holder(spec.holder),
  };
}

/* ------------------------------------------------------------------ *
 * Transaction builder
 * ------------------------------------------------------------------ */

function emptyIslamic(): TransactionFormValues['islamic'] {
  return {
    product: '',
    event: '',
    contract_id: '',
    instalment_no: '',
    tenor: '',
    scheduled_amount: '',
    contract_start: '',
    customer_iban: '',
    supplier_iban: '',
  };
}

interface TxnSpec {
  refPrefix: string;
  amount: string;
  bookedOffsetSeconds: number;
  senderBalance: string;
  receiverBalance: string;
  source: Account;
  destination: Account;
  islamic?: Partial<TransactionFormValues['islamic']>;
  metadata?: { key: string; value: string }[];
}

function txn(spec: TxnSpec): TransactionFormValues {
  return {
    external_ref: reference(spec.refPrefix),
    amount: spec.amount,
    currency: 'AED',
    booked_at: localDateTime(spec.bookedOffsetSeconds),
    transaction_type: 'TRANSFER',
    mcc: '',
    sender_balance_before: spec.senderBalance,
    receiver_balance_before: spec.receiverBalance,
    source_account: spec.source,
    destination_account: spec.destination,
    islamic: { ...emptyIslamic(), ...spec.islamic },
    metadata: spec.metadata ?? [],
  };
}

function noSetup(final: TransactionFormValues): SampleScenario {
  return { setup: [], final };
}

/* ------------------------------------------------------------------ *
 * L1 — Sara's Murabaha instalment, paid from her own account.
 * Twin of F2 (same instalment, paid from a stranger's account).
 * ------------------------------------------------------------------ */

function sampleL1(): Sample {
  return {
    id: 'l1-murabaha-instalment-own-account',
    label: 'L1 — Murabaha instalment, own account',
    group: 'legitimate',
    summary:
      "Sara pays instalment 8 of 36 on her Murabaha from her own account. Expect a quiet, low score.",
    expected: { alert: false },
    hasSetup: false,
    generate: () => {
      const sara = account({
        bankCode: '033',
        openedOffsetDays: -900,
        holder: { name: 'Sara Al Mazrouei', refPrefix: 'SARA' },
      });
      const collections = account({
        bankCode: '070',
        bic: 'ALITAEAD',
        openedOffsetDays: -3000,
        holder: { type: 'COMPANY', name: 'Al Ittihad Islamic Finance', refPrefix: 'AIIF' },
      });
      const final = txn({
        refPrefix: 'DEMO-MRB-INSTALMENT',
        amount: '4215.60',
        bookedOffsetSeconds: 0,
        senderBalance: '62480.00',
        receiverBalance: '1250340.00',
        source: sara,
        destination: collections,
        islamic: {
          product: 'MURABAHA',
          event: 'INSTALMENT',
          contract_id: reference('MRB-SARA'),
          instalment_no: 8,
          tenor: 36,
          scheduled_amount: '4215.60',
          contract_start: isoDateOffset(-240),
          customer_iban: sara.iban,
        },
        metadata: [{ key: 'channel', value: 'MOBILE' }],
      });
      return noSetup(final);
    },
  };
}

/* ------------------------------------------------------------------ *
 * L2 — Ahmed's early settlement, draining his own account by design.
 * Twin of F3 (the same settlement, funded by a fan-in of strangers).
 * ------------------------------------------------------------------ */

function sampleL2(): Sample {
  return {
    id: 'l2-early-settlement-own-drain',
    label: 'L2 — Early settlement, own account',
    group: 'legitimate',
    summary:
      'Ahmed settles his Murabaha early for 156,600, emptying his own account by design. Expect ORIGIN_ACCOUNT_DRAIN set aside and no alert.',
    expected: { alert: false, setAside: ['ORIGIN_ACCOUNT_DRAIN'] },
    hasSetup: false,
    generate: () => {
      const ahmed = account({
        bankCode: '033',
        openedOffsetDays: -1400,
        holder: { name: 'Ahmed Al Qasimi', refPrefix: 'AHMED' },
      });
      const settlements = account({
        bankCode: '070',
        bic: 'ALITAEAD',
        openedOffsetDays: -3000,
        holder: { type: 'COMPANY', name: 'Al Ittihad Islamic Finance', refPrefix: 'AIIF' },
      });
      const final = txn({
        refPrefix: 'DEMO-MRB-SETTLE-OWN',
        amount: '156600.00',
        bookedOffsetSeconds: 0,
        senderBalance: '156600.00',
        receiverBalance: '2200000.00',
        source: ahmed,
        destination: settlements,
        islamic: {
          product: 'MURABAHA',
          event: 'EARLY_SETTLEMENT',
          contract_id: reference('MRB-AHMED'),
          contract_start: isoDateOffset(-500),
          customer_iban: ahmed.iban,
        },
      });
      return noSetup(final);
    },
  };
}

/* ------------------------------------------------------------------ *
 * L3 — A scheduled instalment matching the contract, after ordinary history.
 * Twin of F8 (a settlement far above what the schedule says is left).
 * ------------------------------------------------------------------ */

function sampleL3(): Sample {
  return {
    id: 'l3-instalment-matches-schedule',
    label: 'L3 — Scheduled instalment, with history',
    group: 'legitimate',
    summary:
      "Sara's 5,000 instalment matches the contract schedule, after two ordinary rent payments from the same account. Expect ROUND_AMOUNT_BURST set aside and no alert.",
    expected: { alert: false, setAside: ['ROUND_AMOUNT_BURST'] },
    hasSetup: true,
    generate: () => {
      const sara = account({
        bankCode: '033',
        openedOffsetDays: -1100,
        holder: { name: 'Sara Al Mazrouei', refPrefix: 'SARA' },
      });
      const landlord = account({
        bankCode: '090',
        openedOffsetDays: -2000,
        holder: { type: 'COMPANY', name: 'Al Waha Properties', refPrefix: 'WAHA' },
      });
      const collections = account({
        bankCode: '070',
        bic: 'ALITAEAD',
        openedOffsetDays: -3000,
        holder: { type: 'COMPANY', name: 'Al Ittihad Islamic Finance', refPrefix: 'AIIF' },
      });
      const setup = [
        txn({
          refPrefix: 'DEMO-RENT',
          amount: '3200.00',
          bookedOffsetSeconds: -2,
          senderBalance: '48400.00',
          receiverBalance: '640200.00',
          source: sara,
          destination: landlord,
        }),
        txn({
          refPrefix: 'DEMO-RENT',
          amount: '3200.00',
          bookedOffsetSeconds: -1,
          senderBalance: '45200.00',
          receiverBalance: '643400.00',
          source: sara,
          destination: landlord,
        }),
      ];
      const final = txn({
        refPrefix: 'DEMO-MRB-INSTALMENT',
        amount: '5000.00',
        bookedOffsetSeconds: 0,
        senderBalance: '42000.00',
        receiverBalance: '1250340.00',
        source: sara,
        destination: collections,
        islamic: {
          product: 'MURABAHA',
          event: 'INSTALMENT',
          contract_id: reference('MRB-SARA'),
          instalment_no: 10,
          tenor: 40,
          scheduled_amount: '5000.00',
          contract_start: isoDateOffset(-300),
          customer_iban: sara.iban,
        },
      });
      return { setup, final };
    },
  };
}

/* ------------------------------------------------------------------ *
 * L4 — A Takaful claim, a year after cover started.
 * Twin of F5 (the same claim, nine days after cover started).
 * ------------------------------------------------------------------ */

function sampleL4(): Sample {
  return {
    id: 'l4-takaful-claim-year-later',
    label: 'L4 — Takaful claim, a year later',
    group: 'legitimate',
    summary: 'Mona claims 12,000 on her Takaful cover, a year after it started. Expect a quiet score.',
    expected: { alert: false },
    hasSetup: false,
    generate: () => {
      const fund = account({
        bankCode: '050',
        bic: 'ALNOAEAD',
        openedOffsetDays: -3600,
        holder: { type: 'COMPANY', name: 'Al Noor Takaful Fund', refPrefix: 'TKFFUND' },
      });
      const mona = account({
        bankCode: '033',
        openedOffsetDays: -1200,
        holder: { name: 'Mona Saeed', refPrefix: 'MONA' },
      });
      const final = txn({
        refPrefix: 'DEMO-TKF-CLAIM',
        amount: '12000.00',
        bookedOffsetSeconds: 0,
        senderBalance: '5400000.00',
        receiverBalance: '18200.00',
        source: fund,
        destination: mona,
        islamic: {
          product: 'TAKAFUL',
          event: 'CLAIM',
          contract_id: reference('TKF-MONA'),
          contract_start: isoDateOffset(-365),
          customer_iban: mona.iban,
        },
      });
      return noSetup(final);
    },
  };
}

/* ------------------------------------------------------------------ *
 * L5 — Zakat to an established charity.
 * Twin of F6 (the fifth donation to a charity account opened 21 days ago).
 * ------------------------------------------------------------------ */

function sampleL5(): Sample {
  return {
    id: 'l5-zakat-established-charity',
    label: 'L5 — Zakat, established charity',
    group: 'legitimate',
    summary: 'Yusuf pays 1,000 Zakat to a charity that has been open for years. Expect a quiet score.',
    expected: { alert: false },
    hasSetup: false,
    generate: () => {
      const yusuf = account({
        bankCode: '033',
        openedOffsetDays: -2000,
        holder: { name: 'Yusuf Al Falasi', refPrefix: 'YUSUF' },
      });
      const charity = account({
        bankCode: '050',
        bic: 'ALKHAEAD',
        openedOffsetDays: -1500,
        holder: { type: 'COMPANY', name: 'Al Khair Foundation', refPrefix: 'ALKHAIR' },
      });
      const final = txn({
        refPrefix: 'DEMO-ZAKAT',
        amount: '1000.00',
        bookedOffsetSeconds: 0,
        senderBalance: '88000.00',
        receiverBalance: '420000.00',
        source: yusuf,
        destination: charity,
        islamic: { product: 'ZAKAT', event: 'CHARITY' },
      });
      return noSetup(final);
    },
  };
}

/* ------------------------------------------------------------------ *
 * L6 — Commodity Murabaha asset sold on to a different broker.
 * Twin of F4 (the asset sold back to the original supplier).
 * ------------------------------------------------------------------ */

function sampleL6(): Sample {
  return {
    id: 'l6-commodity-different-broker',
    label: 'L6 — Commodity sold to a different broker',
    group: 'legitimate',
    summary:
      "A Murabaha contract's commodity is sold on to a different broker, not back to the original supplier. Expect a quiet score.",
    expected: { alert: false },
    hasSetup: false,
    generate: () => {
      const bank = account({
        bankCode: '070',
        bic: 'ALITAEAD',
        openedOffsetDays: -3000,
        holder: { type: 'COMPANY', name: 'Al Ittihad Islamic Finance', refPrefix: 'AIIF' },
      });
      const broker = account({
        bankCode: '090',
        openedOffsetDays: -1800,
        holder: { type: 'COMPANY', name: 'Gulf Metals Exchange', refPrefix: 'GULFMETAL' },
      });
      // The original supplier never appears as a party on this transaction —
      // that absence is exactly what keeps COMMODITY_ROUND_TRIP from firing.
      const originalSupplier = freshAeIban('090');
      const final = txn({
        refPrefix: 'DEMO-MRB-ASSETSALE',
        amount: '84730.00',
        bookedOffsetSeconds: 0,
        senderBalance: '3100000.00',
        receiverBalance: '960000.00',
        source: bank,
        destination: broker,
        islamic: {
          product: 'MURABAHA',
          event: 'ASSET_SALE',
          contract_id: reference('MRB-METAL'),
          contract_start: isoDateOffset(-60),
          supplier_iban: originalSupplier,
        },
      });
      return noSetup(final);
    },
  };
}

/* ------------------------------------------------------------------ *
 * L7 — Murabaha disbursement, paid to the registered supplier.
 * Twin of F1 (the same disbursement, paid to a friend instead).
 * ------------------------------------------------------------------ */

function sampleL7(): Sample {
  return {
    id: 'l7-disbursement-registered-supplier',
    label: 'L7 — Disbursement to the registered supplier',
    group: 'legitimate',
    summary:
      'A 100,000 Murabaha disbursement is paid to Al Noor Motors, the registered supplier. Expect a quiet score.',
    expected: { alert: false },
    hasSetup: false,
    generate: () => {
      const bank = account({
        bankCode: '070',
        bic: 'ALITAEAD',
        openedOffsetDays: -3000,
        holder: { type: 'COMPANY', name: 'Al Ittihad Islamic Finance', refPrefix: 'AIIF' },
      });
      const supplier = account({
        bankCode: '090',
        openedOffsetDays: -2500,
        holder: { type: 'COMPANY', name: 'Al Noor Motors', refPrefix: 'ALNOOR' },
      });
      const final = txn({
        refPrefix: 'DEMO-MRB-DISBURSE',
        amount: '100000.00',
        bookedOffsetSeconds: 0,
        senderBalance: '5000000.00',
        receiverBalance: '310000.00',
        source: bank,
        destination: supplier,
        islamic: {
          product: 'MURABAHA',
          event: 'DISBURSEMENT',
          contract_id: reference('MRB-CAR'),
          contract_start: isoDateOffset(0),
          supplier_iban: supplier.iban,
        },
      });
      return noSetup(final);
    },
  };
}

/* ------------------------------------------------------------------ *
 * F1 — Murabaha disbursement, paid to Ahmed's friend instead of the supplier.
 * ------------------------------------------------------------------ */

function sampleF1(): Sample {
  return {
    id: 'f1-disbursement-wrong-recipient',
    label: 'F1 — Disbursement to the wrong recipient',
    group: 'fraud',
    summary:
      "A 100,000 Murabaha disbursement is paid to Ahmed's friend Khalid instead of Al Noor Motors, the registered supplier. Expect an alert.",
    expected: { alert: true, added: ['MURABAHA_SUPPLIER_MISMATCH'], severity: 'HIGH' },
    hasSetup: false,
    generate: () => {
      const bank = account({
        bankCode: '070',
        bic: 'ALITAEAD',
        openedOffsetDays: -3000,
        holder: { type: 'COMPANY', name: 'Al Ittihad Islamic Finance', refPrefix: 'AIIF' },
      });
      const friend = account({
        bankCode: '033',
        openedOffsetDays: -60,
        holder: { name: "Khalid bin Rashid", refPrefix: 'KHALID' },
      });
      // Al Noor Motors is the registered supplier, but never receives the money.
      const registeredSupplier = freshAeIban('090');
      const final = txn({
        refPrefix: 'DEMO-MRB-DISBURSE-FRAUD',
        amount: '100000.00',
        bookedOffsetSeconds: 0,
        senderBalance: '5000000.00',
        receiverBalance: '400.00',
        source: bank,
        destination: friend,
        islamic: {
          product: 'MURABAHA',
          event: 'DISBURSEMENT',
          contract_id: reference('MRB-CAR'),
          contract_start: isoDateOffset(0),
          supplier_iban: registeredSupplier,
        },
      });
      return noSetup(final);
    },
  };
}

/* ------------------------------------------------------------------ *
 * F2 — Murabaha instalment, paid from a stranger's account.
 * ------------------------------------------------------------------ */

function sampleF2(): Sample {
  return {
    id: 'f2-instalment-third-party',
    label: 'F2 — Instalment from a stranger',
    group: 'fraud',
    summary:
      "Instalment 8 of 36 on Sara's Murabaha is paid from a stranger's account, opened two weeks " +
      'ago. Two independent reasons — an unrelated payer, and that account being brand new — ' +
      'corroborate each other. Expect an alert.',
    expected: { alert: true, added: ['THIRD_PARTY_REPAYMENT'], severity: 'HIGH' },
    hasSetup: false,
    generate: () => {
      const sara = account({
        bankCode: '033',
        openedOffsetDays: -900,
        holder: { name: 'Sara Al Mazrouei', refPrefix: 'SARA' },
      });
      const stranger = account({
        bankCode: '033',
        openedOffsetDays: -14,
        holder: { name: 'Hassan Al Marri', refPrefix: 'STRANGER' },
      });
      const collections = account({
        bankCode: '070',
        bic: 'ALITAEAD',
        openedOffsetDays: -3000,
        holder: { type: 'COMPANY', name: 'Al Ittihad Islamic Finance', refPrefix: 'AIIF' },
      });
      const final = txn({
        refPrefix: 'DEMO-MRB-INSTALMENT-FRAUD',
        amount: '4215.60',
        bookedOffsetSeconds: 0,
        senderBalance: '9000.00',
        receiverBalance: '1250340.00',
        source: stranger,
        destination: collections,
        islamic: {
          product: 'MURABAHA',
          event: 'INSTALMENT',
          contract_id: reference('MRB-SARA'),
          instalment_no: 8,
          tenor: 36,
          scheduled_amount: '4215.60',
          contract_start: isoDateOffset(-240),
          customer_iban: sara.iban,
        },
      });
      return noSetup(final);
    },
  };
}

/* ------------------------------------------------------------------ *
 * F3 — Omar's early settlement, funded by six strangers within hours.
 * ------------------------------------------------------------------ */

function sampleF3(): Sample {
  return {
    id: 'f3-settlement-funded-by-fan-in',
    label: 'F3 — Settlement funded by a fan-in',
    group: 'fraud',
    summary:
      'Omar settles 150,000 early, moments after six strangers deposit 25,000 each into his account. Expect an alert.',
    expected: { alert: true, added: ['SETTLEMENT_FUNDED_BY_FAN_IN'], severity: 'HIGH' },
    hasSetup: true,
    generate: () => {
      const omar = account({
        bankCode: '033',
        openedOffsetDays: -1600,
        holder: { name: 'Omar Nasser', refPrefix: 'OMAR' },
      });
      const settlements = account({
        bankCode: '070',
        bic: 'ALITAEAD',
        openedOffsetDays: -3000,
        holder: { type: 'COMPANY', name: 'Al Ittihad Islamic Finance', refPrefix: 'AIIF' },
      });
      const setup = Array.from({ length: 6 }, (_, i) => {
        const sender = account({
          bankCode: '033',
          openedOffsetDays: -(200 + i * 30),
          holder: { name: `Depositor ${i + 1}`, refPrefix: 'DEPOSIT' },
        });
        return txn({
          refPrefix: 'DEMO-FANIN',
          amount: '25000.00',
          bookedOffsetSeconds: -(7 - i),
          senderBalance: '40000.00',
          receiverBalance: String(1000 + i * 25000) + '.00',
          source: sender,
          destination: omar,
        });
      });
      const final = txn({
        refPrefix: 'DEMO-MRB-SETTLE-FANIN',
        amount: '150000.00',
        bookedOffsetSeconds: 0,
        senderBalance: '150500.00',
        receiverBalance: '2200000.00',
        source: omar,
        destination: settlements,
        islamic: {
          product: 'MURABAHA',
          event: 'EARLY_SETTLEMENT',
          contract_id: reference('MRB-OMAR'),
          contract_start: isoDateOffset(-300),
          customer_iban: omar.iban,
        },
      });
      return { setup, final };
    },
  };
}

/* ------------------------------------------------------------------ *
 * F4 — Murabaha commodity sold back to the original supplier.
 * ------------------------------------------------------------------ */

function sampleF4(): Sample {
  return {
    id: 'f4-commodity-round-trip',
    label: 'F4 — Commodity sold back to the supplier',
    group: 'fraud',
    summary:
      'The metal bought under a Murabaha contract is sold back to Supplier X, three days after the contract started. Expect an alert.',
    expected: { alert: true, added: ['COMMODITY_ROUND_TRIP'], severity: 'HIGH' },
    hasSetup: false,
    generate: () => {
      const bank = account({
        bankCode: '070',
        bic: 'ALITAEAD',
        openedOffsetDays: -3000,
        holder: { type: 'COMPANY', name: 'Al Ittihad Islamic Finance', refPrefix: 'AIIF' },
      });
      const supplierX = account({
        bankCode: '090',
        openedOffsetDays: -400,
        holder: { type: 'COMPANY', name: 'Supplier X Trading', refPrefix: 'SUPPX' },
      });
      const final = txn({
        refPrefix: 'DEMO-MRB-ROUNDTRIP',
        amount: '84500.00',
        bookedOffsetSeconds: 0,
        senderBalance: '3100000.00',
        receiverBalance: '220000.00',
        source: bank,
        destination: supplierX,
        islamic: {
          product: 'MURABAHA',
          event: 'ASSET_SALE',
          contract_id: reference('MRB-METALRT'),
          contract_start: isoDateOffset(-3),
          supplier_iban: supplierX.iban,
        },
      });
      return noSetup(final);
    },
  };
}

/* ------------------------------------------------------------------ *
 * F5 — Takaful claim, nine days after cover started.
 * ------------------------------------------------------------------ */

function sampleF5(): Sample {
  return {
    id: 'f5-takaful-early-claim',
    label: 'F5 — Takaful claim, nine days in, to a stranger',
    group: 'fraud',
    summary:
      "Khalid's Takaful cover pays out 40,000 nine days after it started, to an unrelated account " +
      "opened last week — not Khalid's own. Two independent reasons on their own: an early claim, " +
      'and a payee who is not the participant. Expect an alert.',
    expected: { alert: true, added: ['TAKAFUL_EARLY_CLAIM'], severity: 'HIGH' },
    hasSetup: false,
    generate: () => {
      const fund = account({
        bankCode: '050',
        bic: 'ALNOAEAD',
        openedOffsetDays: -3600,
        holder: { type: 'COMPANY', name: 'Al Noor Takaful Fund', refPrefix: 'TKFFUND' },
      });
      const khalid = account({
        bankCode: '033',
        openedOffsetDays: -900,
        holder: { name: 'Khalid Mansouri', refPrefix: 'KHALIDM' },
      });
      const payee = account({
        bankCode: '033',
        openedOffsetDays: -7,
        holder: { name: 'Unrelated Payee', refPrefix: 'TKFPAYEE' },
      });
      const final = txn({
        refPrefix: 'DEMO-TKF-CLAIM-EARLY',
        amount: '40000.00',
        bookedOffsetSeconds: 0,
        senderBalance: '5400000.00',
        receiverBalance: '900.00',
        source: fund,
        destination: payee,
        islamic: {
          product: 'TAKAFUL',
          event: 'CLAIM',
          contract_id: reference('TKF-KHALID'),
          contract_start: isoDateOffset(-9),
          customer_iban: khalid.iban,
        },
      });
      return noSetup(final);
    },
  };
}

/* ------------------------------------------------------------------ *
 * F6 — The fifth Zakat donation in a month, to a very new account.
 * ------------------------------------------------------------------ */

function sampleF6(): Sample {
  return {
    id: 'f6-charity-diversion',
    label: 'F6 — The fifth donation, a personal account',
    group: 'fraud',
    summary:
      '"Helping Hands" — a PERSON account, not a registered organisation — opened 21 days ago, ' +
      'receives its fifth Zakat donation (2,500) from a fifth distinct sender within minutes. Two ' +
      'independent reasons: a brand-new account with several donors, and a personal, not registered, ' +
      'recipient. Expect an alert.',
    expected: { alert: true, added: ['CHARITY_DIVERSION'], severity: 'HIGH' },
    hasSetup: true,
    generate: () => {
      const charity = account({
        bankCode: '061',
        openedOffsetDays: -21,
        holder: { name: 'Helping Hands', refPrefix: 'HELPHANDS' },
      });
      const setup = Array.from({ length: 4 }, (_, i) => {
        const donor = account({
          bankCode: '033',
          openedOffsetDays: -(600 + i * 40),
          holder: { name: `Donor ${i + 1}`, refPrefix: 'DONOR' },
        });
        return txn({
          refPrefix: 'DEMO-ZAKAT-SETUP',
          amount: '1000.00',
          bookedOffsetSeconds: -(4 - i),
          senderBalance: '50000.00',
          receiverBalance: String(2000 + i * 1000) + '.00',
          source: donor,
          destination: charity,
          islamic: { product: 'ZAKAT', event: 'CHARITY' },
        });
      });
      const fifthDonor = account({
        bankCode: '033',
        openedOffsetDays: -500,
        holder: { name: 'Donor 5', refPrefix: 'DONOR' },
      });
      const final = txn({
        refPrefix: 'DEMO-ZAKAT-FRAUD',
        amount: '2500.00',
        bookedOffsetSeconds: 0,
        senderBalance: '18000.00',
        receiverBalance: '6500.00',
        source: fifthDonor,
        destination: charity,
        islamic: { product: 'ZAKAT', event: 'CHARITY' },
      });
      return { setup, final };
    },
  };
}

/* ------------------------------------------------------------------ *
 * F7 — Ijara rental "51 of 48": a warning, not an alert on its own.
 * ------------------------------------------------------------------ */

function sampleF7(): Sample {
  return {
    id: 'f7-rental-instalment-overrun',
    label: 'F7 — Rental 51 of 48 (warning only)',
    group: 'fraud',
    summary:
      'An Ijara rental is logged as instalment 51 of a 48-payment contract. The terms contradict each other, but this alone does not raise a case.',
    expected: { alert: false, added: ['CONTRACT_INCOHERENT'], severity: 'MEDIUM' },
    hasSetup: false,
    generate: () => {
      const tenant = account({
        bankCode: '033',
        openedOffsetDays: -1600,
        holder: { name: 'Fatima Al Shamsi', refPrefix: 'FATIMA' },
      });
      const lessor = account({
        bankCode: '070',
        bic: 'ALITAEAD',
        openedOffsetDays: -3000,
        holder: { type: 'COMPANY', name: 'Al Ittihad Islamic Finance', refPrefix: 'AIIF' },
      });
      const final = txn({
        refPrefix: 'DEMO-IJR-RENTAL-OVERRUN',
        amount: '3800.00',
        bookedOffsetSeconds: 0,
        senderBalance: '55000.00',
        receiverBalance: '980000.00',
        source: tenant,
        destination: lessor,
        islamic: {
          product: 'IJARA',
          event: 'RENTAL',
          contract_id: reference('IJR-FATIMA'),
          instalment_no: 51,
          tenor: 48,
          scheduled_amount: '3800.00',
          contract_start: isoDateOffset(-1460),
          customer_iban: tenant.iban,
        },
      });
      return noSetup(final);
    },
  };
}

/* ------------------------------------------------------------------ *
 * F8 — An early settlement far above what the schedule says is left.
 * ------------------------------------------------------------------ */

function sampleF8(): Sample {
  return {
    id: 'f8-settlement-exceeds-schedule',
    label: 'F8 — Settlement exceeds the schedule',
    group: 'fraud',
    summary:
      'Ali pays 130,000 to settle a Murabaha with only 90,000 left on the schedule. Expect CONTRACT_INCOHERENT, with the drain NOT set aside — an alert.',
    expected: { alert: true, added: ['CONTRACT_INCOHERENT'], severity: 'MEDIUM' },
    hasSetup: false,
    generate: () => {
      const ali = account({
        bankCode: '033',
        openedOffsetDays: -1300,
        holder: { name: 'Ali Al Zaabi', refPrefix: 'ALI' },
      });
      const settlements = account({
        bankCode: '070',
        bic: 'ALITAEAD',
        openedOffsetDays: -3000,
        holder: { type: 'COMPANY', name: 'Al Ittihad Islamic Finance', refPrefix: 'AIIF' },
      });
      const final = txn({
        refPrefix: 'DEMO-MRB-SETTLE-OVER',
        amount: '130000.00',
        bookedOffsetSeconds: 0,
        senderBalance: '130000.00',
        receiverBalance: '2200000.00',
        source: ali,
        destination: settlements,
        islamic: {
          product: 'MURABAHA',
          event: 'EARLY_SETTLEMENT',
          contract_id: reference('MRB-ALI'),
          instalment_no: 28,
          tenor: 36,
          scheduled_amount: '10000.00',
          contract_start: isoDateOffset(-800),
          customer_iban: ali.iban,
        },
      });
      return noSetup(final);
    },
  };
}

/* ------------------------------------------------------------------ *
 * W1 — A father pays his daughter's Murabaha instalment from his own,
 * long-established account: THIRD_PARTY_REPAYMENT fires, but nothing
 * corroborates it — a warning, not an alert.
 * ------------------------------------------------------------------ */

function sampleW1(): Sample {
  return {
    id: 'w1-instalment-paid-by-father',
    label: 'W1 — Instalment paid by her father (warning only)',
    group: 'warning',
    summary:
      "Sara's instalment is paid by her father Rashid, from an account he has held for years. The " +
      'payer is not the customer — a risk signal — but nothing else about it is unusual, so it stays ' +
      'a MEDIUM warning, not an alert.',
    expected: { alert: false, added: ['THIRD_PARTY_REPAYMENT'], severity: 'MEDIUM' },
    hasSetup: false,
    generate: () => {
      const sara = account({
        bankCode: '033',
        openedOffsetDays: -900,
        holder: { name: 'Sara Al Mazrouei', refPrefix: 'SARA' },
      });
      const father = account({
        bankCode: '033',
        openedOffsetDays: -4500,
        holder: { name: 'Rashid Al Mazrouei', refPrefix: 'RASHID' },
      });
      const collections = account({
        bankCode: '070',
        bic: 'ALITAEAD',
        openedOffsetDays: -3000,
        holder: { type: 'COMPANY', name: 'Al Ittihad Islamic Finance', refPrefix: 'AIIF' },
      });
      const final = txn({
        refPrefix: 'DEMO-MRB-INSTALMENT-FAMILY',
        amount: '4215.60',
        bookedOffsetSeconds: 0,
        senderBalance: '210000.00',
        receiverBalance: '1250340.00',
        source: father,
        destination: collections,
        islamic: {
          product: 'MURABAHA',
          event: 'INSTALMENT',
          contract_id: reference('MRB-SARA'),
          instalment_no: 8,
          tenor: 36,
          scheduled_amount: '4215.60',
          contract_start: isoDateOffset(-240),
          customer_iban: sara.iban,
        },
      });
      return noSetup(final);
    },
  };
}

/* ------------------------------------------------------------------ *
 * W2 — Takaful claim nine days in, paid to Fatima's own account: the early
 * claim fires, but the payee is the participant, so there is no second
 * reason — a warning, not an alert.
 * ------------------------------------------------------------------ */

function sampleW2(): Sample {
  return {
    id: 'w2-takaful-early-claim-own-account',
    label: 'W2 — Takaful claim, nine days in, own account (warning only)',
    group: 'warning',
    summary:
      'Fatima claims 18,000 on her Takaful cover nine days after it started, paid to her own, ' +
      'long-held account. The early claim is a risk signal, but paying the participant herself is ' +
      'not a second reason, so it stays a MEDIUM warning, not an alert.',
    expected: { alert: false, added: ['TAKAFUL_EARLY_CLAIM'], severity: 'MEDIUM' },
    hasSetup: false,
    generate: () => {
      const fund = account({
        bankCode: '050',
        bic: 'ALNOAEAD',
        openedOffsetDays: -3600,
        holder: { type: 'COMPANY', name: 'Al Noor Takaful Fund', refPrefix: 'TKFFUND' },
      });
      const fatima = account({
        bankCode: '033',
        openedOffsetDays: -1600,
        holder: { name: 'Fatima Al Shamsi', refPrefix: 'FATIMATKF' },
      });
      const final = txn({
        refPrefix: 'DEMO-TKF-CLAIM-OWN',
        amount: '18000.00',
        bookedOffsetSeconds: 0,
        senderBalance: '5400000.00',
        receiverBalance: '24000.00',
        source: fund,
        destination: fatima,
        islamic: {
          product: 'TAKAFUL',
          event: 'CLAIM',
          contract_id: reference('TKF-FATIMA'),
          contract_start: isoDateOffset(-9),
          customer_iban: fatima.iban,
        },
      });
      return noSetup(final);
    },
  };
}

/* ------------------------------------------------------------------ *
 * W3 — The fifth Zakat donation in a month, to a three-week-old registered
 * mosque (COMPANY, not a person): the base signal fires, and being a
 * registered organisation does not by itself corroborate it to HIGH.
 *
 * Verified live: five fresh donors into one otherwise-quiet account, on
 * their own, do NOT trip core's network analyzer the way the same shape does
 * inside the dense synthetic book (civitas_islamic/book.py's measurement) —
 * that needs a busier surrounding ledger. Were core network evidence ever to
 * fire on a sample like this, it would open the alert regardless of the
 * layer's own MEDIUM severity; this sample just does not, by itself, reach
 * that. If a future engine change makes it fire here too, update `expected`
 * to match and say so in the summary — do not just weaken the assertion.
 * ------------------------------------------------------------------ */

function sampleW3(): Sample {
  return {
    id: 'w3-charity-registered-organisation',
    label: 'W3 — The fifth donation, a registered mosque (warning only)',
    group: 'warning',
    summary:
      'A mosque registered three weeks ago receives its fifth Zakat donation (2,500) from a fifth ' +
      'distinct sender within minutes. The base signal fires, but being a registered organisation, ' +
      'not a person, does not by itself corroborate it to HIGH — it stays a MEDIUM warning, not an ' +
      'alert.',
    expected: {
      alert: false,
      added: ['CHARITY_DIVERSION'],
      severity: 'MEDIUM',
    },
    hasSetup: true,
    generate: () => {
      const mosque = account({
        bankCode: '061',
        openedOffsetDays: -21,
        holder: { type: 'COMPANY', name: 'Al Furqan Mosque', refPrefix: 'MOSQUE' },
      });
      const setup = Array.from({ length: 4 }, (_, i) => {
        const donor = account({
          bankCode: '033',
          openedOffsetDays: -(600 + i * 40),
          holder: { name: `Worshipper ${i + 1}`, refPrefix: 'WORSHIP' },
        });
        return txn({
          refPrefix: 'DEMO-ZAKAT-MOSQUE-SETUP',
          amount: '1000.00',
          bookedOffsetSeconds: -(4 - i),
          senderBalance: '50000.00',
          receiverBalance: String(2000 + i * 1000) + '.00',
          source: donor,
          destination: mosque,
          islamic: { product: 'ZAKAT', event: 'CHARITY' },
        });
      });
      const fifthDonor = account({
        bankCode: '033',
        openedOffsetDays: -500,
        holder: { name: 'Worshipper 5', refPrefix: 'WORSHIP' },
      });
      const final = txn({
        refPrefix: 'DEMO-ZAKAT-MOSQUE',
        amount: '2500.00',
        bookedOffsetSeconds: 0,
        senderBalance: '18000.00',
        receiverBalance: '6500.00',
        source: fifthDonor,
        destination: mosque,
        islamic: { product: 'ZAKAT', event: 'CHARITY' },
      });
      return { setup, final };
    },
  };
}

export const SAMPLES: readonly Sample[] = [
  sampleL1(),
  sampleL2(),
  sampleL3(),
  sampleL4(),
  sampleL5(),
  sampleL6(),
  sampleL7(),
  sampleF1(),
  sampleF2(),
  sampleF3(),
  sampleF4(),
  sampleF5(),
  sampleF6(),
  sampleF7(),
  sampleF8(),
  sampleW1(),
  sampleW2(),
  sampleW3(),
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
  islamic: emptyIslamic(),
  metadata: [],
};

// Exported for tests only — not part of the page's public surface.
export const __test__ = { freshAeIban, ibanCheckDigits, mod97, localDateTime, isoDateOffset };
