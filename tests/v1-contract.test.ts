import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { alertDetailSchema, alertPatchSchema, alertSchema } from '@/api/schemas/alerts';
import { transactionListItemSchema } from '@/api/schemas/transactions';
import { parsePageTolerant } from '@/api/compat';
import { riskDisplay } from '@/lib/risk';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

/** Comments are stripped before asserting: these files legitimately discuss
 *  paths and payloads in prose to explain why they are shaped as they are. */
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

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
    src_account_id: '9c497b11-8a6e-4abe-bcbe-a009b4bec033',
    dst_account_id: '11ec6a46-c438-4e84-a48e-a46d10ea25e6',
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

  it('keeps the account ids the graph is entered by', () => {
    // Added by the backend mid-build and caught by the committed-schema drift
    // check. Undeclared fields are stripped by Zod, which is how columns go
    // blank with nothing in the console.
    const parsed = transactionListItemSchema.parse(row);
    expect(parsed.src_account_id).toBe('9c497b11-8a6e-4abe-bcbe-a009b4bec033');
    expect(parsed.dst_account_id).toBe('11ec6a46-c438-4e84-a48e-a46d10ea25e6');
  });

  it('still parses the older contract, which sends neither', () => {
    const { src_account_id: _s, dst_account_id: _d, ...older } = row;
    expect(() => transactionListItemSchema.parse(older)).not.toThrow();
  });

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

  it('the verdict is recorded on the case instead', () => {
    // One scheme, one judgement: concluding nine member alerts separately would
    // emit nine correlated training labels for a single fraud event.
    const cases = read('src/api/endpoints/cases.ts');
    expect(cases).toContain("route('/v1/cases/{case_id}', { case_id: caseId })");
    expect(cases).toContain("body['feedback']");
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

describe('alert rows parse against the live payload', () => {
  /**
   * Copied verbatim from `GET /v1/fraud-alerts` on the running backend.
   *
   * Two fields here had the WRONG TYPE in the schema and every row was rejected:
   * `provenance` is an object, not a string, and `network.indicators` is a map,
   * not an array. Tolerant parsing then dropped all fifty rows and the queue
   * rendered "no alerts match these filters" — a plausible empty state hiding a
   * contract break behind a 200 response.
   *
   * Fixtures come off the wire, never out of a document.
   */
  const live = {
    id: 'af000dcd-f0c0-4d38-b4af-c1f092077746',
    transaction_id: '73e4f82b-e1fb-4d00-bb50-8d54e64a5ddd',
    score_id: '973b56b4-468e-451c-be5f-324f96aa07c0',
    case_id: '8d93ce3e-c475-43e2-9ecd-a23a8504eb84',
    status: 'OPEN',
    severity: 'HIGH',
    risk_score: 90.89206171035767,
    team: 'team-alpha',
    assigned_to: null,
    opened_at: '2026-09-18T21:28:13.418494Z',
    closed_at: null,
    amount: '48500.00',
    currency: 'AED',
    provenance: {
      transaction_id: '73e4f82b-e1fb-4d00-bb50-8d54e64a5ddd',
      score_id: '973b56b4-468e-451c-be5f-324f96aa07c0',
      alert_id: 'af000dcd-f0c0-4d38-b4af-c1f092077746',
      model_name: 'xgboost-paysim',
      model_version: '1.0.0',
      risk_engine_version: '2.0.0',
      scored_at: '2026-09-18T21:28:13.413145Z',
    },
  };

  it('parses a row exactly as the API returns it', () => {
    const parsed = alertSchema.parse(live);
    expect(parsed.risk_score).toBeCloseTo(90.892, 3);
    expect(parsed.case_id).toBe('8d93ce3e-c475-43e2-9ecd-a23a8504eb84');
    expect(parsed.provenance).toMatchObject({ model_name: 'xgboost-paysim' });
  });

  it('a whole page of live rows survives tolerant parsing', () => {
    const page = parsePageTolerant(alertSchema, {
      items: [live, { ...live, id: '11111111-1111-4111-a111-111111111111' }],
      next_cursor: null,
      page_size: 2,
    });
    expect(page.skipped, 'a live alert row was dropped').toBe(0);
    expect(page.items).toHaveLength(2);
  });

  it('network indicators may be a map or an array', () => {
    const base = {
      ...live,
      events: [],
      explanation: [],
      triggered_rules: [],
      decision_reasons: [],
    };
    const asMap = alertDetailSchema.parse({
      ...base,
      network: { network_score: 40, indicators: { receiver_fan_in: 4 }, evidence: [] },
    });
    expect(asMap.network?.indicators).toMatchObject({ receiver_fan_in: 4 });

    const asArray = alertDetailSchema.parse({
      ...base,
      network: { network_score: 40, indicators: ['FAN_IN'], evidence: [] },
    });
    expect(asArray.network?.indicators).toEqual(['FAN_IN']);
  });

  it('keeps direction and description on a model explanation', () => {
    // §8 renders both when present; Zod's default key-stripping removed them.
    const parsed = alertDetailSchema.parse({
      ...live,
      events: [],
      explanation: [
        {
          feature: 'amount_ratio',
          contribution: 1.42,
          direction: 'INCREASES_RISK',
          description: 'The amount was unusual for this account.',
        },
      ],
      triggered_rules: [],
      decision_reasons: [],
    });
    expect(parsed.explanation[0]).toMatchObject({
      direction: 'INCREASES_RISK',
      description: 'The amount was unusual for this account.',
    });
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

describe('every path is built from the generated OpenAPI types', () => {
  it('no endpoint module builds a URL by hand', () => {
    // A template-literal path is how a route that does not exist on the backend
    // used to typecheck. Every path now goes through `route()`, whose first
    // argument is `keyof paths` from the generated schema.
    const endpointDir = path.join(ROOT, 'src/api/endpoints');
    for (const file of readdirSync(endpointDir)) {
      const source = strip(readFileSync(path.join(endpointDir, file), 'utf8'));
      expect(source, `${file} interpolates a path`).not.toMatch(/`\/v1\/[^`]*\$\{/);
    }
  });

  it('the committed schema contains every path the console calls', () => {
    const schema = read('src/api/schema.d.ts');
    const endpointDir = path.join(ROOT, 'src/api/endpoints');
    const called = new Set<string>();

    for (const file of readdirSync(endpointDir)) {
      const source = strip(readFileSync(path.join(endpointDir, file), 'utf8'));
      for (const match of source.matchAll(/route\(\s*'([^']+)'/g)) {
        if (match[1]) called.add(match[1]);
      }
    }

    expect(called.size).toBeGreaterThan(10);
    for (const path_ of called) {
      expect(schema, `${path_} is not in the generated schema`).toContain(`"${path_}"`);
    }
  });

  it('the generated schema is committed and covers the investigation layer', () => {
    const schema = read('src/api/schema.d.ts');
    for (const path_ of [
      '/v1/cases',
      '/v1/cases/{case_id}',
      '/v1/entities',
      '/v1/network/accounts/{account_id}',
      '/v1/audit-logs',
      '/v1/feedback/export',
    ]) {
      expect(schema).toContain(`"${path_}"`);
    }
  });

  it('nothing outside the client calls fetch directly', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        const full = path.join(dir, entry);
        return statSync(full).isDirectory() ? walk(full) : [full];
      });

    const offenders = walk(path.join(ROOT, 'src'))
      .filter((f) => /\.tsx?$/.test(f))
      .filter((f) => !f.includes(`${path.sep}mocks${path.sep}`))
      .filter((f) => /(?<![.\w])fetch\s*\(/.test(strip(readFileSync(f, 'utf8'))))
      .map((f) => path.relative(ROOT, f));

    expect(offenders).toEqual(['src/api/client.ts']);
  });
});
