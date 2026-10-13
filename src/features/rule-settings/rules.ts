import {
  type RuleMode,
  type RuleSettings,
  type RuleSettingsChange,
  type ThresholdSpec,
  isRuleMode,
} from '@/api/schemas/ruleSettings';

/** Query-key root for the layer's settings, their history and the pilot report. */
export const ruleSettingsKey = ['islamic', 'settings'] as const;
export const ruleSettingsHistoryKey = ['islamic', 'settings', 'history'] as const;
export const pilotReportKey = ['islamic', 'pilot-report'] as const;

/** The scope that changes settings. SUPERVISOR only. */
export const RULES_MANAGE = 'rules:manage';

/**
 * Each rule in one plain line — what it looks for, not how. The layer's own
 * findings carry the specifics (which contract, how many days) per hit.
 */
export const RULE_MEANING: Record<string, string> = {
  MURABAHA_SUPPLIER_MISMATCH:
    'A Murabaha disbursement paid to someone other than the supplier the asset is bought from.',
  THIRD_PARTY_REPAYMENT:
    'An instalment paid by someone other than the customer — a warning, high when the payer is new, risky or repays many contracts.',
  SETTLEMENT_FUNDED_BY_FAN_IN:
    'An early settlement paid for by a burst of inbound payments from many senders.',
  COMMODITY_ROUND_TRIP: 'A Murabaha asset sold back to the supplier it was just bought from.',
  TAKAFUL_EARLY_CLAIM:
    'A Takaful claim soon after the cover started — a warning, high when the payee is new, risky or claimed recently.',
  CHARITY_DIVERSION:
    'Zakat from several senders landing in a newly opened account — high when it is paid straight back out.',
  CONTRACT_INCOHERENT:
    "A payment the contract's own terms contradict: past the tenor, before the start, or more than is left.",
  CONTRACT_MISMATCH: "The transaction's labels contradict the contract as the bank registered it.",
  PAYMENT_ON_CLOSED_CONTRACT: 'Money moving on a contract registered as settled or cancelled.',
  DOUBLE_FINANCED_ASSET: 'The financed asset is also registered on another contract.',
  ORIGIN_ACCOUNT_DRAIN:
    "Clears the core 'account emptied' warning when an early settlement matches its registered schedule.",
  ROUND_AMOUNT_BURST:
    "Clears the core 'round-amount burst' warning when a payment matches its scheduled instalment.",
};

export function ruleMeaning(rule: string): string | null {
  return RULE_MEANING[rule] ?? null;
}

export const KIND_LABEL: Record<string, string> = {
  added: 'Adds a finding',
  set_aside: 'Removes a false alarm',
};

export function kindLabel(kind: string | null | undefined): string {
  return (kind && KIND_LABEL[kind]) || 'Rule';
}

export const MODE_LABEL: Record<RuleMode, string> = {
  ACTIVE: 'Active',
  PILOT: 'Pilot',
  OFF: 'Off',
};

export const MODE_HINT: Record<RuleMode, string> = {
  ACTIVE: 'Applied to the score',
  PILOT: 'Recorded only, never applied',
  OFF: 'Not run',
};

export function modeLabel(mode: string | null | undefined): string {
  return isRuleMode(mode) ? MODE_LABEL[mode] : (mode ?? '—');
}

/** Rules in a stable order: the server's `rule_kinds`, then any mode it names besides. */
export function ruleNames(settings: RuleSettings): string[] {
  const names = Object.keys(settings.rule_kinds);
  for (const rule of Object.keys(settings.modes)) if (!names.includes(rule)) names.push(rule);
  return names;
}

/* ------------------------------------------------------------------ *
 * Units. A `share` is a 0–1 fraction on the wire and a percentage on
 * screen; nothing else is converted.
 * ------------------------------------------------------------------ */

export function isShare(unit: string): boolean {
  return unit === 'share';
}

/** Up to `digits` decimals, trailing zeros dropped: 80, 0.5, 12.25. */
function trim(value: number, digits = 4): string {
  return String(Number(value.toFixed(digits)));
}

/** The number an input shows for a wire value: 0.8 → "80" for a share. */
export function toDisplay(value: number, unit: string): string {
  return isShare(unit) ? trim(value * 100) : trim(value);
}

/** The wire value for what an input holds: "80" → 0.8 for a share. Null when not a number. */
export function fromDisplay(text: string, unit: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const number = Number(trimmed);
  if (!Number.isFinite(number)) return null;
  return isShare(unit) ? Number((number / 100).toFixed(8)) : number;
}

/** The suffix beside an input or value. */
export function unitSuffix(unit: string): string {
  switch (unit) {
    case 'share':
    case 'percent':
      return '%';
    case 'count':
      return '';
    default:
      return unit;
  }
}

