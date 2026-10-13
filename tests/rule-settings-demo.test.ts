import { setupServer } from 'msw/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  pilotReportSchema,
  ruleSettingsSchema,
  settingsHistorySchema,
} from '@/api/schemas/ruleSettings';
import { handlers } from '@/mocks/handlers';
import { createRuleSettingsStore, pilotReport, PILOT_HIT_FIXTURES } from '@/mocks/ruleSettings';
import { WIRE_SETTINGS } from './rule-settings-wire';

/**
 * Demo mode serves the rule settings the way the live layer does: the same
 * rules, thresholds and bounds, rules:manage to write, every write a new
 * version in memory, and the pilot report scoped to the caller's team.
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

const call = (token: string, method: string, path: string, body?: unknown) =>
  fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

describe('demo rule settings', () => {
  it('serves the same rules, thresholds and bounds as the live layer, opening at version 1', async () => {
    const token = await signIn('analyst@civitas.ai');
    const response = await call(token, 'GET', '/v1/islamic/settings');
    expect(response.status).toBe(200);
    const raw = (await response.json()) as Record<string, unknown>;
    const settings = ruleSettingsSchema.parse(raw);
    const live = ruleSettingsSchema.parse(WIRE_SETTINGS);
    expect(settings.schema).toEqual(live.schema);
    expect(settings.rule_kinds).toEqual(live.rule_kinds);
    expect(settings.thresholds).toEqual(live.thresholds);
    expect(Object.keys(raw).sort()).toEqual(Object.keys(WIRE_SETTINGS).sort());
    expect(settings.version).toBe(1);
    expect(settings.modes['CHARITY_DIVERSION']).toBe('PILOT');
    expect(settings.updated_by).toBe('Supervisor');
  });

  it('refuses a write without rules:manage', async () => {
    const token = await signIn('analyst@civitas.ai');
    const put = await call(token, 'PUT', '/v1/islamic/settings', {
      modes: { TAKAFUL_EARLY_CLAIM: 'PILOT' },
      reason: 'Analyst try',
    });
    expect(put.status).toBe(403);
    expect(((await put.json()) as { required_scopes: string[] }).required_scopes).toEqual(['rules:manage']);
    const reset = await call(token, 'POST', '/v1/islamic/settings/reset', { reason: 'Analyst try' });
    expect(reset.status).toBe(403);
  });

  it('writes a new version with its changes, and keeps the history', async () => {
    const token = await signIn('supervisor@civitas.ai');
    const put = await call(token, 'PUT', '/v1/islamic/settings', {
      modes: { TAKAFUL_EARLY_CLAIM: 'PILOT' },
      thresholds: { EARLY_CLAIM_DAYS: 14, FAN_IN_MIN_SHARE: 0.55 },
      reason: '  Trial a shorter window  ',
    });
    expect(put.status).toBe(200);
    const next = ruleSettingsSchema.parse(await put.json());
    expect(next.version).toBe(2);
    expect(next.reason).toBe('Trial a shorter window');
    expect(next.updated_by).toBe('Supervisor');
    expect(next.modes['TAKAFUL_EARLY_CLAIM']).toBe('PILOT');
    expect(next.thresholds['FAN_IN_MIN_SHARE']).toBe(0.55);

    const reread = ruleSettingsSchema.parse(await (await call(token, 'GET', '/v1/islamic/settings')).json());
    expect(reread.version).toBe(2);

    const history = settingsHistorySchema.parse(
      await (await call(token, 'GET', '/v1/islamic/settings/history?limit=10')).json(),
    );
    expect(history.map((v) => v.version)).toEqual([2, 1]);
    expect(history[0]?.changes).toEqual([
      { field: 'modes.TAKAFUL_EARLY_CLAIM', before: 'ACTIVE', after: 'PILOT' },
      { field: 'thresholds.FAN_IN_MIN_SHARE', before: 0.8, after: 0.55 },
      { field: 'thresholds.EARLY_CLAIM_DAYS', before: 30, after: 14 },
    ]);
    const limited = settingsHistorySchema.parse(
      await (await call(token, 'GET', '/v1/islamic/settings/history?limit=1')).json(),
    );
    expect(limited).toHaveLength(1);
    expect((await call(token, 'GET', '/v1/islamic/settings/history?limit=500')).status).toBe(422);
  });

  it('names each bad field, refuses a short reason, and refuses a change that changes nothing', async () => {
    const token = await signIn('supervisor@civitas.ai');
    const bad = await call(token, 'PUT', '/v1/islamic/settings', {
      modes: { ORIGIN_ACCOUNT_DRAIN: 'LIVE', NOT_A_RULE: 'OFF' },
      thresholds: { FAN_IN_HOURS: 0, EARLY_CLAIM_DAYS: 7.5, FAN_IN_MIN_SHARE: 2 },
      reason: 'testing',
    });
    expect(bad.status).toBe(422);
    const body = (await bad.json()) as { detail: string; errors: { field: string; message: string }[] };
    expect(body.detail).toBe('Settings change is invalid.');
    expect(body.errors.map((e) => [e.field, e.message])).toEqual([
      ['modes.ORIGIN_ACCOUNT_DRAIN', 'must be one of ACTIVE, PILOT, OFF'],
      ['modes.NOT_A_RULE', 'unknown rule'],
      ['thresholds.FAN_IN_HOURS', 'must be between 1 and 720'],
      ['thresholds.EARLY_CLAIM_DAYS', 'must be a whole number of days'],
      ['thresholds.FAN_IN_MIN_SHARE', 'must be between 0.1 and 1.0'],
    ]);

    const short = await call(token, 'PUT', '/v1/islamic/settings', {
      thresholds: { FAN_IN_HOURS: 48 },
      reason: '  x ',
    });
    expect(short.status).toBe(422);
    expect(((await short.json()) as { errors: { field: string }[] }).errors[0]?.field).toBe('reason');

    const current = ruleSettingsSchema.parse(await (await call(token, 'GET', '/v1/islamic/settings')).json());
    const noop = await call(token, 'PUT', '/v1/islamic/settings', {
      thresholds: { FAN_IN_HOURS: current.thresholds['FAN_IN_HOURS'] },
      reason: 'same value',
    });
    expect(noop.status).toBe(422);
    expect(((await noop.json()) as { detail: string }).detail).toBe(
      'Nothing to change: every value sent is already in force.',
    );
    const after = ruleSettingsSchema.parse(await (await call(token, 'GET', '/v1/islamic/settings')).json());
    expect(after.version).toBe(current.version);
  });

  it('resets to the defaults as a new version, even from the defaults', async () => {
    const token = await signIn('supervisor@civitas.ai');
    const before = ruleSettingsSchema.parse(await (await call(token, 'GET', '/v1/islamic/settings')).json());
    const reset = await call(token, 'POST', '/v1/islamic/settings/reset', { reason: 'Trial over' });
    expect(reset.status).toBe(200);
    const next = ruleSettingsSchema.parse(await reset.json());
    expect(next.version).toBe(before.version + 1);
    expect(Object.values(next.modes).every((mode) => mode === 'ACTIVE')).toBe(true);
    expect(next.thresholds).toEqual(ruleSettingsSchema.parse(WIRE_SETTINGS).thresholds);
    const history = settingsHistorySchema.parse(
      await (await call(token, 'GET', '/v1/islamic/settings/history')).json(),
    );
    expect(history[0]?.reset).toBe(true);
    expect(history[0]?.reason).toBe('Trial over');

    const again = ruleSettingsSchema.parse(
      await (await call(token, 'POST', '/v1/islamic/settings/reset', { reason: 'Once more' })).json(),
    );
    expect(again.version).toBe(next.version + 1);
    expect((await call(token, 'POST', '/v1/islamic/settings/reset', { reason: '' })).status).toBe(422);
  });

  it('serves the pilot report scoped to the caller’s team, within its window', async () => {
    const analyst = await signIn('analyst@civitas.ai');
    const supervisor = await signIn('supervisor@civitas.ai');
    const own = pilotReportSchema.parse(
      await (await call(analyst, 'GET', '/v1/islamic/pilot-report?days=30')).json(),
    );
    const all = pilotReportSchema.parse(
      await (await call(supervisor, 'GET', '/v1/islamic/pilot-report?days=30')).json(),
    );
    expect(own.rules).toHaveLength(12);
    expect(own.hits).toHaveLength(PILOT_HIT_FIXTURES.filter((h) => h.team === 'team-alpha').length);
    expect(all.hits).toHaveLength(PILOT_HIT_FIXTURES.length);
    const charity = own.rules.find((r) => r.rule === 'CHARITY_DIVERSION')!;
    expect(charity.would_flag).toBe(own.hits.length);
    expect(charity.outcomes.no_case).toBe(own.hits.length);
    // Newest first.
    const booked = own.hits.map((h) => Date.parse(h.booked_at));
    expect([...booked].sort((a, b) => b - a)).toEqual(booked);

    const day = pilotReportSchema.parse(
      await (await call(supervisor, 'GET', '/v1/islamic/pilot-report?days=1')).json(),
    );
    expect(day.hits.length).toBeLessThan(all.hits.length);
    expect((await call(analyst, 'GET', '/v1/islamic/pilot-report?days=0')).status).toBe(422);
    expect((await call(analyst, 'GET', '/v1/islamic/pilot-report?days=366')).status).toBe(422);
  });
});

describe('demo settings store', () => {
  it('starts at version 0, the defaults, when not seeded', () => {
    const store = createRuleSettingsStore({ seed: false });
    expect(store.current().version).toBe(0);
    expect(store.current().updated_at).toBeNull();
    expect(store.versions(50)).toEqual([]);
  });

  it('reports the mode in force now for each rule', () => {
    const store = createRuleSettingsStore({ seed: false });
    store.update({ modes: { ROUND_AMOUNT_BURST: 'pilot' }, reason: 'Trial it' }, 'Supervisor');
    const report = pilotReport(30, () => true, store.modeOf, []);
    expect(report.rules.find((r) => r.rule === 'ROUND_AMOUNT_BURST')?.mode_now).toBe('PILOT');
    expect(report.rules.find((r) => r.rule === 'CHARITY_DIVERSION')?.mode_now).toBe('ACTIVE');
  });
});
