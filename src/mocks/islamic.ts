import type { AlertDetail } from '@/api/schemas/alerts';
import type { LayerFindings } from '@/api/schemas/layers';
import type { Transaction } from '@/api/schemas/transactions';
import { USER_FIXTURES } from './fixtures';
import type { MockCase } from './investigation';

/**
 * Demo mode with the Islamic layer ON: `/v1/meta`, a few Islamic transactions
 * and the summary endpoint.
 *
 * Scores follow the backend exactly, so the demo cannot teach a wrong rule:
 * risk = 0.6 model + 0.25 rule + 0.1 anomaly + 0.05 network (rule signal 100
 * for a HIGH rule, 60 for MEDIUM), then a HIGH rule floors the score at 70 and
 * a MEDIUM one at 30. A layer's set-aside or added rule re-blends the score
 * with the same weights. An alert opens at 70 or above (or on network
 * evidence), so none of these is LOW, and severity follows the 70 / 90 bands.
 */

export const ISLAMIC = 'islamic';

const CORE_TYPOLOGIES = [
  'MULE_RING',
  'STRUCTURING',
  'ACCOUNT_TAKEOVER',
  'INVOICE_REDIRECTION',
  'LAYERING',
];

const ISLAMIC_TYPOLOGIES = [
  'MURABAHA_FICTITIOUS_ASSET',
  'THIRD_PARTY_REPAYMENT',
  'SETTLEMENT_LAUNDERING',
  'COMMODITY_ROUND_TRIP',
  'TAKAFUL_CLAIM_FRAUD',
  'CHARITY_DIVERSION',
];

export const ISLAMIC_PRODUCTS = [
  { code: 'MURABAHA', label: 'Murabaha', events: ['DISBURSEMENT', 'INSTALMENT', 'EARLY_SETTLEMENT', 'ASSET_SALE'] },
  { code: 'IJARA', label: 'Ijara', events: ['DISBURSEMENT', 'RENTAL', 'EARLY_SETTLEMENT'] },
  { code: 'MUSHARAKA', label: 'Musharaka', events: ['DISBURSEMENT', 'INSTALMENT', 'EARLY_SETTLEMENT', 'PROFIT_DISTRIBUTION'] },
  { code: 'MUDARABA', label: 'Mudaraba', events: ['DISBURSEMENT', 'PROFIT_DISTRIBUTION'] },
  { code: 'SUKUK', label: 'Sukuk', events: ['PROFIT_DISTRIBUTION'] },
  { code: 'TAKAFUL', label: 'Takaful', events: ['CONTRIBUTION', 'CLAIM'] },
  { code: 'QARD_HASAN', label: 'Qard Hasan', events: ['DISBURSEMENT', 'INSTALMENT', 'EARLY_SETTLEMENT'] },
  { code: 'ZAKAT', label: 'Zakat', events: ['CHARITY'] },
].map((product) => ({ layer: ISLAMIC, ...product }));

/** `GET /v1/meta` as the live deployment with `LAYERS=civitas_islamic` answers it. */
export const META_FIXTURE = {
  layers: [ISLAMIC],
  typologies: [...CORE_TYPOLOGIES, ...ISLAMIC_TYPOLOGIES],
  products: ISLAMIC_PRODUCTS,
};

const ENGINE = { model_name: 'fixture-rules', model_version: 'fixture-v1', risk_engine_version: 'engine-v1.2.0' };
// The seeded team-alpha analyst and supervisor, so names resolve in the directory.
const ANALYST = USER_FIXTURES.find((u) => u.email === 'analyst@example.com')!.id;
const SUPERVISOR = USER_FIXTURES.find((u) => u.email === 'supervisor@example.com')!.id;

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

interface IslamicFixture {
  team: string;
  transaction: Transaction;
  score: Record<string, unknown> & {
    risk_score: number;
    risk_level: string;
    layer_findings: LayerFindings;
  };
  alert: AlertDetail | null;
}

