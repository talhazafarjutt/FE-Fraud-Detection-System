import { setupServer } from 'msw/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parsePageTolerant } from '@/api/compat';
import { alertDetailSchema, alertSchema } from '@/api/schemas/alerts';
import { caseDetailSchema } from '@/api/schemas/cases';
import { islamicSummarySchema } from '@/api/schemas/islamic';
import { labelledFeedbackSchema } from '@/api/schemas/labelledFeedback';
import { metaSchema } from '@/api/schemas/meta';
import { riskSchema, transactionListItemSchema, transactionSchema } from '@/api/schemas/transactions';
import { RISK_THRESHOLDS, bandFor } from '@/lib/risk';
import { handlers } from '@/mocks/handlers';
import { ISLAMIC_ALERTS, ISLAMIC_FIXTURES } from '@/mocks/islamic';
import { WIRE_META_ON } from './islamic-wire';

/**
 * Demo mode runs with the Islamic layer ON. Every mocked response is parsed with
 * the schema the console uses against the real API, and every fixture score is
 * re-derived from its signals with the engine's own weights and floors.
 */

const server = setupServer(...handlers);
const BASE = 'http://demo.test';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());

async function signIn(username: string): Promise<string> {
  const response = await fetch(`${BASE}/v1/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'SyntheticDemo!2026' }),
  });
  return ((await response.json()) as { access_token: string }).access_token;
}

const get = (token: string, path: string) =>
  fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });

const SETTLEMENT = ISLAMIC_FIXTURES.find(
  (f) => f.score.layer_findings['islamic']?.facts.event === 'EARLY_SETTLEMENT',
)!;

describe('demo mode with the Islamic layer on', () => {
  it('serves /v1/meta with the layer, its typologies and products', async () => {
    const token = await signIn('analyst@example.com');
    const raw: unknown = await (await get(token, '/v1/meta')).json();
    // Exactly what the live layer-on API answers.
    expect(raw).toEqual(WIRE_META_ON);
    const meta = metaSchema.parse(raw);
    expect(meta.layers).toEqual(['islamic']);
    expect(meta.typologies.slice(0, 5)).toEqual([
      'MULE_RING',
      'STRUCTURING',
      'ACCOUNT_TAKEOVER',
      'INVOICE_REDIRECTION',
      'LAYERING',
    ]);
    expect(meta.typologies).toContain('TAKAFUL_CLAIM_FRAUD');
    expect(meta.products.map((p) => p.code)).toContain('QARD_HASAN');
    expect(meta.products.every((p) => p.layer === 'islamic')).toBe(true);

    expect((await fetch(`${BASE}/v1/meta`)).status).toBe(401);
  });

  it('queue rows carry facts only; the detail carries the findings', async () => {
    const token = await signIn('analyst@example.com');
    const page = await (await get(token, '/v1/fraud-alerts?limit=200')).json();
    const rows = parsePageTolerant(alertSchema, page);
    expect(rows.skipped).toBe(0);
    const repayment = rows.items.find((a) => a.layer_facts?.['islamic']?.event === 'INSTALMENT');
    expect(repayment, 'no Islamic alert in the queue').toBeDefined();
    expect(repayment).not.toHaveProperty('layer_findings');

    const detail = alertDetailSchema.parse(
      await (await get(token, `/v1/fraud-alerts/${repayment!.id}`)).json(),
    );
    expect(detail.layer_findings?.['islamic']?.added[0]?.rule).toBe('THIRD_PARTY_REPAYMENT');
    expect(detail.triggered_rules.find((r) => r.source === 'islamic')).toBeDefined();
  });

  it('a Murabaha early settlement has ORIGIN_ACCOUNT_DRAIN set aside and raises no alert', async () => {
    const token = await signIn('analyst@example.com');
    const id = SETTLEMENT.transaction.id;
    const score = riskSchema.parse(await (await get(token, `/v1/transactions/${id}/score`)).json());
    const finding = score.layer_findings?.['islamic'];
    expect(finding?.set_aside[0]?.rule).toBe('ORIGIN_ACCOUNT_DRAIN');
    expect(finding?.set_aside[0]?.reason).toMatch(/early settlement of contract MRB-2026-0187/);
    expect(score.risk_score).toBeLessThan(RISK_THRESHOLDS.HIGH);

    transactionSchema.parse(await (await get(token, `/v1/transactions/${id}`)).json());
    const clean = parsePageTolerant(
      transactionListItemSchema,
      await (await get(token, '/v1/transactions?has_alert=false&q=ISL-MRB-0187&limit=200')).json(),
    );
    expect(clean.items.map((t) => t.id)).toEqual([id]);
  });

  it('a concluded Takaful case keeps the findings on its verdict and labelled record', async () => {
    const token = await signIn('supervisor@example.com');
    const claim = ISLAMIC_ALERTS.find((a) => a.layer_facts?.['islamic']?.product === 'TAKAFUL')!;
    const detail = caseDetailSchema.parse(
      await (await get(token, `/v1/cases/${claim.case_id}`)).json(),
    );
    expect(detail.feedback?.fraud_typology).toBe('TAKAFUL_CLAIM_FRAUD');
    expect(detail.feedback?.original_layer_findings?.['islamic']?.added[0]?.rule).toBe(
      'TAKAFUL_EARLY_CLAIM',
    );
    expect(detail.alerts?.[0]?.layer_facts?.['islamic']?.event).toBe('CLAIM');

    const records = parsePageTolerant(
      labelledFeedbackSchema,
      await (await get(token, '/v1/labelled-feedback/records?limit=200')).json(),
    );
    expect(records.skipped).toBe(0);
    const record = records.items.find((r) => r.case_id === claim.case_id);
    expect(record?.original_layer_findings?.['islamic']?.facts.product).toBe('TAKAFUL');
  });

  it('summarises per product and per rule, scoped to the team', async () => {
    const token = await signIn('analyst@example.com');
    const summary = islamicSummarySchema.parse(
      await (await get(token, '/v1/islamic/summary')).json(),
    );
    const row = (code: string) => summary.products.find((p) => p.product === code);
    expect(row('MURABAHA')).toMatchObject({ transactions: 2, alerts: 1, set_aside: 1 });
    expect(row('TAKAFUL')).toMatchObject({ transactions: 1, alerts: 1, confirmed_fraud: 1 });
    expect(row('IJARA')).toMatchObject({ transactions: 1, alerts: 0, set_aside: 1 });
    expect(summary.rules).toEqual(
      expect.arrayContaining([
        { rule: 'THIRD_PARTY_REPAYMENT', kind: 'added', count: 1 },
        { rule: 'ORIGIN_ACCOUNT_DRAIN', kind: 'set_aside', count: 1 },
      ]),
    );

    // team-beta has no Islamic traffic.
    const beta = await signIn('other-analyst@example.com');
    const empty = islamicSummarySchema.parse(await (await get(beta, '/v1/islamic/summary')).json());
    expect(empty.products.every((p) => p.transactions === 0)).toBe(true);
    expect(empty.rules).toEqual([]);

    // alerts:read, like every other summary read.
    const admin = await signIn('admin@example.com');
    expect((await get(admin, '/v1/islamic/summary')).status).toBe(403);
  });
});

describe('Islamic fixtures follow the engine', () => {
  const WEIGHTS = { model: 0.6, rule: 0.25, anomaly: 0.1, network: 0.05 };
  const RULE_SIGNAL: Record<string, number> = { HIGH: 100, MEDIUM: 60, LOW: 20 };
  const FLOOR: Record<string, number> = { HIGH: 70, MEDIUM: 30, LOW: 0 };

  function blend(
    signals: { model_score: number; anomaly_score: number; network_score: number },
    severities: string[],
  ) {
    const rule = Math.max(0, ...severities.map((s) => RULE_SIGNAL[s] ?? 0));
    const floor = Math.max(0, ...severities.map((s) => FLOOR[s] ?? 0));
    const weighted =
      WEIGHTS.model * signals.model_score +
      WEIGHTS.rule * rule +
      WEIGHTS.anomaly * signals.anomaly_score +
      WEIGHTS.network * signals.network_score;
    return Math.min(100, Math.max(weighted, floor));
  }

  it.each(ISLAMIC_FIXTURES.map((f) => [f.transaction.external_ref, f] as const))(
    '%s: before, after and the alert all match the bands',
    (_ref, fixture) => {
      const score = riskSchema.parse(fixture.score);
      const finding = score.layer_findings!['islamic']!;
      const signals = fixture.score['signals'] as {
        model_score: number;
        anomaly_score: number;
        network_score: number;
      };
      const triggered = (fixture.score['triggered_rules'] as { severity: string }[]).map(
        (r) => r.severity,
      );
      const before = [
        ...triggered.slice(0, triggered.length - finding.added.length),
        ...finding.set_aside.map((r) => r.severity ?? 'LOW'),
      ];

      expect(blend(signals, before)).toBeCloseTo(finding.score_before!, 6);
      expect(blend(signals, triggered)).toBeCloseTo(finding.score_after!, 6);
      expect(score.risk_score).toBe(finding.score_after);
      expect(score.risk_level).toBe(
        bandFor(score.risk_score!) === 'CRITICAL' ? 'HIGH' : bandFor(score.risk_score!),
      );

      const alerted = score.risk_score! >= RISK_THRESHOLDS.HIGH;
      expect(Boolean(fixture.alert)).toBe(alerted);
      if (fixture.alert) {
        expect(fixture.alert.risk_score).toBe(score.risk_score);
        expect(fixture.alert.severity).toBe(
          score.risk_score! >= RISK_THRESHOLDS.CRITICAL ? 'CRITICAL' : 'HIGH',
        );
        expect(fixture.alert.layer_facts?.['islamic']).toEqual(finding.facts);
      }
    },
  );
});
