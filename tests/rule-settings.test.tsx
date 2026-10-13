import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { layerFindingsSchema } from '@/api/schemas/layers';
import { metaSchema } from '@/api/schemas/meta';
import {
  pilotReportSchema,
  ruleSettingsSchema,
  settingsHistorySchema,
} from '@/api/schemas/ruleSettings';
import { AppShell } from '@/components/AppShell';
import { ThemeProvider } from '@/components/ThemeToggle';
import { LayerFindings } from '@/features/layers/LayerFindings';
import { metaKey } from '@/features/layers/useMeta';
import RuleSettingsPage from '@/features/rule-settings/RuleSettingsPage';
import { PILOT_EXPLAINER, outcomeText } from '@/features/rule-settings/PilotReport';
import {
  changeFrom,
  draftFrom,
  formatThreshold,
  fromDisplay,
  rangeText,
  thresholdProblem,
  toDisplay,
} from '@/features/rule-settings/rules';
import { WIRE_META_OFF, WIRE_META_ON } from './islamic-wire';
import { renderWithProviders } from './render';
import { WIRE_PILOT_REPORT, WIRE_SETTINGS, WIRE_SETTINGS_HISTORY } from './rule-settings-wire';

const META_ON = metaSchema.parse(WIRE_META_ON);
const META_OFF = metaSchema.parse(WIRE_META_OFF);
const ON: Array<[readonly unknown[], unknown]> = [[metaKey, META_ON]];
const OFF: Array<[readonly unknown[], unknown]> = [[metaKey, META_OFF]];

const ANALYST = ['alerts:read', 'alerts:update', 'entities:read', 'transactions:read'];
const SUPERVISOR = [...ANALYST, 'alerts:read:all', 'alerts:close', 'rules:manage'];

type Json = Record<string, unknown>;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Version 3: TAKAFUL_EARLY_CLAIM on trial and a 14-day early-claim window. */
function settingsV3(): Json {
  const settings = clone(WIRE_SETTINGS) as unknown as Json & {
    modes: Json;
    thresholds: Json;
  };
  settings.version = 3;
  settings.updated_at = '2026-10-13T09:00:00Z';
  settings.updated_by = 'Supervisor';
  settings.reason = 'Trial a shorter early-claim window';
  settings.modes.TAKAFUL_EARLY_CLAIM = 'PILOT';
  settings.thresholds.EARLY_CLAIM_DAYS = 14;
  return settings;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status < 400 ? 'application/json' : 'application/problem+json' },
  });
}

interface Call {
  method: string;
  url: URL;
  body: unknown;
}

type Handler = unknown | ((call: Call) => Response);

/** Serves `routes` by "METHOD /path" or "/path" (GET); 404s the rest. Returns every call made. */
function stubApi(routes: Record<string, Handler>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://console.test');
      const method = (init?.method ?? 'GET').toUpperCase();
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
      const call = { method, url, body };
      calls.push(call);
      const route = routes[`${method} ${url.pathname}`] ?? (method === 'GET' ? routes[url.pathname] : undefined);
      if (typeof route === 'function') return (route as (c: Call) => Response)(call);
      if (route !== undefined) return json(route);
      return json({ title: 'Not found', status: 404, detail: 'Not found.' }, 404);
    }),
  );
  return calls;
}

const READS = {
  '/v1/islamic/settings': settingsV3(),
  '/v1/islamic/settings/history': WIRE_SETTINGS_HISTORY,
  '/v1/islamic/pilot-report': WIRE_PILOT_REPORT,
};

function renderPage(scopes: string[], { path = '/rules', seed = ON } = {}) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/rules" element={<RuleSettingsPage />} />
        <Route path="/alerts/:alertId" element={<p>alert page</p>} />
      </Routes>
    </MemoryRouter>,
    { seed, scopes },
  );
}

const card = (rule: string) => screen.getByRole('article', { name: rule });

afterEach(() => vi.unstubAllGlobals());

/* ------------------------------------------------------------------ */

