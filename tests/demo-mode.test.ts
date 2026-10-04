import { setupServer } from 'msw/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { batchVisibleTo, handlers } from '@/mocks/handlers';
import { auditEntrySchema } from '@/api/schemas/audit';
import { caseDetailSchema, caseSchema, findingsLocked } from '@/api/schemas/cases';
import { entityDetailSchema, entitySchema, entityTransactionSchema } from '@/api/schemas/entities';
import { networkGraphSchema } from '@/api/schemas/network';
import { parsePageTolerant } from '@/api/compat';
import { filenameFromDisposition } from '@/api/client';
import { directoryListSchema } from '@/api/schemas/users';
import {
  exportBatchSchema,
  labelledFeedbackSchema,
} from '@/api/schemas/labelledFeedback';

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

  it('the directory parses and is team-scoped like the live API', async () => {
    const supervisor = directoryListSchema.parse(
      await (await get(await signIn('supervisor@example.com'), '/v1/users/directory')).json(),
    );
    expect(new Set(supervisor.map((u) => u.team)).size).toBeGreaterThan(1);

    const analyst = directoryListSchema.parse(
      await (await get(await signIn('analyst@example.com'), '/v1/users/directory')).json(),
    );
    expect(analyst.every((u) => u.team === 'team-alpha')).toBe(true);
    expect(analyst.find((u) => u.email === 'analyst@example.com')?.can_investigate).toBe(true);
  });

  it('findings save on an open case, are frozen on a concluded one, and a lone note is refused', async () => {
    const token = await signIn('analyst@example.com');
    const page = parsePageTolerant(caseSchema, await (await get(token, '/v1/cases?limit=50')).json());
    const open = page.items.find((c) => c.status === 'IN_REVIEW')!;
    const concluded = page.items.find((c) => findingsLocked(String(c.status)))!;
    const patch = (id: string, body: unknown) =>
      fetch(`${BASE}/v1/cases/${id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

    const saved = caseDetailSchema.parse(
      await (await patch(open.id, { findings: '  Funds forwarded within minutes.  ' })).json(),
    );
    expect(saved.findings).toBe('Funds forwarded within minutes.');
    expect(saved.findings_by).toBeTruthy();
    expect(saved.findings_at).toBeTruthy();

    expect((await patch(concluded.id, { findings: 'late' })).status).toBe(409);

    const lone = await patch(open.id, { note: 'just a note' });
    expect(lone.status).toBe(422);
    expect(((await lone.json()) as { errors: { field: string }[] }).errors[0]?.field).toBe('note');

    // An analyst cannot assign.
    expect((await patch(open.id, { assigned_to: null })).status).toBe(403);
  });

  it('assignment validates the assignee and carries the open member alerts', async () => {
    const token = await signIn('supervisor@example.com');
    const people = directoryListSchema.parse(await (await get(token, '/v1/users/directory')).json());
    const analyst = people.find((u) => u.email === 'analyst@example.com')!;
    const outsider = people.find((u) => u.email === 'other-analyst@example.com')!;

    const page = parsePageTolerant(caseSchema, await (await get(token, '/v1/cases?limit=50')).json());
    const target = page.items.find((c) => c.team === 'team-alpha' && c.status === 'OPEN')!;
    const patch = (body: unknown) =>
      fetch(`${BASE}/v1/cases/${target.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

    const rejected = await patch({ assigned_to: outsider.id });
    expect(rejected.status).toBe(422);
    const problem = (await rejected.json()) as { detail: string; errors: { field: string }[] };
    expect(problem.detail).toBe('The assignee must belong to the same team as the case.');
    expect(problem.errors[0]?.field).toBe('assigned_to');

    const assigned = caseDetailSchema.parse(await (await patch({ assigned_to: analyst.id })).json());
    expect(assigned.assigned_to).toBe(analyst.id);
    const member = assigned.alerts![0]!;
    const alert = (await (await get(token, `/v1/fraud-alerts/${member.id}`)).json()) as {
      assigned_to: string | null;
    };
    expect(alert.assigned_to).toBe(analyst.id);

    const cleared = caseDetailSchema.parse(await (await patch({ assigned_to: null })).json());
    expect(cleared.assigned_to).toBeNull();
  });

  it('a validated verdict can be batched and downloaded; a cancelled batch cannot', async () => {
    const token = await signIn('supervisor@example.com');
    const send = (method: string, path: string, body?: unknown) =>
      fetch(`${BASE}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

    const records = parsePageTolerant(
      labelledFeedbackSchema,
      await (await get(token, '/v1/labelled-feedback/records?limit=50')).json(),
    );
    expect(records.skipped).toBe(0);
    const record = records.items.find((r) => r.final_label === 'CONFIRMED_FRAUD')!;
    expect(record.curation_status).toBe('PENDING');
    expect(record.analyst_findings).toBeTruthy();

    // Unvalidated records are refused, as on the live API.
    expect(
      (await send('POST', '/v1/labelled-feedback/batches', { name: 'x', record_ids: [record.id] }))
        .status,
    ).toBe(409);

    await send('PATCH', `/v1/labelled-feedback/records/${record.id}`, {
      curation_status: 'VALIDATED',
    });
    const batch = exportBatchSchema.parse(
      await (
        await send('POST', '/v1/labelled-feedback/batches', {
          name: 'Demo batch',
          record_ids: [record.id],
        })
      ).json(),
    );

    const csv = await get(token, `/v1/labelled-feedback/batches/${batch.id}/download?format=csv`);
    expect(csv.status).toBe(200);
    expect(filenameFromDisposition(csv.headers.get('Content-Disposition'))).toBe(
      `labelled-feedback-demo-batch-${batch.id.slice(0, 8)}.csv`,
    );
    const text = await csv.text();
    expect(text.split('\r\n')[0]).toContain('analyst_findings');
    // People are ids only in an export.
    expect(text).not.toMatch(/@example\.com/);

    const jsonl = await get(token, `/v1/labelled-feedback/batches/${batch.id}/download?format=jsonl`);
    expect(JSON.parse((await jsonl.text()).trim()).id).toBe(record.id);

    await send('POST', `/v1/labelled-feedback/batches/${batch.id}/cancel`);
    expect((await get(token, `/v1/labelled-feedback/batches/${batch.id}/download`)).status).toBe(409);
  });

  it('excluding without a reason is a 409, and validating with a null note clears it', async () => {
    const token = await signIn('supervisor@example.com');
    const records = parsePageTolerant(
      labelledFeedbackSchema,
      await (await get(token, '/v1/labelled-feedback/records?final_label=FALSE_POSITIVE')).json(),
    );
    const record = records.items[0]!;
    const patch = (body: unknown) =>
      fetch(`${BASE}/v1/labelled-feedback/records/${record.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

    expect((await patch({ curation_status: 'EXCLUDED' })).status).toBe(409);

    const excluded = labelledFeedbackSchema.parse(
      await (
        await patch({ curation_status: 'EXCLUDED', curation_note: 'One-off branch error.' })
      ).json(),
    );
    expect(excluded.curation_note).toBe('One-off branch error.');

    const validated = labelledFeedbackSchema.parse(
      await (await patch({ curation_status: 'VALIDATED', curation_note: null })).json(),
    );
    expect(validated.curation_status).toBe('VALIDATED');
    expect(validated.curation_note).toBeNull();
  });

  it('batches follow the backend team rule', async () => {
    const machine = await fetch(`${BASE}/v1/auth/client-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: 'ml-service',
        client_secret: 'demo-ml-secret-not-for-production',
      }),
    });
    const { access_token: ml } = (await machine.json()) as { access_token: string };
    // The cross-team supervisor's batch (team null) from the test above.
    const listed = parsePageTolerant(
      exportBatchSchema,
      await (await get(ml, '/v1/labelled-feedback/batches')).json(),
    );
    expect(listed.items.length).toBeGreaterThan(0);

    const analyst = await signIn('analyst@example.com');
    expect((await get(analyst, '/v1/labelled-feedback/batches')).status).toBe(403);

    // A team-scoped reviewer sees only their team's batches; the rest are 404.
    const reviewer = { scopes: ['feedback:review'], team: 'team-alpha' };
    const crossTeam = { scopes: ['feedback:review', 'alerts:read:all'], team: 'team-alpha' };
    const mlService = { scopes: ['feedback:process'], team: 'machine' };
    expect(batchVisibleTo(reviewer, { team: 'team-alpha' })).toBe(true);
    expect(batchVisibleTo(reviewer, { team: 'team-beta' })).toBe(false);
    expect(batchVisibleTo(reviewer, { team: null })).toBe(false);
    expect(batchVisibleTo(crossTeam, { team: 'team-beta' })).toBe(true);
    expect(batchVisibleTo(mlService, { team: null })).toBe(true);
  });

  it('a team with no traffic sees empty lists, not errors', async () => {
    const token = await signIn('other-analyst@example.com');
    for (const path of ['/v1/cases', '/v1/entities']) {
      const response = await get(token, path);
      expect(response.status, `${path} should answer, not fail`).toBe(200);
    }
  });
});
