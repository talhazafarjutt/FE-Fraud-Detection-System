import type { AlertDetail } from '@/api/schemas/alerts';
import type { Transaction } from '@/api/schemas/transactions';

/**
 * The §15.2 aggregate, computed inside the mock backend.
 *
 * This lives in `src/mocks/` deliberately. §15.1 forbids the *dashboard* from
 * aggregating client-side over a page of alerts, and it is right to: that
 * breaks past the first page and misrepresents the data. This module is the
 * stand-in for the SQL the real endpoint will run — the dashboard still makes
 * one request and renders whatever comes back, so replacing this with the real
 * endpoint changes nothing in the UI.
 *
 * Note what is NOT produced here: recall. It needs false negatives — fraud
 * nobody flagged — which by definition were never recorded. Precision is
 * computed from closed cases only and ships with the caveat string.
 */

const TERMINAL = new Set(['CONFIRMED_FRAUD', 'FALSE_POSITIVE', 'CLOSED']);

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function hourKey(iso: string): string {
  return `${iso.slice(0, 13)}:00`;
}

function addDecimals(a: string, b: string): string {
  // Cents arithmetic on integers — never floats, same rule as the real money path.
  const cents = (v: string) => {
    const [whole = '0', frac = ''] = v.split('.');
    return BigInt(whole) * 100n + BigInt(frac.padEnd(2, '0').slice(0, 2));
  };
  const total = cents(a) + cents(b);
  const sign = total < 0n ? '-' : '';
  const abs = total < 0n ? -total : total;
  return `${sign}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}

function countBy<T>(rows: readonly T[], key: (row: T) => string | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const k = key(row);
    if (k === null) continue;
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export interface MetricsInput {
  alerts: readonly AlertDetail[];
  transactions: readonly Transaction[];
  bucket: 'hour' | 'day';
  from?: string | undefined;
  to?: string | undefined;
}

export function computeOverview({ alerts, transactions, bucket, from, to }: MetricsInput) {
  const fromMs = from ? Date.parse(from) : Number.NEGATIVE_INFINITY;
  const toMs = to ? Date.parse(to) : Number.POSITIVE_INFINITY;

  const inWindow = <T extends { booked_at?: string; opened_at?: string }>(row: T) => {
    const stamp = row.booked_at ?? row.opened_at;
    if (!stamp) return true;
    const at = Date.parse(stamp);
    return at >= fromMs && at <= toMs;
  };

  const tx = transactions.filter(inWindow);
  const al = alerts.filter(inWindow);

  const alertByTx = new Map(al.map((a) => [a.transaction_id, a]));

  const scored = tx.filter((t) => t.scoring_status === 'COMPLETE').length;
  const pending = tx.filter((t) => t.scoring_status === 'PENDING').length;

  let totalAmount = '0.00';
  let flaggedAmount = '0.00';
  for (const t of tx) {
    totalAmount = addDecimals(totalAmount, t.amount);
    if (alertByTx.has(t.id)) flaggedAmount = addDecimals(flaggedAmount, t.amount);
  }

  // Risk levels come from the alert where one exists; everything else is the
  // clean majority the dashboard exists to show.
  const byRisk: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  for (const t of tx) {
    const alert = alertByTx.get(t.id);
    const p = alert?.fraud_probability ?? 0;
    const band = p >= 0.7 ? 'HIGH' : p >= 0.4 ? 'MEDIUM' : 'LOW';
    byRisk[band] = (byRisk[band] ?? 0) + 1;
  }

  const key = bucket === 'hour' ? hourKey : dayKey;
  const buckets = new Map<
    string,
    { transactions: number; alerts: number; confirmed_fraud: number; false_positives: number; flagged_amount: string }
  >();
  const bucketFor = (k: string) => {
    let b = buckets.get(k);
    if (!b) {
      b = { transactions: 0, alerts: 0, confirmed_fraud: 0, false_positives: 0, flagged_amount: '0.00' };
      buckets.set(k, b);
    }
    return b;
  };

  for (const t of tx) {
    const b = bucketFor(key(t.booked_at));
    b.transactions += 1;
    const alert = alertByTx.get(t.id);
    if (alert) {
      b.alerts += 1;
      b.flagged_amount = addDecimals(b.flagged_amount, t.amount);
      if (alert.status === 'CONFIRMED_FRAUD') b.confirmed_fraud += 1;
      if (alert.status === 'FALSE_POSITIVE') b.false_positives += 1;
    }
  }

  const series = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([t, v]) => ({ t, ...v }));

  const confirmed = al.filter((a) => a.status === 'CONFIRMED_FRAUD').length;
  const falsePositives = al.filter((a) => a.status === 'FALSE_POSITIVE').length;
  const stillOpen = al.filter((a) => !TERMINAL.has(a.status)).length;
  const closedTotal = confirmed + falsePositives;

  const latencies = [41, 58, 73, 96, 120, 155, 180, 240, 310, 420];
  const pct = (p: number) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))] ?? null;

  return {
    window: {
      from: Number.isFinite(fromMs) ? new Date(fromMs).toISOString() : (tx.at(-1)?.booked_at ?? new Date().toISOString()),
      to: Number.isFinite(toMs) ? new Date(toMs).toISOString() : new Date().toISOString(),
      bucket,
    },
    totals: {
      transactions: tx.length,
      scored,
      pending,
      alerted: al.length,
      alert_rate: tx.length === 0 ? 0 : Number((al.length / tx.length).toFixed(4)),
      total_amount: totalAmount,
      flagged_amount: flaggedAmount,
      currency: 'AED',
    },
    by_risk_level: byRisk,
    by_alert_status: countBy(al, (a) => a.status),
    by_transaction_type: countBy(tx, (t) => t.transaction_type),
    series,
    outcomes: {
      confirmed_fraud: confirmed,
      false_positives: falsePositives,
      still_open: stillOpen,
      // Undefined rather than a misleading zero when nothing has been closed.
      precision: closedTotal === 0 ? null : Number((confirmed / closedTotal).toFixed(3)),
      precision_note: 'confirmed / (confirmed + false positives), closed cases only',
    },
    latency: { p50_ms: pct(0.5), p95_ms: pct(0.95), p99_ms: pct(0.99), model_version: 'fixture-v1' },
    queue_health: {
      pending_scores: pending,
      oldest_pending_seconds: pending > 0 ? 34 : null,
    },
  };
}

/**
 * Closed-case outcomes bucketed by the probability that produced them, so the
 * threshold explorer can answer "what would have happened at 0.6?" against real
 * historical decisions rather than a projection.
 */
export function closedCaseOutcomes(alerts: readonly AlertDetail[]) {
  return alerts
    .filter((a) => a.status === 'CONFIRMED_FRAUD' || a.status === 'FALSE_POSITIVE')
    .map((a) => ({
      probability: a.fraud_probability,
      confirmed: a.status === 'CONFIRMED_FRAUD',
    }));
}
