/**
 * Demo-mode rule settings and pilot report, mirroring civitas_islamic's
 * settings.py / settings_routes.py / pilot.py closely enough that the screen
 * behaves as it does live: the same 12 rules and 18 thresholds with their
 * bounds, the same field errors, a 422 for a change that changes nothing, and
 * every write kept in memory as a new version with its before/after changes.
 *
 * Demo mode opens at version 1: CHARITY_DIVERSION on trial (PILOT), with a
 * few shadow hits for the pilot report. The mock does not run the rules, so
 * those hits are fixtures, not computed.
 */

export const ADDED_RULES = [
  'MURABAHA_SUPPLIER_MISMATCH',
  'THIRD_PARTY_REPAYMENT',
  'SETTLEMENT_FUNDED_BY_FAN_IN',
  'COMMODITY_ROUND_TRIP',
  'TAKAFUL_EARLY_CLAIM',
  'CHARITY_DIVERSION',
  'CONTRACT_INCOHERENT',
  'CONTRACT_MISMATCH',
  'PAYMENT_ON_CLOSED_CONTRACT',
  'DOUBLE_FINANCED_ASSET',
] as const;
export const SET_ASIDE_RULES = ['ORIGIN_ACCOUNT_DRAIN', 'ROUND_AMOUNT_BURST'] as const;
export const RULES: readonly string[] = [...ADDED_RULES, ...SET_ASIDE_RULES];

const MODES = ['ACTIVE', 'PILOT', 'OFF'] as const;
type Mode = (typeof MODES)[number];

export interface MockThresholdSpec {
  name: string;
  rules: string[];
  default: number;
  min: number;
  max: number;
  unit: 'days' | 'hours' | 'count' | 'share' | 'tier';
  help: string;
}

const FAN_IN = ['SETTLEMENT_FUNDED_BY_FAN_IN'];
const SIGNALS = ['THIRD_PARTY_REPAYMENT', 'TAKAFUL_EARLY_CLAIM', 'CHARITY_DIVERSION'];

