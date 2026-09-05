import { HttpResponse, http } from 'msw';
import { TRANSITIONS, isKnownStatus } from '@/features/alerts/stateMachine';
import {
  ACCOUNT_SCOPES,
  ALERT_FIXTURES,
  CLIENT_SCOPES,
  TRANSACTION_FIXTURES,
  USER_FIXTURES,
} from './fixtures';

/**
 * MSW handlers mirroring the real backend closely enough that the whole console
 * is presentable with the API down — the insurance policy for the meeting.
 *
 * They reproduce the behaviours the demo depends on: keyset pagination, team
 * filtering by scope, 404 (not 403) for cross-team alerts, the alert state
 * machine, idempotent replay, and RFC 9457 error bodies.
 */

const DEMO_PASSWORD = 'SyntheticDemo!2026';
const CLIENT_SECRETS: Record<string, string> = {
  'ingest-loader': 'demo-ingest-secret-not-for-production',
  'ml-service': 'demo-ml-secret-not-for-production',
};

/** In-memory mutable copy so PATCHes persist for the life of the page. */
const alerts = ALERT_FIXTURES.map((alert) => ({ ...alert, events: [...alert.events] }));
const users = [...USER_FIXTURES];
const idempotencyLog = new Map<string, Record<string, unknown>>();

/**
 * Mock identifiers must be real UUIDs.
 *
 * The response schemas validate `id`, `transaction_id` and `alert_id` with
 * `z.string().uuid()`, and that constraint is a security control, not a
 * formality — it is what closes the React Router open-redirect advisory for the
 * two interpolated route targets (see tests/route-injection.test.ts). A mock
 * that emitted `mock-txn-abc123` would be rejected by the client, which is the
 * validation layer doing exactly its job. So the fixtures produce valid UUIDs
 * rather than the schema being loosened to accept the fixtures.
 */
function mockUuid(): string {
  return crypto.randomUUID();
}

/** token -> session. Opaque strings; nothing here is a real JWT. */
const sessions = new Map<string, { scopes: string[]; team: string; subject: string }>();

function problem(
  status: number,
  title: string,
  detail: string,
  extras: Record<string, unknown> = {},
) {
  return HttpResponse.json(
    { type: `https://fraud.example/errors/${title.toLowerCase().replace(/\s+/g, '-')}`, title, status, detail, instance: '', ...extras },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );
}

function sessionFor(request: Request) {
  const header = request.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return sessions.get(header.slice(7)) ?? null;
}

function requireScope(request: Request, scope: string) {
  const session = sessionFor(request);
  if (!session) {
    return { error: problem(401, 'Unauthorized', 'A valid access token is required.') };
  }
  if (!session.scopes.includes(scope)) {
    return {
      error: problem(403, 'Insufficient scope', 'The token does not grant the required scope.', {
        required_scopes: [scope],
      }),
    };
  }
  return { session };
}

function issue(scopes: string[], team: string, subject: string) {
  const access = `mock-access-${mockUuid()}`;
  sessions.set(access, { scopes, team, subject });
  return access;
}

