import type { ReactElement } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parsePageTolerant } from '@/api/compat';
import { alertDetailSchema, alertSchema } from '@/api/schemas/alerts';
import { caseDetailSchema } from '@/api/schemas/cases';
import { islamicSummarySchema } from '@/api/schemas/islamic';
import { layerFindingsSchema } from '@/api/schemas/layers';
import { metaSchema } from '@/api/schemas/meta';
import { riskSchema, transactionSchema } from '@/api/schemas/transactions';
import AlertDetailPage from '@/features/alerts/AlertDetailPage';
import AlertQueuePage from '@/features/alerts/AlertQueuePage';
import { TriggeredRules } from '@/features/alerts/EvidencePanels';
import CaseDetailPage from '@/features/cases/CaseDetailPage';
import { ConcludeModal } from '@/features/cases/ConcludeModal';
import DashboardPage from '@/features/dashboard/DashboardPage';
import FlowPage from '@/features/flow/FlowPage';
import { activeProductFacts, distinctProductFacts, productText } from '@/features/layers/facts';
import { LayerBadges } from '@/features/layers/LayerBadges';
import { LayerFindings } from '@/features/layers/LayerFindings';
import { layersFrom, metaKey } from '@/features/layers/useMeta';
import {
  WIRE_ALERT_DETAIL_CLAIM,
  WIRE_ALERT_DETAIL_CORE,
  WIRE_ALERT_DETAIL_ISLAMIC,
  WIRE_ALERT_PAGE,
  WIRE_CASE_ISLAMIC,
  WIRE_META_OFF,
  WIRE_META_ON,
  WIRE_SCORE_SETTLEMENT,
  WIRE_SUMMARY,
  WIRE_TRANSACTION,
  WIRE_TRANSACTION_ISLAMIC,
} from './islamic-wire';
import { renderWithProviders } from './render';

const META_ON = metaSchema.parse(WIRE_META_ON);
const META_OFF = metaSchema.parse(WIRE_META_OFF);
const ON: Array<[readonly unknown[], unknown]> = [[metaKey, META_ON]];
const OFF: Array<[readonly unknown[], unknown]> = [[metaKey, META_OFF]];
const PRODUCTS = META_ON.products;

/** The live third-party repayment: MUR-0073, instalment 23 of 48. */
const REPAYMENT_FACTS = WIRE_ALERT_DETAIL_ISLAMIC.layer_facts.islamic;
const CHIP = 'Murabaha · instalment 23/48';
const SETTLEMENT = layerFindingsSchema.parse(WIRE_SCORE_SETTLEMENT.layer_findings);
const REPAYMENT = layerFindingsSchema.parse(WIRE_ALERT_DETAIL_ISLAMIC.layer_findings);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status < 400 ? 'application/json' : 'application/problem+json' },
  });
}

/** Serves the given paths; 404s the rest. Returns every path requested. */
function stubApi(routes: Record<string, unknown>) {
  const requested: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const { pathname } = new URL(String(input), 'http://console.test');
      requested.push(pathname);
      if (pathname in routes) return json(routes[pathname]);
      return json({ title: 'Not found', status: 404, detail: 'Not found.' }, 404);
    }),
  );
  return requested;
}

function renderAt(path: string, pattern: string, page: ReactElement, seed: typeof ON) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={pattern} element={page} />
      </Routes>
    </MemoryRouter>,
    { scopes: ['alerts:read', 'transactions:read'], seed },
  );
}

afterEach(() => vi.unstubAllGlobals());

/* ------------------------------------------------------------------ */