/* ------------------------------------------------------------------ *
 * 1. Murabaha early settlement. ORIGIN_ACCOUNT_DRAIN fires on the engine
 *    (the account is emptied) and the layer sets it aside: 70 -> 5.4, no alert.
 * ------------------------------------------------------------------ */
const SETTLEMENT_TXN = '5a1c0e10-7d1e-4c11-9a01-000000000101';
const settlement: IslamicFixture = {
  team: 'team-alpha',
  transaction: {
    id: SETTLEMENT_TXN,
    external_ref: 'ISL-MRB-0187-ES',
    amount: '184250.00',
    currency: 'AED',
    booked_at: minutesAgo(35),
    transaction_type: 'PAYMENT',
    mcc: null,
    sender_balance_before: '184300.00',
    receiver_balance_before: '2500000.00',
    scoring_status: 'COMPLETE',
    src_account_last4: '4471',
    dst_account_last4: '9001',
  },
  score: {
    ...ENGINE,
    risk_score: 5.4,
    risk_level: 'LOW',
    model_decision: 'ALLOW',
    latency_ms: 41,
    scored_at: minutesAgo(35),
    explanation: [{ feature: 'amount', contribution: -0.04 }],
    signals: {
      model_score: 4,
      rule_score: 0,
      anomaly_score: 30,
      network_score: 0,
      weighted_score: 5.4,
      rule_floor_applied: false,
    },
    triggered_rules: [],
    decision_reasons: [],
    layer_findings: {
      [ISLAMIC]: {
        facts: {
          product: 'MURABAHA',
          event: 'EARLY_SETTLEMENT',
          contract_id: 'MRB-2026-0187',
          // As the live layer sends it: the instalment the settlement is made at.
          instalment_no: 22,
          tenor: 36,
        },
        added: [],
        set_aside: [
          {
            rule: 'ORIGIN_ACCOUNT_DRAIN',
            severity: 'HIGH',
            description:
              'The PAYMENT amount of 184,250.00 is within 1.0% of the origin balance of 184,300.00.',
            reason: 'Scheduled early settlement of contract MRB-2026-0187 empties the account by design.',
          },
        ],
        score_before: 70,
        score_after: 5.4,
      },
    },
  },
  alert: null,
};

/* ------------------------------------------------------------------ *
 * 2. Murabaha instalment 8/36 paid from an account that is not the
 *    customer's. The layer adds THIRD_PARTY_REPAYMENT (HIGH): 12.2 -> 70, HIGH.
 * ------------------------------------------------------------------ */
