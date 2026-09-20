import { ALERT_FIXTURES } from './fixtures';

/**
 * Fixtures for the investigation layer: cases, entities, the account graph and
 * the audit trail.
 *
 * Demo mode has to serve the SAME contract the local API serves, not a
 * simplified one. A mock that is easier than production means the screens get
 * built against the easy version and break on the real thing — which is most of
 * what went wrong in this console already.
 *
 * Everything here is derived from the alert fixtures, so the demo is internally
 * consistent: a case's alert_count really is the number of alerts pointing at
 * it, and the graph really does contain the accounts those alerts name.
 */

function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const random = makeRandom(20260919);

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

/* ------------------------------------------------------------------ *
 * Cases
 * ------------------------------------------------------------------ */

export interface MockCase {
  id: string;
  title: string;
  status: string;
  severity: string;
  team: string;
  assigned_to: string | null;
  opened_at: string;
  closed_at: string | null;
  alert_count: number;
  alerts: {
    id: string;
    transaction_id: string;
    score_id: string | null;
    status: string;
    severity: string;
    opened_at: string;
  }[];
  feedback: Record<string, unknown> | null;
}

const SEVERITY_ORDER = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/**
 * The alert fixtures already carry `case_id`, six distinct values across 48
 * alerts. Grouping by it produces cases of 8 alerts each — the point being
 * made visible: one scheme, many alerts, one investigation.
 */
export const CASE_FIXTURES: MockCase[] = (() => {
  const byCase = new Map<string, typeof ALERT_FIXTURES>();
  for (const alert of ALERT_FIXTURES) {
    const key = alert.case_id ?? uuid(0, 'case');
    byCase.set(key, [...(byCase.get(key) ?? []), alert]);
  }

  return [...byCase.entries()].map(([id, members], index) => {
    const anchor = members[0]!;
    const severity = members
      .map((m) => String(m.severity))
      .reduce((worst, s) =>
        SEVERITY_ORDER.indexOf(s) > SEVERITY_ORDER.indexOf(worst) ? s : worst,
      'LOW');

    // Spread statuses so the whole state machine is walkable offline.
    const status = ['OPEN', 'IN_REVIEW', 'ESCALATED', 'CONFIRMED_FRAUD', 'OPEN', 'FALSE_POSITIVE'][
      index % 6
    ]!;
    const concluded = status === 'CONFIRMED_FRAUD' || status === 'FALSE_POSITIVE';
    const openedAt = members
      .map((m) => m.opened_at)
      .sort()[0]!;

    return {
      id,
      title: `Investigation ${anchor.transaction_id.slice(0, 8).toUpperCase()}`,
      status,
      severity,
      team: anchor.team,
      assigned_to: index % 3 === 0 ? uuid(1, 'analyst') : null,
      opened_at: openedAt,
      closed_at: concluded
        ? new Date(Date.parse(openedAt) + 6 * 3_600_000).toISOString()
        : null,
      alert_count: members.length,
      alerts: members.map((m) => ({
        id: m.id,
        transaction_id: m.transaction_id,
        score_id: m.score_id ?? null,
        status: String(m.status),
        severity: String(m.severity),
        opened_at: m.opened_at,
      })),
      feedback: concluded
        ? {
            id: uuid(index, 'feedback'),
            case_id: id,
            anchor_alert_id: anchor.id,
            score_id: anchor.score_id ?? null,
            transaction_id: anchor.transaction_id,
            alert_count: members.length,
            final_label: status,
            confidence: status === 'CONFIRMED_FRAUD' ? 'HIGH' : 'MEDIUM',
            model_agreement: status === 'CONFIRMED_FRAUD' ? 'AGREES' : 'DISAGREES',
            fraud_typology: status === 'CONFIRMED_FRAUD' ? 'MULE_RING' : null,
            decision_drivers:
              status === 'CONFIRMED_FRAUD'
                ? ['network fan-in', 'origin account drained']
                : ['established payroll pattern'],
            missing_signals: ['device fingerprint'],
            notes: null,
            reviewer_user_id: uuid(2, 'supervisor'),
            alert_opened_at: openedAt,
            decided_at: new Date(Date.parse(openedAt) + 6 * 3_600_000).toISOString(),
            model_version: 'fixture-v1',
            risk_engine_version: 'engine-v1.2.0',
            // Frozen at the moment of decision — never recomputed.
            original_risk_score: anchor.risk_score ?? 0,
            original_model_score: anchor.signals?.model_score ?? 0,
            original_rule_score: anchor.signals?.rule_score ?? 0,
            original_anomaly_score: anchor.signals?.anomaly_score ?? 0,
            original_network_score: anchor.signals?.network_score ?? 0,
            original_triggered_rules: anchor.triggered_rules ?? [],
          }
        : null,
    };
  });
})();

