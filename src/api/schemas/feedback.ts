/**
 * Statuses that are a verdict. A verdict belongs to the case, recorded with
 * its feedback block on `PATCH /v1/cases/{id}`; the alert endpoint refuses it.
 */
const TERMINAL_STATUSES = ['CONFIRMED_FRAUD', 'FALSE_POSITIVE'] as const;

export function isTerminalStatus(status: string): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}