describe('layer contract (live captures)', () => {
  it('reads /v1/meta with the layer off as core only', () => {
    const layers = layersFrom(META_OFF);
    expect(layers.layers).toEqual([]);
    expect(layers.hasProducts).toBe(false);
    expect(layers.isActive('islamic')).toBe(false);
    expect(layers.typologies).toEqual(WIRE_META_OFF.typologies);
  });

  it('reads /v1/meta with the layer on, keeping each product’s layer', () => {
    expect(META_ON.products).toHaveLength(8);
    expect(META_ON.products[0]).toMatchObject({ code: 'MURABAHA', layer: 'islamic' });
    const layers = layersFrom(META_ON);
    expect(layers.isActive('islamic')).toBe(true);
    expect(layers.hasProducts).toBe(true);
    expect(layers.typologies).toEqual([
      ...WIRE_META_OFF.typologies,
      'MURABAHA_FICTITIOUS_ASSET',
      'THIRD_PARTY_REPAYMENT',
      'SETTLEMENT_LAUNDERING',
      'COMMODITY_ROUND_TRIP',
      'TAKAFUL_CLAIM_FRAUD',
      'CHARITY_DIVERSION',
    ]);
    // A product without a code is dropped, not fatal.
    expect(metaSchema.parse({ ...WIRE_META_ON, products: [{ label: 'x' }] }).products).toEqual([]);
  });

  it('parses every queue row, Islamic and core alike', () => {
    const page = parsePageTolerant(alertSchema, WIRE_ALERT_PAGE);
    expect(page.skipped).toBe(0);
    const islamic = page.items.filter((a) => a.layer_facts);
    expect(islamic).toHaveLength(12);
    expect(page.items.filter((a) => a.layer_facts === null)).toHaveLength(2);
    expect(islamic.every((a) => a.layer_facts?.['islamic']?.product)).toBe(true);
  });

  it('keeps layer findings, facts and the rule source on the alert detail', () => {
    const detail = alertDetailSchema.parse(WIRE_ALERT_DETAIL_ISLAMIC);
    expect(detail.triggered_rules[0]).toMatchObject({
      rule: 'THIRD_PARTY_REPAYMENT',
      source: 'islamic',
    });
    expect(detail.layer_facts?.['islamic']).toEqual(REPAYMENT_FACTS);
    const finding = detail.layer_findings?.['islamic'];
    expect(finding?.added[0]?.rule).toBe('THIRD_PARTY_REPAYMENT');
    expect(finding?.set_aside).toEqual([]);
    expect(finding?.score_after).toBe(WIRE_ALERT_DETAIL_ISLAMIC.risk_score);

    // An engine rule on a layer-on alert carries no source.
    const claim = alertDetailSchema.parse(WIRE_ALERT_DETAIL_CLAIM);
    expect(claim.triggered_rules.map((r) => r.source ?? null)).toEqual([null, 'islamic']);
  });

  it('keeps the set-aside and its reason on a score that raised no alert', () => {
    const score = riskSchema.parse(WIRE_SCORE_SETTLEMENT);
    const finding = score.layer_findings?.['islamic'];
    expect(finding?.set_aside[0]).toMatchObject({
      rule: 'ORIGIN_ACCOUNT_DRAIN',
      reason: 'Scheduled early settlement of contract MUR-0021 empties the account by design.',
    });
    expect(finding?.score_before).toBeGreaterThanOrEqual(70);
    expect(score.risk_score).toBeLessThan(70);
  });

  it('parses the live layer-off payloads unchanged', () => {
    const detail = alertDetailSchema.parse(WIRE_ALERT_DETAIL_CORE);
    expect(detail.layer_findings).toBeNull();
    expect(detail.layer_facts).toBeUndefined();
    expect(detail.triggered_rules[0]?.source).toBeUndefined();
    transactionSchema.parse(WIRE_TRANSACTION);
    transactionSchema.parse(WIRE_TRANSACTION_ISLAMIC);
  });

  it('drops one malformed layer entry instead of failing the alert', () => {
    const findings = layerFindingsSchema.parse({
      ...WIRE_SCORE_SETTLEMENT.layer_findings,
      broken: { added: 'not a list' },
    });
    expect(Object.keys(findings ?? {})).toEqual(['islamic']);
    expect(layerFindingsSchema.parse('nonsense')).toBeNull();
    expect(layerFindingsSchema.parse({})).toBeNull();
    // Missing lists read as empty, not as a crash.
    expect(layerFindingsSchema.parse({ islamic: { facts: null } })?.['islamic']?.added).toEqual([]);
  });

  it('carries facts on case members and findings on the frozen verdict', () => {
    const detail = caseDetailSchema.parse(WIRE_CASE_ISLAMIC);
    expect(detail.alerts?.[0]?.layer_facts?.['islamic']?.event).toBe('CLAIM');
    expect(detail.feedback?.fraud_typology).toBe('TAKAFUL_CLAIM_FRAUD');
    expect(detail.feedback?.original_layer_findings?.['islamic']?.added[0]?.rule).toBe(
      'TAKAFUL_EARLY_CLAIM',
    );
  });

  it('parses the summary', () => {
    const summary = islamicSummarySchema.parse(WIRE_SUMMARY);
    expect(summary.products.map((p) => p.product)).toEqual(META_ON.products.map((p) => p.code));
    expect(summary.rules.find((r) => r.rule === 'ORIGIN_ACCOUNT_DRAIN')?.kind).toBe('set_aside');
  });
});

