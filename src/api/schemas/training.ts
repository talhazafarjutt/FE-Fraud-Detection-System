import { z } from 'zod';
import { caseFeedbackSchema } from './cases';
import { isoDateTime, uuid } from './common';

/**
 * Training curation and training runs — supervisor only.
 *
 * A concluded case is not automatically training data. Its verdict arrives here
 * as a CANDIDATE; a supervisor approves it (fit to teach a model) or excludes
 * it (with a reason). A supervisor then selects approved records and requests a
 * training run, which freezes them and queues the run for the ML service.
 *
 * Nothing trains on its own, and nothing trains inside this console or the API.
 */

export const TRAINING_STATUSES = ['CANDIDATE', 'APPROVED', 'EXCLUDED'] as const;
export type TrainingStatus = (typeof TRAINING_STATUSES)[number];

export const RUN_STATUSES = ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

const trainingStatusSchema = z.union([z.enum(TRAINING_STATUSES), z.string()]);
const runStatusSchema = z.union([z.enum(RUN_STATUSES), z.string()]);

export const trainingRecordSchema = caseFeedbackSchema
  .extend({
    case_opened_at: isoDateTime.nullish(),
    case_title: z.string().nullish(),
    case_status: z.string().nullish(),
    external_ref: z.string().nullish(),
    team: z.string(),
    training_status: trainingStatusSchema,
    training_note: z.string().nullish(),
    training_reviewed_by: z.string().nullish(),
    training_reviewed_at: isoDateTime.nullish(),
    run_count: z.number().int().nullish(),
  })
  .passthrough();
export type TrainingRecord = z.infer<typeof trainingRecordSchema>;

export const trainingRunSchema = z
  .object({
    id: uuid,
    name: z.string(),
    notes: z.string().nullish(),
    status: runStatusSchema,
    requested_by: z.string().nullish(),
    requested_at: isoDateTime,
    started_at: isoDateTime.nullish(),
    finished_at: isoDateTime.nullish(),
    record_count: z.number().int(),
    label_counts: z.record(z.string(), z.number()).nullish(),
    base_model_version: z.string().nullish(),
    executor: z.string().nullish(),
    result_model_version: z.string().nullish(),
    metrics: z.record(z.string(), z.unknown()).nullish(),
    error: z.string().nullish(),
    warnings: z.array(z.string()).nullish(),
  })
  .passthrough();
export type TrainingRun = z.infer<typeof trainingRunSchema>;

export const trainingRunRecordSchema = z
  .object({
    id: uuid,
    feedback_id: z.string().nullish(),
    case_id: z.string().nullish(),
    final_label: z.string(),
    snapshot: z.record(z.string(), z.unknown()),
  })
  .passthrough();
export type TrainingRunRecord = z.infer<typeof trainingRunRecordSchema>;

/** What a supervisor may change. No `final_label` and no engine snapshot. */
export interface TrainingRecordPatch {
  training_status?: TrainingStatus;
  training_note?: string;
  confidence?: string;
  fraud_typology?: string;
  decision_drivers?: string[];
  missing_signals?: string[];
  notes?: string;
}

export interface TrainingRunInput {
  name: string;
  notes?: string;
  record_ids: string[];
}

/**
 * The evaluation a run reports back. Every field is optional because the ML
 * service owns this shape: a real training job adds its own metrics, and the
 * console shows the ones it recognises without failing on the rest.
 */
export interface RunMetrics {
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
