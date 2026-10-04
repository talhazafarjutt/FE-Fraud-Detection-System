import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { alertEventSchema } from '@/api/schemas/alerts';
import { CaseTrail } from '@/features/alerts/CaseTrail';
import { renderWithProviders } from './render';
import { WIRE_DIRECTORY } from './wire';

/**
 * A note saved without a status change is persisted by the API as an event
 * whose from_status equals its to_status. Captured from the local API after a
 * note-only PATCH /v1/fraud-alerts/{id}.
 */
const WIRE_NOTE_EVENTS = [
  {
    id: '69c0cc3c-8533-4ac4-bfd3-debf8cb1b0ef',
    from_status: null,
    to_status: 'OPEN',
    note: 'auto-opened by xgboost-paysim@1.0.0 score_id=97f9c158-3755-4e94-827c-6a2b3c7c927a',
    actor_user_id: null,
    created_at: '2026-10-03T19:56:00.475945Z',
  },
  {
    id: 'dd01a61f-f510-4b9e-9007-37e2ea45c981',
    from_status: 'OPEN',
    to_status: 'IN_REVIEW',
    note: 'Picked up for investigation.',
    actor_user_id: 'c8684733-a3ec-4cea-a174-00fc0070012f',
    created_at: '2026-10-03T19:56:07.177681Z',
  },
  {
    id: '2a676419-1476-41fa-943c-c0cb2d954a62',
    from_status: 'IN_REVIEW',
    to_status: 'IN_REVIEW',
    note: 'Called the branch; account holder unreachable. Leaving in review.',
    actor_user_id: 'c8684733-a3ec-4cea-a174-00fc0070012f',
    created_at: '2026-10-04T09:52:06.606625Z',
  },
] as const;

describe('case trail', () => {
  const events = WIRE_NOTE_EVENTS.map((event) => alertEventSchema.parse(event));

  it('parses the live events', () => {
    expect(events).toHaveLength(3);
  });

  it('renders a same-status event as a note, not "X → X"', () => {
    renderWithProviders(<CaseTrail events={events} />, { directory: WIRE_DIRECTORY });
    const items = screen.getAllByRole('listitem');
    // Newest first: the note-only update is on top.
    const note = items[0]!;
    expect(within(note).getByText('Note')).toBeInTheDocument();
    expect(within(note).queryByLabelText('changed to')).toBeNull();
    expect(within(note).queryByText('IN REVIEW')).toBeNull();
    expect(
      within(note).getByText('Called the branch; account holder unreachable. Leaving in review.'),
    ).toBeInTheDocument();
  });

  it('still renders a status change as from → to', () => {
    renderWithProviders(<CaseTrail events={events} />, { directory: WIRE_DIRECTORY });
    const change = screen.getAllByRole('listitem')[1]!;
    expect(within(change).getByText('OPEN')).toBeInTheDocument();
    expect(within(change).getByLabelText('changed to')).toBeInTheDocument();
    expect(within(change).getByText('IN REVIEW')).toBeInTheDocument();
    expect(within(change).queryByText('Note')).toBeNull();
  });

  it('names the actor from the directory, with the id in the tooltip', () => {
    renderWithProviders(<CaseTrail events={events} />, { directory: WIRE_DIRECTORY });
    const [note, , opened] = screen.getAllByRole('listitem');
    const actor = within(note!).getByText('Supervisor');
    expect(actor).toHaveAttribute('title', 'c8684733-a3ec-4cea-a174-00fc0070012f');
    expect(within(opened!).getByText('System')).toBeInTheDocument();
  });

  it('renders the opening event as "Opened as"', () => {
    renderWithProviders(<CaseTrail events={events} />, { directory: WIRE_DIRECTORY });
    const opened = screen.getAllByRole('listitem')[2]!;
    expect(within(opened).getByText('Opened as')).toBeInTheDocument();
  });
});