/** As `GET /v1/islamic/settings` returns `schema`, in the same order. */
// prettier-ignore
export const SETTINGS_SCHEMA: readonly MockThresholdSpec[] = [
  { name: 'FAN_IN_HOURS', rules: FAN_IN, default: 72, min: 1, max: 720, unit: 'hours', help: 'How far back to look for inbound payments that fund an early settlement.' },
  { name: 'FAN_IN_MIN_TRANSFERS', rules: FAN_IN, default: 5, min: 1, max: 100, unit: 'count', help: 'Inbound payments in that window needed before a settlement counts as funded by fan-in.' },
  { name: 'FAN_IN_MIN_SENDERS', rules: FAN_IN, default: 5, min: 1, max: 100, unit: 'count', help: 'Distinct senders of those inbound payments needed.' },
  { name: 'FAN_IN_MIN_SHARE', rules: FAN_IN, default: 0.8, min: 0.1, max: 1, unit: 'share', help: 'Share of the settlement those inbound payments must cover (0.8 = 80%).' },
  { name: 'ROUND_TRIP_DAYS', rules: ['COMMODITY_ROUND_TRIP'], default: 7, min: 0, max: 365, unit: 'days', help: 'A Murabaha asset sold back to its supplier within this many days of the contract start is a round trip.' },
  { name: 'EARLY_CLAIM_DAYS', rules: ['TAKAFUL_EARLY_CLAIM'], default: 30, min: 1, max: 365, unit: 'days', help: 'A Takaful claim fewer than this many days after the cover starts is early.' },
  { name: 'CHARITY_WINDOW_DAYS', rules: ['CHARITY_DIVERSION'], default: 30, min: 1, max: 365, unit: 'days', help: 'Window over which Zakat senders to one recipient account are counted.' },
  { name: 'NEW_ACCOUNT_DAYS', rules: SIGNALS, default: 90, min: 1, max: 730, unit: 'days', help: 'An account opened fewer than this many days ago counts as new.' },
  { name: 'CHARITY_MEDIUM_SENDERS', rules: ['CHARITY_DIVERSION'], default: 3, min: 1, max: 100, unit: 'count', help: 'Distinct Zakat senders to a new recipient account in the window that raise the signal.' },
  { name: 'SCHEDULE_TOLERANCE', rules: ['CONTRACT_INCOHERENT', 'ORIGIN_ACCOUNT_DRAIN', 'ROUND_AMOUNT_BURST'], default: 0.005, min: 0, max: 0.1, unit: 'share', help: 'How far a payment may differ from the scheduled amount and still match it (0.005 = 0.5%).' },
  { name: 'SCHEDULE_DATE_TOLERANCE_DAYS', rules: ['ROUND_AMOUNT_BURST'], default: 7, min: 0, max: 60, unit: 'days', help: 'Days either side of the due date a payment may be booked and still match the schedule.' },
  { name: 'START_GRACE_DAYS', rules: ['CONTRACT_INCOHERENT'], default: 1, min: 0, max: 30, unit: 'days', help: 'Days before the contract start a booking may fall without contradicting it.' },
  { name: 'RISK_TIER_ELEVATED', rules: SIGNALS, default: 4, min: 1, max: 5, unit: 'tier', help: 'A party at or above this risk tier (1-5) corroborates a risk signal.' },
  { name: 'TAKAFUL_PRIOR_CLAIM_DAYS', rules: ['TAKAFUL_EARLY_CLAIM'], default: 90, min: 1, max: 730, unit: 'days', help: 'Another Takaful claim to the same payout account within this many days corroborates.' },
  { name: 'THIRD_PARTY_FAN_OUT_DAYS', rules: ['THIRD_PARTY_REPAYMENT'], default: 30, min: 1, max: 365, unit: 'days', help: "Window over which one payer's repayments toward different contracts are counted." },
  { name: 'THIRD_PARTY_FAN_OUT_MIN_CONTRACTS', rules: ['THIRD_PARTY_REPAYMENT'], default: 3, min: 2, max: 50, unit: 'count', help: 'Different contracts one payer repays in that window that corroborate the signal.' },
  { name: 'CHARITY_FAN_OUT_HOURS', rules: ['CHARITY_DIVERSION'], default: 72, min: 1, max: 720, unit: 'hours', help: 'How far back to look for a Zakat recipient paying the money straight back out.' },
  { name: 'CHARITY_FAN_OUT_SHARE', rules: ['CHARITY_DIVERSION'], default: 0.8, min: 0.1, max: 1, unit: 'share', help: 'Share of the Zakat received that, paid back out in that window, corroborates (0.8 = 80%).' },
];

const BY_NAME = new Map(SETTINGS_SCHEMA.map((spec) => [spec.name, spec]));

export interface FieldProblem {
  field: string;
  message: string;
  type: string;
}

export interface Change {
  field: string;
  before: string | number;
  after: string | number;
}

export interface VersionRecord {
  version: number;
  updated_at: string;
  updated_by: string;
  reason: string;
  reset: boolean;
  changes: Change[];
}

const DEFAULT_MODES = (): Record<string, Mode> =>
  Object.fromEntries(RULES.map((rule) => [rule, 'ACTIVE' as Mode]));
const DEFAULT_VALUES = (): Record<string, number> =>
  Object.fromEntries(SETTINGS_SCHEMA.map((spec) => [spec.name, spec.default]));

/** Python's float repr for a bound: 1 → "1.0" for a share, the way the server words it. */
function bound(value: number, spec: MockThresholdSpec): string {
  return spec.unit === 'share' && Number.isInteger(value) ? `${value}.0` : String(value);
}

