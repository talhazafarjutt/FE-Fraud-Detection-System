import { z } from 'zod';

/**
 * `GET /v1/islamic/summary` — served by the Islamic layer, team-scoped like
 * other reads. Only requested when `meta.layers` includes the layer.
 */

export const islamicProductRowSchema = z
  .object({
    product: z.string(),
    label: z.string().nullish(),
    transactions: z.number().default(0),
    alerts: z.number().default(0),
    set_aside: z.number().default(0),
    confirmed_fraud: z.number().default(0),
    false_positive: z.number().default(0),
  })
  .passthrough();
export type IslamicProductRow = z.infer<typeof islamicProductRowSchema>;

export const islamicRuleRowSchema = z
  .object({
    rule: z.string(),
    /** "added" or "set_aside". */
    kind: z.string(),
    count: z.number().default(0),
  })
  .passthrough();
export type IslamicRuleRow = z.infer<typeof islamicRuleRowSchema>;

export const islamicSummarySchema = z
  .object({
    products: z.array(islamicProductRowSchema).default([]),
    rules: z.array(islamicRuleRowSchema).default([]),
  })
  .passthrough();
export type IslamicSummary = z.infer<typeof islamicSummarySchema>;
