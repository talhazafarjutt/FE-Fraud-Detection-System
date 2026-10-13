import { ISLAMIC, ISLAMIC_FIXTURES } from './islamic';

/**
 * Demo mode's contract register (`/v1/islamic/contracts`), shaped like
 * civitas_islamic/register_routes.py answers it: IBANs as their last four
 * only, the schedule computed from the first due date, and every payment the
 * demo ledger holds on a contract — with its score, alert and what the layer
 * added or set aside — newest first.
 *
 * Three of the four Islamic demo transactions name a registered contract;
 * the Takaful claim's contract is deliberately unregistered, and one
 * Musharaka contract belongs to team-beta so team scoping shows.
 */

export interface MockContract {
  contract_id: string;
  product: string;
  status: string;
  team: string;
  customer_iban_last4: string;
  supplier_iban_last4: string | null;
  asset_id: string | null;
  contract_start: string;
  tenor: number | null;
  scheduled_amount: string | null;
  first_due_date: string | null;
  frequency_months: number;
  financed_amount: string | null;
  approved_payers: { iban_last4: string }[];
  created_at: string;
  updated_at: string;
}

export interface MockPayment {
  contract_id: string;
  team: string;
  transaction_id: string;
  booked_at: string;
  amount: string;
  currency: string;
  event: string | null;
  instalment_no: number | null;
  risk_score: number | null;
  risk_level: string | null;
  alert_id: string | null;
  alert_severity: string | null;
  alert_status: string | null;
  rules_added: string[];
  rules_set_aside: string[];
}

const PRODUCT_LABELS: Record<string, string> = {
  MURABAHA: 'Murabaha',
  IJARA: 'Ijara',
  MUSHARAKA: 'Musharaka',
  MUDARABA: 'Mudaraba',
  SUKUK: 'Sukuk',
  TAKAFUL: 'Takaful',
  QARD_HASAN: 'Qard Hasan',
};

export const CONTRACT_STATUS_TRANSITIONS: Record<string, readonly string[]> = {
  ACTIVE: ['SETTLED', 'CANCELLED', 'DEFAULTED'],
  DEFAULTED: ['SETTLED'],
  SETTLED: [],
  CANCELLED: [],
};

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const dateAgo = (days: number) => daysAgo(days).slice(0, 10);

/** civitas_islamic/schedule.py add_months: the day clamped to the month's length. */
export function addMonths(iso: string, months: number): string {
  const [year = 0, month = 1, day = 1] = iso.split('-').map(Number);
  const index = month - 1 + months;
  const y = year + Math.floor(index / 12);
  const m = ((index % 12) + 12) % 12;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, last))).toISOString().slice(0, 10);
}

/** At most 120 listed, as the API does. */
export function scheduleOf(contract: MockContract) {
  if (!contract.first_due_date || !contract.tenor) return [];
  return Array.from({ length: Math.min(contract.tenor, 120) }, (_, i) => ({
    instalment_no: i + 1,
    due_date: addMonths(contract.first_due_date!, i * contract.frequency_months),
    amount: contract.scheduled_amount,
  }));
}

function contract(
  spec: Partial<MockContract> & Pick<MockContract, 'contract_id' | 'product' | 'customer_iban_last4'>,
): MockContract {
  const created = daysAgo(400);
  return {
    status: 'ACTIVE',
    team: 'team-alpha',
    supplier_iban_last4: null,
    asset_id: null,
    contract_start: dateAgo(400),
    tenor: null,
    scheduled_amount: null,
    first_due_date: null,
    frequency_months: 1,
    financed_amount: null,
    approved_payers: [],
    created_at: created,
    updated_at: created,
    ...spec,
  };
}