describe('rule settings contract (live captures)', () => {
  it('reads settings, history and the pilot report exactly as the live API returns them', () => {
    const settings = ruleSettingsSchema.parse(WIRE_SETTINGS);
    expect(Object.keys(settings.modes)).toHaveLength(12);
    expect(settings.schema).toHaveLength(18);
    expect(Object.values(settings.rule_kinds).filter((kind) => kind === 'set_aside')).toHaveLength(2);
    expect(settingsHistorySchema.parse(WIRE_SETTINGS_HISTORY)[0]?.reset).toBe(true);
    const report = pilotReportSchema.parse(WIRE_PILOT_REPORT);
    expect(report.days).toBe(30);
    expect(report.rules).toHaveLength(12);
  });

  it('drops a hostile alert id on a pilot hit instead of linking it', () => {
    const report = pilotReportSchema.parse({
      days: 7,
      rules: [],
      hits: [{ ...WIRE_PILOT_REPORT.hits[0], alert_id: '../../logout' }],
    });
    expect(report.hits[0]?.alert_id).toBeNull();
  });
});

describe('units', () => {
  const share = ruleSettingsSchema.parse(WIRE_SETTINGS).schema.find((s) => s.name === 'FAN_IN_MIN_SHARE')!;
  const tolerance = ruleSettingsSchema.parse(WIRE_SETTINGS).schema.find((s) => s.name === 'SCHEDULE_TOLERANCE')!;
  const days = ruleSettingsSchema.parse(WIRE_SETTINGS).schema.find((s) => s.name === 'EARLY_CLAIM_DAYS')!;

  it('shows a share as a percentage and sends the fraction', () => {
    expect(toDisplay(0.8, 'share')).toBe('80');
    expect(toDisplay(0.005, 'share')).toBe('0.5');
    expect(fromDisplay('55', 'share')).toBe(0.55);
    expect(fromDisplay('0.5', 'share')).toBe(0.005);
    expect(formatThreshold(0.8, 'share')).toBe('80%');
    expect(rangeText(share)).toBe('10–100%');
    expect(rangeText(tolerance)).toBe('0–10%');
  });

  it('reads the other units plainly', () => {
    expect(formatThreshold(72, 'hours')).toBe('72 hours');
    expect(formatThreshold(1, 'days')).toBe('1 day');
    expect(formatThreshold(4, 'tier')).toBe('tier 4');
    expect(formatThreshold(5, 'count')).toBe('5');
    expect(toDisplay(30, 'days')).toBe('30');
    expect(fromDisplay('30', 'days')).toBe(30);
  });

  it('checks a value against its bounds and unit before it is sent', () => {
    expect(thresholdProblem('', days)).toBe('Enter a value');
    expect(thresholdProblem('abc', days)).toBe('Must be a number');
    expect(thresholdProblem('0', days)).toBe('Must be between 1–365 days');
    expect(thresholdProblem('7.5', days)).toBe('Must be a whole number of days');
    expect(thresholdProblem('5', share)).toBe('Must be between 10–100%');
    expect(thresholdProblem('62.5', share)).toBeNull();
  });

  it('sends only what changed', () => {
    const settings = ruleSettingsSchema.parse(WIRE_SETTINGS);
    const draft = draftFrom(settings);
    draft.modes['CHARITY_DIVERSION'] = 'PILOT';
    draft.values['FAN_IN_MIN_SHARE'] = '75';
    draft.values['FAN_IN_HOURS'] = '72';
    expect(changeFrom(settings, draft, '  why  ')).toEqual({
      modes: { CHARITY_DIVERSION: 'PILOT' },
      thresholds: { FAN_IN_MIN_SHARE: 0.75 },
      reason: 'why',
    });
  });
});

