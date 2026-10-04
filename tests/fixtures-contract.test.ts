import { describe, expect, it } from 'vitest';
import { alertDetailSchema, alertPageSchema, alertSchema } from '@/api/schemas/alerts';
import { transactionSchema } from '@/api/schemas/transactions';
import { userListSchema } from '@/api/schemas/users';
import { RISK_THRESHOLDS, bandFor, riskDisplay } from '@/lib/risk';
import {
  ALERT_FIXTURES,
  TRANSACTION_FIXTURES,
  USER_FIXTURES,
} from '@/mocks/fixtures';

/**
 * The offline demo is the insurance policy for the meeting, so its fixtures
 * must satisfy the same schemas the real API responses do. They already caught
 * one real bug: handlers that minted ids like `mock-txn-abc123` were rejected
 * by `z.string().uuid()` and the submission screen showed "Unexpected
 * response". The right fix was valid UUIDs in the mocks, not a looser schema —
 * that uuid constraint is load-bearing (see route-injection.test.ts).
 *
 * These tests fail loudly at build time instead of on stage.
 */
describe('MSW fixtures satisfy the real response schemas', () => {
  it('every alert parses as both a list row and a detail record', () => {
    for (const alert of ALERT_FIXTURES) {
      const asRow = alertSchema.safeParse(alert);
      expect(asRow.success, `alert ${alert.id} failed alertSchema`).toBe(true);

      const asDetail = alertDetailSchema.safeParse(alert);
      expect(asDetail.success, `alert ${alert.id} failed alertDetailSchema`).toBe(true);
    }
  });

  it('a page of fixtures parses as a keyset page', () => {
    const page = {
      items: ALERT_FIXTURES.slice(0, 50),
      next_cursor: ALERT_FIXTURES[49]?.id ?? null,
      page_size: 50,
    };
    expect(alertPageSchema.safeParse(page).success).toBe(true);
  });

  it('every transaction fixture parses', () => {
    for (const [id, transaction] of Object.entries(TRANSACTION_FIXTURES)) {
      expect(transactionSchema.safeParse(transaction).success, `transaction ${id}`).toBe(true);
    }
  });

  it('the user directory parses', () => {
    expect(userListSchema.safeParse(USER_FIXTURES).success).toBe(true);
  });

  it('covers every severity and every status, so the demo can walk the machine', () => {
    const severities = new Set(ALERT_FIXTURES.map((a) => a.severity));
    const statuses = new Set(ALERT_FIXTURES.map((a) => a.status));

    // No LOW: an alert only exists at HIGH risk or on network evidence.
    expect([...severities].sort()).toEqual(['CRITICAL', 'HIGH', 'MEDIUM']);
    expect([...statuses].sort()).toEqual([
      'CLOSED',
      'CONFIRMED_FRAUD',
      'ESCALATED',
      'FALSE_POSITIVE',
      'IN_REVIEW',
      'OPEN',
    ]);
  });

  it('raises alerts exactly where the backend would', () => {
    for (const alert of ALERT_FIXTURES) {
      const score = alert.risk_score ?? -1;
      const networked = Boolean(alert.network?.evidence?.length);
      expect(Number.isInteger(score), `${alert.id} risk_score is not an integer`).toBe(true);
      expect(score >= RISK_THRESHOLDS.HIGH || networked, `${alert.id} would not alert`).toBe(true);
      const expected =
        score >= RISK_THRESHOLDS.CRITICAL
          ? 'CRITICAL'
          : score >= RISK_THRESHOLDS.HIGH
            ? 'HIGH'
            : 'MEDIUM';
      expect(alert.severity).toBe(expected);
    }
  });

  it('never shows a number from a higher band than its chip', () => {
    for (const alert of ALERT_FIXTURES) {
      const shown = riskDisplay(alert.risk_score, alert.fraud_probability);
      expect(shown && bandFor(shown.value)).toBe(shown?.band);
    }
  });

  it('spans both teams, which the live seed does not', () => {
    const teams = new Set(ALERT_FIXTURES.map((a) => a.team));
    expect(teams).toEqual(new Set(['team-alpha', 'team-beta']));
    // Enough of each side to make cross-team visibility obvious on screen.
    for (const team of teams) {
      expect(ALERT_FIXTURES.filter((a) => a.team === team).length).toBeGreaterThan(5);
    }
  });

  it('produces explanations with both positive and negative contributions', () => {
    // The SHAP chart is only convincing if bars go both ways.
    const all = ALERT_FIXTURES.flatMap((a) => a.explanation);
    expect(all.some((r) => r.contribution > 0)).toBe(true);
    expect(all.some((r) => r.contribution < 0)).toBe(true);
  });

  it('gives every alert a linked transaction', () => {
    for (const alert of ALERT_FIXTURES) {
      expect(TRANSACTION_FIXTURES[alert.transaction_id], `alert ${alert.id}`).toBeDefined();
    }
  });

  it('is deterministic — the same fixtures on every run', () => {
    // Generated from a seeded PRNG, so a demo rehearsal matches the real thing.
    expect(ALERT_FIXTURES).toHaveLength(48);
    expect(ALERT_FIXTURES[0]?.id).toBe(ALERT_FIXTURES[0]?.id);
    expect(new Set(ALERT_FIXTURES.map((a) => a.id)).size).toBe(48);
  });
});
