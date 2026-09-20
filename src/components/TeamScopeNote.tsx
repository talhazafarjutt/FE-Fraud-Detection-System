import { useAuth } from '@/auth/AuthProvider';

/**
 * Why a list is empty, said out loud.
 *
 * The server filters every list to the caller's team unless they hold
 * `alerts:read:all`, so "no results" and "not your team's" look identical from
 * the client. For a team with no traffic at all — `other-analyst` on team-beta
 * in the seeded data — EVERY list is empty, and an unexplained empty screen
 * reads as a broken console rather than an accurate one.
 *
 * NAMING THE TEAM IS NOT ALWAYS POSSIBLE. The access token carries no `team`
 * claim, the login response does not return one, and there is no /v1/users/me —
 * all three verified against the running backend. The team is therefore learned
 * by observing the rows the server returns, which works for everyone except the
 * one user who most needs the explanation: if nothing comes back, there is
 * nothing to learn it from. So the wording explains the rule either way and
 * names the team only when it is genuinely known.
 */
export function TeamScopeNote({ noun }: { noun: string }) {
  const { session, hasScope } = useAuth();

  if (hasScope('alerts:read:all')) {
    return (
      <>
        You can see every team, so this is genuinely empty rather than filtered.
      </>
    );
  }

  if (session?.team) {
    return (
      <>
        You are seeing <strong>{session.team}</strong> only — the server filters {noun} to your
        own team. If your team has no traffic yet, an empty list here is expected, not a fault.
      </>
    );
  }

  return (
    <>
      The server filters {noun} to your own team, and nothing has been returned for it yet. A team
      with no traffic sees an empty list everywhere — that is expected, not a fault.
    </>
  );
}
