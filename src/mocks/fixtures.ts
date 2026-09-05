import type { AlertDetail, AlertEvent } from '@/api/schemas/alerts';
import type { Transaction } from '@/api/schemas/transactions';
import type { User } from '@/api/schemas/users';

/**
 * Deterministic fixtures for the offline demo (VITE_USE_MSW=true).
 *
 * These cover two things the live seed does not: alerts on `team-beta`, so the
 * cross-team story in the demo script is actually visible, and alerts in every
 * status, so the state machine can be walked end to end with the backend down.
 */

/** Small deterministic PRNG — fixtures must be identical on every run. */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const random = makeRandom(20260904);

function uuid(index: number, salt: string): string {
  const hex = (n: number, len: number) =>
    Math.abs(Math.floor(n)).toString(16).padStart(len, '0').slice(0, len);
  const base = index * 2654435761 + salt.length * 40503;
  return [
    hex(base, 8),
    hex(base >> 4, 4),
    `4${hex(base >> 8, 3)}`,
    `a${hex(base >> 12, 3)}`,
    hex(base * 31, 12),
  ].join('-');
}

const STATUSES = [
  'OPEN',
  'OPEN',
  'OPEN',
  'IN_REVIEW',
  'IN_REVIEW',
  'ESCALATED',
  'CONFIRMED_FRAUD',
  'FALSE_POSITIVE',
  'CLOSED',
] as const;

const FEATURES = [
  'amount_ratio',
  'mule_fan_in',
  'risky_type',
  'new_beneficiary',
  'empty_receiver',
  'night_hour',
  'velocity_24h',
  'dormancy_days',
  'balance_drain',
  'counterparty_age',
] as const;

const TYPES = ['TRANSFER', 'CASH_OUT', 'CASH_IN', 'PAYMENT', 'DEBIT'] as const;

function severityFor(probability: number): string {
  if (probability >= 0.9) return 'CRITICAL';
  if (probability >= 0.7) return 'HIGH';
  if (probability >= 0.4) return 'MEDIUM';
  return 'LOW';
}

function amountFor(index: number): string {
  const whole = 250 + Math.floor(random() * 96_000);
  const cents = Math.floor(random() * 100);
  return `${whole + index}.${String(cents).padStart(2, '0')}`;
}

function explanationFor(index: number) {
  const count = 4 + (index % 3);
  return Array.from({ length: count }, (_, position) => {
    const feature = FEATURES[(index + position) % FEATURES.length] ?? 'amount_ratio';
    // A couple of features pull the score down, so the chart shows both signs.
    const magnitude = Number((0.04 + random() * 0.24).toFixed(3));
    const negative = position % 4 === 3;
    return { feature, contribution: negative ? -magnitude : magnitude };
  });
}

function eventsFor(index: number, status: string, openedAt: string): AlertEvent[] {
  const events: AlertEvent[] = [
    {
      id: uuid(index, 'event-open'),
      from_status: null,
      to_status: 'OPEN',
      note: 'auto-opened by fixture-rules@fixture-v1',
      actor_user_id: null,
      created_at: openedAt,
    },
  ];

  if (status === 'OPEN') return events;

  const reviewedAt = new Date(Date.parse(openedAt) + 42 * 60_000).toISOString();
  events.push({
    id: uuid(index, 'event-review'),
    from_status: 'OPEN',
    to_status: 'IN_REVIEW',
    note: 'Picked up for triage. Beneficiary account opened in the last 30 days.',
    actor_user_id: uuid(1, 'analyst'),
    created_at: reviewedAt,
  });

  if (status === 'IN_REVIEW') return events;

  const resolvedAt = new Date(Date.parse(reviewedAt) + 95 * 60_000).toISOString();
  const finalStatus = status === 'CLOSED' ? 'CONFIRMED_FRAUD' : status;
  events.push({
    id: uuid(index, 'event-final'),
    from_status: 'IN_REVIEW',
    to_status: finalStatus,
    note:
      finalStatus === 'FALSE_POSITIVE'
        ? 'Customer confirmed the payment. Releasing.'
        : 'Pattern matches known mule network. Escalating to the financial crime unit.',
    actor_user_id: uuid(2, 'supervisor'),
    created_at: resolvedAt,
  });

  if (status === 'CLOSED') {
    events.push({
      id: uuid(index, 'event-closed'),
      from_status: 'CONFIRMED_FRAUD',
      to_status: 'CLOSED',
      note: 'Report filed. Case closed.',
      actor_user_id: uuid(2, 'supervisor'),
      created_at: new Date(Date.parse(resolvedAt) + 20 * 60_000).toISOString(),
    });
  }

  return events;
}

