import { useEffect } from 'react';
import { tokenStore } from './tokenStore';

/**
 * Discover the caller's team from the rows the server chose to return.
 *
 * The access token carries no `team` claim and there is no /v1/users/me, so the
 * only way to name the team on screen is to observe it: the server filters
 * every list to the caller's own team unless they hold `alerts:read:all`, so a
 * single distinct team across a page IS their team.
 *
 * Naming it matters. An analyst looking at an empty screen needs to know they
 * are seeing one team's work — team-beta genuinely has no traffic in the seed,
 * and an unlabelled empty list reads as a broken screen instead of an
 * accurate one.
 *
 * Several lists carry a team, so this lives in one place rather than being
 * re-derived per page. Display only; never an authorisation input.
 */
function recordTeam(rows: readonly { team?: string | null }[]): void {
  const teams = new Set(
    rows.map((row) => row.team).filter((team): team is string => typeof team === 'string'),
  );
  // More than one team means cross-team visibility, so there is no single
  // "your team" to display. Zero means we learned nothing — leave it alone
  // rather than clearing a team an earlier list already established.
  if (teams.size !== 1) return;
  tokenStore.setObservedTeam([...teams][0] ?? null);
}

/**
 * Effect form. This MUST NOT run during render: it writes to the token store,
 * which notifies AuthProvider, and updating one component while rendering
 * another is a React error ("Cannot update a component while rendering a
 * different component"). The hook is the only thing pages should call.
 */
export function useObservedTeam(
  rows: readonly { team?: string | null }[],
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled || rows.length === 0) return;
    recordTeam(rows);
  }, [rows, enabled]);
}
