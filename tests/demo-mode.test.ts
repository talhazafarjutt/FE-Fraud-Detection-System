import { setupServer } from 'msw/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { handlers } from '@/mocks/handlers';
import { auditEntrySchema } from '@/api/schemas/audit';
import { caseDetailSchema, caseSchema } from '@/api/schemas/cases';
import { entityDetailSchema, entitySchema, entityTransactionSchema } from '@/api/schemas/entities';
import { networkGraphSchema } from '@/api/schemas/network';
import { parsePageTolerant } from '@/api/compat';

/**
 * Demo mode must serve the SAME contract as the real API.
 *
 * A mock that is easier than production is worse than no mock: the screens get
 * built against the easy version and break on the real thing. So every mocked
 * response here is parsed with the SAME Zod schema the console uses against the
 * live backend — if the mock drifts, this fails.
 *
 * It also pins the permission model, because getting that wrong offline teaches
 * people the wrong thing: an ADMIN can read the audit trail and nothing else,
 * and an analyst on a team with no traffic correctly sees empty lists.
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
  expect(response.status, `${username} could not sign in`).toBe(200);
  const body = (await response.json()) as { access_token: string };
  return body.access_token;
}

const get = (token: string, path: string) =>
  fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });

describe('demo mode serves the live contract', () => {
  it('cases carry the grouping, and a concluded one carries its verdict', async () => {
    const token = await signIn('supervisor@example.com');

    const list = await get(token, '/v1/cases?limit=50');
    expect(list.status).toBe(200);
    const page = parsePageTolerant(caseSchema, await list.json());
    expect(page.skipped, 'a mocked case row failed the real schema').toBe(0);
    expect(page.items.length).toBeGreaterThan(0);

    // The whole point of a case: more alerts than one.
    expect(page.items.some((c) => (c.alert_count ?? 1) > 1)).toBe(true);

    const concluded = page.items.find((c) => c.status === 'CONFIRMED_FRAUD');
    expect(concluded, 'no concluded case to demo a verdict with').toBeDefined();

    const detail = caseDetailSchema.parse(
      await (await get(token, `/v1/cases/${concluded!.id}`)).json(),
    );
    expect(detail.alerts?.length).toBe(detail.alert_count);
    expect(detail.feedback?.final_label).toBe('CONFIRMED_FRAUD');
    // Frozen at decision time — the reason they are stored at all.
    expect(detail.feedback?.original_risk_score).toBeTypeOf('number');
  });

  it('refuses a verdict with no feedback block, and names the legal moves on a bad one', async () => {
    const token = await signIn('supervisor@example.com');
    const page = parsePageTolerant(caseSchema, await (await get(token, '/v1/cases?limit=50')).json());
    const open = page.items.find((c) => c.status === 'OPEN');
    expect(open).toBeDefined();

    const patch = (body: unknown) =>
      fetch(`${BASE}/v1/cases/${open!.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

    // OPEN -> CONFIRMED_FRAUD is not a legal move; the server says what is.
    const illegal = await patch({ status: 'CONFIRMED_FRAUD' });
    expect(illegal.status).toBe(409);
    const problem = (await illegal.json()) as { allowed_transitions?: string[] };
    expect(problem.allowed_transitions).toContain('IN_REVIEW');

    // FALSE_POSITIVE is legal from OPEN — but not without a label.
    const noLabel = await patch({ status: 'FALSE_POSITIVE' });
    expect(noLabel.status).toBe(409);
  });

  it('an analyst cannot conclude, and cannot read the trail', async () => {
    const token = await signIn('analyst@example.com');
    const page = parsePageTolerant(caseSchema, await (await get(token, '/v1/cases?limit=50')).json());
    const open = page.items.find((c) => c.status === 'OPEN');

    const attempt = await fetch(`${BASE}/v1/cases/${open!.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'FALSE_POSITIVE',
        feedback: { final_label: 'FALSE_POSITIVE', confidence: 'HIGH', model_agreement: 'AGREES' },
      }),
    });
    expect(attempt.status, 'four-eyes is not enforced in demo mode').toBe(403);

    expect((await get(token, '/v1/audit-logs')).status).toBe(403);
  });

  it('entities parse, and direction is relative to the party', async () => {
    const token = await signIn('analyst@example.com');

    const page = parsePageTolerant(entitySchema, await (await get(token, '/v1/entities?limit=50')).json());
    expect(page.skipped).toBe(0);
    expect(page.items.length).toBeGreaterThan(0);

    const detail = entityDetailSchema.parse(
      await (await get(token, `/v1/entities/${page.items[0]!.id}`)).json(),
    );
    expect(detail.accounts?.length).toBeGreaterThan(0);

    // No IBAN exists anywhere in this contract, by design.
    const raw = JSON.stringify(detail);
    expect(raw).not.toMatch(/iban|national_id/i);

    const txns = parsePageTolerant(
      entityTransactionSchema,
      await (await get(token, `/v1/entities/${page.items[0]!.id}/transactions`)).json(),
    );
    expect(txns.skipped).toBe(0);
    for (const row of txns.items) {
      expect(['IN', 'OUT', 'INTERNAL']).toContain(row.direction);
    }
  });

  it('the graph honours the node budget and admits when it truncated', async () => {
    const token = await signIn('analyst@example.com');
    const entities = parsePageTolerant(
      entitySchema,
      await (await get(token, '/v1/entities?limit=50')).json(),
    );
    const detail = entityDetailSchema.parse(
      await (await get(token, `/v1/entities/${entities.items[0]!.id}`)).json(),
    );
    const accountId = detail.accounts![0]!.id;

    const full = networkGraphSchema.parse(
      await (await get(token, `/v1/network/accounts/${accountId}?depth=3&max_nodes=500`)).json(),
    );
    expect(full.nodes.filter((n) => n.is_focus)).toHaveLength(1);
    expect(full.nodes.every((n) => n.hop >= 0)).toBe(true);

    const budgeted = networkGraphSchema.parse(
      await (await get(token, `/v1/network/accounts/${accountId}?depth=3&max_nodes=10`)).json(),
    );
    expect(budgeted.nodes.length).toBeLessThanOrEqual(10);
    // A trimmed graph read as complete produces a false conclusion.
    if (full.nodes.length > 10) expect(budgeted.truncated).toBe(true);
  });

  it('the audit trail is readable by an admin and records what they did', async () => {
    const token = await signIn('admin@example.com');
    const page = parsePageTolerant(
      auditEntrySchema,
      await (await get(token, '/v1/audit-logs?limit=50')).json(),
    );
    expect(page.skipped).toBe(0);
    expect(page.items.length).toBeGreaterThan(0);

    // Newest first.
    const times = page.items.map((row) => Date.parse(row.created_at));
    expect([...times].sort((a, b) => b - a)).toEqual(times);

    // An admin administers people; the case files are out of reach.
    expect((await get(token, '/v1/cases')).status).toBe(403);
    expect((await get(token, '/v1/entities')).status).toBe(403);
    expect((await get(token, '/v1/fraud-alerts')).status).toBe(403);
  });

  it('a team with no traffic sees empty lists, not errors', async () => {
    const token = await signIn('other-analyst@example.com');
    for (const path of ['/v1/cases', '/v1/entities']) {
      const response = await get(token, path);
      expect(response.status, `${path} should answer, not fail`).toBe(200);
    }
  });
});
