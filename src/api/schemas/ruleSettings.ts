import { z } from 'zod';
import { uuid } from './common';

/**
 * The Islamic layer's rule settings — `GET/PUT /v1/islamic/settings`,
 * `POST /v1/islamic/settings/reset`, `GET /v1/islamic/settings/history` — and
 * what rules on trial would have done, `GET /v1/islamic/pilot-report`.
 *
 * Settings are per deployment, not per team, and versioned: version 0 is the
 * shipped defaults (no one has changed anything, so `updated_*` and `reason`
 * are null). Reading needs alerts:read; changing needs rules:manage.
 */

export const RULE_MODES = ['ACTIVE', 'PILOT', 'OFF'] as const;
export type RuleMode = (typeof RULE_MODES)[number];

export function isRuleMode(value: unknown): value is RuleMode {
  return typeof value === 'string' && (RULE_MODES as readonly string[]).includes(value);
}

/** "added": a finding the layer adds. "set_aside": an engine rule it explains away. */
export type RuleKind = 'added' | 'set_aside';

/**
 * `share` is a 0–1 fraction (0.8 = 80%): shown and edited as a percentage,
 * always sent as the fraction. Every other unit is a whole number.
 */
export type ThresholdUnit = 'days' | 'hours' | 'count' | 'share' | 'percent' | 'tier';

export const thresholdSpecSchema = z
  .object({
    name: z.string(),
    rules: z.array(z.string()).default([]),
    default: z.number(),
    min: z.number(),
    max: z.number(),
    unit: z.string(),
    help: z
      .string()
      .nullish()
      .transform((help) => help ?? ''),
  })
  .passthrough();
export type ThresholdSpec = z.infer<typeof thresholdSpecSchema>;

export const ruleSettingsSchema = z
  .object({
    version: z.number(),
    updated_at: z.string().nullish(),
    updated_by: z.string().nullish(),
    reason: z.string().nullish(),
    modes: z.record(z.string()).default({}),
    thresholds: z.record(z.number()).default({}),
    rule_kinds: z.record(z.string()).default({}),
    schema: z.array(thresholdSpecSchema).default([]),
  })
  .passthrough();
export type RuleSettings = z.infer<typeof ruleSettingsSchema>;

/** PUT body: only what changes. `reason` is 3–500 characters once trimmed. */
export interface RuleSettingsChange {
  modes?: Record<string, RuleMode>;
  thresholds?: Record<string, number>;
  reason: string;
}

export const REASON_MIN = 3;
export const REASON_MAX = 500;

export const settingsChangeSchema = z
  .object({
    field: z.string(),
    before: z.union([z.string(), z.number()]).nullish(),
    after: z.union([z.string(), z.number()]).nullish(),
  })
  .passthrough();
export type SettingsChange = z.infer<typeof settingsChangeSchema>;

export const settingsVersionSchema = z
  .object({
    version: z.number(),
    updated_at: z.string().nullish(),
    updated_by: z.string().nullish(),
    reason: z.string().nullish(),
    reset: z.boolean().default(false),
    changes: z.array(settingsChangeSchema).default([]),
  })
  .passthrough();
export type SettingsVersion = z.infer<typeof settingsVersionSchema>;

export const settingsHistorySchema = z.array(settingsVersionSchema);

export const pilotOutcomesSchema = z
  .object({
    confirmed_fraud: z.number().default(0),
    false_positive: z.number().default(0),
    open_case: z.number().default(0),
    no_case: z.number().default(0),
  })
  .passthrough();
export type PilotOutcomes = z.infer<typeof pilotOutcomesSchema>;

const NO_OUTCOMES: PilotOutcomes = {
  confirmed_fraud: 0,
  false_positive: 0,
  open_case: 0,
  no_case: 0,
};

export const pilotRuleSchema = z
  .object({
    rule: z.string(),
    mode_now: z.string(),
    would_flag: z.number().default(0),
    would_set_aside: z.number().default(0),
    outcomes: pilotOutcomesSchema.nullish().transform((outcomes) => outcomes ?? NO_OUTCOMES),
  })
  .passthrough();
export type PilotRule = z.infer<typeof pilotRuleSchema>;

export const pilotHitSchema = z
  .object({
    transaction_id: z.string(),
    booked_at: z.string(),
    product: z.string().nullish(),
    event: z.string().nullish(),
    rule: z.string(),
    kind: z.string(),
    severity: z.string().nullish(),
    risk_score: z.number().nullish(),
    // Becomes a route target: anything but a uuid is dropped, not linked.
    alert_id: uuid.nullish().catch(null),
    case_status: z.string().nullish(),
    final_label: z.string().nullish(),
  })
  .passthrough();
export type PilotHit = z.infer<typeof pilotHitSchema>;

export const pilotReportSchema = z
  .object({
    days: z.number(),
    rules: z.array(pilotRuleSchema).default([]),
    hits: z.array(pilotHitSchema).default([]),
  })
  .passthrough();
export type PilotReport = z.infer<typeof pilotReportSchema>;

export const PILOT_WINDOWS = [7, 30, 90] as const;
