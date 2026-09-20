/**
 * "Show the workflow once, then get out of the way."
 *
 * WHY THIS IS IN MEMORY RATHER THAN localStorage
 *
 * The obvious implementation is a per-user key in localStorage. It is not worth
 * it here. Tokens in this console live in memory only, so a page reload already
 * signs the user out — which means an in-memory marker behaves identically to a
 * persisted one for the entire life of a session, and the only difference is on
 * a fresh sign-in.
 *
 * What a persisted marker WOULD add is a list of user ids sitting in
 * localStorage on a possibly shared workstation, readable by any injected
 * script, recording who has signed in on this machine. That is a real if small
 * leak, traded for skipping one help screen on the second login of the day.
 * Not a good trade for a financial-crime product, so: in memory.
 *
 * The practical effect: the full-screen introduction opens once per sign-in,
 * and the dashboard panel stays collapsed for the rest of that session.
 */

const seen = new Set<string>();
let panelCollapsed = false;

const keyFor = (subject: string | null) => subject ?? 'anonymous';

/**
 * Should this user be shown the workflow view first?
 *
 * PURE ON PURPOSE. This used to claim the visit as a side effect of being
 * called, which broke under StrictMode: the landing route renders twice in
 * development, the first call said "yes" and the second said "no", and the two
 * redirects raced — the introduction never appeared. Asking and recording are
 * now two separate operations.
 */
export function shouldShowIntro(subject: string | null): boolean {
  return !seen.has(keyFor(subject));
}

/** Record that the view has been shown. Idempotent, so an effect may re-run. */
export function markIntroSeen(subject: string | null): void {
  seen.add(keyFor(subject));
}

export function isPanelCollapsed(): boolean {
  return panelCollapsed;
}

export function setPanelCollapsed(value: boolean): void {
  panelCollapsed = value;
}

/** Test-only: forget everything so cases do not leak into each other. */
export function __resetIntroState(): void {
  seen.clear();
  panelCollapsed = false;
}
