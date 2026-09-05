import type { AlertStatus } from '@/api/schemas/common';

/**
 * The alert state machine, mirrored client-side so the UI only ever offers a
 * legal move. The server enforces the same table and remains the authority — a
 * 409 with `allowed_transitions` is still handled if the two ever disagree.
 */
export const TRANSITIONS: Record<AlertStatus, readonly AlertStatus[]> = {
  OPEN: ['IN_REVIEW', 'ESCALATED', 'FALSE_POSITIVE'],
  IN_REVIEW: ['ESCALATED', 'CONFIRMED_FRAUD', 'FALSE_POSITIVE', 'OPEN'],
  ESCALATED: ['CONFIRMED_FRAUD', 'FALSE_POSITIVE'],
  CONFIRMED_FRAUD: ['CLOSED', 'OPEN', 'IN_REVIEW'],
  FALSE_POSITIVE: ['CLOSED', 'OPEN', 'IN_REVIEW'],
  CLOSED: ['OPEN', 'IN_REVIEW'],
};

/** Statuses that end a case. Moving to one of these requires alerts:close. */
const TERMINAL: readonly AlertStatus[] = ['CLOSED', 'CONFIRMED_FRAUD', 'FALSE_POSITIVE'];

/** Statuses a case can be reopened from — reopening also requires alerts:close. */
const CLOSED_LIKE: readonly AlertStatus[] = ['CLOSED', 'CONFIRMED_FRAUD', 'FALSE_POSITIVE'];

export interface TransitionOption {
  to: AlertStatus;
  allowed: boolean;
  /**
   * Why the move is unavailable. Shown to the user verbatim — a disabled
   * control that does not say why is just a dead end.
   */
  reason?: string;
}

export function isKnownStatus(status: string): status is AlertStatus {
  return status in TRANSITIONS;
}

/**
 * Legal moves from `from`, each annotated with whether the caller's scopes
 * permit it. Illegal moves are omitted entirely; legal-but-ungated moves are
 * returned as `allowed: false` with a reason, so the UI can show the gate
 * rather than hide the capability.
 */
export function transitionsFor(
  from: string,
  scopes: readonly string[],
): readonly TransitionOption[] {
  if (!isKnownStatus(from)) return [];

  const canClose = scopes.includes('alerts:close');
  const canUpdate = scopes.includes('alerts:update');
  const reopening = CLOSED_LIKE.includes(from);

  return TRANSITIONS[from].map((to) => {
    if (!canUpdate) {
      return { to, allowed: false, reason: 'Updating a case requires an analyst role.' };
    }
    if (reopening && !canClose) {
      return { to, allowed: false, reason: 'Reopening a closed case requires a supervisor.' };
    }
    if (TERMINAL.includes(to) && !canClose) {
      return { to, allowed: false, reason: 'Closing requires a supervisor.' };
    }
    return { to, allowed: true };
  });
}