/** A wire value, read: "80%", "72 hours", "tier 4", "5". */
export function formatThreshold(value: number | string | null | undefined, unit: string): string {
  if (value === null || value === undefined || value === '') return '—';
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return String(value);
  const shown = toDisplay(number, unit);
  if (unit === 'share' || unit === 'percent') return `${shown}%`;
  if (unit === 'tier') return `tier ${shown}`;
  if (unit === 'count') return shown;
  if (unit === 'days' || unit === 'hours') {
    return `${shown} ${number === 1 ? unit.slice(0, -1) : unit}`;
  }
  return `${shown} ${unit}`;
}

/** "1–365 days", "10–100%", in what the input shows. */
export function rangeText(spec: ThresholdSpec): string {
  const low = toDisplay(spec.min, spec.unit);
  const high = toDisplay(spec.max, spec.unit);
  const suffix = unitSuffix(spec.unit);
  if (suffix === '%') return `${low}–${high}%`;
  if (spec.unit === 'tier') return `tier ${low}–${high}`;
  return suffix ? `${low}–${high} ${suffix}` : `${low}–${high}`;
}

/** A client-side check of what an input holds, in the server's words where it has them. */
export function thresholdProblem(text: string, spec: ThresholdSpec): string | null {
  const value = fromDisplay(text, spec.unit);
  if (text.trim() === '') return 'Enter a value';
  if (value === null) return 'Must be a number';
  if (value < spec.min || value > spec.max) return `Must be between ${rangeText(spec)}`;
  if (!isShare(spec.unit) && !Number.isInteger(value)) {
    return `Must be a whole number${spec.unit === 'count' ? '' : ` of ${spec.unit}`}`;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * The draft an editor holds: modes as sent, thresholds as typed.
 * ------------------------------------------------------------------ */

export interface Draft {
  modes: Record<string, string>;
  values: Record<string, string>;
}

export function draftFrom(settings: RuleSettings): Draft {
  const values: Record<string, string> = {};
  for (const spec of settings.schema) {
    const value = settings.thresholds[spec.name] ?? spec.default;
    values[spec.name] = toDisplay(value, spec.unit);
  }
  return { modes: { ...settings.modes }, values };
}

export function modeChanged(settings: RuleSettings, draft: Draft, rule: string): boolean {
  return (draft.modes[rule] ?? settings.modes[rule]) !== settings.modes[rule];
}

export function thresholdChanged(
  settings: RuleSettings,
  draft: Draft,
  spec: ThresholdSpec,
): boolean {
  const text = draft.values[spec.name];
  if (text === undefined) return false;
  const original = settings.thresholds[spec.name] ?? spec.default;
  return fromDisplay(text, spec.unit) !== original;
}

/** Only what differs from the version in force — the PUT carries nothing else. */
export function changeFrom(
  settings: RuleSettings,
  draft: Draft,
  reason: string,
): RuleSettingsChange {
  const modes: Record<string, RuleMode> = {};
  for (const rule of Object.keys(draft.modes)) {
    const mode = draft.modes[rule];
    if (isRuleMode(mode) && modeChanged(settings, draft, rule)) modes[rule] = mode;
  }
  const thresholds: Record<string, number> = {};
  for (const spec of settings.schema) {
    if (!thresholdChanged(settings, draft, spec)) continue;
    const value = fromDisplay(draft.values[spec.name] ?? '', spec.unit);
    if (value !== null) thresholds[spec.name] = value;
  }
  return {
    ...(Object.keys(modes).length > 0 ? { modes } : {}),
    ...(Object.keys(thresholds).length > 0 ? { thresholds } : {}),
    reason: reason.trim(),
  };
}

export function changeCount(settings: RuleSettings, draft: Draft): number {
  const modes = ruleNames(settings).filter((rule) => modeChanged(settings, draft, rule)).length;
  const values = settings.schema.filter((spec) => thresholdChanged(settings, draft, spec)).length;
  return modes + values;
}

/** True when every value and mode is the shipped default. */
export function atDefaults(settings: RuleSettings): boolean {
  return (
    Object.values(settings.modes).every((mode) => mode === 'ACTIVE') &&
    settings.schema.every(
      (spec) => (settings.thresholds[spec.name] ?? spec.default) === spec.default,
    )
  );
}

/* ------------------------------------------------------------------ *
 * History: "thresholds.EARLY_CLAIM_DAYS" / "modes.TAKAFUL_EARLY_CLAIM".
 * ------------------------------------------------------------------ */

export function changeField(field: string): { kind: 'mode' | 'threshold' | 'other'; name: string } {
  if (field.startsWith('modes.')) return { kind: 'mode', name: field.slice('modes.'.length) };
  if (field.startsWith('thresholds.')) {
    return { kind: 'threshold', name: field.slice('thresholds.'.length) };
  }
  return { kind: 'other', name: field };
}

export function formatChangeValue(
  field: string,
  value: string | number | null | undefined,
  schema: readonly ThresholdSpec[],
): string {
  const { kind, name } = changeField(field);
  if (kind === 'mode') return modeLabel(typeof value === 'string' ? value : String(value ?? '—'));
  if (kind === 'threshold') {
    const spec = schema.find((entry) => entry.name === name);
    return spec ? formatThreshold(value, spec.unit) : String(value ?? '—');
  }
  return String(value ?? '—');
}