describe('product chip labels', () => {
  it.each([
    [REPAYMENT_FACTS, CHIP],
    // The layer sends the instalment an early settlement is made at; the chip
    // does not number it as if it were one of the schedule's payments.
    [SETTLEMENT?.['islamic']?.facts, 'Murabaha · early settlement'],
    [WIRE_CASE_ISLAMIC.alerts[0]!.layer_facts.islamic, 'Takaful · claim'],
    [{ product: 'ZAKAT', event: 'CHARITY', contract_id: null, instalment_no: null, tenor: null }, 'Zakat · charity'],
    [{ product: 'IJARA', event: 'RENTAL', instalment_no: 16, tenor: 48 }, 'Ijara · rental 16/48'],
    [{ product: 'SUKUK', event: 'PROFIT_DISTRIBUTION', instalment_no: 3 }, 'Sukuk · profit distribution 3'],
    [{ product: 'MURABAHA', event: 'ASSET_SALE' }, 'Murabaha · asset sale'],
    [{ product: 'MURABAHA' }, 'Murabaha'],
  ])('%o reads "%s"', (facts, expected) => {
    expect(productText(facts, PRODUCTS, 'islamic')).toBe(expected);
  });

  it('takes the label from meta, and falls back to the code', () => {
    const custom = [{ code: 'QARD_HASAN', label: 'Qard al-Hasan', layer: 'islamic' }];
    expect(productText({ product: 'QARD_HASAN', event: 'DISBURSEMENT' }, custom)).toBe(
      'Qard al-Hasan · disbursement',
    );
    expect(productText({ product: 'QARD_HASAN', event: 'DISBURSEMENT' }, [])).toBe(
      'Qard Hasan · disbursement',
    );
  });

  it('says nothing for a transaction that names no product', () => {
    expect(productText({ event: 'INSTALMENT' }, PRODUCTS)).toBeNull();
    expect(productText(null, PRODUCTS)).toBeNull();
  });

  it('reads only active layers', () => {
    const byLayer = { islamic: REPAYMENT_FACTS };
    expect(activeProductFacts(byLayer, [])).toBeNull();
    expect(activeProductFacts(byLayer, ['islamic'])?.facts).toBe(REPAYMENT_FACTS);
    const members = WIRE_ALERT_PAGE.items.map((a) => a.layer_facts);
    expect(distinctProductFacts(members, ['islamic'], PRODUCTS).map((p) => p.text)).toContain(CHIP);
    expect(distinctProductFacts(members, [], PRODUCTS)).toEqual([]);
  });
});

