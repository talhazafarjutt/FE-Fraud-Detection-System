import { HttpResponse, http } from 'msw';
import { TRANSITIONS, isKnownStatus } from '@/features/alerts/stateMachine';
import {
  ACCOUNT_SCOPES,
  ALERT_FIXTURES,
  ALL_TRANSACTIONS,
  CLEAN_PROBABILITY,
  CLIENT_SCOPES,
  TRANSACTION_FIXTURES,
  USER_FIXTURES,
} from './fixtures';
import { computeOverview } from './metrics';
import {
  ACCOUNT_FIXTURES,
  ALERTS_PER_ACCOUNT,
  AUDIT_FIXTURES,
  CASE_FIXTURES,
  EDGE_FIXTURES,
  ENTITY_FIXTURES,
  type MockCase,
} from './investigation';

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
const transactions = [...ALL_TRANSACTIONS];

/** Mutable copies so PATCH, attach and detach persist for the life of the page. */
const cases: MockCase[] = CASE_FIXTURES.map((entry) => ({
  ...entry,
  alerts: [...entry.alerts],
}));
const auditLog = [...AUDIT_FIXTURES];
let nextAuditId = Math.max(0, ...auditLog.map((row) => row.id)) + 1;

/** Every mutation writes a trail entry, exactly as the backend does. */
function recordAudit(
  actor: string,
  action: string,
  entity: string,
  entityId: string,
  detail: Record<string, unknown> | null,
) {
  auditLog.unshift({
    id: nextAuditId++,
    actor,
    actor_type: 'user',
    action,
    entity,
    entity_id: entityId,
    request_id: mockUuid().replace(/-/g, ''),
    ip: '127.0.0.1',
    detail,
    created_at: new Date().toISOString(),
  });
}

/**
 * Keyset pagination, shared by every list below.
 *
 * The cursor is the previous page's last id — there is no offset on this API
 * and there never will be, so the mock must not offer one either.
 */
function paginate<T extends { id: string | number }>(
  rows: T[],
  url: URL,
  max = 200,
): { items: T[]; next_cursor: string | null; page_size: number } {
  const limit = Math.min(max, Math.max(1, Number(url.searchParams.get('limit') ?? '50')));
  const cursor = url.searchParams.get('cursor');
  const start = cursor ? rows.findIndex((row) => String(row.id) === cursor) + 1 : 0;
  const page = rows.slice(start, start + limit);
  const last = page.at(-1);
  const more = start + limit < rows.length;
  return {
    items: page,
    next_cursor: more && last ? String(last.id) : null,
    page_size: limit,
  };
}

/** Cross-team access is masked as 404, never 403 — the same as the backend. */
function visibleTo(session: { scopes: string[]; team: string }, team: string): boolean {
  return session.scopes.includes('alerts:read:all') || team === session.team;
}

/**
 * §16.3 CASE_FEEDBACK. `model_probability` and `model_version` are COPIED at
 * write time, never joined: when the model is retrained the score may be
 * recomputed, and a training label must stay pinned to the score that actually
 * produced it.
 */
interface FeedbackRow {
  alert_id: string;
  transaction_id: string;
  reviewer_id: string;
  model_probability: number;
  model_version: string | null;
  created_at: string;
  [field: string]: unknown;
}
const feedbackRows: FeedbackRow[] = [];

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

/** Stable UUID for a given key, so a mocked row keeps its id across renders. */
function mockUuidFor(key: string): string {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash = Math.imul(hash ^ key.charCodeAt(i), 16777619) >>> 0;
  }
  const hex = (n: number, len: number) =>
    Math.abs(n).toString(16).padStart(len, '0').slice(0, len);
  return [
    hex(hash, 8),
    hex(hash >> 4, 4),
    `4${hex(hash >> 8, 3)}`,
    `a${hex(hash >> 12, 3)}`,
    hex(hash * 31, 12),
  ].join('-');
}

/**
 * Breadth-first expansion from a focus account, honouring depth, window and the
 * node budget — and reporting `truncated` honestly when the budget stops it.
 * A mock that always returned the full graph would hide the one state an
 * investigator most needs to notice.
 */
