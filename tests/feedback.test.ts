import { describe, expect, it } from 'vitest';
import { isTerminalStatus } from '@/api/schemas/feedback';
import { alertPatchSchema } from '@/api/schemas/alerts';
import { metricsOverviewSchema } from '@/api/schemas/metrics';
import { computeOverview } from '@/mocks/metrics';
import { ALERT_FIXTURES, ALL_TRANSACTIONS } from '@/mocks/fixtures';

describe('verdict statuses', () => {
  it('knows which statuses are terminal', () => {
    expect(isTerminalStatus('CONFIRMED_FRAUD')).toBe(true);
    expect(isTerminalStatus('FALSE_POSITIVE')).toBe(true);
    // CLOSED is an end state but carries no new verdict — the label was already
    // captured when the case was confirmed or dismissed.
    expect(isTerminalStatus('CLOSED')).toBe(false);
    expect(isTerminalStatus('IN_REVIEW')).toBe(false);
    expect(isTerminalStatus('ESCALATED')).toBe(false);
    expect(isTerminalStatus('OPEN')).toBe(false);
  });

  it('never lets a feedback block ride along on an AlertPatch', () => {
    // The verdict belongs to the case; the alert endpoint 422s a feedback key.
    const parsed = alertPatchSchema.parse({
      status: 'IN_REVIEW',
      note: 'Picked up.',
      feedback: { final_label: 'CONFIRMED_FRAUD' },
    });
    expect(parsed).not.toHaveProperty('feedback');
  });
});

describe('metrics overview (§15.2)', () => {
  const overview = computeOverview({
    alerts: ALERT_FIXTURES,
    transactions: ALL_TRANSACTIONS,
    bucket: 'day',
  });

  it('matches the published contract', () => {
    expect(metricsOverviewSchema.safeParse(overview).success).toBe(true);
  });

  it('counts fraud AND non-fraud, so the alert rate is realistic', () => {
    // A dashboard built from alerts alone would report a 100% alert rate.
    expect(overview.totals.transactions).toBeGreaterThan(overview.totals.alerted);
    expect(overview.totals.alert_rate).toBeLessThan(0.2);
    expect(overview.totals.alert_rate).toBeGreaterThan(0);
  });

  it('never reports recall', () => {
    // Recall needs false negatives, which by definition were never recorded.
    expect(JSON.stringify(overview)).not.toMatch(/recall/i);
    expect(Object.keys(overview.outcomes)).not.toContain('recall');
  });

  it('ships precision with its caveat', () => {
    expect(overview.outcomes.precision_note).toBe(
      'confirmed / (confirmed + false positives), closed cases only',
    );
  });

  it('leaves precision null rather than reporting a misleading zero', () => {
    const noClosed = computeOverview({
      alerts: ALERT_FIXTURES.filter(
        (a) => a.status !== 'CONFIRMED_FRAUD' && a.status !== 'FALSE_POSITIVE',
      ),
      transactions: ALL_TRANSACTIONS,
      bucket: 'day',
    });
    expect(noClosed.outcomes.precision).toBeNull();
  });

  it('keeps money as strings through aggregation', () => {
    expect(typeof overview.totals.total_amount).toBe('string');
    expect(overview.totals.total_amount).toMatch(/^\d+\.\d{2}$/);
    expect(overview.totals.flagged_amount).toMatch(/^\d+\.\d{2}$/);
  });

  it('produces a plottable series', () => {
    expect(overview.series.length).toBeGreaterThan(1);
    for (const point of overview.series) {
      // Clean traffic is transactions minus alerts and must never go negative.
      expect(point.transactions).toBeGreaterThanOrEqual(point.alerts);
    }
  });

  it('handles an empty window without dividing by zero', () => {
    const empty = computeOverview({ alerts: [], transactions: [], bucket: 'day' });
    expect(empty.totals.alert_rate).toBe(0);
    expect(empty.outcomes.precision).toBeNull();
    expect(metricsOverviewSchema.safeParse(empty).success).toBe(true);
  });
});