describe('evidence', () => {
  it('shows a rule the layer added, with its severity and source', () => {
    renderWithProviders(<LayerFindings findings={REPAYMENT} products={PRODUCTS} />);
    const block = screen.getByRole('region', { name: 'Islamic layer' });
    expect(within(block).getByText(CHIP)).toBeInTheDocument();
    expect(within(block).getByText('THIRD_PARTY_REPAYMENT')).toBeInTheDocument();
    expect(within(block).getByText('HIGH')).toBeInTheDocument();
    expect(within(block).getByText('Added by Islamic layer')).toBeInTheDocument();
    expect(within(block).queryByText('Set aside')).toBeNull();
    // 6.01 -> 70, floored like every other score.
    expect(within(block).getByTitle(/before and after/)).toHaveTextContent(/6\s*→\s*to\s*70$/);
  });

  it('shows a set-aside with its reason, and the score it fell from', () => {
    renderWithProviders(<LayerFindings findings={SETTLEMENT} products={PRODUCTS} />);
    const block = screen.getByRole('region', { name: 'Islamic layer' });
    expect(within(block).getByText('Murabaha · early settlement')).toBeInTheDocument();
    expect(within(block).getByText('Contract MUR-0021')).toBeInTheDocument();
    // Never left out: the rule, its reason, and the drop below the alert line.
    expect(within(block).getByText('Set aside')).toBeInTheDocument();
    expect(within(block).getByText('ORIGIN_ACCOUNT_DRAIN')).toBeInTheDocument();
    expect(
      within(block).getByText(
        'Scheduled early settlement of contract MUR-0021 empties the account by design.',
      ),
    ).toBeInTheDocument();
    expect(within(block).getByTitle(/before and after/)).toHaveTextContent(/76\s*→\s*to\s*66$/);
  });

  it('renders nothing without findings', () => {
    renderWithProviders(
      <div data-testid="host">
        <LayerFindings findings={null} />
      </div>,
    );
    expect(screen.getByTestId('host')).toBeEmptyDOMElement();
  });

  it('labels the rule a layer added, and not the engine’s own', () => {
    const claim = alertDetailSchema.parse(WIRE_ALERT_DETAIL_CLAIM);
    renderWithProviders(<TriggeredRules rules={claim.triggered_rules} />);
    expect(screen.getByText('NIGHT_HIGH_VALUE')).toBeInTheDocument();
    expect(screen.getAllByText('Added by Islamic layer')).toHaveLength(1);
  });
});

