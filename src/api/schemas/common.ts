import { z } from 'zod';

/**
 * Schemas mirror the live OpenAPI document (verified 2026-09-04 against the
 * running container, not just the brief). Where the server declares a loose
 * type we stay loose too: parsing must fail on genuine contract drift, never on
 * a field the backend was always allowed to widen.
 */

export const uuid = z.string().uuid();
export const isoDateTime = z.string().min(1);

/** Decimal amounts arrive as strings and stay strings. */
export const decimalString = z.string();

export const alertStatusSchema = z.enum([
  'OPEN',
  'IN_REVIEW',
  'ESCALATED',
  'CONFIRMED_FRAUD',
  'FALSE_POSITIVE',
  'CLOSED',
]);
export type AlertStatus = z.infer<typeof alertStatusSchema>;

export const alertSeveritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type AlertSeverity = z.infer<typeof alertSeveritySchema>;

export const transactionTypeSchema = z.enum([
  'TRANSFER',
  'CASH_OUT',
  'CASH_IN',
  'PAYMENT',
  'DEBIT',
]);
export type TransactionType = z.infer<typeof transactionTypeSchema>;

export const modelDecisionSchema = z.enum(['ALLOW', 'REVIEW', 'BLOCK']);

/**
 * The server types alert `status`/`severity` as plain strings on the way out
 * (only the query params are enum-constrained). Accept the enum, fall back to
 * the raw string so an added status never blanks the queue mid-demo.
 */
export const looseAlertStatus = z.union([alertStatusSchema, z.string()]);
export const looseAlertSeverity = z.union([alertSeveritySchema, z.string()]);

/**
 * AlertDetailOut.explanation is `array<object>` with additionalProperties:true,
 * so it is not guaranteed to be {feature, contribution}. Keep only the entries
 * that are usable and drop the rest rather than failing the whole page.
 */
export const reasonSchema = z
  .object({
    feature: z.string(),
    contribution: z.number(),
    /**
     * Present on the current contract and worth keeping: `direction` says which
     * way the feature pushed, `description` is the human sentence. Declaring
     * them is what stops Zod's default key-stripping from throwing them away
     * before they reach the screen.
     */
    direction: z.string().nullish(),
    description: z.string().nullish(),
  })
  .passthrough();
export type Reason = z.infer<typeof reasonSchema>;

export const looseExplanationSchema = z
  .array(z.unknown())
  .default([])
  .transform((entries) =>
    entries.flatMap((entry) => {
      const parsed = reasonSchema.safeParse(entry);
      return parsed.success ? [parsed.data] : [];
    }),
  );

export const healthSchema = z.object({
  status: z.string(),
  version: z.string().optional(),
  checks: z.record(z.string()).default({}),
});
export type Health = z.infer<typeof healthSchema>;