const REPAYMENT_TXN = '5a1c0e10-7d1e-4c11-9a01-000000000102';
const REPAYMENT_ALERT = '5a1c0e10-7d1e-4c11-9a01-000000000202';
const REPAYMENT_CASE = '5a1c0e10-7d1e-4c11-9a01-000000000302';
const REPAYMENT_SCORE = '5a1c0e10-7d1e-4c11-9a01-000000000402';
const repaymentRule = {
  rule: 'THIRD_PARTY_REPAYMENT',
  severity: 'HIGH',
  description:
    'Instalment 8 of contract MRB-2026-0412 was paid from an account that is not the customer’s.',
  source: ISLAMIC,
};
const repaymentFacts = {
  product: 'MURABAHA',
  event: 'INSTALMENT',
  contract_id: 'MRB-2026-0412',
  instalment_no: 8,
  tenor: 36,
};
const repaymentFindings: LayerFindings = {
  [ISLAMIC]: {
    facts: repaymentFacts,
    added: [repaymentRule],
    set_aside: [],
    score_before: 12.2,
    score_after: 70,
  },
};
const repaymentSignals = {
  model_score: 12,
  rule_score: 100,
  anomaly_score: 40,
  network_score: 20,
  weighted_score: 37.2,
  rule_floor_applied: true,
};
const repaymentOpened = minutesAgo(18);
const repayment: IslamicFixture = {
  team: 'team-alpha',
  transaction: {
    id: REPAYMENT_TXN,
    external_ref: 'ISL-MRB-0412-I08',
    amount: '6250.00',
    currency: 'AED',
    booked_at: repaymentOpened,
    transaction_type: 'TRANSFER',
    mcc: null,
    sender_balance_before: '41800.00',
    receiver_balance_before: '2500000.00',
    scoring_status: 'COMPLETE',
    src_account_last4: '7720',
    dst_account_last4: '9001',
  },
  score: {
    ...ENGINE,
    risk_score: 70,
    risk_level: 'HIGH',
    model_decision: 'ALLOW',
    latency_ms: 38,
    scored_at: repaymentOpened,
    explanation: [
      { feature: 'amount', contribution: -0.03 },
      { feature: 'new_beneficiary', contribution: 0.05 },
    ],
    signals: repaymentSignals,
    triggered_rules: [repaymentRule],
    decision_reasons: [
      { source: 'RULE', code: 'THIRD_PARTY_REPAYMENT', description: repaymentRule.description },
    ],
    layer_findings: repaymentFindings,
  },
  alert: {
    id: REPAYMENT_ALERT,
    transaction_id: REPAYMENT_TXN,
    status: 'OPEN',
    severity: 'HIGH',
    fraud_probability: null,
    risk_score: 70,
    team: 'team-alpha',
    assigned_to: null,
    opened_at: repaymentOpened,
    closed_at: null,
    amount: '6250.00',
    currency: 'AED',
    case_id: REPAYMENT_CASE,
    score_id: REPAYMENT_SCORE,
    provenance: {
      transaction_id: REPAYMENT_TXN,
      score_id: REPAYMENT_SCORE,
      alert_id: REPAYMENT_ALERT,
      ...ENGINE,
      scored_at: repaymentOpened,
    },
    layer_facts: { [ISLAMIC]: repaymentFacts },
    events: [
      {
        id: '5a1c0e10-7d1e-4c11-9a01-000000000502',
        from_status: null,
        to_status: 'OPEN',
        note: 'auto-opened by fixture-rules@fixture-v1',
        actor_user_id: null,
        created_at: repaymentOpened,
      },
    ],
    explanation: [
      { feature: 'amount', contribution: -0.03 },
      { feature: 'new_beneficiary', contribution: 0.05 },
    ],
    ...ENGINE,
    model_decision: 'ALLOW',
    signals: repaymentSignals,
    triggered_rules: [repaymentRule],
    network: null,
    anomaly: { is_anomaly: false, anomaly_score: 40, threshold: 70 },
    decision_reasons: [
      { source: 'RULE', code: 'THIRD_PARTY_REPAYMENT', description: repaymentRule.description },
    ],
    layer_findings: repaymentFindings,
  },
};

/* ------------------------------------------------------------------ *
 * 3. Takaful claim 12 days after the first contribution. The layer adds
 *    TAKAFUL_EARLY_CLAIM (HIGH): 66 -> 91, CRITICAL. Concluded as fraud.
 * ------------------------------------------------------------------ */
