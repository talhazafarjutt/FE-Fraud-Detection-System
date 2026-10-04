import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { directoryListSchema, type DirectoryUser } from '@/api/schemas/users';
import { describeFailure, ApiError } from '@/lib/problem';
import { AssigneePicker } from '@/features/users/AssigneePicker';
import { UserName } from '@/features/users/UserName';
import { eligibleAssignees, useDirectoryLookup } from '@/features/users/directory';
import { renderWithProviders } from './render';
import { WIRE_ASSIGNEE_PROBLEM, WIRE_DIRECTORY } from './wire';

const ANALYST = '8154776a-c4da-41aa-8245-522cc45d00e1';
const SUPERVISOR = 'c8684733-a3ec-4cea-a174-00fc0070012f';
const OTHER_TEAM = '28a8dac3-3062-4842-aef5-24ece3e9a3c3';

const LEAVER: DirectoryUser = {
  id: '5b0c7f3e-4a51-4c1e-9d43-2f6f6a2b9e10',
  full_name: 'Former Analyst',
  email: 'former@example.com',
  team: 'team-alpha',
  roles: ['ANALYST'],
  is_active: false,
  can_investigate: true,
};

const AUDITOR: DirectoryUser = {
  id: '0d7e3b1a-9c2f-4e8b-a6d5-1f4c3b2a7e90',
  full_name: null,
  email: 'auditor@example.com',
  team: 'team-alpha',
  roles: ['AUDITOR'],
  is_active: true,
  can_investigate: false,
};

const PEOPLE = [...WIRE_DIRECTORY, LEAVER, AUDITOR];

afterEach(() => vi.unstubAllGlobals());

describe('user directory contract', () => {
  it('parses the live directory', () => {
    const parsed = directoryListSchema.safeParse(WIRE_DIRECTORY);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it('shares one lookup across every name on the page', () => {
    const seen: ReadonlyMap<string, DirectoryUser>[] = [];
    function Probe() {
      seen.push(useDirectoryLookup());
      return null;
    }
    renderWithProviders(
      <>
        <Probe />
        <Probe />
      </>,
      { directory: PEOPLE },
    );
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(new Set(seen).size).toBe(1);
    expect(seen[0]?.get(SUPERVISOR)?.full_name).toBe('Supervisor');
  });

  it('offers only active investigators on the same team', () => {
    expect(eligibleAssignees(PEOPLE, 'team-alpha').map((u) => u.id)).toEqual([ANALYST, SUPERVISOR]);
    expect(eligibleAssignees(PEOPLE, 'team-beta').map((u) => u.id)).toEqual([OTHER_TEAM]);
  });
});

describe('AssigneePicker', () => {
  function options() {
    return within(screen.getByRole('combobox')).getAllByRole('option');
  }

  it('lists Unassigned and eligible people, nobody else', () => {
    renderWithProviders(<AssigneePicker team="team-alpha" value={null} onChange={() => {}} />, {
      directory: PEOPLE,
    });
    expect(options().map((o) => o.textContent)).toEqual(['Unassigned', 'Analyst', 'Supervisor']);
    expect(screen.queryByRole('option', { name: /Other-Analyst/ })).toBeNull();
    expect(screen.queryByRole('option', { name: /Former Analyst/ })).toBeNull();
    expect(screen.queryByRole('option', { name: /auditor/ })).toBeNull();
    expect(screen.queryByRole('option', { name: 'Admin' })).toBeNull();
    expect(screen.getByRole('combobox')).toHaveValue('');
  });

  it('keeps a current assignee who no longer qualifies, marked inactive', () => {
    renderWithProviders(
      <AssigneePicker team="team-alpha" value={LEAVER.id} onChange={() => {}} />,
      { directory: PEOPLE },
    );
    expect(options().map((o) => o.textContent)).toContain('Former Analyst (inactive)');
    expect(screen.getByRole('combobox')).toHaveValue(LEAVER.id);
  });

  it('reports an id, or null for Unassigned', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <AssigneePicker team="team-alpha" value={SUPERVISOR} onChange={onChange} />,
      { directory: PEOPLE },
    );
    await userEvent.selectOptions(screen.getByRole('combobox'), ANALYST);
    expect(onChange).toHaveBeenLastCalledWith(ANALYST);
    await userEvent.selectOptions(screen.getByRole('combobox'), '');
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('shows the server\'s 422 detail inline', () => {
    const failure = describeFailure(
      new ApiError({
        status: WIRE_ASSIGNEE_PROBLEM.status,
        title: WIRE_ASSIGNEE_PROBLEM.title,
        detail: WIRE_ASSIGNEE_PROBLEM.detail,
        extras: { errors: WIRE_ASSIGNEE_PROBLEM.errors },
      }),
    );
    expect(failure.fieldErrors?.[0]?.field).toBe('assigned_to');

    renderWithProviders(
      <AssigneePicker team="team-alpha" value={null} onChange={() => {}} error={failure.detail} />,
      { directory: PEOPLE },
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The assignee must belong to the same team as the case.',
    );
    expect(screen.getByRole('combobox')).toHaveAccessibleDescription(
      'The assignee must belong to the same team as the case.',
    );
    expect(screen.getByRole('combobox')).toBeInvalid();
  });
});

describe('UserName', () => {
  it('shows the name, with the id in the tooltip', () => {
    renderWithProviders(<UserName id={SUPERVISOR} />, { directory: PEOPLE });
    expect(screen.getByText('Supervisor')).toHaveAttribute('title', SUPERVISOR);
  });

  it('falls back to the email when there is no name', () => {
    renderWithProviders(<UserName id={AUDITOR.id} />, { directory: PEOPLE });
    expect(screen.getByText('auditor@example.com')).toBeInTheDocument();
  });

  it('marks an inactive user', () => {
    renderWithProviders(<UserName id={LEAVER.id} />, { directory: PEOPLE });
    expect(screen.getByText('Former Analyst (inactive)')).toBeInTheDocument();
  });

  it('falls back to the short id for someone the directory does not know', () => {
    const stranger = '9f1e2d3c-4b5a-4c6d-8e7f-0a1b2c3d4e5f';
    renderWithProviders(<UserName id={stranger} />, { directory: PEOPLE });
    expect(screen.getByText('9f1e2d3c')).toHaveAttribute('title', stranger);
  });

  it('renders the empty text when there is no id', () => {
    renderWithProviders(<UserName id={null} empty="Unassigned" />, { directory: PEOPLE });
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
  });

  it('does not ask for the directory without alerts:read or users:manage', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<UserName id={SUPERVISOR} />, {
      scopes: ['feedback:process'],
      directory: null,
    });
    expect(screen.getByText('c8684733')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