function number(spec: MockThresholdSpec, raw: unknown): { value?: number; problem?: string } {
  if (typeof raw === 'boolean' || (typeof raw !== 'number' && typeof raw !== 'string')) {
    return { problem: 'must be a number' };
  }
  const value = Number(String(raw).trim());
  if (String(raw).trim() === '' || !Number.isFinite(value)) return { problem: 'must be a number' };
  if (value < spec.min || value > spec.max) {
    return { problem: `must be between ${bound(spec.min, spec)} and ${bound(spec.max, spec)}` };
  }
  if (spec.unit !== 'share' && !Number.isInteger(value)) {
    return { problem: `must be a whole number of ${spec.unit}` };
  }
  return { value };
}

function reasonProblem(raw: unknown): FieldProblem | null {
  if (typeof raw !== 'string') {
    return { field: 'reason', message: 'Field required', type: 'missing' };
  }
  const reason = raw.trim();
  if (reason.length < 3) {
    return {
      field: 'reason',
      message: 'String should have at least 3 characters',
      type: 'string_too_short',
    };
  }
  if (reason.length > 500) {
    return {
      field: 'reason',
      message: 'String should have at most 500 characters',
      type: 'string_too_long',
    };
  }
  return null;
}

export interface SettingsOut {
  version: number;
  updated_at: string | null;
  updated_by: string | null;
  reason: string | null;
  modes: Record<string, Mode>;
  thresholds: Record<string, number>;
  rule_kinds: Record<string, 'added' | 'set_aside'>;
  schema: MockThresholdSpec[];
}

export type WriteResult =
  | { ok: true; settings: SettingsOut }
  | { ok: false; detail: string; errors: FieldProblem[] };

export type RuleSettingsStore = ReturnType<typeof createRuleSettingsStore>;

/**
 * One deployment's settings, in memory. `seed` false starts at version 0,
 * the shipped defaults; the demo seeds version 1.
 */