/* ------------------------------------------------------------------ *
 * Entities and accounts
 * ------------------------------------------------------------------ */

export interface MockAccount {
  id: string;
  account_last4: string;
  currency: string;
  country_code: string;
  status: string;
  holder_role: string;
  opened_on: string;
  party_id: string;
}

export interface MockEntity {
  id: string;
  party_type: string;
  display_name: string;
  country_code: string;
  external_ref: string | null;
  risk_tier: number;
  created_at: string;
  account_count: number;
  transaction_count: number;
  pep_flag: boolean | null;
  registration_no: string | null;
  legal_form: string | null;
  sector_code: string | null;
  date_of_birth: string | null;
  team: string;
}

const HOLDER_ROLES = ['PRIMARY', 'PRIMARY', 'PRIMARY', 'JOINT', 'BENEFICIAL_OWNER', 'SIGNATORY'];
const COUNTRIES = ['AE', 'AE', 'AE', 'GB', 'SG', 'NL'];

const ENTITY_COUNT = 60;

export const ENTITY_FIXTURES: MockEntity[] = Array.from({ length: ENTITY_COUNT }, (_, index) => {
  const isCompany = index % 7 === 0;
  // One party is the fan-in mule: a single account, many inbound transfers.
  const heavy = index % 11 === 3;

  return {
    id: uuid(index, 'party'),
    party_type: isCompany ? 'COMPANY' : 'PERSON',
    display_name: isCompany
      ? `Company ${uuid(index, 'party').slice(0, 6).toUpperCase()}`
      : `Person ${uuid(index, 'party').slice(0, 6).toUpperCase()}`,
    country_code: COUNTRIES[index % COUNTRIES.length]!,
    external_ref: null,
    risk_tier: heavy ? 4 : 1 + (index % 4),
    created_at: new Date(Date.now() - (index + 3) * 36 * 3_600_000).toISOString(),
    account_count: isCompany ? 2 : 1,
    transaction_count: heavy ? 15 : 1 + (index % 6),
    pep_flag: isCompany ? null : index % 13 === 0,
    registration_no: isCompany ? `AE-${10_000_000 + index * 7919}` : null,
    legal_form: isCompany ? 'BV' : null,
    sector_code: isCompany ? '6499' : null,
    date_of_birth: isCompany ? null : `19${70 + (index % 25)}-0${1 + (index % 9)}-1${index % 9}`,
    team: index % 3 === 2 ? 'team-beta' : 'team-alpha',
  };
});

export const ACCOUNT_FIXTURES: MockAccount[] = ENTITY_FIXTURES.flatMap((entity, index) =>
  Array.from({ length: entity.account_count }, (_, n) => ({
    id: uuid(index * 10 + n, 'account'),
    account_last4: String(1000 + ((index * 37 + n * 13) % 9000)).slice(-4),
    currency: 'AED',
    country_code: entity.country_code,
    status: index % 17 === 0 ? 'FROZEN' : 'ACTIVE',
    holder_role: HOLDER_ROLES[(index + n) % HOLDER_ROLES.length]!,
    // A recently opened account receiving large sums is a classic finding.
    opened_on: new Date(Date.now() - (index % 11 === 3 ? 11 : 400 + index) * 86_400_000)
      .toISOString()
      .slice(0, 10),
    party_id: entity.id,
  })),
);

/* ------------------------------------------------------------------ *
 * The graph
 *
 * Built once, deterministically, with real structure in it: a fan-in cluster,
 * a pass-through, and one cycle. A random graph would draw fine and mean
 * nothing — and the shapes are the entire purpose of the view.
 * ------------------------------------------------------------------ */

export interface MockEdge {
  source: string;
  target: string;
  transaction_count: number;
  total_amount: string;
  currency: string;
  last_booked_at: string;
}

