import { z } from 'zod';
import { caseFeedbackSchema } from './cases';
import { isoDateTime, uuid } from './common';

/**
 * Labelled feedback curation and export batches — supervisor only.
 *
 * A concluded case is not automatically labelled feedback. Its verdict arrives
 * here PENDING; a supervisor validates it (fit for reuse) or excludes it (with
 * a reason). A supervisor then selects validated records and creates an export
 * batch, which freezes them and queues the batch for the ML service.
 *
 * Nothing retrains automatically, and no model work happens in this console or
 * the API.
 */

export const CURATION_STATUSES = ['PENDING', 'VALIDATED', 'EXCLUDED'] as const;
export type CurationStatus = (typeof CURATION_STATUSES)[number];

export const BATCH_STATUSES = ['QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'] as const;

const curationStatusSchema = z.union([z.enum(CURATION_STATUSES), z.string()]);
const batchStatusSchema = z.union([z.enum(BATCH_STATUSES), z.string()]);

export const labelledFeedbackSchema = caseFeedbackSchema
  .extend({
    case_title: z.string().nullish(),
    case_status: z.string().nullish(),
    external_ref: z.string().nullish(),
    team: z.string(),
    curation_status: curationStatusSchema,
    curation_note: z.string().nullish(),
    curated_by: z.string().nullish(),
    curated_at: isoDateTime.nullish(),
    batch_count: z.number().int().nullish(),
  })
  .passthrough();
export type LabelledFeedback = z.infer<typeof labelledFeedbackSchema>;

export const exportBatchSchema = z
  .object({
    id: uuid,
    name: z.string(),
    notes: z.string().nullish(),
    status: batchStatusSchema,
    requested_by: z.string().nullish(),
    /** Null when a cross-team supervisor created it. */
    team: z.string().nullish(),
    requested_at: isoDateTime,
    started_at: isoDateTime.nullish(),
    finished_at: isoDateTime.nullish(),
    record_count: z.number().int(),
    label_counts: z.record(z.string(), z.number()).nullish(),
    base_model_version: z.string().nullish(),
    processed_by: z.string().nullish(),
    candidate_model_version: z.string().nullish(),
    metrics: z.record(z.string(), z.unknown()).nullish(),
    error: z.string().nullish(),
    warnings: z.array(z.string()).nullish(),
  })
  .passthrough();
export type ExportBatch = z.infer<typeof exportBatchSchema>;

export const exportBatchRecordSchema = z
  .object({
    id: uuid,
    feedback_id: z.string().nullish(),
    case_id: z.string().nullish(),
    final_label: z.string(),
    snapshot: z.record(z.string(), z.unknown()),
  })
  .passthrough();
export type ExportBatchRecord = z.infer<typeof exportBatchRecordSchema>;

/** What a supervisor may change. No `final_label` and no engine snapshot. */
export interface LabelledFeedbackPatch {
  curation_status?: CurationStatus;
  /** Null clears it. */
  curation_note?: string | null;
  confidence?: string;
  fraud_typology?: string;
  decision_drivers?: string[];
  missing_signals?: string[];
  notes?: string;
}

export interface ExportBatchInput {
  name: string;
  notes?: string;
  record_ids: string[];
}

/**
 * What the ML service reports for a batch. Every field is optional because the
 * ML service owns this shape: the console shows the ones it recognises without
 * failing on the rest. The reference worker reports `mode: "engine_check"`.
 */
export interface BatchMetrics {
  mode?: string;
  note?: string;
  threshold?: number;
  records_evaluated?: number;
  engine_caught?: number;
  engine_missed?: number;
  engine_false_alarms?: number;
  precision?: number | null;
  recall_on_curated_set?: number | null;
  [key: string]: unknown;
}