function graphResponse(request: Request, focusAccountId: string) {
  const guard = requireScope(request, 'alerts:read');
  if (guard.error) return guard.error;

  const url = new URL(request.url);
  const depth = Math.min(3, Math.max(1, Number(url.searchParams.get('depth') ?? '2')));
  const windowDays = Math.min(
    365,
    Math.max(1, Number(url.searchParams.get('window_days') ?? '30')),
  );
  const maxNodes = Math.min(500, Math.max(10, Number(url.searchParams.get('max_nodes') ?? '120')));

  if (!ACCOUNT_FIXTURES.some((a) => a.id === focusAccountId)) {
    return problem(404, 'Not found', 'No account with that identifier is visible to you.');
  }

  const cutoff = Date.now() - windowDays * 86_400_000;
  const inWindow = EDGE_FIXTURES.filter((e) => Date.parse(e.last_booked_at) >= cutoff);

  const hops = new Map<string, number>([[focusAccountId, 0]]);
  let frontier = [focusAccountId];
  let truncated = false;

  for (let hop = 1; hop <= depth; hop += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const edge of inWindow) {
        for (const other of [
          edge.source === id ? edge.target : null,
          edge.target === id ? edge.source : null,
        ]) {
          if (!other || hops.has(other)) continue;
          if (hops.size >= maxNodes) {
            truncated = true;
            continue;
          }
          hops.set(other, hop);
          next.push(other);
        }
      }
    }
    frontier = next;
  }

  const nodes = [...hops.entries()].map(([id, hop]) => {
    const account = ACCOUNT_FIXTURES.find((a) => a.id === id);
    return {
      id,
      label: account ? `Account ••••${account.account_last4}` : null,
      account_last4: account?.account_last4 ?? null,
      currency: account?.currency ?? null,
      country_code: account?.country_code ?? null,
      status: account?.status ?? null,
      hop,
      is_focus: id === focusAccountId,
      alert_count: ALERTS_PER_ACCOUNT.get(id) ?? 0,
    };
  });

  const edges = inWindow.filter((e) => hops.has(e.source) && hops.has(e.target));

  return HttpResponse.json({
    focus_account_id: focusAccountId,
    depth,
    window_days: windowDays,
    nodes,
    edges,
    truncated,
  });
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
      visible = visible.filter((alert) => (alert.fraud_probability ?? 0) >= minProbability);
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
      feedback?: Record<string, unknown>;
    };

    // §16.3: feedback is accepted only alongside a terminal status. Sending it
    // on IN_REVIEW or ESCALATED is a 422, exactly as the real endpoint should
    // behave once it exists.
    if (body.feedback) {
      const terminal = ['CONFIRMED_FRAUD', 'FALSE_POSITIVE'];
      if (!body.status || !terminal.includes(body.status)) {
        return problem(
          422,
          'Validation failed',
          'Feedback may only accompany a terminal status.',
          { errors: [{ field: 'feedback', message: 'Requires a terminal status.' }] },
        );
      }
    }

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

    if (body.feedback) {
      // model_probability and model_version are copied, not joined — a training
      // label must stay pinned to the score that produced it even after the
      // model is retrained and scores are recomputed.
      feedbackRows.push({
        ...body.feedback,
        alert_id: alert.id,
        transaction_id: alert.transaction_id,
        reviewer_id: session.subject,
        model_probability: alert.fraud_probability ?? 0,
        model_version: alert.model_version,
        created_at: new Date().toISOString(),
      });
    }

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
        // Same V1 fields the real backend leaves null.
        risk_score: null,
        case_id: null,
        score_id: null,
        provenance: null,
        risk_engine_version: null,
        signals: null,
        triggered_rules: [],
        network: null,
        anomaly: null,
        decision_reasons: [],
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

  /* ---------------------------------------------------------------- *
   * §15.2 — endpoints the real backend does not have yet.
   * These mirror the specified contract exactly so swapping in the real
   * implementation requires no UI change.
   * ---------------------------------------------------------------- */

  http.get('*/v1/metrics/overview', ({ request }) => {
    const guard = requireScope(request, 'alerts:read');
    if (guard.error) return guard.error;
    const { session } = guard;

    const url = new URL(request.url);
    const bucket = url.searchParams.get('bucket') === 'hour' ? 'hour' : 'day';
    const from = url.searchParams.get('from') ?? undefined;
    const to = url.searchParams.get('to') ?? undefined;

    // Same team filter as every other row-returning endpoint.
    const visibleAlerts = session.scopes.includes('alerts:read:all')
      ? alerts
      : alerts.filter((a) => a.team === session.team);
    const visibleAlertTxIds = new Set(visibleAlerts.map((a) => a.transaction_id));
    const visibleTx = session.scopes.includes('alerts:read:all')
      ? transactions
      : transactions.filter((t) => visibleAlertTxIds.has(t.id) || !TRANSACTION_FIXTURES[t.id]);

    return HttpResponse.json(
      computeOverview({ alerts: visibleAlerts, transactions: visibleTx, bucket, from, to }),
    );
  }),

  http.get('*/v1/transactions', ({ request }) => {
    const guard = requireScope(request, 'transactions:read');
    if (guard.error) return guard.error;

    const url = new URL(request.url);
    const p = url.searchParams;
    const limit = Math.min(200, Math.max(1, Number(p.get('limit') ?? '50')));
    const cursor = p.get('cursor');

    const alertByTx = new Map(alerts.map((a) => [a.transaction_id, a]));

    let rows = transactions.map((t) => {
      const alert = alertByTx.get(t.id);
      const probability = alert?.fraud_probability ?? CLEAN_PROBABILITY.get(t.id) ?? 0;
      return {
        ...t,
        fraud_probability: probability,
        risk_level: probability >= 0.7 ? 'HIGH' : probability >= 0.4 ? 'MEDIUM' : 'LOW',
        alert_id: alert?.id ?? null,
        alert_status: alert?.status ?? null,
      };
    });

    // has_alert is the fraud / non-fraud switch §15 is built around.
    const hasAlert = p.get('has_alert');
    if (hasAlert === 'true') rows = rows.filter((r) => r.alert_id !== null);
    if (hasAlert === 'false') rows = rows.filter((r) => r.alert_id === null);

    const riskLevel = p.get('risk_level');
    if (riskLevel) rows = rows.filter((r) => r.risk_level === riskLevel);

    const type = p.get('transaction_type');
    if (type) rows = rows.filter((r) => r.transaction_type === type);

    const scoringStatus = p.get('scoring_status');
    if (scoringStatus) rows = rows.filter((r) => r.scoring_status === scoringStatus);

    const minP = p.get('min_probability');
    if (minP) rows = rows.filter((r) => r.fraud_probability >= Number(minP));
    const maxP = p.get('max_probability');
    if (maxP) rows = rows.filter((r) => r.fraud_probability <= Number(maxP));

    const from = p.get('from');
    if (from) rows = rows.filter((r) => Date.parse(r.booked_at) >= Date.parse(from));
    const to = p.get('to');
    if (to) rows = rows.filter((r) => Date.parse(r.booked_at) <= Date.parse(to));

    const minAmount = p.get('min_amount');
    if (minAmount) rows = rows.filter((r) => Number(r.amount) >= Number(minAmount));
    const maxAmount = p.get('max_amount');
    if (maxAmount) rows = rows.filter((r) => Number(r.amount) <= Number(maxAmount));

    const q = p.get('q');
    if (q) {
      const needle = q.toLowerCase();
      rows = rows.filter((r) => (r.external_ref ?? '').toLowerCase().includes(needle));
    }

    // Sort booked_at DESC, id DESC — the cursor encodes that pair.
    rows.sort(
      (a, b) => Date.parse(b.booked_at) - Date.parse(a.booked_at) || b.id.localeCompare(a.id),
    );

    const start = cursor ? rows.findIndex((r) => r.id === cursor) + 1 : 0;
    const page = rows.slice(start, start + limit);
    const last = page.at(-1);
    const more = start + limit < rows.length;

    return HttpResponse.json({
      items: page,
      next_cursor: more && last ? last.id : null,
      page_size: limit,
    });
  }),

  /* ---------------------------------------------------------------- *
   * §16.3 — feedback capture and export.
   * ---------------------------------------------------------------- */

  http.get('*/v1/feedback/export', ({ request }) => {
    // feedback:export, not users:manage — verified against the live API, where
    // a SUPERVISOR holds it and an ADMIN does not.
    const guard = requireScope(request, 'feedback:export');
    if (guard.error) return guard.error;

    // One JSON object per line: model input, model output, analyst label.
    // This file is the retraining set — it is what makes the loop real.
    const lines = feedbackRows.map((row) => JSON.stringify(row)).join('\n');
    return new HttpResponse(lines, {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson' },
    });
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

  /* ---------------------------------------------------------------- *
   * Cases — the investigation layer.
   * ---------------------------------------------------------------- */

  http.get('*/v1/cases', ({ request }) => {
    const guard = requireScope(request, 'alerts:read');
    if (guard.error) return guard.error;
    const { session } = guard;

    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const severity = url.searchParams.get('severity');

    let visible = cases.filter((entry) => visibleTo(session, entry.team));
    if (status) visible = visible.filter((entry) => entry.status === status);
    if (severity) visible = visible.filter((entry) => entry.severity === severity);
    visible = [...visible].sort((a, b) => Date.parse(b.opened_at) - Date.parse(a.opened_at));

    const page = paginate(visible, url);
    return HttpResponse.json({
      ...page,
      items: page.items.map(({ alerts: _a, feedback: _f, ...row }) => row),
    });
  }),

  http.get('*/v1/cases/:caseId', ({ request, params }) => {
    const guard = requireScope(request, 'alerts:read');
    if (guard.error) return guard.error;
    const { session } = guard;

    const found = cases.find((entry) => entry.id === params['caseId']);
    if (!found || !visibleTo(session, found.team)) {
      return problem(404, 'Not found', 'No case with that identifier is visible to you.');
    }
    return HttpResponse.json(found);
  }),

  http.patch('*/v1/cases/:caseId', async ({ request, params }) => {
    const guard = requireScope(request, 'alerts:update');
    if (guard.error) return guard.error;
    const { session } = guard;

    const found = cases.find((entry) => entry.id === params['caseId']);
    if (!found || !visibleTo(session, found.team)) {
      return problem(404, 'Not found', 'No case with that identifier is visible to you.');
    }

    const body = (await request.json()) as {
      status?: string;
      title?: string;
      assigned_to?: string;
      note?: string;
      feedback?: Record<string, unknown>;
    };

    if (body.status !== undefined) {
      if (!isKnownStatus(found.status) || !isKnownStatus(body.status)) {
        return problem(422, 'Invalid input', 'Unknown status.');
      }
      const allowed = TRANSITIONS[found.status];
      if (!allowed.includes(body.status)) {
        // The server sends the legal moves back; the UI renders them.
        return problem(409, 'Conflict', `Cannot move from ${found.status} to ${body.status}.`, {
          allowed_transitions: allowed,
        });
      }

      const terminal = ['CONFIRMED_FRAUD', 'FALSE_POSITIVE', 'CLOSED'];
      if (terminal.includes(body.status) && !session.scopes.includes('alerts:close')) {
        return problem(403, 'Insufficient scope', 'Concluding a case requires alerts:close.', {
          required_scopes: ['alerts:close'],
        });
      }

      // A verdict without a label is refused. The label IS the verdict; a
      // status change on its own produces a closed case and no training data.
      const verdict = ['CONFIRMED_FRAUD', 'FALSE_POSITIVE'];
      if (verdict.includes(body.status) && !body.feedback) {
        return problem(409, 'Conflict', 'Concluding a case requires a feedback block.');
      }
    }

    if (body.feedback) {
      const required = ['final_label', 'confidence', 'model_agreement'];
      const missing = required.filter((key) => !body.feedback?.[key]);
      if (missing.length) {
        return problem(422, 'Invalid input', 'One or more fields are invalid.', {
          errors: missing.map((field) => ({ field, message: 'This field is required.' })),
        });
      }
    }

    const anchor = found.alerts[0];
    if (body.status) found.status = body.status;
    if (body.title) found.title = body.title;
    if (body.assigned_to !== undefined) found.assigned_to = body.assigned_to || null;

    if (body.feedback) {
      found.closed_at = new Date().toISOString();
      found.feedback = {
        id: mockUuid(),
        case_id: found.id,
        anchor_alert_id: anchor?.id ?? null,
        score_id: anchor?.score_id ?? null,
        transaction_id: anchor?.transaction_id ?? null,
        alert_count: found.alerts.length,
        ...body.feedback,
        decision_drivers: body.feedback['decision_drivers'] ?? [],
        missing_signals: body.feedback['missing_signals'] ?? [],
        notes: body.feedback['notes'] ?? null,
        reviewer_user_id: session.subject,
        alert_opened_at: found.opened_at,
        decided_at: new Date().toISOString(),
        model_version: 'fixture-v1',
        risk_engine_version: 'engine-v1.2.0',
        original_risk_score: 91,
        original_model_score: 96,
        original_rule_score: 100,
        original_anomaly_score: 88,
        original_network_score: 40,
        original_triggered_rules: [
          {
            rule: 'ORIGIN_ACCOUNT_DRAIN',
            severity: 'HIGH',
            description: 'The transfer left the sending account with a balance of zero.',
          },
        ],
      };
    }

    recordAudit(session.subject, 'case.patch', 'fraud_case', found.id, {
      ...(body.status ? { status: body.status } : {}),
      alert_count: found.alerts.length,
    });

    return HttpResponse.json(found);
  }),

  http.post('*/v1/cases/:caseId/alerts', async ({ request, params }) => {
    const guard = requireScope(request, 'alerts:update');
    if (guard.error) return guard.error;
    const { session } = guard;

    const found = cases.find((entry) => entry.id === params['caseId']);
    if (!found || !visibleTo(session, found.team)) {
      return problem(404, 'Not found', 'No case with that identifier is visible to you.');
    }

    const body = (await request.json()) as { alert_id?: string };
    const alert = alerts.find((entry) => entry.id === body.alert_id);
    if (!alert) {
      return problem(404, 'Not found', 'No alert with that identifier is visible to you.');
    }
    if (found.alerts.some((entry) => entry.id === alert.id)) {
      return problem(409, 'Conflict', 'That alert already belongs to this investigation.');
    }

    found.alerts.push({
      id: alert.id,
      transaction_id: alert.transaction_id,
      score_id: alert.score_id ?? null,
      status: String(alert.status),
      severity: String(alert.severity),
      opened_at: alert.opened_at,
    });
    found.alert_count = found.alerts.length;
    recordAudit(session.subject, 'case.alert.attach', 'fraud_case', found.id, {
      alert_id: alert.id,
    });

    return HttpResponse.json(found);
  }),

  http.delete('*/v1/cases/:caseId/alerts/:alertId', ({ request, params }) => {
    const guard = requireScope(request, 'alerts:update');
    if (guard.error) return guard.error;
    const { session } = guard;

    const found = cases.find((entry) => entry.id === params['caseId']);
    if (!found || !visibleTo(session, found.team)) {
      return problem(404, 'Not found', 'No case with that identifier is visible to you.');
    }

    found.alerts = found.alerts.filter((entry) => entry.id !== params['alertId']);
    found.alert_count = found.alerts.length;
    recordAudit(session.subject, 'case.alert.detach', 'fraud_case', found.id, {
      alert_id: String(params['alertId']),
    });

    return new HttpResponse(null, { status: 204 });
  }),

  /* ---------------------------------------------------------------- *
   * Entities.
   * ---------------------------------------------------------------- */

  http.get('*/v1/entities', ({ request }) => {
    const guard = requireScope(request, 'entities:read');
    if (guard.error) return guard.error;
    const { session } = guard;

    const url = new URL(request.url);
    const partyType = url.searchParams.get('party_type');
    const country = url.searchParams.get('country_code');
    const minTier = Number(url.searchParams.get('min_risk_tier') ?? '0');
    const q = url.searchParams.get('q')?.toLowerCase();

    // An entity is visible only once your team has transacted with it. For
    // team-beta that is nothing — correct, and the screen says why.
    let visible = ENTITY_FIXTURES.filter((entity) => visibleTo(session, entity.team));
    if (partyType) visible = visible.filter((e) => e.party_type === partyType);
    if (country) visible = visible.filter((e) => e.country_code === country);
    if (minTier > 0) visible = visible.filter((e) => e.risk_tier >= minTier);
    if (q) visible = visible.filter((e) => e.display_name.toLowerCase().includes(q));

    const page = paginate(visible, url);
    return HttpResponse.json({
      ...page,
      items: page.items.map(({ team: _t, date_of_birth: _d, ...row }) => row),
    });
  }),

  http.get('*/v1/entities/:partyId', ({ request, params }) => {
    const guard = requireScope(request, 'entities:read');
    if (guard.error) return guard.error;
    const { session } = guard;

    const entity = ENTITY_FIXTURES.find((e) => e.id === params['partyId']);
    if (!entity || !visibleTo(session, entity.team)) {
      return problem(404, 'Not found', 'No party with that identifier is visible to you.');
    }

    const { team: _team, ...row } = entity;
    return HttpResponse.json({
      ...row,
      accounts: ACCOUNT_FIXTURES.filter((a) => a.party_id === entity.id).map(
        ({ party_id: _p, ...account }) => account,
      ),
    });
  }),

  http.get('*/v1/entities/:partyId/transactions', ({ request, params }) => {
    const guard = requireScope(request, 'entities:read');
    if (guard.error) return guard.error;
    const { session } = guard;

    const entity = ENTITY_FIXTURES.find((e) => e.id === params['partyId']);
    if (!entity || !visibleTo(session, entity.team)) {
      return problem(404, 'Not found', 'No party with that identifier is visible to you.');
    }

    const url = new URL(request.url);
    const wanted = url.searchParams.get('direction');
    const owned = new Set(
      ACCOUNT_FIXTURES.filter((a) => a.party_id === entity.id).map((a) => a.id),
    );

    /*
     * Direction is computed RELATIVE TO THIS PARTY, which is the whole point:
     * the same edge is OUT here and IN on the counterparty's page.
     */
    const rows = EDGE_FIXTURES.filter((e) => owned.has(e.source) || owned.has(e.target)).map(
      (edge, index) => {
        const out = owned.has(edge.source);
        const inbound = owned.has(edge.target);
        return {
          id: mockUuidFor(`${edge.source}:${edge.target}:${index}`),
          external_ref: `TXN-${String(index).padStart(6, '0')}`,
          direction: out && inbound ? 'INTERNAL' : out ? 'OUT' : 'IN',
          amount: edge.total_amount,
          currency: edge.currency,
          booked_at: edge.last_booked_at,
          transaction_type: 'TRANSFER',
          scoring_status: 'COMPLETE',
          counterparty_account_id: out ? edge.target : edge.source,
          src_account_id: edge.source,
          dst_account_id: edge.target,
        };
      },
    );

    const filtered = wanted ? rows.filter((r) => r.direction === wanted) : rows;
    return HttpResponse.json(paginate(filtered, url));
  }),

  /* ---------------------------------------------------------------- *
   * Network graph.
   * ---------------------------------------------------------------- */

  http.get('*/v1/network/accounts/:accountId', ({ request, params }) =>
    graphResponse(request, String(params['accountId'])),
  ),

  http.get('*/v1/network/entities/:partyId', ({ request, params }) => {
    const first = ACCOUNT_FIXTURES.find((a) => a.party_id === params['partyId']);
    if (!first) {
      return problem(404, 'Not found', 'No party with that identifier is visible to you.');
    }
    return graphResponse(request, first.id);
  }),

  /* ---------------------------------------------------------------- *
   * Audit trail. Append-only: there is no write route, by design.
   * ---------------------------------------------------------------- */

  http.get('*/v1/audit-logs', ({ request }) => {
    const guard = requireScope(request, 'audit:read');
    if (guard.error) return guard.error;

    const url = new URL(request.url);
    const entity = url.searchParams.get('entity');
    const entityId = url.searchParams.get('entity_id');
    const action = url.searchParams.get('action');
    const actor = url.searchParams.get('actor');
    const from = url.searchParams.get('created_from');
    const to = url.searchParams.get('created_to');

    let rows = [...auditLog];
    if (entity) rows = rows.filter((r) => r.entity === entity);
    if (entityId) rows = rows.filter((r) => r.entity_id === entityId);
    if (action) rows = rows.filter((r) => r.action.includes(action));
    if (actor) rows = rows.filter((r) => r.actor === actor);
    if (from) rows = rows.filter((r) => Date.parse(r.created_at) >= Date.parse(from));
    if (to) rows = rows.filter((r) => Date.parse(r.created_at) <= Date.parse(to));

    return HttpResponse.json(paginate(rows, url));
  }),
];
