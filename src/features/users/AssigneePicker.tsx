import { useId } from 'react';
import { shortId } from '@/lib/format';
import { describeFailure } from '@/lib/problem';
import { displayName, eligibleAssignees, useDirectoryLookup, useUserDirectory } from './directory';

const UNASSIGNED = '';

export interface AssigneePickerProps {
  id?: string;
  /** Team of the case or alert; the server only accepts an assignee from it. */
  team: string;
  /** User id, or null for unassigned. */
  value: string | null;
  onChange: (next: string | null) => void;
  disabled?: boolean;
  /** Shown under the control — typically the `detail` of a 422. */
  error?: string | undefined;
}

/**
 * Active investigators on the subject's team, plus "Unassigned". The current
 * assignee stays selectable even if they no longer qualify, so the control
 * never misreports who holds the work.
 */
export function AssigneePicker({
  id,
  team,
  value,
  onChange,
  disabled,
  error,
}: AssigneePickerProps) {
  const errorId = useId();
  const directory = useUserDirectory();
  const lookup = useDirectoryLookup();
  const options = eligibleAssignees(directory.data ?? [], team);
  const ineligibleCurrent = value !== null && !options.some((user) => user.id === value) ? value : null;
  const ineligibleUser = ineligibleCurrent ? lookup.get(ineligibleCurrent) : undefined;

  return (
    <div>
      <select
        id={id}
        className="field"
        value={value ?? UNASSIGNED}
        disabled={disabled || directory.isLoading}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value === UNASSIGNED ? null : event.target.value)}
      >
        <option value={UNASSIGNED}>Unassigned</option>
        {ineligibleCurrent ? (
          <option value={ineligibleCurrent}>
            {ineligibleUser ? displayName(ineligibleUser) : shortId(ineligibleCurrent)}
          </option>
        ) : null}
        {options.map((user) => (
          <option key={user.id} value={user.id}>
            {displayName(user)}
          </option>
        ))}
      </select>
      {directory.isError ? (
        <p className="mt-2 text-[12px] text-ink-3">
          People list unavailable: {describeFailure(directory.error).detail}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-2 text-[12px] text-carmine" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
