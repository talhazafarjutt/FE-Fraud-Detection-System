import type { z } from 'zod';

/**
 * The compatibility layer between two API surfaces.
 *
 * LOCAL (and TARGET, which is LOCAL once deployed) returns `risk_score` 0–100.
 * The older contract still answering the hosted URL returns `risk_score: null`
 * and ranks on `fraud_probability` 0–1 instead.
 *
 * Every screen consumes the normalised types from this module and never a raw
 * payload, so nothing downstream needs to know which contract answered — and
 * the console keeps working against the hosted deployment until it catches up.
 */

/* ------------------------------------------------------------------ *
 * Risk
 * ------------------------------------------------------------------ */

export type RiskSource = 'engine' | 'legacy' | 'none';

export interface NormalisedRisk {
  /** 0–100, or null when the row carries no score at all. */
  score: number | null;
  source: RiskSource;
}

/**
 * `risk_score` is 0–100 on the current contract and null on the older one,
 * where `fraud_probability` (0–1) is the only ranking available. One place
 * converts; nothing downstream needs to know which answered.
 *
 * A null score is NOT a zero. Returning `null` keeps "not scored" distinct from
 * "scored zero", which matters for sorting, medians and anything that would
 * otherwise rank an unscored row as the safest thing in the list.
 */
export function normaliseRisk(row: {
  risk_score?: number | null;
  fraud_probability?: number | null;
}): NormalisedRisk {
  if (row.risk_score != null) return { score: row.risk_score, source: 'engine' };
  if (row.fraud_probability != null) {
    return { score: row.fraud_probability * 100, source: 'legacy' };
  }
  return { score: null, source: 'none' };
}

/* ------------------------------------------------------------------ *
 * Tolerant list parsing
 * ------------------------------------------------------------------ */

export interface TolerantPage<T> {
  items: T[];
  /** How many rows failed validation and were left out. */
  skipped: number;
  next_cursor: string | null;
  page_size: number;
}

/**
 * Parse a page row by row instead of all-or-nothing.
 *
 * A strict whole-page parse is what turned a working ledger into "could not be
 * loaded": one unexpected row shape failed the array, so 50 good rows vanished
 * with a 200 sitting in the network panel. Here a bad row is dropped and
 * counted, and the caller shows the rest plus a quiet notice.
 *
 * Failures are logged with the raw row in dev. A silently dropped row is a bug
 * nobody ever finds.
 *
 * The page envelope itself is still read defensively — if `items` is not an
 * array there is nothing to salvage and the caller gets an empty page rather
 * than a thrown error mid-render.
 */
export function parsePageTolerant<T>(
  rowSchema: z.ZodType<T, z.ZodTypeDef, unknown>,
  payload: unknown,
): TolerantPage<T> {
  const envelope = (payload ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(envelope['items']) ? (envelope['items'] as unknown[]) : [];

  const items: T[] = [];
  let skipped = 0;

  for (const row of raw) {
    const parsed = rowSchema.safeParse(row);
    if (parsed.success) {
      items.push(parsed.data);
      continue;
    }
    skipped += 1;
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console -- dev-only contract diagnostics.
      console.warn('[civitas] dropped an unparseable row', parsed.error.issues, row);
    }
  }

  const cursor = envelope['next_cursor'];
  const size = envelope['page_size'];

  return {
    items,
    skipped,
    next_cursor: typeof cursor === 'string' ? cursor : null,
    page_size: typeof size === 'number' ? size : items.length,
  };
}