export function createRuleSettingsStore({
  seed = true,
  now = () => Date.now(),
}: { seed?: boolean; now?: () => number } = {}) {
  let modes = DEFAULT_MODES();
  let values = DEFAULT_VALUES();
  const history: VersionRecord[] = [];

  if (seed) {
    modes = { ...modes, CHARITY_DIVERSION: 'PILOT' };
    history.unshift({
      version: 1,
      updated_at: new Date(now() - 3 * 86_400_000).toISOString(),
      updated_by: 'Supervisor',
      reason:
        'Trial the Zakat rule before it can alert: its thresholds were set on a synthetic book.',
      reset: false,
      changes: [{ field: 'modes.CHARITY_DIVERSION', before: 'ACTIVE', after: 'PILOT' }],
    });
  }

  const latest = () => history[0];

  function current(): SettingsOut {
    const head = latest();
    return {
      version: head?.version ?? 0,
      updated_at: head?.updated_at ?? null,
      updated_by: head?.updated_by ?? null,
      reason: head?.reason ?? null,
      modes: { ...modes },
      thresholds: { ...values },
      rule_kinds: Object.fromEntries(
        RULES.map((rule) => [
          rule,
          (SET_ASIDE_RULES as readonly string[]).includes(rule) ? 'set_aside' : 'added',
        ]),
      ) as Record<string, 'added' | 'set_aside'>,
      schema: SETTINGS_SCHEMA.map((spec) => ({ ...spec, rules: [...spec.rules] })),
    };
  }

  function write(
    nextModes: Record<string, Mode>,
    nextValues: Record<string, number>,
    reason: string,
    actor: string,
    reset: boolean,
  ): WriteResult {
    const changes: Change[] = [];
    for (const rule of RULES) {
      if (nextModes[rule] !== modes[rule]) {
        changes.push({ field: `modes.${rule}`, before: modes[rule]!, after: nextModes[rule]! });
      }
    }
    for (const spec of SETTINGS_SCHEMA) {
      if (nextValues[spec.name] !== values[spec.name]) {
        changes.push({
          field: `thresholds.${spec.name}`,
          before: values[spec.name]!,
          after: nextValues[spec.name]!,
        });
      }
    }
    if (changes.length === 0 && !reset) {
      const detail = 'Nothing to change: every value sent is already in force.';
      return { ok: false, detail, errors: [{ field: '', message: detail, type: 'value_error' }] };
    }
    modes = nextModes;
    values = nextValues;
    history.unshift({
      version: (latest()?.version ?? 0) + 1,
      updated_at: new Date(now()).toISOString(),
      updated_by: actor,
      reason,
      reset,
      changes,
    });
    return { ok: true, settings: current() };
  }

  /** `PUT /v1/islamic/settings`: a partial change, validated like the server. */
  function update(body: Record<string, unknown>, actor: string): WriteResult {
    const reason = reasonProblem(body['reason']);
    if (reason) return { ok: false, detail: 'One or more fields are invalid.', errors: [reason] };
    const rawModes = body['modes'];
    const rawValues = body['thresholds'];
    const empty = (value: unknown) =>
      value === undefined ||
      value === null ||
      (typeof value === 'object' && Object.keys(value as object).length === 0);
    if (empty(rawModes) && empty(rawValues)) {
      const detail = 'Nothing to change: send modes or thresholds.';
      return { ok: false, detail, errors: [{ field: '', message: detail, type: 'value_error' }] };
    }

    const errors: FieldProblem[] = [];
    const nextModes = { ...modes };
    const nextValues = { ...values };
    if (!empty(rawModes)) {
      if (typeof rawModes !== 'object' || Array.isArray(rawModes)) {
        errors.push({
          field: 'modes',
          message: 'must be an object of rule: mode',
          type: 'value_error',
        });
      } else {
        for (const [rule, mode] of Object.entries(rawModes as Record<string, unknown>)) {
          const upper = typeof mode === 'string' ? mode.toUpperCase() : null;
          if (!RULES.includes(rule)) {
            errors.push({ field: `modes.${rule}`, message: 'unknown rule', type: 'value_error' });
          } else if (!upper || !(MODES as readonly string[]).includes(upper)) {
            errors.push({
              field: `modes.${rule}`,
              message: `must be one of ${MODES.join(', ')}`,
              type: 'value_error',
            });
          } else {
            nextModes[rule] = upper as Mode;
          }
        }
      }
    }
    if (!empty(rawValues)) {
      if (typeof rawValues !== 'object' || Array.isArray(rawValues)) {
        errors.push({
          field: 'thresholds',
          message: 'must be an object of name: value',
          type: 'value_error',
        });
      } else {
        for (const [name, raw] of Object.entries(rawValues as Record<string, unknown>)) {
          const spec = BY_NAME.get(name);
          if (!spec) {
            errors.push({
              field: `thresholds.${name}`,
              message: 'unknown threshold',
              type: 'value_error',
            });
            continue;
          }
          const { value, problem } = number(spec, raw);
          if (problem !== undefined) {
            errors.push({ field: `thresholds.${name}`, message: problem, type: 'value_error' });
          } else {
            nextValues[name] = value!;
          }
        }
      }
    }
    if (errors.length > 0) return { ok: false, detail: 'Settings change is invalid.', errors };
    return write(nextModes, nextValues, (body['reason'] as string).trim(), actor, false);
  }

  /** `POST /v1/islamic/settings/reset`: the defaults, always as a new version. */
  function reset(body: Record<string, unknown>, actor: string): WriteResult {
    const reason = reasonProblem(body['reason']);
    if (reason) return { ok: false, detail: 'One or more fields are invalid.', errors: [reason] };
    return write(DEFAULT_MODES(), DEFAULT_VALUES(), (body['reason'] as string).trim(), actor, true);
  }

  function versions(limit: number): VersionRecord[] {
    return history.slice(0, limit).map((entry) => ({ ...entry, changes: [...entry.changes] }));
  }

  function modeOf(rule: string): Mode {
    return modes[rule] ?? 'ACTIVE';
  }

  return { current, update, reset, versions, modeOf, version: () => latest()?.version ?? 0 };
}