const CLAIM_TXN = '5a1c0e10-7d1e-4c11-9a01-000000000103';
const CLAIM_ALERT = '5a1c0e10-7d1e-4c11-9a01-000000000203';
const CLAIM_CASE = '5a1c0e10-7d1e-4c11-9a01-000000000303';
const CLAIM_SCORE = '5a1c0e10-7d1e-4c11-9a01-000000000403';
const claimRule = {
  rule: 'TAKAFUL_EARLY_CLAIM',
  severity: 'HIGH',
  description: 'Claim on contract TKF-2026-0044 paid 12 days after the contract started.',
  source: ISLAMIC,
};
const claimFacts = {
  product: 'TAKAFUL',
  event: 'CLAIM',
  contract_id: 'TKF-2026-0044',
  instalment_no: null,
  tenor: null,
};
const claimFindings: LayerFindings = {
  [ISLAMIC]: {
    facts: claimFacts,
    added: [claimRule],
    set_aside: [],
    score_before: 66,
    score_after: 91,
  },
};
const claimSignals = {
  model_score: 95,
  rule_score: 100,
  anomaly_score: 90,
  network_score: 0,
  weighted_score: 91,
  rule_floor_applied: false,
};
const claimOpened = minutesAgo(26 * 60);
const claimReviewed = new Date(Date.parse(claimOpened) + 50 * 60_000).toISOString();
const claimDecided = new Date(Date.parse(claimOpened) + 5 * 3_600_000).toISOString();
const claim: IslamicFixture = {
  team: 'team-alpha',
  transaction: {
    id: CLAIM_TXN,
    external_ref: 'ISL-TKF-0044-CLM',
    amount: '95000.00',
    currency: 'AED',
    booked_at: claimOpened,
    transaction_type: 'TRANSFER',
    mcc: null,
    sender_balance_before: '8800000.00',
    receiver_balance_before: '1200.00',
    scoring_status: 'COMPLETE',
    src_account_last4: '6060',
    dst_account_last4: '3318',
  },
  score: {
    ...ENGINE,
    risk_score: 91,
    risk_level: 'HIGH',
    model_decision: 'BLOCK',
    latency_ms: 44,
    scored_at: claimOpened,
    explanation: [
      { feature: 'amount', contribution: 0.21 },
      { feature: 'empty_receiver', contribution: 0.14 },
    ],
    signals: claimSignals,
    triggered_rules: [claimRule],
    decision_reasons: [{ source: 'RULE', code: 'TAKAFUL_EARLY_CLAIM', description: claimRule.description }],
    layer_findings: claimFindings,
  },
  alert: {
    id: CLAIM_ALERT,
    transaction_id: CLAIM_TXN,
    status: 'CONFIRMED_FRAUD',
    severity: 'CRITICAL',
    fraud_probability: null,
    risk_score: 91,
    team: 'team-alpha',
    assigned_to: ANALYST,
    opened_at: claimOpened,
    closed_at: claimDecided,
    amount: '95000.00',
    currency: 'AED',
    case_id: CLAIM_CASE,
    score_id: CLAIM_SCORE,
    provenance: {
      transaction_id: CLAIM_TXN,
      score_id: CLAIM_SCORE,
      alert_id: CLAIM_ALERT,
      ...ENGINE,
      scored_at: claimOpened,
    },
    layer_facts: { [ISLAMIC]: claimFacts },
    events: [
      {
        id: '5a1c0e10-7d1e-4c11-9a01-000000000503',
        from_status: null,
        to_status: 'OPEN',
        note: 'auto-opened by fixture-rules@fixture-v1',
        actor_user_id: null,
        created_at: claimOpened,
      },
      {
        id: '5a1c0e10-7d1e-4c11-9a01-000000000603',
        from_status: 'OPEN',
        to_status: 'IN_REVIEW',
        note: 'Claim beneficiary account opened last week.',
        actor_user_id: ANALYST,
        created_at: claimReviewed,
      },
      {
        id: '5a1c0e10-7d1e-4c11-9a01-000000000703',
        from_status: 'IN_REVIEW',
        to_status: 'CONFIRMED_FRAUD',
        note: 'Claim staged within the first month of cover.',
        actor_user_id: SUPERVISOR,
        created_at: claimDecided,
      },
    ],
    explanation: [
      { feature: 'amount', contribution: 0.21 },
      { feature: 'empty_receiver', contribution: 0.14 },
    ],
    ...ENGINE,
    model_decision: 'BLOCK',
    signals: claimSignals,
    triggered_rules: [claimRule],
    network: null,
    anomaly: { is_anomaly: true, anomaly_score: 90, threshold: 70 },
    decision_reasons: [{ source: 'RULE', code: 'TAKAFUL_EARLY_CLAIM', description: claimRule.description }],
    layer_findings: claimFindings,
  },
};

