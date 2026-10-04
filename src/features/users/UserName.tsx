import { shortId } from '@/lib/format';
import { displayName, useDirectoryLookup } from './directory';

/**
 * A person, by name. Falls back to the short id when the directory is not
 * readable or does not know the id (another team, a deleted user); the full id
 * is always in the tooltip.
 */
export function UserName({
  id,
  empty = '—',
  className,
}: {
  id: string | null | undefined;
  /** Shown when there is no id at all. */
  empty?: string;
  className?: string;
}) {
  const lookup = useDirectoryLookup();
  if (!id) return <span className={className}>{empty}</span>;
  const user = lookup.get(id);
  return (
    <span className={className} title={id}>
      {user ? displayName(user) : shortId(id)}
    </span>
  );
}

/** A person as one cell of a `<dl>` grid: label above, name below. */
export function PersonFact({
  label,
  id,
  empty,
  dense,
}: {
  label: string;
  id: string | null | undefined;
  empty?: string;
  /** Tighter padding and type, for dialogs. */
  dense?: boolean;
}) {
  return (
    <div className={dense ? 'bg-surface p-3' : 'bg-surface p-4'}>
      <dt className="mono-label text-ink-3">{label}</dt>
      <dd className={dense ? 'text-[13px] text-ink' : 'mt-1 text-ink'}>
        <UserName id={id} {...(empty ? { empty } : {})} />
      </dd>
    </div>
  );
}
