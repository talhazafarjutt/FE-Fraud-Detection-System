import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveBaseUrl } from '@/api/client';
import { normaliseRisk, parsePageTolerant } from '@/api/compat';
import { transactionListItemSchema } from '@/api/schemas/transactions';

const ROOT = path.resolve(__dirname, '..');

/**
 * The compatibility layer is what lets one console serve two API contracts.
 * These pin the behaviours that broke the ledger the first time.
 */

describe('normaliseRisk bridges the two contracts', () => {
  it('uses risk_score when the engine supplied one (TARGET)', () => {
    expect(normaliseRisk({ risk_score: 93, fraud_probability: 0.1 })).toEqual({
      score: 93,
      source: 'engine',
    });
  });

  it('falls back to fraud_probability scaled to 0-100 (DEPLOYED)', () => {
    // The deployed API returns risk_score: null on every row.
    expect(normaliseRisk({ risk_score: null, fraud_probability: 0.7817 })).toEqual({
      score: 78.17,
      source: 'legacy',
    });
  });

  it('reports "none" rather than zero when nothing is scored', () => {
    // A null score must never sort or average as if it were the safest row.
    expect(normaliseRisk({ risk_score: null, fraud_probability: null })).toEqual({
      score: null,
      source: 'none',
    });
    expect(normaliseRisk({})).toEqual({ score: null, source: 'none' });
  });

  it('treats a genuine zero score as a score, not as missing', () => {
    expect(normaliseRisk({ risk_score: 0 }).source).toBe('engine');
    expect(normaliseRisk({ risk_score: 0 }).score).toBe(0);
    expect(normaliseRisk({ fraud_probability: 0 }).source).toBe('legacy');
  });
});

describe('a bad row does not kill the page', () => {
  const good = {
    id: '11111111-1111-4111-a111-111111111111',
    external_ref: 'TXN-1',
    amount: '10.00',
    currency: 'AED',
    booked_at: '2026-09-01T10:00:00Z',
    transaction_type: 'PAYMENT',
    scoring_status: 'COMPLETE',
    team: 'team-alpha',
    src_account_last4: '1111',
    dst_account_last4: '2222',
    risk_score: null,
    risk_level: 'LOW',
    alert_id: null,
    alert_status: null,
    alert_severity: null,
    fraud_probability: 0.01,
  };

  it('keeps the good rows and counts the bad ones', () => {
    // The original failure: one malformed row failed the whole array, so fifty
    // good rows disappeared behind "could not be loaded".
    const page = parsePageTolerant(transactionListItemSchema, {
      items: [good, { id: 'not-a-uuid' }, { ...good, id: '22222222-2222-4222-a222-222222222222' }],
      next_cursor: 'abc',
      page_size: 3,
    });
    expect(page.items).toHaveLength(2);
    expect(page.skipped).toBe(1);
    expect(page.next_cursor).toBe('abc');
  });

  it('survives an envelope with no items array at all', () => {
    const page = parsePageTolerant(transactionListItemSchema, { detail: 'unexpected' });
    expect(page.items).toEqual([]);
    expect(page.skipped).toBe(0);
    expect(page.next_cursor).toBeNull();
  });

  it('survives null and undefined payloads', () => {
    expect(parsePageTolerant(transactionListItemSchema, null).items).toEqual([]);
    expect(parsePageTolerant(transactionListItemSchema, undefined).items).toEqual([]);
  });

  it('parses the exact row the deployed API returns', () => {
    // Verbatim from the live ledger — the shape that used to fail.
    const live = {
      id: 'd12f43d6-94b5-4ba6-acfb-189879d164da',
      external_ref: 'DEMO-BENIGN-UJY1XT',
      amount: '240.50',
      currency: 'AED',
      booked_at: '2026-09-09T20:14:00Z',
      transaction_type: 'PAYMENT',
      scoring_status: 'COMPLETE',
      team: 'team-alpha',
      src_account_last4: '3456',
      dst_account_last4: '0701',
      fraud_probability: 0.0022,
      risk_score: null,
      risk_level: 'LOW',
      alert_id: null,
      alert_status: null,
      alert_severity: null,
    };
    const page = parsePageTolerant(transactionListItemSchema, {
      items: [live],
      next_cursor: null,
      page_size: 1,
    });
    expect(page.skipped).toBe(0);
    expect(page.items).toHaveLength(1);
    expect(normaliseRisk(page.items[0]!).source).toBe('legacy');
  });

  it('keeps an unexpected extra field instead of dropping it', () => {
    const page = parsePageTolerant(transactionListItemSchema, {
      items: [{ ...good, brand_new_field: 'kept' }],
    });
    expect((page.items[0] as Record<string, unknown>)['brand_new_field']).toBe('kept');
  });
});

describe('environment configuration fails loudly rather than guessing', () => {
  it('the committed example defines the base URL and keeps mocks off', () => {
    /*
     * `.env.example` ONLY. `.env` is gitignored, so it does not exist on a CI
     * runner or a fresh clone — asserting on it made the suite pass locally and
     * fail everywhere else, which is the least useful kind of test.
     */
    const env = readFileSync(path.join(ROOT, '.env.example'), 'utf8');
    expect(env).toMatch(/^VITE_API_BASE_URL=/m);
    expect(env).toMatch(/VITE_USE_MSW=false/);
  });

  it('a missing base URL is reported, not guessed at and not thrown at import', () => {
    const missing = resolveBaseUrl(undefined);
    expect(missing.problem).toMatch(/VITE_API_BASE_URL/);
    // No invented fallback — above all, never a production URL.
    expect(missing.baseUrl).toBe('');
  });

  it('an explicitly empty base URL is same-origin, not missing', () => {
    // The two are different configurations and must not be conflated: empty is
    // a deliberate choice that routes through the dev proxy.
    expect(resolveBaseUrl('')).toEqual({ baseUrl: '', problem: null });
  });

  it('a supplied URL is used as given, minus a trailing slash', () => {
    expect(resolveBaseUrl('http://localhost:8000/')).toEqual({
      baseUrl: 'http://localhost:8000',
      problem: null,
    });
  });

  it('no production URL is hardcoded as a fallback', () => {
    const client = readFileSync(path.join(ROOT, 'src/api/client.ts'), 'utf8');
    expect(client).not.toMatch(/https?:\/\/(?!localhost)/);
  });

  it('resolving the base URL cannot throw, whatever it is handed', () => {
    // A throw during module evaluation kills the import graph and renders a
    // blank page — strictly worse than the misconfiguration it reports.
    for (const value of [undefined, '', '   ', 'http://localhost:8000', 'https://api.example/']) {
      expect(() => resolveBaseUrl(value)).not.toThrow();
    }
  });
});
