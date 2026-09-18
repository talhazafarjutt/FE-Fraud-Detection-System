import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { alertDetailSchema, alertPatchSchema, alertSchema } from '@/api/schemas/alerts';
import { transactionListItemSchema } from '@/api/schemas/transactions';
import { NOT_IMPLEMENTED } from '@/api/unavailable';
import { riskDisplay } from '@/lib/risk';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

/**
 * Pins the defects found against the deployed V1 API. Each of these was a real,
 * silent failure: nothing threw, the UI simply showed less than it should have.
 */

describe('transaction rows keep every field the API returns', () => {
  /** A row shaped exactly like the deployed API returns. */
  const row = {
    id: '11111111-1111-4111-a111-111111111111',
    external_ref: 'TXN-000001',
    amount: '4820.00',
    currency: 'AED',
    booked_at: '2026-09-01T10:00:00Z',
    transaction_type: 'TRANSFER',
    scoring_status: 'COMPLETE',
    team: 'team-alpha',
    src_account_last4: '1374',
    dst_account_last4: '9682',
    mcc: 6011,
    sender_balance_before: '9000.00',
    receiver_balance_before: '0.00',
    risk_score: 84,
    risk_level: 'HIGH',
    alert_id: '22222222-2222-4222-a222-222222222222',
    alert_status: 'OPEN',
    alert_severity: 'CRITICAL',
    fraud_probability: 0.84,
  };

  it('keeps risk_score and alert_severity', () => {
    // Both were being stripped by the schema, so the columns rendered blank
    // with no error anywhere — the failure mode this test exists to catch.
    const parsed = transactionListItemSchema.parse(row);
    expect(parsed.risk_score).toBe(84);
    expect(parsed.alert_severity).toBe('CRITICAL');
  });

  it('passes through a field the backend adds later', () => {
    const parsed = transactionListItemSchema.parse({ ...row, some_new_field: 'kept' });
    expect((parsed as Record<string, unknown>)['some_new_field']).toBe('kept');
  });

  it('accepts the deployed reality where risk_score is null', () => {
    const parsed = transactionListItemSchema.parse({ ...row, risk_score: null });
    expect(parsed.risk_score).toBeNull();
  });
});

describe('date filters use the API parameter names', () => {
  const endpoint = read('src/api/endpoints/transactions.ts');

  it('sends booked_from / booked_to, not from / to', () => {
    // The API ignores unknown query params rather than erroring, so `from`/`to`
    // looked like a working filter that never changed the result set.
    expect(endpoint).toContain('booked_from: filters.booked_from');
    expect(endpoint).toContain('booked_to: filters.booked_to');
    expect(endpoint).not.toMatch(/^\s+from: filters\.from,$/m);
    expect(endpoint).not.toMatch(/^\s+to: filters\.to,$/m);
  });
});

describe('the verdict no longer rides on the alert', () => {
  it('alertPatchSchema has no feedback key', () => {
    // The deployed API 422s a feedback block on this endpoint.
    expect(Object.keys(alertPatchSchema.shape)).not.toContain('feedback');
  });

  it('the alert endpoint never puts feedback on the request body', () => {
    const endpoint = read('src/api/endpoints/alerts.ts');
    expect(endpoint).not.toMatch(/body\['feedback'\]\s*=/);
  });

  it('the verdict is registered as a missing capability', () => {
    expect(NOT_IMPLEMENTED.caseVerdict.endpoints.join(' ')).toContain('/v1/cases/{id}');
  });
});

describe('scores tolerate the deployed backend', () => {
  it('parses an alert with no score at all', () => {
    const parsed = alertSchema.parse({
      id: '33333333-3333-4333-a333-333333333333',
      transaction_id: '44444444-4444-4444-a444-444444444444',
      status: 'OPEN',
      severity: 'HIGH',
      fraud_probability: null,
      team: 'team-alpha',
      assigned_to: null,
      opened_at: '2026-09-01T10:00:00Z',
      closed_at: null,
    });
    expect(parsed.risk_score).toBeNull();
    expect(riskDisplay(parsed.risk_score, parsed.fraud_probability)).toBeNull();
  });

  it('prefers risk_score and reports it as a 0-100 score', () => {
    const r = riskDisplay(84, 0.2);
    expect(r).toEqual({ value: 84, source: 'risk_score', band: 'HIGH', derived: false });
  });

  it('falls back to fraud_probability and flags it as derived', () => {
    // Every alert on the deployed backend is in this state.
    const r = riskDisplay(null, 0.78);
    expect(r?.value).toBe(78);
    expect(r?.derived).toBe(true);
    expect(r?.source).toBe('fraud_probability');
  });

  it('a null score is never treated as zero', () => {
    expect(riskDisplay(null, null)).toBeNull();
    expect(riskDisplay(undefined, undefined)).toBeNull();
  });
});

describe('the risk engine payload is optional everywhere', () => {
  it('parses the deployed detail shape, where every engine field is null or empty', () => {
    const parsed = alertDetailSchema.parse({
      id: '55555555-5555-4555-a555-555555555555',
      transaction_id: '66666666-6666-4666-a666-666666666666',
      status: 'OPEN',
      severity: 'HIGH',
      fraud_probability: 0.78,
      team: 'team-alpha',
      assigned_to: null,
      opened_at: '2026-09-01T10:00:00Z',
      closed_at: null,
      events: [],
      explanation: [],
      model_name: 'stub-rules',
      model_version: 'stub-v0.1.0',
      model_decision: 'REVIEW',
      risk_engine_version: null,
      signals: null,
      triggered_rules: [],
      network: null,
      anomaly: null,
      decision_reasons: [],
    });
    expect(parsed.signals).toBeNull();
    expect(parsed.triggered_rules).toEqual([]);
    expect(parsed.network).toBeNull();
  });
});

describe('missing capabilities are declared, not guessed at', () => {
  it('records the case layer as unavailable', () => {
    // The V1 spec presents /v1/cases as available; the deployed API 404s all of
    // it. The registry is what stops a screen rendering invented data.
    expect(NOT_IMPLEMENTED.cases.endpoints).toContain('GET /v1/cases');
    expect(NOT_IMPLEMENTED.cases.observed).toMatch(/404/);
  });

  it('every entry names at least one endpoint and what it unlocks', () => {
    for (const [key, entry] of Object.entries(NOT_IMPLEMENTED)) {
      expect(entry.endpoints.length, `${key} has no endpoint`).toBeGreaterThan(0);
      expect(entry.unlocks.length, `${key} has no description`).toBeGreaterThan(10);
      expect(entry.observed.length, `${key} has no observation`).toBeGreaterThan(10);
    }
  });

  it('no screen calls a route that does not exist', () => {
    // Endpoint modules are the only place a URL should be built; none of them
    // may reference a path from the missing registry.
    const endpointDir = path.join(ROOT, 'src/api/endpoints');
    const files = ['alerts.ts', 'transactions.ts', 'auth.ts', 'users.ts', 'metrics.ts'];
    // Comments are stripped first: these files legitimately *discuss* the
    // missing routes to explain why they are not called.
    const strip = (src: string) =>
      src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const sources = files
      .map((f) => strip(readFileSync(path.join(endpointDir, f), 'utf8')))
      .join('\n');
    expect(sources).not.toContain('/v1/cases');
    expect(sources).not.toContain('/v1/feedback/export');
    expect(sources).not.toContain('/v1/entities');
  });
});
