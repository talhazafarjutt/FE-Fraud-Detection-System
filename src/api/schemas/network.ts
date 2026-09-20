import { z } from 'zod';
import { decimalString, isoDateTime, uuid } from './common';

/**
 * The network graph: accounts as nodes, money movements as edges.
 *
 * This view exists because a human recognises a shape faster than they read
 * seventeen rows. Fan-in (many accounts paying one), pass-through (money in and
 * straight out), and cycles (money returning to its origin) are the patterns,
 * and the layout has to let them be seen.
 */

export const networkNodeSchema = z
  .object({
    id: z.string(),
    label: z.string().nullish(),
    account_last4: z.string().nullish(),
    currency: z.string().nullish(),
    country_code: z.string().nullish(),
    status: z.string().nullish(),
    /** Distance from the focus account. Drives the concentric layout. */
    hop: z.number().int(),
    /** Exactly one node carries this. */
    is_focus: z.boolean(),
    /** Drives node colour: 13 alerts and 0 alerts must not look alike. */
    alert_count: z.number().int(),
  })
  .passthrough();
export type NetworkNode = z.infer<typeof networkNodeSchema>;

export const networkEdgeSchema = z
  .object({
    source: z.string(),
    target: z.string(),
    transaction_count: z.number().int(),
    /** Edge weight is money moved, not how many times it moved. */
    total_amount: decimalString,
    currency: z.string().nullish(),
    last_booked_at: isoDateTime.nullish(),
  })
  .passthrough();
export type NetworkEdge = z.infer<typeof networkEdgeSchema>;

export const networkGraphSchema = z
  .object({
    focus_account_id: uuid,
    depth: z.number().int(),
    window_days: z.number().int(),
    nodes: z.array(networkNodeSchema).default([]),
    edges: z.array(networkEdgeSchema).default([]),
    /**
     * The node budget stopped the expansion — the ring may continue past what
     * is drawn. An investigator reading a trimmed graph as complete draws a
     * false conclusion, so this is always surfaced, never hidden.
     */
    truncated: z.boolean().default(false),
  })
  .passthrough();
export type NetworkGraph = z.infer<typeof networkGraphSchema>;

export interface NetworkParams {
  depth?: number;
  window_days?: number;
  max_nodes?: number;
}

/** Server-enforced bounds; the controls clamp to these rather than 422-ing. */
export const NETWORK_LIMITS = {
  depth: { min: 1, max: 3, default: 2 },
  window_days: { min: 1, max: 365, default: 30 },
  max_nodes: { min: 10, max: 500, default: 120 },
} as const;
