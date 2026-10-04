import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CaseCurationPanel } from '@/features/labelled-feedback/CaseCurationPanel';
import LabelledFeedbackPage from '@/features/labelled-feedback/LabelledFeedbackPage';
import { renderWithProviders } from './render';
import { WIRE_DIRECTORY, WIRE_RECORDS_PAGE } from './wire';

/** CONFIRMED_FRAUD, PENDING on the wire. */
const PENDING = WIRE_RECORDS_PAGE.items[1];
const MISSING = '9f1e2d3c-4b5a-4c6d-8e7f-0a1b2c3d4e5f';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': status < 400 ? 'application/json' : 'application/problem+json',
    },
  });
}

/** Serves `record` and the records page; 404s anything else; logs every PATCH body. */
function stubApi(record: Record<string, unknown>) {
  const patches: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://console.test');
      if (init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        patches.push(body);
        return json({ ...record, ...body });
      }
      if (url.pathname === '/v1/labelled-feedback/records') return json(WIRE_RECORDS_PAGE);
      if (url.pathname === `/v1/labelled-feedback/records/${String(record['id'])}`) {
        return json(record);
      }
      return json(
        { title: 'Not found', status: 404, detail: 'Labelled feedback record not found.' },
        404,
      );
    }),
  );
  return patches;
}

const SUPERVISOR = ['alerts:read', 'feedback:review'];

afterEach(() => vi.unstubAllGlobals());

describe('CaseCurationPanel', () => {
  function renderPanel(id: string) {
    renderWithProviders(
      <MemoryRouter>
        <CaseCurationPanel feedbackId={id} />
      </MemoryRouter>,
      { scopes: SUPERVISOR, directory: WIRE_DIRECTORY },
    );
  }

  it('validates without writing a note, clearing a stale exclusion reason', async () => {
    const patches = stubApi({
      ...PENDING,
      curation_status: 'EXCLUDED',
      curation_note: 'Duplicate of another case.',
    });
    renderPanel(PENDING.id);
    await userEvent.click(await screen.findByRole('button', { name: 'Validate' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toEqual({ curation_status: 'VALIDATED', curation_note: null });
  });

  it('labels the exclusion reason', async () => {
    stubApi(PENDING);
    renderPanel(PENDING.id);
    await userEvent.click(await screen.findByRole('button', { name: 'Exclude…' }));
    const reason = screen.getByRole('textbox', { name: 'Reason for excluding' });
    await userEvent.type(reason, 'One-off branch error.');
    expect(screen.getByRole('button', { name: 'Exclude' })).toBeEnabled();
  });
});

describe('LabelledFeedbackPage', () => {
  function renderPage(url: string) {
    renderWithProviders(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/labelled-feedback" element={<LabelledFeedbackPage />} />
        </Routes>
      </MemoryRouter>,
      { scopes: SUPERVISOR, directory: WIRE_DIRECTORY },
    );
  }

  it('says so when a ?review= link points at a record that is not there', async () => {
    stubApi(PENDING);
    renderPage(`/labelled-feedback?review=${MISSING}`);
    const notice = await screen.findByText(/The linked record was not found/);
    expect(screen.queryByRole('dialog')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(notice).not.toBeInTheDocument();
  });

  it('bulk-validates with a null note', async () => {
    const patches = stubApi(PENDING);
    renderPage('/labelled-feedback');
    await userEvent.click(
      await screen.findByRole('checkbox', { name: `Select ${PENDING.case_title}` }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toEqual({ curation_status: 'VALIDATED', curation_note: null });
  });

  it('labels the bulk exclusion reason', async () => {
    stubApi(PENDING);
    renderPage('/labelled-feedback');
    await userEvent.click(
      await screen.findByRole('checkbox', { name: `Select ${PENDING.case_title}` }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Exclude…' }));
    expect(screen.getByRole('textbox', { name: 'Reason for excluding' })).toBeInTheDocument();
  });
});
