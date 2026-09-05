import { z } from 'zod';
import { decimalString, isoDateTime } from './common';

/**
 * `GET /v1/metrics/overview` — §15.2.
 *
 * THIS ENDPOINT DOES NOT EXIST ON THE BACKEND YET. Verified against the running
 * container: it returns 404. The schema is written to the specified contract so
 * the dashboard lights up the moment the endpoint ships, and the UI degrades to
 * an explicit "not available" state until then.
 *
 * Nothing here is computed in the browser. §15.1 is explicit that aggregating
 * over a page of alerts client-side is wrong both practically and on principle,
 * so every figure on the dashboard comes from this payload.
 */

export const metricsWindowSchema = z.object({
  from: isoDateTime,
  to: isoDateTime,
  bucket: z.enum(['hour', 'day']),
});

export const metricsTotalsSchema = z.object({
  transactions: z.number().int(),
  scored: z.number().int(),
  pending: z.number().int(),
  alerted: z.number().int(),
  alert_rate: z.number(),
  total_amount: decimalString,
  flagged_amount: decimalString,
  currency: z.string(),
});

export const metricsSeriesPointSchema = z.object({
  t: z.string(),
  transactions: z.number().int(),
  alerts: z.number().int(),
  confirmed_fraud: z.number().int(),
  false_positives: z.number().int(),
  flagged_amount: decimalString,
});
export type MetricsSeriesPoint = z.infer<typeof metricsSeriesPointSchema>;

/**
 * Note what is absent: there is no recall field, and the UI must never derive
 * one. Recall needs false negatives — fraud the system did not flag — and by
 * definition those were never surfaced, so they cannot be counted. Precision is
 * computable from closed cases only, and it ships with its own caveat string
 * which the UI renders verbatim rather than paraphrasing.
 */
export const metricsOutcomesSchema = z.object({
  confirmed_fraud: z.number().int(),
  false_positives: z.number().int(),
  still_open: z.number().int(),
  precision: z.number().nullable().default(null),
  precision_note: z.string(),
});

export const metricsLatencySchema = z.object({
  p50_ms: z.number().nullable().default(null),
  p95_ms: z.number().nullable().default(null),
  p99_ms: z.number().nullable().default(null),
  model_version: z.string().nullable().default(null),
});

export const metricsQueueHealthSchema = z.object({
  pending_scores: z.number().int(),
  oldest_pending_seconds: z.number().nullable().default(null),
});

export const metricsOverviewSchema = z.object({
  window: metricsWindowSchema,
  totals: metricsTotalsSchema,
  by_risk_level: z.record(z.number().int()).default({}),
  by_alert_status: z.record(z.number().int()).default({}),
  by_transaction_type: z.record(z.number().int()).default({}),
  series: z.array(metricsSeriesPointSchema).default([]),
  outcomes: metricsOutcomesSchema,
  latency: metricsLatencySchema,
  queue_health: metricsQueueHealthSchema,
});
export type MetricsOverview = z.infer<typeof metricsOverviewSchema>;

export interface MetricsQuery {
  from?: string;
  to?: string;
  bucket?: 'hour' | 'day';
}