describe('settings page, read-only', () => {
  it('shows every value without controls, and says who can change them', async () => {
    stubApi(READS);
    renderPage(ANALYST);

    const claim = await screen.findByRole('article', { name: 'TAKAFUL_EARLY_CLAIM' });
    expect(within(claim).getByText(/A Takaful claim soon after the cover started/)).toBeInTheDocument();
    expect(within(claim).getByText('Adds a finding')).toBeInTheDocument();
    expect(within(claim).getByText('Pilot')).toBeInTheDocument();
    expect(within(claim).getByText('14 days')).toBeInTheDocument();
    expect(within(claim).getByText(/Default 30 days · allowed 1–365 days/)).toBeInTheDocument();
    expect(within(card('ROUND_AMOUNT_BURST')).getByText('Removes a false alarm')).toBeInTheDocument();
    // A share reads as a percentage.
    const shared = screen.getByRole('region', { name: 'Shared thresholds' });
    expect(within(shared).getByText('0.5%')).toBeInTheDocument();

    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reset to defaults' })).toBeNull();
    expect(
      screen.getByText('Read-only — only a supervisor (rules:manage) can change these settings.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Settings version')).toHaveTextContent(
      /^Version 3 · changed by Supervisor · .+ · “Trial a shorter early-claim window”$/,
    );
  });

  it('says version 0 is the shipped defaults', async () => {
    stubApi({ ...READS, '/v1/islamic/settings': { ...clone(WIRE_SETTINGS), version: 0, updated_at: null, updated_by: null, reason: null }, '/v1/islamic/settings/history': [] });
    renderPage(ANALYST);
    expect(await screen.findByLabelText('Settings version')).toHaveTextContent(
      'Version 0 · the shipped defaults, never changed',
    );
    expect(await screen.findByText(/No changes yet/)).toBeInTheDocument();
  });

  it('says so when the layer is off, and asks for nothing', () => {
    const calls = stubApi(READS);
    renderPage(ANALYST, { seed: OFF });
    expect(screen.getByText('The Islamic layer is off')).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });
});

