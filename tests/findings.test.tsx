import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { patchCase } from '@/api/endpoints/cases';
import { caseDetailSchema, findingsLocked } from '@/api/schemas/cases';
import { ConcludeModal } from '@/features/cases/ConcludeModal';
import { FindingsPanel } from '@/features/cases/FindingsPanel';
import { renderWithProviders } from './render';
import { WIRE_CASE_WITH_FINDINGS, WIRE_DIRECTORY } from './wire';

const live = caseDetailSchema.parse(WIRE_CASE_WITH_FINDINGS);

function panel(overrides: Partial<Parameters<typeof FindingsPanel>[0]> = {}) {
  const onSave = vi.fn();
  renderWithProviders(
    <FindingsPanel
      findings={live.findings}
      findingsBy={live.findings_by}
      findingsAt={live.findings_at}
      status={String(live.status)}
      canEdit
      saving={false}
      onSave={onSave}
      {...overrides}
    />,
    { directory: WIRE_DIRECTORY, scopes: ['alerts:read', 'alerts:update'] },
  );
  return onSave;
}

describe('case findings contract', () => {
  it('parses the live case and keeps findings, author and time', () => {
    expect(live.findings).toBe(WIRE_CASE_WITH_FINDINGS.findings);
    expect(live.findings_by).toBe('8154776a-c4da-41aa-8245-522cc45d00e1');
    expect(live.findings_at).toBe('2026-10-04T10:05:36.317650Z');
  });

  it('freezes findings exactly where the server answers 409', () => {
    expect(['CONFIRMED_FRAUD', 'FALSE_POSITIVE', 'CLOSED'].every(findingsLocked)).toBe(true);
    expect(['OPEN', 'IN_REVIEW', 'ESCALATED'].some(findingsLocked)).toBe(false);
  });
});

describe('FindingsPanel', () => {
  it('is editable while the case is open, and names the author', async () => {
    const onSave = panel();
    const box = screen.getByRole('textbox', { name: 'Analyst findings' });
    expect(box).toHaveValue(WIRE_CASE_WITH_FINDINGS.findings);
    expect(screen.getByText('Analyst')).toHaveAttribute('title', live.findings_by);

    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();

    await userEvent.clear(box);
    await userEvent.type(box, '  Mule account confirmed by the bank.  ');
    await userEvent.click(save);
    expect(onSave).toHaveBeenCalledWith('Mule account confirmed by the bank.');
  });

  it('lets an editor clear the findings', async () => {
    const onSave = panel();
    await userEvent.clear(screen.getByRole('textbox', { name: 'Analyst findings' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith('');
  });

  it('is read-only once the case is concluded, even for an editor', () => {
    panel({ status: 'CONFIRMED_FRAUD' });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.getByText(WIRE_CASE_WITH_FINDINGS.findings)).toBeInTheDocument();
    expect(screen.getByText(/Frozen once the case is concluded/)).toBeInTheDocument();
  });

  it('is read-only without alerts:update, with a plain empty state', () => {
    panel({ canEdit: false, findings: null, findingsBy: null, findingsAt: null });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('No findings recorded yet.')).toBeInTheDocument();
  });

  it('shows the server error inline', () => {
    panel({ error: 'Findings are frozen once a case is concluded.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Findings are frozen');
  });
});

describe('ConcludeModal findings', () => {
  function modal(findings: string | null, onSubmit = vi.fn()) {
    renderWithProviders(
      <ConcludeModal
        open
        onClose={() => {}}
        onSubmit={onSubmit}
        submitting={false}
        alertCount={1}
        caseTitle="Investigation TXN-2E41449A9988"
        allowedLabels={['CONFIRMED_FRAUD', 'FALSE_POSITIVE']}
        findings={findings}
        findingsBy={findings ? live.findings_by : null}
      />,
      { directory: WIRE_DIRECTORY, scopes: ['alerts:read', 'alerts:close'] },
    );
    return onSubmit;
  }

  it('shows the recorded findings read-only, with no warning', () => {
    modal(live.findings ?? null);
    expect(screen.getByText(WIRE_CASE_WITH_FINDINGS.findings)).toBeInTheDocument();
    expect(screen.getByText('Analyst')).toBeInTheDocument();
    expect(screen.queryByText(/No analyst findings recorded/)).toBeNull();
  });

  it('warns when there are none, and still allows concluding', async () => {
    const onSubmit = modal(null);
    expect(
      screen.getByText('No analyst findings recorded. The verdict will be stored without them.'),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: /^Confirmed fraud/ }));
    await userEvent.click(screen.getByRole('radio', { name: 'HIGH' }));
    await userEvent.click(screen.getByRole('radio', { name: /^AGREES/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Conclude 1 alert' }));
    expect(onSubmit).toHaveBeenCalledWith(
      'CONFIRMED_FRAUD',
      expect.objectContaining({ final_label: 'CONFIRMED_FRAUD' }),
    );
  });

  it('sends the same verdict as status and as final_label', async () => {
    const onSubmit = modal(null);
    await userEvent.click(screen.getByRole('radio', { name: /^False positive/ }));
    await userEvent.click(screen.getByRole('radio', { name: 'LOW' }));
    await userEvent.click(screen.getByRole('radio', { name: /^DISAGREES/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Conclude 1 alert' }));
    expect(onSubmit).toHaveBeenCalledWith(
      'FALSE_POSITIVE',
      expect.objectContaining({ final_label: 'FALSE_POSITIVE' }),
    );
  });
});

describe('clearing findings on the wire', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends an empty string, since null means "no change"', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ ...WIRE_CASE_WITH_FINDINGS, findings: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await patchCase(WIRE_CASE_WITH_FINDINGS.id, { findings: '' });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ findings: '' });
  });
});