export const CONTRACT_FIXTURES: readonly MockContract[] = [
  contract({
    contract_id: 'MRB-2026-0187',
    product: 'MURABAHA',
    customer_iban_last4: '4471',
    supplier_iban_last4: '2208',
    asset_id: 'INV-2024-88112',
    contract_start: dateAgo(660),
    tenor: 36,
    scheduled_amount: '12283.33',
    first_due_date: dateAgo(630),
    financed_amount: '442200.00',
  }),
  contract({
    contract_id: 'MRB-2026-0412',
    product: 'MURABAHA',
    customer_iban_last4: '6650',
    supplier_iban_last4: '3017',
    contract_start: dateAgo(240),
    tenor: 36,
    scheduled_amount: '4215.60',
    first_due_date: dateAgo(210),
  }),
  contract({
    contract_id: 'IJR-2025-0093',
    product: 'IJARA',
    customer_iban_last4: '1185',
    contract_start: dateAgo(420),
    tenor: 60,
    scheduled_amount: '12000.00',
    first_due_date: addMonths(dateAgo(0), -13),
    approved_payers: [{ iban_last4: '7342' }],
  }),
  contract({
    contract_id: 'QRD-2024-0311',
    product: 'QARD_HASAN',
    status: 'SETTLED',
    customer_iban_last4: '9024',
    contract_start: dateAgo(800),
    tenor: 12,
    scheduled_amount: '1500.00',
    first_due_date: dateAgo(770),
    financed_amount: '18000.00',
  }),
  contract({
    contract_id: 'MSK-2026-0007',
    product: 'MUSHARAKA',
    team: 'team-beta',
    customer_iban_last4: '5530',
    contract_start: dateAgo(90),
    tenor: 24,
    scheduled_amount: '8800.00',
    first_due_date: dateAgo(60),
  }),
];

/** Payments on registered contracts, read off the Islamic demo transactions. */
export const PAYMENT_FIXTURES: readonly MockPayment[] = ISLAMIC_FIXTURES.flatMap((fixture) => {
  const finding = fixture.score.layer_findings[ISLAMIC];
  const contractId = finding?.facts.contract_id;
  if (!finding || !contractId || !CONTRACT_FIXTURES.some((c) => c.contract_id === contractId)) {
    return [];
  }
  return [
    {
      contract_id: contractId,
      team: fixture.team,
      transaction_id: fixture.transaction.id,
      booked_at: fixture.transaction.booked_at,
      amount: fixture.transaction.amount,
      currency: fixture.transaction.currency,
      event: finding.facts.event ?? null,
      instalment_no: finding.facts.instalment_no ?? null,
      risk_score: fixture.score.risk_score,
      risk_level: fixture.score.risk_level,
      alert_id: fixture.alert?.id ?? null,
      alert_severity: fixture.alert ? String(fixture.alert.severity) : null,
      alert_status: fixture.alert ? String(fixture.alert.status) : null,
      rules_added: finding.added.map((rule) => rule.rule),
      rules_set_aside: finding.set_aside.map((rule) => rule.rule),
    },
  ];
});

/** ContractOut. */
export function contractOut(entry: MockContract) {
  return { ...entry, product_label: PRODUCT_LABELS[entry.product] ?? entry.product };
}

/** ContractListItem: ContractOut plus what the visible ledger holds on it. */
export function contractListItem(entry: MockContract, payments: readonly MockPayment[]) {
  const mine = payments.filter((p) => p.contract_id === entry.contract_id);
  const last = mine.map((p) => p.booked_at).sort().at(-1) ?? null;
  return {
    ...contractOut(entry),
    payments_seen: mine.length,
    alerts: mine.filter((p) => p.alert_id).length,
    last_payment_at: last,
  };
}

/** ContractDetailOut: the list item, its schedule, and its payments newest first. */
export function contractDetail(entry: MockContract, payments: readonly MockPayment[]) {
  const mine = payments
    .filter((p) => p.contract_id === entry.contract_id)
    .sort((a, b) => b.booked_at.localeCompare(a.booked_at))
    .map(({ contract_id: _contract, team: _team, ...payment }) => payment);
  return { ...contractListItem(entry, payments), schedule: scheduleOf(entry), payments: mine };
}