/* ------------------------------------------------------------------ *
 * 4. Ijara rental 14/60 matching its schedule. ROUND_AMOUNT_BURST (MEDIUM)
 *    floors the engine score at 30; the layer sets it aside: 30 -> 5.6.
 * ------------------------------------------------------------------ */
const RENTAL_TXN = '5a1c0e10-7d1e-4c11-9a01-000000000104';
const rental: IslamicFixture = {
  team: 'team-alpha',
  transaction: {
    id: RENTAL_TXN,
    external_ref: 'ISL-IJR-0093-R14',
    amount: '12000.00',
    currency: 'AED',
    booked_at: minutesAgo(90),
    transaction_type: 'PAYMENT',
    mcc: null,
    sender_balance_before: '58000.00',
    receiver_balance_before: '2500000.00',
    scoring_status: 'COMPLETE',
    src_account_last4: '1185',
    dst_account_last4: '9001',
  },
  score: {
    ...ENGINE,
    risk_score: 5.6,
    risk_level: 'LOW',
    model_decision: 'ALLOW',
    latency_ms: 36,
    scored_at: minutesAgo(90),
    explanation: [{ feature: 'amount', contribution: -0.02 }],
    signals: {
      model_score: 6,
      rule_score: 0,
      anomaly_score: 20,
      network_score: 0,
      weighted_score: 5.6,
      rule_floor_applied: false,
    },
    triggered_rules: [],
    decision_reasons: [],
    layer_findings: {
      [ISLAMIC]: {
        facts: {
          product: 'IJARA',
          event: 'RENTAL',
          contract_id: 'IJR-2025-0093',
          instalment_no: 14,
          tenor: 60,
        },
        added: [],
        set_aside: [
          {
            rule: 'ROUND_AMOUNT_BURST',
            severity: 'MEDIUM',
            description: 'Three round-amount payments from this account in 24 hours.',
            reason: 'Matches the contract schedule.',
          },
        ],
        score_before: 30,
        score_after: 5.6,
      },
    },
  },
  alert: null,
};

export const ISLAMIC_FIXTURES: readonly IslamicFixture[] = [settlement, repayment, claim, rental];

export const ISLAMIC_TRANSACTIONS: Transaction[] = ISLAMIC_FIXTURES.map((f) => f.transaction);

export const ISLAMIC_ALERTS: AlertDetail[] = ISLAMIC_FIXTURES.flatMap((f) =>
  f.alert ? [f.alert] : [],
);

/** The stored score per transaction, as `GET /v1/transactions/{id}/score` returns it. */
export const ISLAMIC_SCORES = new Map(ISLAMIC_FIXTURES.map((f) => [f.transaction.id, f.score]));

export const ISLAMIC_TEAMS = new Map(ISLAMIC_FIXTURES.map((f) => [f.transaction.id, f.team]));

function member(alert: AlertDetail) {
  return {
    id: alert.id,
    transaction_id: alert.transaction_id,
    score_id: alert.score_id ?? null,
    status: String(alert.status),
    severity: String(alert.severity),
    opened_at: alert.opened_at,
    layer_facts: alert.layer_facts ?? null,
  };
}