describe('settings page, editable', () => {
  it('offers a mode switch per rule and an input per threshold, a share edited as a percentage', async () => {
    const calls = stubApi({
      ...READS,
      'PUT /v1/islamic/settings': ({ body }: Call) => json({ ...settingsV3(), version: 4, reason: (body as Json).reason }),
    });
    renderPage(SUPERVISOR);

    const claim = await screen.findByRole('article', { name: 'TAKAFUL_EARLY_CLAIM' });
    expect(within(claim).getByRole('radio', { name: 'Pilot' })).toBeChecked();
    const share = screen.getByLabelText('FAN_IN_MIN_SHARE');
    expect(share).toHaveValue('80');
    expect(within(card('SETTLEMENT_FUNDED_BY_FAN_IN')).getAllByText('%').length).toBeGreaterThan(0);

    fireEvent.change(share, { target: { value: '55' } });
    fireEvent.click(within(card('CHARITY_DIVERSION')).getByRole('radio', { name: 'Off' }));
    fireEvent.change(screen.getByLabelText('Reason for this change'), {
      target: { value: '  Tighter fan-in, charity rule off  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.url.pathname).toBe('/v1/islamic/settings');
    // The fraction, never the percentage; only what changed.
    expect(put.body).toEqual({
      modes: { CHARITY_DIVERSION: 'OFF' },
      thresholds: { FAN_IN_MIN_SHARE: 0.55 },
      reason: 'Tighter fan-in, charity rule off',
    });
    expect(await screen.findByText('Saved as version 4')).toBeInTheDocument();
  });

  it('highlights what changed, says what it was, and counts it', async () => {
    stubApi(READS);
    renderPage(SUPERVISOR);
    const claim = await screen.findByRole('article', { name: 'TAKAFUL_EARLY_CLAIM' });
    expect(claim).not.toHaveAttribute('data-changed');
    expect(screen.getByText('No unsaved changes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();

    fireEvent.change(within(claim).getByLabelText('EARLY_CLAIM_DAYS'), { target: { value: '21' } });
    expect(claim).toHaveAttribute('data-changed', 'true');
    expect(within(claim).getByText(/· was 14 days/)).toBeInTheDocument();
    expect(within(claim).getAllByText('Changed')).toHaveLength(1);

    fireEvent.click(within(claim).getByRole('radio', { name: 'Active' }));
    expect(within(claim).getByText(/Applied to the score · was Pilot/)).toBeInTheDocument();
    expect(screen.getByText('2 unsaved changes — saved as version 4')).toBeInTheDocument();
    expect(card('CHARITY_DIVERSION')).not.toHaveAttribute('data-changed');

    // Back to the saved value is not a change.
    fireEvent.change(within(claim).getByLabelText('EARLY_CLAIM_DAYS'), { target: { value: '14' } });
    expect(screen.getByText('1 unsaved change — saved as version 4')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(claim).not.toHaveAttribute('data-changed');
    expect(within(claim).getByRole('radio', { name: 'Pilot' })).toBeChecked();
  });

  it('requires a reason before anything is sent', async () => {
    const calls = stubApi(READS);
    renderPage(SUPERVISOR);
    const claim = await screen.findByRole('article', { name: 'TAKAFUL_EARLY_CLAIM' });
    fireEvent.change(within(claim).getByLabelText('EARLY_CLAIM_DAYS'), { target: { value: '21' } });
    fireEvent.change(screen.getByLabelText('Reason for this change'), { target: { value: '  a ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/Give a reason of at least 3 characters/)).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  it('refuses an out-of-range value before sending it', async () => {
    const calls = stubApi(READS);
    renderPage(SUPERVISOR);
    const claim = await screen.findByRole('article', { name: 'TAKAFUL_EARLY_CLAIM' });
    const input = within(claim).getByLabelText('EARLY_CLAIM_DAYS');
    fireEvent.change(input, { target: { value: '400' } });
    expect(within(claim).getByText('Must be between 1–365 days')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(screen.getByLabelText('Reason for this change'), { target: { value: 'Too long' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  it("puts the server's 422 field errors on the fields they name", async () => {
    stubApi({
      ...READS,
      'PUT /v1/islamic/settings': () =>
        json(
          {
            type: 'https://fraud.example/errors/validation',
            title: 'Validation failed',
            status: 422,
            detail: 'Settings change is invalid.',
            errors: [
              { field: 'modes.CHARITY_DIVERSION', message: 'must be one of ACTIVE, PILOT, OFF', type: 'value_error' },
              { field: 'thresholds.EARLY_CLAIM_DAYS', message: 'must be between 1 and 180', type: 'value_error' },
              { field: 'reason', message: 'String should have at least 3 characters', type: 'string_too_short' },
            ],
          },
          422,
        ),
    });
    renderPage(SUPERVISOR);
    const claim = await screen.findByRole('article', { name: 'TAKAFUL_EARLY_CLAIM' });
    fireEvent.change(within(claim).getByLabelText('EARLY_CLAIM_DAYS'), { target: { value: '200' } });
    fireEvent.click(within(card('CHARITY_DIVERSION')).getByRole('radio', { name: 'Pilot' }));
    fireEvent.change(screen.getByLabelText('Reason for this change'), { target: { value: 'Longer window' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await within(claim).findByText('must be between 1 and 180')).toBeInTheDocument();
    expect(within(claim).getByLabelText('EARLY_CLAIM_DAYS')).toHaveAttribute('aria-invalid', 'true');
    expect(within(card('CHARITY_DIVERSION')).getByText('must be one of ACTIVE, PILOT, OFF')).toBeInTheDocument();
    expect(screen.getByText('String should have at least 3 characters')).toBeInTheDocument();
    // Editing the field clears the server's complaint about it.
    fireEvent.change(within(claim).getByLabelText('EARLY_CLAIM_DAYS'), { target: { value: '60' } });
    expect(within(claim).queryByText('must be between 1 and 180')).toBeNull();
  });

  it('shows a change that changes nothing as a form error', async () => {
    stubApi({
      ...READS,
      'PUT /v1/islamic/settings': () =>
        json(
          {
            title: 'Validation failed',
            status: 422,
            detail: 'Nothing to change: every value sent is already in force.',
            errors: [{ field: '', message: 'Nothing to change: every value sent is already in force.', type: 'value_error' }],
          },
          422,
        ),
    });
    renderPage(SUPERVISOR);
    const claim = await screen.findByRole('article', { name: 'TAKAFUL_EARLY_CLAIM' });
    fireEvent.click(within(claim).getByRole('radio', { name: 'Active' }));
    fireEvent.change(screen.getByLabelText('Reason for this change'), { target: { value: 'Go live' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Nothing to change: every value sent is already in force.')).toBeInTheDocument();
  });

  it('asks to reload on a 409, and reloads the version in force', async () => {
    let reads = 0;
    const calls = stubApi({
      ...READS,
      '/v1/islamic/settings': () => {
        reads += 1;
        return json(reads === 1 ? settingsV3() : { ...settingsV3(), version: 5, updated_by: 'Other Supervisor' });
      },
      'PUT /v1/islamic/settings': () =>
        json({ title: 'Conflict', status: 409, detail: 'Settings were changed concurrently.' }, 409),
    });
    renderPage(SUPERVISOR);
    const claim = await screen.findByRole('article', { name: 'TAKAFUL_EARLY_CLAIM' });
    fireEvent.change(within(claim).getByLabelText('EARLY_CLAIM_DAYS'), { target: { value: '21' } });
    fireEvent.change(screen.getByLabelText('Reason for this change'), { target: { value: 'Longer window' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    const prompt = await screen.findByRole('alert', { name: '' });
    expect(prompt).toHaveTextContent(/Changed while you were editing/);
    fireEvent.click(within(prompt).getByRole('button', { name: 'Reload settings' }));
    expect(await screen.findByText(/^Version 5 · changed by Other Supervisor/)).toBeInTheDocument();
    expect(screen.queryByText(/Changed while you were editing/)).toBeNull();
    expect(screen.getByLabelText('EARLY_CLAIM_DAYS')).toHaveValue('14');
    expect(calls.filter((c) => c.method === 'GET' && c.url.pathname === '/v1/islamic/settings')).toHaveLength(2);
  });

  it('resets to defaults only after a reason and a confirmation', async () => {
    const calls = stubApi({
      ...READS,
      'POST /v1/islamic/settings/reset': ({ body }: Call) =>
        json({ ...clone(WIRE_SETTINGS), version: 4, reason: (body as Json).reason }),
    });
    renderPage(SUPERVISOR);
    await screen.findByRole('article', { name: 'TAKAFUL_EARLY_CLAIM' });
    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));

    const dialog = screen.getByRole('dialog', { name: 'Reset every rule to its defaults?' });
    expect(dialog).toHaveTextContent('saved as version 4');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset to defaults' }));
    expect(within(dialog).getByText(/Give a reason of at least 3 characters/)).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);

    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Trial over' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset to defaults' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.url.pathname).toBe('/v1/islamic/settings/reset');
    expect(post.body).toEqual({ reason: 'Trial over' });
    expect(await screen.findByText('Reset to defaults as version 4')).toBeInTheDocument();
    expect(screen.getByLabelText('Settings version')).toHaveTextContent(/^Version 4 · .+ · “Trial over”$/);
    // At the defaults there is nothing left to reset.
    expect(screen.getByRole('button', { name: 'Reset to defaults' })).toBeDisabled();
  });

  it('cancelling the reset sends nothing', async () => {
    const calls = stubApi(READS);
    renderPage(SUPERVISOR);
    await screen.findByRole('article', { name: 'TAKAFUL_EARLY_CLAIM' });
    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });
});

describe('settings history', () => {
  it('lists each version, newest first, with its reason and every field before → after', async () => {
    stubApi(READS);
    renderPage(ANALYST);
    const v2 = await screen.findByRole('listitem', { name: 'Version 2' });
    expect(within(v2).getByText('Reset to defaults')).toBeInTheDocument();
    expect(within(v2).getByText('by Supervisor')).toBeInTheDocument();
    expect(within(v2).getByText('Smoke test done: back to the shipped defaults')).toBeInTheDocument();
    const mode = within(v2).getByText('MURABAHA_SUPPLIER_MISMATCH mode').parentElement!;
    expect(mode).toHaveTextContent(/^MURABAHA_SUPPLIER_MISMATCH mode\s*Pilot\s*→\s*to\s*Active$/);
    const days = within(v2).getByText('EARLY_CLAIM_DAYS').parentElement!;
    expect(days).toHaveTextContent(/^EARLY_CLAIM_DAYS\s*14 days\s*→\s*to\s*30 days$/);

    const v1 = screen.getByRole('listitem', { name: 'Version 1' });
    expect(within(v1).queryByText('Reset to defaults')).toBeNull();
    const order = screen.getAllByRole('listitem', { name: /^Version \d+$/ }).map((li) => li.getAttribute('aria-label'));
    expect(order).toEqual(['Version 2', 'Version 1']);
  });

  it('reads a share change as percentages', async () => {
    stubApi({
      ...READS,
      '/v1/islamic/settings/history': [
        {
          version: 1,
          updated_at: '2026-10-13T09:00:00Z',
          updated_by: 'Supervisor',
          reason: 'Looser fan-in',
          reset: false,
          changes: [{ field: 'thresholds.FAN_IN_MIN_SHARE', before: 0.8, after: 0.55 }],
        },
      ],
    });
    renderPage(ANALYST);
    const entry = await screen.findByRole('listitem', { name: 'Version 1' });
    expect(within(entry).getByText('FAN_IN_MIN_SHARE').parentElement).toHaveTextContent(
      /^FAN_IN_MIN_SHARE\s*80%\s*→\s*to\s*55%$/,
    );
  });
});

describe('pilot report', () => {
  const ALERT_ID = '5a1c0e10-7d1e-4c11-9a01-000000000203';
  const report = (days: number) => ({
    days,
    rules: [
      { rule: 'TAKAFUL_EARLY_CLAIM', mode_now: 'PILOT', would_flag: 3, would_set_aside: 0, outcomes: { confirmed_fraud: 1, false_positive: 1, open_case: 0, no_case: 1 } },
      { rule: 'ROUND_AMOUNT_BURST', mode_now: 'ACTIVE', would_flag: 0, would_set_aside: 0, outcomes: { confirmed_fraud: 0, false_positive: 0, open_case: 0, no_case: 0 } },
    ],
    hits: [
      { transaction_id: '11111111-1111-4111-a111-111111111111', booked_at: '2026-10-13T08:00:00Z', product: 'TAKAFUL', event: 'CLAIM', rule: 'TAKAFUL_EARLY_CLAIM', kind: 'added', severity: 'HIGH', risk_score: 66.4, alert_id: ALERT_ID, case_status: 'CONFIRMED_FRAUD', final_label: 'CONFIRMED_FRAUD' },
      { transaction_id: '22222222-2222-4222-a222-222222222222', booked_at: '2026-10-12T08:00:00Z', product: 'TAKAFUL', event: 'CLAIM', rule: 'TAKAFUL_EARLY_CLAIM', kind: 'added', severity: 'MEDIUM', risk_score: 12, alert_id: null, case_status: null, final_label: null },
    ],
  });

  it('explains pilot, counts per rule, and links a hit to its alert', async () => {
    stubApi({ ...READS, '/v1/islamic/pilot-report': ({ url }: Call) => json(report(Number(url.searchParams.get('days')))) });
    renderPage(ANALYST, { path: '/rules?tab=pilot' });

    expect(await screen.findByText(PILOT_EXPLAINER)).toBeInTheDocument();
    expect(PILOT_EXPLAINER).toBe(
      'Pilot rules run silently: they record what they would have done but never change a score or open an alert.',
    );
    const table = await screen.findByRole('table', { name: 'Pilot results by rule, last 30 days' });
    const row = within(table).getByRole('row', { name: /TAKAFUL_EARLY_CLAIM/ });
    expect(within(row).getByText('Pilot')).toBeInTheDocument();
    expect(within(row).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['Pilot', '3', '0', '1', '1', '0', '1']);

    const hits = screen.getByRole('table', { name: 'Pilot hits, newest first' });
    const [first, second] = within(hits).getAllByRole('row').slice(1);
    expect(within(first!).getByRole('link', { name: 'Open alert' })).toHaveAttribute('href', `/alerts/${ALERT_ID}`);
    expect(within(first!).getByText('Confirmed fraud')).toBeInTheDocument();
    expect(within(first!).getByText('Takaful · claim')).toBeInTheDocument();
    expect(within(first!).getByText('High')).toBeInTheDocument();
    expect(within(second!).queryByRole('link')).toBeNull();
    expect(within(second!).getByText('No alert')).toBeInTheDocument();
    expect(within(second!).getByText('No case')).toBeInTheDocument();
  });

  it('asks for the chosen window', async () => {
    const calls = stubApi({ ...READS, '/v1/islamic/pilot-report': ({ url }: Call) => json(report(Number(url.searchParams.get('days')))) });
    renderPage(ANALYST, { path: '/rules?tab=pilot' });
    await screen.findByRole('table', { name: 'Pilot results by rule, last 30 days' });
    expect(screen.getByRole('radio', { name: '30 days' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: '7 days' }));
    expect(await screen.findByRole('table', { name: 'Pilot results by rule, last 7 days' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: '90 days' }));
    await screen.findByRole('table', { name: 'Pilot results by rule, last 90 days' });
    const asked = calls.filter((c) => c.url.pathname === '/v1/islamic/pilot-report').map((c) => c.url.searchParams.get('days'));
    expect(asked).toEqual(['30', '7', '90']);
  });

  it('says so when nothing was piloted in the window', async () => {
    stubApi({ ...READS, '/v1/islamic/pilot-report': { days: 30, rules: [], hits: [] } });
    renderPage(ANALYST, { path: '/rules?tab=pilot' });
    expect(await screen.findByText('No pilot hits in the last 30 days')).toBeInTheDocument();
  });

  it('names each outcome as the per-rule columns count it', () => {
    expect(outcomeText({ final_label: 'CONFIRMED_FRAUD', case_status: 'CONFIRMED_FRAUD' })).toBe('Confirmed fraud');
    expect(outcomeText({ final_label: 'FALSE_POSITIVE', case_status: 'FALSE_POSITIVE' })).toBe('False positive');
    expect(outcomeText({ final_label: null, case_status: 'IN_REVIEW' })).toBe('Open case · in review');
    expect(outcomeText({ final_label: null, case_status: null })).toBe('No case');
  });
});

describe('evidence: settings version and pilot findings', () => {
  const base = {
    facts: { product: 'TAKAFUL', event: 'CLAIM', contract_id: null },
    added: [],
    set_aside: [],
    score_before: 66.4,
    score_after: 66.4,
  };

  it('shows the settings version and a dashed "Pilot — not applied" block', () => {
    const findings = layerFindingsSchema.parse({
      islamic: {
        ...base,
        settings_version: 7,
        shadow: {
          added: [{ rule: 'TAKAFUL_EARLY_CLAIM', severity: 'HIGH', description: 'Takaful claim 9 days after the cover started; payout account opened 6 days ago.', source: 'islamic' }],
          set_aside: [{ rule: 'ROUND_AMOUNT_BURST', severity: 'MEDIUM', description: 'Three round-amount payments in 24 hours.', reason: 'Matches the registered contract schedule: 5,000.00 due on 2026-10-13.' }],
        },
      },
    });
    renderWithProviders(<LayerFindings findings={findings} products={META_ON.products} />);
    const block = screen.getByRole('region', { name: 'Islamic layer' });
    expect(within(block).getByText('Settings v7')).toBeInTheDocument();
    // What the layer did is unchanged: nothing added, nothing set aside.
    expect(within(block).getByText('No rule added or set aside.')).toBeInTheDocument();
    const pilot = within(block).getByRole('group', { name: 'Pilot — not applied' });
    expect(pilot.className).toContain('border-dashed');
    expect(within(pilot).getByText('Would add')).toBeInTheDocument();
    expect(within(pilot).getByText('TAKAFUL_EARLY_CLAIM')).toBeInTheDocument();
    expect(within(pilot).getByText(/payout account opened 6 days ago/)).toBeInTheDocument();
    expect(within(pilot).getByText('Would set aside')).toBeInTheDocument();
    expect(within(pilot).getByText('Matches the registered contract schedule: 5,000.00 due on 2026-10-13.')).toBeInTheDocument();
    expect(within(block).queryByText('Added by Islamic layer')).toBeNull();
  });

  it('shows neither on findings recorded before settings existed', () => {
    const findings = layerFindingsSchema.parse({ islamic: base });
    renderWithProviders(<LayerFindings findings={findings} />);
    const block = screen.getByRole('region', { name: 'Islamic layer' });
    expect(within(block).queryByText(/^Settings v/)).toBeNull();
    expect(within(block).queryByRole('group', { name: 'Pilot — not applied' })).toBeNull();
  });

  it('drops a malformed shadow block without losing the finding', () => {
    const findings = layerFindingsSchema.parse({ islamic: { ...base, settings_version: 'x', shadow: 'nope' } });
    expect(findings?.['islamic']?.shadow).toBeNull();
    expect(findings?.['islamic']?.settings_version).toBeNull();
    expect(findings?.['islamic']?.score_after).toBe(66.4);
  });
});

describe('nav', () => {
  function renderShell(seed: typeof ON, scopes: string[]) {
    return renderWithProviders(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/flow']}>
          <Routes>
            <Route path="/" element={<AppShell />}>
              <Route path="flow" element={<p>flow</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
      { seed, scopes },
    );
  }

  it('offers Rule settings to alerts:read with the Islamic layer on', () => {
    renderShell(ON, ANALYST);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Rule settings' })).toHaveAttribute('href', '/rules');
  });

  it('hides it with the layer off', () => {
    renderShell(OFF, SUPERVISOR);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).queryByRole('link', { name: 'Rule settings' })).toBeNull();
  });

  it('hides it without alerts:read, even with the layer on', () => {
    renderShell(ON, ['users:manage', 'audit:read']);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).queryByRole('link', { name: 'Rule settings' })).toBeNull();
  });
});
