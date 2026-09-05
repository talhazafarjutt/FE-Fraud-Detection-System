import { describe, expect, it } from 'vitest';
import {
  computeModelAgreement,
  feedbackSchema,
  isTerminalStatus,
} from '@/api/schemas/feedback';
import { alertPatchSchema } from '@/api/schemas/alerts';
import { metricsOverviewSchema } from '@/api/schemas/metrics';
import { computeOverview } from '@/mocks/metrics';
import { ALERT_FIXTURES, ALL_TRANSACTIONS } from '@/mocks/fixtures';

const validFeedback = {
  true_label: 'FRAUD' as const,
  confidence: 'HIGH' as const,
  typology: 'MULE_FAN_IN' as const,
  decision_drivers: ['new_beneficiary'],
  model_agreed: true,
  missing_signals: ['receiver_account_age_days'],
  reviewed_at: '2026-09-05T11:20:00Z',
  time_to_decide_seconds: 412,
};

describe('feedback contract (§16.2)', () => {
  it('accepts a complete block', () => {
    expect(feedbackSchema.safeParse(validFeedback).success).toBe(true);
  });

  it('requires INCONCLUSIVE to be a legal label', () => {
    // Forcing a binary answer on an uncertain case poisons the training set,
    // so this option must exist.
    const parsed = feedbackSchema.safeParse({ ...validFeedback, true_label: 'INCONCLUSIVE' });
    expect(parsed.success).toBe(true);
  });

  it('rejects an unknown label or typology', () => {
    expect(feedbackSchema.safeParse({ ...validFeedback, true_label: 'MAYBE' }).success).toBe(false);
    expect(feedbackSchema.safeParse({ ...validFeedback, typology: 'WIRE_FRAUD' }).success).toBe(
      false,
    );
  });

  it('bounds the free-text arrays', () => {
    const tooManySignals = { ...validFeedback, missing_signals: Array(11).fill('x') };
    expect(feedbackSchema.safeParse(tooManySignals).success).toBe(false);

    const tooManyDrivers = { ...validFeedback, decision_drivers: Array(21).fill('x') };
    expect(feedbackSchema.safeParse(tooManyDrivers).success).toBe(false);
  });

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

  it('rides along on an AlertPatch', () => {
    const parsed = alertPatchSchema.safeParse({
      status: 'CONFIRMED_FRAUD',
      note: 'Confirmed mule network.',
      feedback: validFeedback,
    });
    expect(parsed.success).toBe(true);
  });
});

describe('model agreement is derived, never typed', () => {
  it('agrees when the analyst confirms fraud the model scored above threshold', () => {
    expect(computeModelAgreement('FRAUD', 0.91)).toBe(true);
    expect(computeModelAgreement('FRAUD', 0.7)).toBe(true);
  });

  it('disagrees when the analyst confirms fraud the model scored low', () => {
    expect(computeModelAgreement('FRAUD', 0.42)).toBe(false);
  });

  it('agrees when the analyst clears a case the model scored low', () => {
    expect(computeModelAgreement('LEGITIMATE', 0.2)).toBe(true);
  });

  it('disagrees when the analyst clears a case the model flagged', () => {
    expect(computeModelAgreement('LEGITIMATE', 0.88)).toBe(false);
  });

  it('returns null for INCONCLUSIVE — nothing to compare against', () => {
    expect(computeModelAgreement('INCONCLUSIVE', 0.95)).toBeNull();
    expect(computeModelAgreement('INCONCLUSIVE', 0.05)).toBeNull();
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