export const ISLAMIC_CASES: MockCase[] = [
  {
    id: REPAYMENT_CASE,
    title: 'Instalments paid by a third party — MRB-2026-0412',
    status: 'OPEN',
    severity: 'HIGH',
    team: 'team-alpha',
    assigned_to: null,
    opened_at: repaymentOpened,
    closed_at: null,
    alert_count: 1,
    findings: null,
    findings_by: null,
    findings_at: null,
    alerts: [member(repayment.alert!)],
    feedback: null,
  },
  {
    id: CLAIM_CASE,
    title: 'Early Takaful claim — TKF-2026-0044',
    status: 'CONFIRMED_FRAUD',
    severity: 'CRITICAL',
    team: 'team-alpha',
    assigned_to: ANALYST,
    opened_at: claimOpened,
    closed_at: claimDecided,
    alert_count: 1,
    findings: 'Cover started 12 days before the claim; the payout went to an account opened last week.',
    findings_by: ANALYST,
    findings_at: claimReviewed,
    alerts: [member(claim.alert!)],
    feedback: {
      id: '5a1c0e10-7d1e-4c11-9a01-000000000803',
      case_id: CLAIM_CASE,
      anchor_alert_id: CLAIM_ALERT,
      score_id: CLAIM_SCORE,
      transaction_id: CLAIM_TXN,
      alert_count: 1,
      final_label: 'CONFIRMED_FRAUD',
      confidence: 'HIGH',
      model_agreement: 'AGREES',
      fraud_typology: 'TAKAFUL_CLAIM_FRAUD',
      decision_drivers: ['claim within 30 days of cover', 'new beneficiary account'],
      missing_signals: ['policy underwriting file'],
      notes: null,
      analyst_findings:
        'Cover started 12 days before the claim; the payout went to an account opened last week.',
      findings_by: ANALYST,
      assigned_to: ANALYST,
      reviewer_user_id: SUPERVISOR,
      case_opened_at: claimOpened,
      decided_at: claimDecided,
      model_version: ENGINE.model_version,
      risk_engine_version: ENGINE.risk_engine_version,
      original_risk_score: 91,
      original_model_score: 95,
      original_rule_score: 100,
      original_anomaly_score: 90,
      original_network_score: 0,
      original_triggered_rules: [claimRule],
      original_layer_findings: claimFindings,
    },
  },
];

/**
 * `GET /v1/islamic/summary`, computed the way civitas_islamic/summary.py does:
 * transactions and findings per product, alerts per product, and outcomes from
 * the verdict on each alert's case.
 */
export function islamicSummary(
  visible: (team: string) => boolean,
  alerts: ReadonlyArray<{ transaction_id: string; case_id?: string | null; team: string }>,
  cases: ReadonlyArray<{ id: string; feedback: Record<string, unknown> | null }>,
) {
  const alertByTxn = new Map(alerts.map((alert) => [alert.transaction_id, alert]));
  const verdictByCase = new Map(cases.map((entry) => [entry.id, entry.feedback?.['final_label']]));
  const products = ISLAMIC_PRODUCTS.map((product) => ({
    product: product.code,
    label: product.label,
    transactions: 0,
    alerts: 0,
    set_aside: 0,
    confirmed_fraud: 0,
    false_positive: 0,
  }));
  const rules = new Map<string, { rule: string; kind: string; count: number }>();
  const bump = (rule: string, kind: string) => {
    const key = `${kind}:${rule}`;
    const row = rules.get(key) ?? { rule, kind, count: 0 };
    row.count += 1;
    rules.set(key, row);
  };

  for (const fixture of ISLAMIC_FIXTURES) {
    if (!visible(fixture.team)) continue;
    const finding = fixture.score.layer_findings[ISLAMIC];
    const row = products.find((p) => p.product === finding?.facts.product);
    if (!finding || !row) continue;
    row.transactions += 1;
    if (finding.set_aside.length > 0) row.set_aside += 1;
    for (const rule of finding.added) bump(rule.rule, 'added');
    for (const rule of finding.set_aside) bump(rule.rule, 'set_aside');
    const alert = alertByTxn.get(fixture.transaction.id);
    if (!alert) continue;
    row.alerts += 1;
    const verdict = alert.case_id ? verdictByCase.get(alert.case_id) : undefined;
    if (verdict === 'CONFIRMED_FRAUD') row.confirmed_fraud += 1;
    if (verdict === 'FALSE_POSITIVE') row.false_positive += 1;
  }

  return { products, rules: [...rules.values()] };
}