describe('typology suggestions', () => {
  function modal(seed: typeof ON, onSubmit = vi.fn()) {
    renderWithProviders(
      <ConcludeModal
        open
        onClose={() => {}}
        onSubmit={onSubmit}
        submitting={false}
        alertCount={1}
        caseTitle="Investigation ISL-0074"
        allowedLabels={['CONFIRMED_FRAUD', 'FALSE_POSITIVE']}
      />,
      { scopes: ['alerts:read', 'alerts:close'], seed },
    );
    return onSubmit;
  }

  const options = () =>
    [...document.querySelectorAll('datalist option')].map((o) => o.getAttribute('value'));

  it('offers core and Islamic typologies from meta', () => {
    modal(ON);
    expect(options()).toEqual(WIRE_META_ON.typologies);
  });

  it('offers only the core vocabulary with the layer off', () => {
    modal(OFF);
    expect(options()).toEqual(WIRE_META_OFF.typologies);
  });

  it('still accepts free text', async () => {
    const onSubmit = modal(ON);
    await userEvent.type(screen.getByRole('combobox', { name: 'Typology' }), 'OWN_SCHEME');
    await userEvent.click(screen.getByRole('radio', { name: /^Confirmed fraud/ }));
    await userEvent.click(screen.getByRole('radio', { name: 'HIGH' }));
    await userEvent.click(screen.getByRole('radio', { name: /^AGREES/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Conclude 1 alert' }));
    expect(onSubmit).toHaveBeenCalledWith(
      'CONFIRMED_FRAUD',
      expect.objectContaining({ fraud_typology: 'OWN_SCHEME' }),
    );
  });
});

describe('header badge', () => {
  it('names the active layer', () => {
    renderWithProviders(<LayerBadges />, { seed: ON });
    expect(screen.getByText('Islamic layer')).toBeInTheDocument();
  });

  it('is absent with the layer off', () => {
    renderWithProviders(
      <div data-testid="host">
        <LayerBadges />
      </div>,
      { seed: OFF },
    );
    expect(screen.getByTestId('host')).toBeEmptyDOMElement();
  });
});

describe('dashboard', () => {
  it('adds the Islamic products panel from /v1/islamic/summary when the layer is on', async () => {
    const requested = stubApi({ '/v1/islamic/summary': WIRE_SUMMARY });
    renderWithProviders(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
      { seed: ON },
    );
    expect(await screen.findByText('04 — Islamic products')).toBeInTheDocument();
    const products = await screen.findByRole('table', { name: 'Islamic products' });
    const murabaha = within(products).getByRole('row', { name: /Murabaha/ });
    const live = WIRE_SUMMARY.products[0]!;
    expect(within(murabaha).getAllByRole('cell').map((c) => c.textContent)).toEqual(
      [live.transactions, live.alerts, live.set_aside, live.confirmed_fraud, live.false_positive].map(
        String,
      ),
    );
    const rules = screen.getByRole('table', { name: 'Islamic layer rules' });
    const drain = WIRE_SUMMARY.rules.find((r) => r.rule === 'ORIGIN_ACCOUNT_DRAIN')!;
    const drainRow = within(rules).getByRole('row', { name: /ORIGIN_ACCOUNT_DRAIN/ });
    expect(within(drainRow).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      'ORIGIN_ACCOUNT_DRAIN',
      'Set aside',
      String(drain.count),
    ]);
    expect(requested).toContain('/v1/islamic/summary');
  });

  it('neither draws the panel nor calls the summary with the layer off', async () => {
    const requested = stubApi({});
    renderWithProviders(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
      { seed: OFF },
    );
    expect(await screen.findByText('03 — My queue')).toBeInTheDocument();
    await waitFor(() => expect(requested).toContain('/v1/fraud-alerts'));
    expect(screen.queryByText(/Islamic products/)).toBeNull();
    expect(requested).not.toContain('/v1/islamic/summary');
  });
});

describe('flow page', () => {
  it('shows the layer step under Detection when the layer is on', () => {
    stubApi({});
    renderWithProviders(
      <MemoryRouter>
        <FlowPage />
      </MemoryRouter>,
      { seed: ON },
    );
    expect(screen.getByText('↳ Islamic layer')).toBeInTheDocument();
  });

  it('is unchanged with the layer off', () => {
    stubApi({});
    renderWithProviders(
      <MemoryRouter>
        <FlowPage />
      </MemoryRouter>,
      { seed: OFF },
    );
    expect(screen.queryByText(/Islamic layer/)).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Regression guard: with the layer off the console looks as it did.
 * ------------------------------------------------------------------ */

describe('alert queue', () => {
  it('adds a Product column with the chips when the layer is on', async () => {
    stubApi({ '/v1/fraud-alerts': WIRE_ALERT_PAGE });
    renderAt('/alerts', '/alerts', <AlertQueuePage />, ON);
    expect(await screen.findByText(CHIP)).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Product' })).toBeInTheDocument();
    expect(screen.getAllByText('Zakat · charity')).toHaveLength(3);
    expect(screen.getAllByText('Murabaha · early settlement')).toHaveLength(2);
  });

  it('has no Product column with the layer off, even if rows carry facts', async () => {
    stubApi({ '/v1/fraud-alerts': WIRE_ALERT_PAGE });
    renderAt('/alerts', '/alerts', <AlertQueuePage />, OFF);
    expect((await screen.findAllByRole('link', { name: 'Open case' })).length).toBe(14);
    expect(screen.queryByRole('columnheader', { name: 'Product' })).toBeNull();
    expect(screen.queryByText(CHIP)).toBeNull();
    expect(screen.getAllByRole('columnheader')).toHaveLength(8);
  });
});

describe('alert detail', () => {
  it('shows the product and the layer block when the layer is on', async () => {
    stubApi({
      [`/v1/fraud-alerts/${WIRE_ALERT_DETAIL_ISLAMIC.id}`]: WIRE_ALERT_DETAIL_ISLAMIC,
      [`/v1/transactions/${WIRE_TRANSACTION_ISLAMIC.id}`]: WIRE_TRANSACTION_ISLAMIC,
    });
    renderAt(
      `/alerts/${WIRE_ALERT_DETAIL_ISLAMIC.id}`,
      '/alerts/:alertId',
      <AlertDetailPage />,
      ON,
    );
    const block = await screen.findByRole('region', { name: 'Islamic layer' });
    expect(within(block).getByText('THIRD_PARTY_REPAYMENT')).toBeInTheDocument();
    // Header, layer block and the linked transaction's Product row.
    expect(await screen.findByText('Product')).toBeInTheDocument();
    expect(screen.getByText('MUR-0073')).toBeInTheDocument();
    expect(screen.getAllByText(CHIP)).toHaveLength(3);
    // Once on the engine's rule list, once in the layer block.
    expect(screen.getAllByText('Added by Islamic layer')).toHaveLength(2);
  });

  it('adds nothing for a core alert with the layer off', async () => {
    stubApi({
      [`/v1/fraud-alerts/${WIRE_ALERT_DETAIL_CORE.id}`]: WIRE_ALERT_DETAIL_CORE,
      [`/v1/transactions/${WIRE_TRANSACTION.id}`]: WIRE_TRANSACTION,
    });
    renderAt(`/alerts/${WIRE_ALERT_DETAIL_CORE.id}`, '/alerts/:alertId', <AlertDetailPage />, OFF);
    expect(await screen.findByText('Case file')).toBeInTheDocument();
    expect(await screen.findByText('Reference')).toBeInTheDocument();
    expect(screen.getAllByText('ORIGIN_ACCOUNT_DRAIN').length).toBeGreaterThan(0);
    expect(screen.queryByRole('region', { name: /layer/ })).toBeNull();
    expect(screen.queryByText('Product')).toBeNull();
    expect(screen.queryByText(/Added by/)).toBeNull();
  });
});

describe('case page', () => {
  const casePath = `/cases/${WIRE_CASE_ISLAMIC.id}`;

  it('shows the product in the header, on each member and in the verdict', async () => {
    stubApi({ [`/v1/cases/${WIRE_CASE_ISLAMIC.id}`]: WIRE_CASE_ISLAMIC });
    renderAt(casePath, '/cases/:caseId', <CaseDetailPage />, ON);
    expect(await screen.findByRole('columnheader', { name: 'Product' })).toBeInTheDocument();
    // Header chip, member row and the verdict's frozen findings.
    expect(screen.getAllByText('Takaful · claim')).toHaveLength(3);
    expect(screen.getByText('Layer findings at the moment of decision')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Islamic layer' })).toHaveTextContent(
      'TAKAFUL_EARLY_CLAIM',
    );
  });

  it('adds nothing for a core case with the layer off', async () => {
    const { feedback, alerts, ...rest } = WIRE_CASE_ISLAMIC;
    const core = {
      ...rest,
      alerts: alerts.map(({ layer_facts: _facts, ...member }) => member),
      feedback: {
        ...feedback,
        fraud_typology: 'MULE_RING',
        original_layer_findings: null,
        original_triggered_rules: WIRE_ALERT_DETAIL_CORE.triggered_rules,
      },
    };
    stubApi({ [`/v1/cases/${WIRE_CASE_ISLAMIC.id}`]: core });
    renderAt(casePath, '/cases/:caseId', <CaseDetailPage />, OFF);
    expect(await screen.findByText('Member alerts')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Product' })).toBeNull();
    expect(screen.queryByText(/layer/i)).toBeNull();
  });

  it('still shows a recorded set-aside or added rule after the layer is switched off', async () => {
    stubApi({ [`/v1/cases/${WIRE_CASE_ISLAMIC.id}`]: WIRE_CASE_ISLAMIC });
    renderAt(casePath, '/cases/:caseId', <CaseDetailPage />, OFF);
    expect(await screen.findByText('Layer findings at the moment of decision')).toBeInTheDocument();
    // The live product column and header chip follow meta; recorded evidence does not.
    expect(screen.queryByRole('columnheader', { name: 'Product' })).toBeNull();
    expect(screen.getAllByText('Takaful · claim')).toHaveLength(1);
  });
});
