import { z } from 'zod';
import {
  alertStatusSchema,
  decimalString,
  isoDateTime,
  looseAlertSeverity,
  looseAlertStatus,
  looseExplanationSchema,
  uuid,
} from './common';

/**
 * The score's origin: which model, which engine version, which score row. This
 * is what pins a case to the exact score that raised it, so a re-score later
 * cannot quietly rewrite the evidence.
 */
export const provenanceSchema = z
  .object({
    transaction_id: uuid.nullish(),
    score_id: uuid.nullish(),
    alert_id: uuid.nullish(),
    model_name: z.string().nullish(),
    model_version: z.string().nullish(),
    risk_engine_version: z.string().nullish(),
    scored_at: isoDateTime.nullish(),
  })
  .passthrough();
export type Provenance = z.infer<typeof provenanceSchema>;

/**
 * `.passthrough()` throughout: the risk engine is mid-rollout and the backend is
 * adding fields to these payloads. Stripping unknown keys is how `risk_score`
 * and `alert_severity` went missing from the transaction table without any
 * error — a new field should survive to the UI, not vanish silently.
 */
export const alertSchema = z
  .object({
    id: uuid,
    transaction_id: uuid,
    status: looseAlertStatus,
    severity: looseAlertSeverity,
    /**
     * VERIFIED: `fraud_probability` (0–1) is still returned and is the only
     * populated score. `risk_score` (0–100) is the V1 replacement but is null on
     * every alert the deployed backend has — all of them come from `stub-rules`.
     * Both are optional so the UI can prefer the score and fall back honestly.
     */
    fraud_probability: z.number().nullable().default(null),
    risk_score: z.number().nullable().default(null),
    team: z.string(),
    assigned_to: uuid.nullable(),
    opened_at: isoDateTime,
    closed_at: isoDateTime.nullable(),
    amount: decimalString.nullable().default(null),
    currency: z.string().nullable().default(null),
    case_id: uuid.nullable().default(null),
    score_id: uuid.nullable().default(null),
    /**
     * An OBJECT, not a string.
     *
     * This was typed as `z.string()`, which meant EVERY alert row on the current
     * contract failed validation. Tolerant parsing then dropped all fifty and
     * the queue rendered "no alerts match these filters" — a wrong-but-plausible
     * empty state, with a 200 in the network panel and nothing in the console.
     * Exactly the silent class of failure this schema layer exists to prevent.
     */
    provenance: provenanceSchema.nullable().default(null),
  })
  .passthrough();
export type Alert = z.infer<typeof alertSchema>;

export const alertEventSchema = z.object({
  id: uuid,
  from_status: z.string().nullable(),
  to_status: z.string(),
  note: z.string().nullable(),
  actor_user_id: uuid.nullable(),
  created_at: isoDateTime,
});
export type AlertEvent = z.infer<typeof alertEventSchema>;

/* ------------------------------------------------------------------ *
 * Risk engine payload.
 *
 * These keys ARE present on the deployed alert detail, but every one of them is
 * null or empty on all 15 alerts sampled — the engine is deployed but not yet
 * producing. Each is nullable so the page renders what exists and says plainly
 * when a section has nothing, rather than crashing or inventing a value.
 * ------------------------------------------------------------------ */

export const signalsSchema = z
  .object({
    model_score: z.number().nullable().default(null),
    rule_score: z.number().nullable().default(null),
    anomaly_score: z.number().nullable().default(null),
    network_score: z.number().nullable().default(null),
    weighted_score: z.number().nullable().default(null),
    rule_floor_applied: z.boolean().default(false),
  })
  .passthrough();
export type Signals = z.infer<typeof signalsSchema>;

export const triggeredRuleSchema = z
  .object({
    rule: z.string(),
    severity: z.string().nullable().default(null),
    description: z.string().nullable().default(null),
  })
  .passthrough();
export type TriggeredRule = z.infer<typeof triggeredRuleSchema>;

export const decisionReasonSchema = z
  .object({
    source: z.string(),
    code: z.string().nullable().default(null),
    description: z.string().nullable().default(null),
  })
  .passthrough();
export type DecisionReason = z.infer<typeof decisionReasonSchema>;

export const networkSchema = z
  .object({
    network_score: z.number().nullable().default(null),
    /**
     * A MAP of indicator name to value on the current contract
     * (`{receiver_fan_in: 4.0, ...}`), an array on the older one. Accept both:
     * a wrong container type here fails the whole alert detail.
     */
    indicators: z
      .union([z.record(z.unknown()), z.array(z.unknown())])
      .nullish()
      .default({}),
    evidence: z.array(z.unknown()).nullish().default([]),
    neighborhood: z
      .object({
        nodes: z.array(z.unknown()).default([]),
        edges: z.array(z.unknown()).default([]),
      })
      .passthrough()
      .nullish()
      .default(null),
  })
  .passthrough();
export type AlertNetwork = z.infer<typeof networkSchema>;

export const anomalySchema = z
  .object({
    is_anomaly: z.boolean().nullable().default(null),
    anomaly_score: z.number().nullable().default(null),
    threshold: z.number().nullable().default(null),
  })
  .passthrough();

export const alertDetailSchema = alertSchema
  .extend({
    events: z.array(alertEventSchema).default([]),
    explanation: looseExplanationSchema,
    model_name: z.string().nullable().default(null),
    model_version: z.string().nullable().default(null),
    model_decision: z.string().nullable().default(null),
    risk_engine_version: z.string().nullable().default(null),
    signals: signalsSchema.nullable().default(null),
    triggered_rules: z.array(triggeredRuleSchema).default([]),
    network: networkSchema.nullable().default(null),
    anomaly: anomalySchema.nullable().default(null),
    decision_reasons: z.array(decisionReasonSchema).default([]),
  })
  .passthrough();
export type AlertDetail = z.infer<typeof alertDetailSchema>;

export const alertPageSchema = z.object({
  items: z.array(alertSchema),
  next_cursor: z.string().nullable().default(null),
  page_size: z.number().int(),
});
/**
 * `skipped` counts rows dropped by tolerant parsing — see api/compat.ts. The UI
 * surfaces it as a quiet notice rather than failing the page.
 */
export type AlertPage = z.infer<typeof alertPageSchema> & { skipped: number };

export const alertPatchSchema = z.object({
  status: alertStatusSchema.optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  note: z.string().max(2000, 'Notes are limited to 2000 characters.').optional(),
  /**
   * No `feedback` key: the deployed API 422s it on this endpoint. The verdict
   * now belongs to the case — see endpoints/alerts.ts for the full note.
   */
});
export type AlertPatch = z.infer<typeof alertPatchSchema>;

export interface AlertFilters {
  status?: string;
  severity?: string;
  min_probability?: number;
  limit?: number;
}
