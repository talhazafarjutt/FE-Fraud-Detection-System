import { z } from 'zod';
import { RISK_THRESHOLDS } from '@/lib/risk';

/**
 * Analyst feedback — §16.2.
 *
 * THIS IS REJECTED BY THE BACKEND TODAY. `AlertPatch` declares
 * `extra="forbid"`, and a PATCH carrying `feedback` returns 422 with
 * `{"field":"feedback","message":"Extra inputs are not permitted",
 *   "type":"extra_forbidden"}` — verified against the running container.
 * §16.3 specifies the backend work that unblocks it.
 *
 * Why structured feedback at all: closing a case produces the one thing the
 * platform cannot generate for itself — a labelled example. Free text cannot be
 * trained on; these fields can.
 */

export const TRUE_LABELS = ['FRAUD', 'LEGITIMATE', 'INCONCLUSIVE'] as const;
export const CONFIDENCE_LEVELS = ['HIGH', 'MEDIUM', 'LOW'] as const;

export const TYPOLOGIES = [
  'STRUCTURING',
  'MULE_FAN_IN',
  'DORMANT_REACTIVATION',
  'ACCOUNT_TAKEOVER',
  'NIGHT_BURST',
  'LAYERING',
  'OTHER',
] as const;

/** Statuses that represent ground truth and therefore require feedback. */
export const TERMINAL_STATUSES = ['CONFIRMED_FRAUD', 'FALSE_POSITIVE'] as const;

export function isTerminalStatus(status: string): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

export const feedbackSchema = z.object({
  /**
   * INCONCLUSIVE has to exist. Forcing a binary answer on a genuinely uncertain
   * case poisons the training set with confident wrong labels, which is worse
   * than no label at all.
   */
  true_label: z.enum(TRUE_LABELS, {
    errorMap: () => ({ message: 'Pick the outcome you actually established.' }),
  }),
  /** Lets the ML side down-weight hesitant labels rather than treating all as equal. */
  confidence: z.enum(CONFIDENCE_LEVELS),
  typology: z.enum(TYPOLOGIES),
  /**
   * Compared against the model's own `explanation`. Agreement means the model
   * reasons the way a human does; divergence means it is right for the wrong
   * reasons, which is a leading indicator of drift.
   */
  decision_drivers: z
    .array(z.string().max(64))
    .max(20, 'At most 20 decision drivers.')
    .default([]),
  /** Derived by the UI, never typed by the analyst. */
  model_agreed: z.boolean(),
  /**
   * The most valuable field in the form: features the analyst used that the
   * model does not have. A feature-request pipeline from the people doing the
   * work.
   */
  missing_signals: z
    .array(z.string().max(64))
    .max(10, 'At most 10 missing signals.')
    .default([]),
  reviewed_at: z.string(),
  time_to_decide_seconds: z.number().int().min(0),
});
export type Feedback = z.infer<typeof feedbackSchema>;

/**
 * `model_agreed` compares the analyst's verdict with whether the model's score
 * crossed the alert threshold — not with the model's advisory `decision`, which
 * the backend recomputes anyway.
 *
 * INCONCLUSIVE cannot agree or disagree with anything, so it is reported as
 * disagreement-neutral: the caller renders it as "not comparable".
 */
export function computeModelAgreement(
  trueLabel: (typeof TRUE_LABELS)[number],
  fraudProbability: number,
): boolean | null {
  if (trueLabel === 'INCONCLUSIVE') return null;
  const modelSaidFraud = fraudProbability >= RISK_THRESHOLDS.HIGH;
  return trueLabel === 'FRAUD' ? modelSaidFraud : !modelSaidFraud;
}

/** Form shape — `model_agreed`/`reviewed_at`/timing are added at submit time. */
export const feedbackFormSchema = z.object({
  true_label: z.enum(TRUE_LABELS),
  confidence: z.enum(CONFIDENCE_LEVELS),
  typology: z.enum(TYPOLOGIES),
  decision_drivers: z.array(z.string()).max(20).default([]),
  missing_signals: z.array(z.string()).max(10).default([]),
});
export type FeedbackFormValues = z.infer<typeof feedbackFormSchema>;
