import { z } from 'zod';
import { isoDateTime, looseAlertSeverity, looseAlertStatus, uuid } from './common';

/**
 * Cases — the unit of human judgement.
 *
 * A criminal scheme produces many alerts: one mule ring in the seeded data
 * raises 17 of them and exactly 1 case. Without the grouping an analyst works
 * the same ring seventeen times and a supervisor signs off seventeen times, and
 * retraining gets seventeen correlated labels for one event.
 *
 * `alert_count` is therefore the most important number on the screen — it is
 * the only thing that makes the grouping visible.
 *
 * Every schema here is `.passthrough()` with contract-dependent fields
 * optional: a backend free to add a field must never be able to blank a page.
 */

export const FINAL_LABELS = ['CONFIRMED_FRAUD', 'FALSE_POSITIVE', 'INCONCLUSIVE'] as const;
export const LABEL_CONFIDENCE = ['LOW', 'MEDIUM', 'HIGH'] as const;
export const MODEL_AGREEMENT = ['AGREES', 'DISAGREES', 'PARTIAL'] as const;

export const finalLabelSchema = z.enum(FINAL_LABELS);
export const labelConfidenceSchema = z.enum(LABEL_CONFIDENCE);
export const modelAgreementSchema = z.enum(MODEL_AGREEMENT);

export type FinalLabel = z.infer<typeof finalLabelSchema>;
export type LabelConfidence = z.infer<typeof labelConfidenceSchema>;
export type ModelAgreement = z.infer<typeof modelAgreementSchema>;

export const triggeredRuleSchema = z
  .object({
    rule: z.string(),
    severity: z.string().nullish(),
    description: z.string().nullish(),
  })
  .passthrough();
export type TriggeredRule = z.infer<typeof triggeredRuleSchema>;

/**
 * The verdict, as stored. `original_*` are the scores AT THE MOMENT OF THE
 * DECISION, not current ones — a re-score months later must not rewrite what
 * the reviewer actually saw, or the audit trail becomes fiction.
 */
export const caseFeedbackSchema = z
  .object({
    id: uuid,
    case_id: uuid,
    anchor_alert_id: uuid.nullish(),
    score_id: uuid.nullish(),
    transaction_id: uuid.nullish(),
    alert_count: z.number().int().nullish(),
    final_label: z.union([finalLabelSchema, z.string()]),
    confidence: z.union([labelConfidenceSchema, z.string()]),
    model_agreement: z.union([modelAgreementSchema, z.string()]),
    fraud_typology: z.string().nullish(),
    decision_drivers: z.array(z.string()).nullish(),
    missing_signals: z.array(z.string()).nullish(),
    notes: z.string().nullish(),
    reviewer_user_id: z.string().nullish(),
    alert_opened_at: isoDateTime.nullish(),
    decided_at: isoDateTime,
    model_version: z.string().nullish(),
    risk_engine_version: z.string().nullish(),
    original_risk_score: z.number().nullish(),
    original_model_score: z.number().nullish(),
    original_rule_score: z.number().nullish(),
    original_anomaly_score: z.number().nullish(),
    original_network_score: z.number().nullish(),
    original_triggered_rules: z.array(triggeredRuleSchema).nullish(),
  })
  .passthrough();
export type CaseFeedback = z.infer<typeof caseFeedbackSchema>;

export const caseSchema = z
  .object({
    id: uuid,
    title: z.string(),
    status: looseAlertStatus,
    severity: looseAlertSeverity,
    team: z.string(),
    assigned_to: z.string().nullish(),
    opened_at: isoDateTime,
    closed_at: isoDateTime.nullish(),
    /** Optional on the wire; a case with no count still renders as "1 alert". */
    alert_count: z.number().int().nullish(),
  })
  .passthrough();
export type CaseRow = z.infer<typeof caseSchema>;

export const caseMemberAlertSchema = z
  .object({
    id: uuid,
    transaction_id: uuid,
    score_id: uuid.nullish(),
    status: looseAlertStatus,
    severity: looseAlertSeverity,
    opened_at: isoDateTime,
  })
  .passthrough();
export type CaseMemberAlert = z.infer<typeof caseMemberAlertSchema>;

export const caseDetailSchema = caseSchema
  .extend({
    alerts: z.array(caseMemberAlertSchema).nullish(),
    feedback: caseFeedbackSchema.nullish(),
  })
  .passthrough();
export type CaseDetail = z.infer<typeof caseDetailSchema>;

/* ------------------------------------------------------------------ *
 * Concluding
 * ------------------------------------------------------------------ */

/**
 * The verdict form. `final_label`, `confidence` and `model_agreement` are
 * required by the server; a status change to a verdict without a feedback block
 * is a 409.
 *
 * Nothing here is pre-filled anywhere in the UI. A pre-filled label is a guess
 * recorded as human judgement, and this record is training data.
 */
export const feedbackInputSchema = z.object({
  final_label: finalLabelSchema,
  confidence: labelConfidenceSchema,
  model_agreement: modelAgreementSchema,
  fraud_typology: z.string().max(64).optional(),
  decision_drivers: z.array(z.string().max(120)).max(20).default([]),
  missing_signals: z.array(z.string().max(120)).max(20).default([]),
  notes: z.string().max(2000).optional(),
});
export type FeedbackInput = z.infer<typeof feedbackInputSchema>;

export interface CasePatchInput {
  status?: string;
  title?: string;
  assigned_to?: string;
  note?: string;
  feedback?: FeedbackInput;
}
