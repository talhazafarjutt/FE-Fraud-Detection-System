import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useQuery } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAlert } from '@/api/endpoints/alerts';
import { alertDetailSchema, type AlertDetail } from '@/api/schemas/alerts';
import { AlertActions } from '@/features/alerts/AlertActions';
import { alertKeys } from '@/features/alerts/queries';
import { renderWithProviders } from './render';
import { WIRE_ASSIGNEE_PROBLEM, WIRE_DIRECTORY } from './wire';

const ANALYST = '8154776a-c4da-41aa-8245-522cc45d00e1';
const SUPERVISOR = 'c8684733-a3ec-4cea-a174-00fc0070012f';
const OTHER_TEAM = '28a8dac3-3062-4842-aef5-24ece3e9a3c3';

const ALERT: AlertDetail = alertDetailSchema.parse({
  id: '4f86c685-3fcf-430e-9b37-e14ae5a64343',
  transaction_id: 'b572e9c7-954c-4921-a031-9b350c881ded',
  status: 'IN_REVIEW',
  severity: 'HIGH',
  risk_score: 74,
  team: 'team-alpha',
  assigned_to: SUPERVISOR,
  opened_at: '2026-10-03T19:55:49.502313Z',
  closed_at: null,
  case_id: 'a2c1f4df-469c-48aa-a05d-c14748177c89',
});

const SCOPES = ['alerts:read', 'alerts:update', 'alerts:assign'];

function json(body: unknown, status = 200, type = 'application/json') {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': type } });
}

/** Records every PATCH body; answers it with the alert as the server would. */
function stubApi(answer?: (body: Record<string, unknown>) => Response) {
  const sent: Record<string, unknown>[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method !== 'PATCH') return new Promise<Response>(() => {});
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      sent.push(body);
      return answer?.(body) ?? json({ ...ALERT, ...body });
    }),
  );
  return sent;
}

function renderActions(alert: AlertDetail = ALERT) {
  return renderWithProviders(
    <MemoryRouter>
      <AlertActions alert={alert} />
    </MemoryRouter>,
    { scopes: SCOPES, directory: WIRE_DIRECTORY },
  );
}

const picker = () => screen.getByLabelText('Assign to');
const record = () => userEvent.click(screen.getByRole('button', { name: 'Record action' }));

afterEach(() => vi.unstubAllGlobals());

describe('AlertActions request body', () => {
  it('sends a note on its own, without assigned_to or status', async () => {
    const sent = stubApi();
    renderActions();
    await userEvent.type(screen.getByRole('textbox'), '  Called the branch.  ');
    await record();
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ note: 'Called the branch.' });
  });

  it('sends assigned_to only when the pick differs from the current assignee', async () => {
    const sent = stubApi();
    renderActions();

    await userEvent.selectOptions(picker(), SUPERVISOR);
    expect(screen.getByRole('button', { name: 'Record action' })).toBeDisabled();

    await userEvent.selectOptions(picker(), ANALYST);
    await record();
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ assigned_to: ANALYST });
  });

  it('sends null for Unassigned', async () => {
    const sent = stubApi();
    renderActions();
    await userEvent.selectOptions(picker(), '');
    await record();
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ assigned_to: null });
  });

  it('shows a rejected assignee under the picker, not as a toast', async () => {
    stubApi(() => json(WIRE_ASSIGNEE_PROBLEM, 422, 'application/problem+json'));
    renderActions({ ...ALERT, assigned_to: OTHER_TEAM });
    await userEvent.selectOptions(picker(), ANALYST);
    await record();

    const inline = await screen.findByRole('alert');
    expect(inline).toHaveTextContent(WIRE_ASSIGNEE_PROBLEM.detail);
    expect(picker()).toHaveAccessibleDescription(WIRE_ASSIGNEE_PROBLEM.detail);
    expect(screen.getAllByText(WIRE_ASSIGNEE_PROBLEM.detail)).toHaveLength(1);
    expect(screen.queryByText(WIRE_ASSIGNEE_PROBLEM.title)).toBeNull();
  });

  it('shows the new assignee straight away, before the refetch lands', async () => {
    // Every GET hangs, so only the PATCH response can move the picker.
    stubApi();
    function Page() {
      const { data } = useQuery({
        queryKey: alertKeys.detail(ALERT.id),
        queryFn: ({ signal }) => getAlert(ALERT.id, signal),
        initialData: ALERT,
      });
      return <AlertActions alert={data} />;
    }
    renderWithProviders(
      <MemoryRouter>
        <Page />
      </MemoryRouter>,
      { scopes: SCOPES, directory: WIRE_DIRECTORY },
    );

    await userEvent.selectOptions(picker(), ANALYST);
    await record();
    await screen.findByText('Assignment saved.');
    expect(picker()).toHaveValue(ANALYST);
  });
});