/** 48 alerts spanning every severity and status, across two teams. */
export const ALERT_FIXTURES: AlertDetail[] = Array.from({ length: 48 }, (_, index) => {
  const probability = Number(Math.min(0.999, 0.08 + random() * 0.92).toFixed(4));
  const status = STATUSES[index % STATUSES.length] ?? 'OPEN';
  // Roughly a third of the fixtures sit on team-beta so cross-team visibility
  // is demonstrable — the live seed has none.
  const team = index % 3 === 2 ? 'team-beta' : 'team-alpha';
  const openedAt = new Date(Date.now() - (index + 1) * 47 * 60_000).toISOString();
  const closed = status === 'CLOSED';

  return {
    id: uuid(index, 'alert'),
    transaction_id: uuid(index, 'txn'),
    status,
    severity: severityFor(probability),
    fraud_probability: probability,
    team,
    assigned_to: index % 4 === 0 ? uuid(1, 'analyst') : null,
    opened_at: openedAt,
    closed_at: closed ? new Date(Date.parse(openedAt) + 3 * 3_600_000).toISOString() : null,
    amount: amountFor(index),
    currency: 'AED',
    events: eventsFor(index, status, openedAt),
    explanation: explanationFor(index),
    model_name: 'fixture-rules',
    model_version: 'fixture-v1',
    model_decision: probability >= 0.9 ? 'BLOCK' : probability >= 0.7 ? 'REVIEW' : 'ALLOW',
  };
});

export const TRANSACTION_FIXTURES: Record<string, Transaction> = Object.fromEntries(
  ALERT_FIXTURES.map((alert, index) => [
    alert.transaction_id,
    {
      id: alert.transaction_id,
      external_ref: `FIXTURE-${String(index + 1).padStart(4, '0')}`,
      amount: alert.amount ?? '0.00',
      currency: 'AED',
      booked_at: alert.opened_at,
      transaction_type: TYPES[index % TYPES.length] ?? 'TRANSFER',
      mcc: 6011,
      sender_balance_before: amountFor(index + 100),
      receiver_balance_before: index % 5 === 0 ? '0.00' : amountFor(index + 200),
      scoring_status: 'COMPLETE',
      src_account_last4: String(1000 + ((index * 37) % 9000)),
      dst_account_last4: String(1000 + ((index * 53) % 9000)),
    },
  ]),
);

export const USER_FIXTURES: User[] = [
  {
    id: uuid(1, 'analyst'),
    email: 'analyst@example.com',
    full_name: 'Analyst',
    team: 'team-alpha',
    is_active: true,
    scopes: ['alerts:read', 'alerts:update', 'transactions:read'],
  },
  {
    id: uuid(2, 'supervisor'),
    email: 'supervisor@example.com',
    full_name: 'Supervisor',
    team: 'team-alpha',
    is_active: true,
    scopes: [
      'alerts:read',
      'alerts:read:all',
      'alerts:update',
      'alerts:assign',
      'alerts:close',
      'transactions:read',
    ],
  },
  {
    id: uuid(3, 'other'),
    email: 'other-analyst@example.com',
    full_name: 'Other Analyst',
    team: 'team-beta',
    is_active: true,
    scopes: ['alerts:read', 'alerts:update', 'transactions:read'],
  },
  {
    id: uuid(4, 'admin'),
    email: 'admin@example.com',
    full_name: 'Admin',
    team: 'default',
    is_active: true,
    scopes: ['users:manage'],
  },
];

export const ACCOUNT_SCOPES: Record<string, { scopes: string[]; team: string }> = {
  'analyst@example.com': {
    scopes: ['alerts:read', 'alerts:update', 'transactions:read'],
    team: 'team-alpha',
  },
  'supervisor@example.com': {
    scopes: [
      'alerts:read',
      'alerts:read:all',
      'alerts:update',
      'alerts:assign',
      'alerts:close',
      'transactions:read',
    ],
    team: 'team-alpha',
  },
  'other-analyst@example.com': {
    scopes: ['alerts:read', 'alerts:update', 'transactions:read'],
    team: 'team-beta',
  },
  'admin@example.com': { scopes: ['users:manage'], team: 'default' },
};

export const CLIENT_SCOPES: Record<string, string[]> = {
  'ingest-loader': ['transactions:write'],
  'ml-service': ['scores:write', 'transactions:read'],
};