export const handlers = [
  http.get('*/healthz', () =>
    HttpResponse.json({ status: 'ok', version: 'mock', checks: {} }),
  ),

  http.get('*/readyz', () =>
    HttpResponse.json({
      status: 'ok',
      version: 'mock',
      checks: { database: 'ok', cache: 'ok', model: 'ok' },
    }),
  ),

  http.post('*/v1/auth/token', async ({ request }) => {
    const body = (await request.json()) as { username?: string; password?: string };
    const account = body.username ? ACCOUNT_SCOPES[body.username] : undefined;
    if (!account || body.password !== DEMO_PASSWORD) {
      return problem(401, 'Invalid credentials', 'The email or password is incorrect.');
    }
    const subject = users.find((u) => u.email === body.username)?.id ?? mockUuid();
    return HttpResponse.json({
      access_token: issue(account.scopes, account.team, subject),
      refresh_token: `mock-refresh-${mockUuid()}`,
      token_type: 'bearer',
      expires_in: 900,
      scopes: account.scopes,
    });
  }),

  http.post('*/v1/auth/client-token', async ({ request }) => {
    const body = (await request.json()) as { client_id?: string; client_secret?: string };
    const scopes = body.client_id ? CLIENT_SCOPES[body.client_id] : undefined;
    if (!scopes || CLIENT_SECRETS[body.client_id ?? ''] !== body.client_secret) {
      return problem(401, 'Invalid client', 'The client credentials were not recognised.');
    }
    return HttpResponse.json({
      access_token: issue(scopes, 'machine', body.client_id ?? 'machine'),
      // Machines re-authenticate rather than refresh.
      refresh_token: '',
      token_type: 'bearer',
      expires_in: 900,
      scopes,
    });
  }),

  http.post('*/v1/auth/refresh', async () =>
    HttpResponse.json({
      access_token: issue(
        ACCOUNT_SCOPES['analyst@example.com']?.scopes ?? [],
        'team-alpha',
        mockUuid(),
      ),
      refresh_token: `mock-refresh-${mockUuid()}`,
      token_type: 'bearer',
      expires_in: 900,
      scopes: ACCOUNT_SCOPES['analyst@example.com']?.scopes ?? [],
    }),
  ),

  http.post('*/v1/auth/logout', () => new HttpResponse(null, { status: 204 })),

  http.get('*/v1/fraud-alerts', ({ request }) => {
    const guard = requireScope(request, 'alerts:read');
    if (guard.error) return guard.error;
    const { session } = guard;

    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const severity = url.searchParams.get('severity');
    const minProbability = Number(url.searchParams.get('min_probability') ?? '0');
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? '50')));
    const cursor = url.searchParams.get('cursor');

    let visible = alerts.filter((alert) =>
      // Without alerts:read:all the server scopes to the caller's own team.
      session.scopes.includes('alerts:read:all') ? true : alert.team === session.team,
    );
    if (status) visible = visible.filter((alert) => alert.status === status);
    if (severity) visible = visible.filter((alert) => alert.severity === severity);
    if (minProbability > 0) {
      visible = visible.filter((alert) => alert.fraud_probability >= minProbability);
    }

    visible = [...visible].sort((a, b) => Date.parse(b.opened_at) - Date.parse(a.opened_at));

    // Keyset pagination: the cursor is the last id of the previous page.
    const start = cursor ? visible.findIndex((alert) => alert.id === cursor) + 1 : 0;
    const page = visible.slice(start, start + limit);
    const last = page.at(-1);
    const more = start + limit < visible.length;

    return HttpResponse.json({
      items: page.map(({ events: _events, explanation: _explanation, ...row }) => row),
      next_cursor: more && last ? last.id : null,
      page_size: limit,
    });
  }),

  http.get('*/v1/fraud-alerts/:alertId', ({ request, params }) => {
    const guard = requireScope(request, 'alerts:read');
    if (guard.error) return guard.error;
    const { session } = guard;

    const alert = alerts.find((entry) => entry.id === params['alertId']);
    // Cross-team access is masked as 404, never 403 — the same as the backend.
    if (
      !alert ||
      (!session.scopes.includes('alerts:read:all') && alert.team !== session.team)
    ) {
      return problem(404, 'Not found', 'No alert with that identifier is visible to you.');
    }
    // The live backend returns null amount/currency on the detail endpoint.
    return HttpResponse.json({ ...alert, amount: null, currency: null });
  }),

  http.patch('*/v1/fraud-alerts/:alertId', async ({ request, params }) => {
    const guard = requireScope(request, 'alerts:update');
    if (guard.error) return guard.error;
    const { session } = guard;

    const alert = alerts.find((entry) => entry.id === params['alertId']);
    if (
      !alert ||
      (!session.scopes.includes('alerts:read:all') && alert.team !== session.team)
    ) {
      return problem(404, 'Not found', 'No alert with that identifier is visible to you.');
    }

    const body = (await request.json()) as {
      status?: string;
      assigned_to?: string | null;
      note?: string;
    };

    if (body.assigned_to !== undefined && !session.scopes.includes('alerts:assign')) {
      return problem(403, 'Insufficient scope', 'Assigning a case requires alerts:assign.', {
        required_scopes: ['alerts:assign'],
      });
    }

    if (body.status) {
      const terminal = ['CLOSED', 'CONFIRMED_FRAUD', 'FALSE_POSITIVE'];
      if (terminal.includes(body.status) && !session.scopes.includes('alerts:close')) {
        return problem(403, 'Insufficient scope', 'Closing a case requires alerts:close.', {
          required_scopes: ['alerts:close'],
        });
      }
      const from = alert.status;
      const allowed = isKnownStatus(from) ? TRANSITIONS[from] : [];
      if (!allowed.includes(body.status as never)) {
        return problem(409, 'Illegal transition', `${from} cannot move to ${body.status}.`, {
          allowed_transitions: allowed,
        });
      }

      alert.events = [
        ...alert.events,
        {
          id: mockUuid(),
          from_status: from,
          to_status: body.status,
          note: body.note ?? null,
          actor_user_id: session.subject,
          created_at: new Date().toISOString(),
        },
      ];
      alert.status = body.status;
      if (body.status === 'CLOSED') alert.closed_at = new Date().toISOString();
    } else if (body.note) {
      alert.events = [
        ...alert.events,
        {
          id: mockUuid(),
          from_status: alert.status,
          to_status: alert.status,
          note: body.note,
          actor_user_id: session.subject,
          created_at: new Date().toISOString(),
        },
      ];
    }

    if (body.assigned_to !== undefined) alert.assigned_to = body.assigned_to;

    const { events: _events, explanation: _explanation, ...row } = alert;
    return HttpResponse.json(row);
  }),

  http.post('*/v1/transactions', async ({ request }) => {
    const guard = requireScope(request, 'transactions:write');
    if (guard.error) return guard.error;

    const key = request.headers.get('Idempotency-Key');
    if (key && idempotencyLog.has(key)) {
      return HttpResponse.json(idempotencyLog.get(key), {
        status: 200,
        headers: { 'Idempotent-Replay': 'true' },
      });
    }

    const body = (await request.json()) as { amount?: string; external_ref?: string };
    const amount = Number(body.amount ?? '0');
    // Big transfers score high, so "Load sample: structuring" raises a case.
    const probability = Number(Math.min(0.98, 0.18 + amount / 60_000).toFixed(4));
    const transactionId = mockUuid();
    const raisesAlert = probability >= 0.7;

    const risk = {
      fraud_probability: probability,
      risk_level: probability >= 0.7 ? 'HIGH' : probability >= 0.4 ? 'MEDIUM' : 'LOW',
      model_name: 'fixture-rules',
      model_version: 'fixture-v1',
      explanation: [
        { feature: 'amount_ratio', contribution: Number((probability * 0.4).toFixed(3)) },
        { feature: 'new_beneficiary', contribution: 0.16 },
        { feature: 'empty_receiver', contribution: 0.12 },
        { feature: 'counterparty_age', contribution: -0.05 },
      ],
      model_decision: probability >= 0.9 ? 'BLOCK' : probability >= 0.7 ? 'REVIEW' : 'ALLOW',
      latency_ms: 38,
      scored_at: new Date().toISOString(),
    };

    let alertRef: { alert_id: string; status: string; severity: string } | null = null;
    if (raisesAlert) {
      const created = {
        id: mockUuid(),
        transaction_id: transactionId,
        status: 'OPEN',
        severity: probability >= 0.9 ? 'CRITICAL' : 'HIGH',
        fraud_probability: probability,
        team: 'team-alpha',
        assigned_to: null,
        opened_at: new Date().toISOString(),
        closed_at: null,
        amount: body.amount ?? '0.00',
        currency: 'AED',
        events: [
          {
            id: mockUuid(),
            from_status: null,
            to_status: 'OPEN',
            note: 'auto-opened by fixture-rules@fixture-v1',
            actor_user_id: null,
            created_at: new Date().toISOString(),
          },
        ],
        explanation: risk.explanation,
        model_name: risk.model_name,
        model_version: risk.model_version,
        model_decision: risk.model_decision,
      };
      alerts.unshift(created);
      alertRef = { alert_id: created.id, status: 'OPEN', severity: created.severity };
    }

    TRANSACTION_FIXTURES[transactionId] = {
      id: transactionId,
      external_ref: body.external_ref ?? null,
      amount: body.amount ?? '0.00',
      currency: 'AED',
      booked_at: new Date().toISOString(),
      transaction_type: 'TRANSFER',
      mcc: 6011,
      sender_balance_before: '0.00',
      receiver_balance_before: '0.00',
      scoring_status: 'COMPLETE',
      src_account_last4: '1374',
      dst_account_last4: '9682',
    };

    const payload = {
      transaction_id: transactionId,
      scoring: 'COMPLETE',
      risk,
      alert: alertRef,
      links: {},
    };
    if (key) idempotencyLog.set(key, payload);
    return HttpResponse.json(payload, { status: 201 });
  }),

  http.get('*/v1/transactions/:id/score', ({ request, params }) => {
    const guard = requireScope(request, 'transactions:read');
    if (guard.error) return guard.error;
    const transaction = TRANSACTION_FIXTURES[String(params['id'])];
    if (!transaction) {
      return problem(404, 'Not found', 'No score recorded for this transaction yet.');
    }
    return HttpResponse.json({
      fraud_probability: 0.82,
      risk_level: 'HIGH',
      model_name: 'fixture-rules',
      model_version: 'fixture-v1',
      explanation: [{ feature: 'amount_ratio', contribution: 0.31 }],
      model_decision: 'REVIEW',
      latency_ms: 44,
      scored_at: new Date().toISOString(),
    });
  }),

  http.get('*/v1/transactions/:id', ({ request, params }) => {
    const guard = requireScope(request, 'transactions:read');
    if (guard.error) return guard.error;
    const transaction = TRANSACTION_FIXTURES[String(params['id'])];
    if (!transaction) return problem(404, 'Not found', 'No such transaction.');
    return HttpResponse.json(transaction);
  }),

  http.get('*/v1/users', ({ request }) => {
    const guard = requireScope(request, 'users:manage');
    if (guard.error) return guard.error;
    const team = new URL(request.url).searchParams.get('team');
    return HttpResponse.json(team ? users.filter((user) => user.team === team) : users);
  }),

  http.post('*/v1/users', async ({ request }) => {
    const guard = requireScope(request, 'users:manage');
    if (guard.error) return guard.error;
    const body = (await request.json()) as {
      email: string;
      full_name?: string | null;
      team: string;
      roles: string[];
    };
    const created = {
      id: mockUuid(),
      email: body.email,
      full_name: body.full_name ?? null,
      team: body.team,
      is_active: true,
      scopes: body.roles.includes('SUPERVISOR')
        ? ['alerts:read', 'alerts:read:all', 'alerts:update', 'alerts:assign', 'alerts:close']
        : body.roles.includes('ADMIN')
          ? ['users:manage']
          : ['alerts:read', 'alerts:update', 'transactions:read'],
    };
    users.push(created);
    return HttpResponse.json(created, { status: 201 });
  }),

  http.post('*/v1/users/:userId/deactivate', ({ request, params }) => {
    const guard = requireScope(request, 'users:manage');
    if (guard.error) return guard.error;
    const user = users.find((entry) => entry.id === params['userId']);
    if (!user) return problem(404, 'Not found', 'No such user.');
    user.is_active = false;
    return HttpResponse.json(user);
  }),

  http.post('*/v1/scores', async ({ request }) => {
    const guard = requireScope(request, 'scores:write');
    if (guard.error) return guard.error;
    const body = (await request.json()) as { transaction_id: string; fraud_probability: number };
    return HttpResponse.json(
      {
        transaction_id: body.transaction_id,
        fraud_probability: body.fraud_probability,
        risk_level: body.fraud_probability >= 0.7 ? 'HIGH' : 'MEDIUM',
        alert_id: body.fraud_probability >= 0.7 ? mockUuid() : null,
        explanation: [],
      },
      { status: 201 },
    );
  }),
];