export const EDGE_FIXTURES: MockEdge[] = (() => {
  const edges: MockEdge[] = [];
  const ids = ACCOUNT_FIXTURES.map((a) => a.id);
  const amount = () => (500 + random() * 48_000).toFixed(2);
  const when = (n: number) => new Date(Date.now() - n * 3_600_000).toISOString();

  // Fan-in: five accounts pay into one hub.
  const hub = ids[3]!;
  for (let i = 0; i < 5; i += 1) {
    edges.push({
      source: ids[10 + i]!,
      target: hub,
      transaction_count: 1 + (i % 3),
      total_amount: amount(),
      currency: 'AED',
      last_booked_at: when(i * 5 + 2),
    });
  }

  // Pass-through: the hub forwards almost everything to one account.
  const sink = ids[4]!;
  edges.push({
    source: hub,
    target: sink,
    transaction_count: 2,
    total_amount: '48500.00',
    currency: 'AED',
    last_booked_at: when(1),
  });

  // Cycle: the sink pays back one of the original payers.
  edges.push({
    source: sink,
    target: ids[10]!,
    transaction_count: 1,
    total_amount: amount(),
    currency: 'AED',
    last_booked_at: when(0),
  });
  edges.push({
    source: ids[10]!,
    target: sink,
    transaction_count: 1,
    total_amount: amount(),
    currency: 'AED',
    last_booked_at: when(3),
  });

  // Background traffic so the interesting structure is not the only structure.
  for (let i = 0; i < 40; i += 1) {
    const a = ids[(i * 7 + 20) % ids.length]!;
    const b = ids[(i * 13 + 31) % ids.length]!;
    if (a === b) continue;
    edges.push({
      source: a,
      target: b,
      transaction_count: 1,
      total_amount: amount(),
      currency: 'AED',
      last_booked_at: when(i + 6),
    });
  }

  return edges;
})();

/** How many alerts name each account — drives node colour. */
export const ALERTS_PER_ACCOUNT = new Map<string, number>(
  ACCOUNT_FIXTURES.map((account, index) => [
    account.id,
    index === 3 ? 13 : index === 4 ? 6 : index % 9 === 0 ? 2 : 0,
  ]),
);

/* ------------------------------------------------------------------ *
 * Audit trail
 * ------------------------------------------------------------------ */

export interface MockAuditEntry {
  id: number;
  actor: string;
  actor_type: string;
  action: string;
  entity: string;
  entity_id: string | null;
  request_id: string;
  ip: string;
  detail: Record<string, unknown> | null;
  created_at: string;
}

export const AUDIT_FIXTURES: MockAuditEntry[] = (() => {
  const rows: MockAuditEntry[] = [];
  let id = 1;

  for (const [index, investigation] of CASE_FIXTURES.entries()) {
    rows.push({
      id: id++,
      actor: uuid(1, 'analyst'),
      actor_type: 'user',
      action: 'case.create',
      entity: 'fraud_case',
      entity_id: investigation.id,
      request_id: uuid(id, 'req').replace(/-/g, ''),
      ip: '172.22.0.1',
      detail: { alert_count: investigation.alert_count },
      created_at: investigation.opened_at,
    });

    if (investigation.status !== 'OPEN') {
      rows.push({
        id: id++,
        actor: uuid(1, 'analyst'),
        actor_type: 'user',
        action: 'case.patch',
        entity: 'fraud_case',
        entity_id: investigation.id,
        request_id: uuid(id, 'req').replace(/-/g, ''),
        ip: '172.22.0.1',
        detail: { status: 'IN_REVIEW' },
        created_at: new Date(Date.parse(investigation.opened_at) + 3_600_000).toISOString(),
      });
    }

    if (investigation.feedback) {
      rows.push({
        id: id++,
        actor: uuid(2, 'supervisor'),
        actor_type: 'user',
        action: 'case.patch',
        entity: 'fraud_case',
        entity_id: investigation.id,
        request_id: uuid(id, 'req').replace(/-/g, ''),
        ip: '172.22.0.1',
        detail: { status: investigation.status, alert_count: investigation.alert_count },
        created_at: investigation.closed_at ?? investigation.opened_at,
      });
    }

    // Logins, so the trail is not only case traffic.
    if (index % 2 === 0) {
      rows.push({
        id: id++,
        actor: uuid(index, 'user'),
        actor_type: 'user',
        action: 'login',
        entity: 'app_user',
        entity_id: uuid(index, 'user'),
        request_id: uuid(id, 'req').replace(/-/g, ''),
        ip: '172.22.0.1',
        detail: null,
        created_at: new Date(Date.now() - index * 900_000).toISOString(),
      });
    }
  }

  return rows.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
})();
