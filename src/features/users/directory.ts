import { useQuery } from '@tanstack/react-query';
import { listDirectory } from '@/api/endpoints/users';
import type { DirectoryUser } from '@/api/schemas/users';
import { useAuth } from '@/auth/AuthProvider';

export const directoryKey = ['users', 'directory'] as const;

/**
 * Everyone the caller may see, for turning ids into names and for picking an
 * assignee. People change rarely, so one fetch serves every page for minutes.
 */
export function useUserDirectory() {
  const { hasAnyScope } = useAuth();
  return useQuery({
    queryKey: directoryKey,
    queryFn: ({ signal }) => listDirectory(signal),
    enabled: hasAnyScope('alerts:read', 'users:manage'),
    staleTime: 5 * 60_000,
  });
}

const NOBODY: ReadonlyMap<string, DirectoryUser> = new Map();

/**
 * One map per fetched directory, shared by every caller. A per-component memo
 * would rebuild it for each of the hundreds of names on a long table.
 */
const lookups = new WeakMap<readonly DirectoryUser[], ReadonlyMap<string, DirectoryUser>>();

/** id → user, rebuilt only when the directory itself changes. */
export function useDirectoryLookup(): ReadonlyMap<string, DirectoryUser> {
  const { data } = useUserDirectory();
  if (!data) return NOBODY;
  let lookup = lookups.get(data);
  if (!lookup) {
    lookup = new Map(data.map((user) => [user.id, user]));
    lookups.set(data, lookup);
  }
  return lookup;
}

export function displayName(user: DirectoryUser): string {
  const name = user.full_name?.trim() || user.email;
  return user.is_active ? name : `${name} (inactive)`;
}

/** Who the server would accept as an assignee for work in `team`. */
export function eligibleAssignees(
  users: readonly DirectoryUser[],
  team: string,
): DirectoryUser[] {
  return users
    .filter((user) => user.is_active && user.can_investigate && user.team === team)
    .sort((a, b) => displayName(a).localeCompare(displayName(b)));
}