/* ------------------------------------------------------------------ *
 * Pilot hits. What CHARITY_DIVERSION, on trial since version 1, would have
 * added. Synthetic Zakat transactions: none of them raised an alert.
 * ------------------------------------------------------------------ */

export interface MockPilotHit {
  team: string;
  transaction_id: string;
  hoursAgo: number;
  product: string | null;
  event: string | null;
  rule: string;
  kind: 'added' | 'set_aside';
  severity: string | null;
  risk_score: number | null;
  alert_id: string | null;
  case_status: string | null;
  final_label: string | null;
}

export const PILOT_HIT_FIXTURES: readonly MockPilotHit[] = [
  {
    team: 'team-alpha',
    transaction_id: '5a1c0e10-7d1e-4c11-9a01-000000000501',
    hoursAgo: 2,
    product: 'ZAKAT',
    event: 'CHARITY',
    rule: 'CHARITY_DIVERSION',
    kind: 'added',
    severity: 'MEDIUM',
    risk_score: 12.4,
    alert_id: null,
    case_status: null,
    final_label: null,
  },
  {
    team: 'team-alpha',
    transaction_id: '5a1c0e10-7d1e-4c11-9a01-000000000502',
    hoursAgo: 20,
    product: 'ZAKAT',
    event: 'CHARITY',
    rule: 'CHARITY_DIVERSION',
    kind: 'added',
    severity: 'HIGH',
    risk_score: 41,
    alert_id: null,
    case_status: null,
    final_label: null,
  },
  {
    team: 'team-beta',
    transaction_id: '5a1c0e10-7d1e-4c11-9a01-000000000503',
    hoursAgo: 50,
    product: 'ZAKAT',
    event: 'CHARITY',
    rule: 'CHARITY_DIVERSION',
    kind: 'added',
    severity: 'MEDIUM',
    risk_score: 8.2,
    alert_id: null,
    case_status: null,
    final_label: null,
  },
];

function outcome(
  hit: MockPilotHit,
): 'confirmed_fraud' | 'false_positive' | 'open_case' | 'no_case' {
  if (hit.final_label === 'CONFIRMED_FRAUD') return 'confirmed_fraud';
  if (hit.final_label === 'FALSE_POSITIVE') return 'false_positive';
  return hit.case_status ? 'open_case' : 'no_case';
}

/** `GET /v1/islamic/pilot-report?days=` for one caller: their team's hits in the window. */
export function pilotReport(
  days: number,
  visible: (team: string) => boolean,
  modeOf: (rule: string) => string,
  hits: readonly MockPilotHit[] = PILOT_HIT_FIXTURES,
  now: number = Date.now(),
) {
  const since = now - days * 86_400_000;
  const inWindow = hits
    .filter((hit) => visible(hit.team) && now - hit.hoursAgo * 3_600_000 >= since)
    .sort((a, b) => a.hoursAgo - b.hoursAgo);
  const rules = RULES.map((rule) => {
    const row = {
      rule,
      mode_now: modeOf(rule),
      would_flag: 0,
      would_set_aside: 0,
      outcomes: { confirmed_fraud: 0, false_positive: 0, open_case: 0, no_case: 0 },
    };
    for (const hit of inWindow) {
      if (hit.rule !== rule) continue;
      if (hit.kind === 'added') row.would_flag += 1;
      else row.would_set_aside += 1;
      row.outcomes[outcome(hit)] += 1;
    }
    return row;
  });
  return {
    days,
    rules,
    hits: inWindow.slice(0, 200).map(({ team: _team, hoursAgo, ...hit }) => ({
      ...hit,
      booked_at: new Date(now - hoursAgo * 3_600_000).toISOString(),
    })),
  };
}
