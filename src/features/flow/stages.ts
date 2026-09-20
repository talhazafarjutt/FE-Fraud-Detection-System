/**
 * The platform, as one pipeline — and which parts of it the signed-in user
 * personally acts on.
 *
 * EVERYTHING HERE IS KEYED ON SCOPES, never on a role name. Scopes are what the
 * API actually enforces; a role name is a label that will drift from them the
 * first time a scope moves between roles. `scopes.includes('alerts:close')`
 * decides whether the Verdict stage is lit, and nothing else does.
 *
 * Dimmed stages stay visible on purpose. An analyst who cannot see the Verdict
 * stage at all concludes that concluding does not exist; one who sees it dimmed
 * with "a supervisor signs this off" understands the separation of duties.
 */

export type StageId =
  | 'transaction'
  | 'detection'
  | 'score'
  | 'alert'
  | 'case'
  | 'investigation'
  | 'verdict'
  | 'retraining'
  | 'audit';

export interface Stage {
  id: StageId;
  title: string;
  /** One line: what happens at this stage. */
  blurb: string;
  /** Scope required to act here. `null` = visible to everyone who can sign in. */
  scope: string | null;
  /** Where clicking goes, when the user holds the scope. */
  to?: string;
  /** Shown when the stage is dimmed — a reason, never a bare lock. */
  locked: string;
  /** Drawn below the main line rather than on it. */
  branch?: boolean;
}

export const STAGES: readonly Stage[] = [
  {
    id: 'transaction',
    title: 'Transaction',
    blurb: 'Money moves between two accounts. Most of it is ordinary — and seeing ordinary is how you recognise the rest.',
    scope: 'transactions:read',
    to: '/transactions',
    locked: 'Reading the ledger needs transactions:read.',
  },
  {
    id: 'detection',
    title: 'Detection',
    blurb: 'Four independent signals score it: model, rules, anomaly and network.',
    scope: 'alerts:read',
    to: '/alerts',
    locked: 'The signals live on the alert, which needs alerts:read.',
  },
  {
    id: 'score',
    title: 'Risk score',
    blurb: 'The four signals combine into one number, 0–100. A hard rule can set a floor regardless of the model.',
    scope: 'alerts:read',
    to: '/dashboard',
    locked: 'Scores are shown on alerts, which need alerts:read.',
  },
  {
    id: 'alert',
    title: 'Alert',
    blurb: 'One flagged transaction. One row, one movement of money.',
    scope: 'alerts:read',
    to: '/alerts',
    locked: 'Opening alerts needs alerts:read.',
  },
  {
    id: 'case',
    title: 'Case',
    blurb: 'The alerts of one scheme, grouped. A mule ring raises many alerts and makes exactly one case.',
    scope: 'alerts:read',
    to: '/cases',
    locked: 'Cases need alerts:read.',
  },
  {
    id: 'investigation',
    title: 'Investigation',
    blurb: 'Someone picks it up, reads the evidence, walks the network, and fixes the grouping if it is wrong.',
    scope: 'alerts:update',
    to: '/investigations',
    locked: 'Moving a case through review needs alerts:update.',
  },
  {
    id: 'verdict',
    title: 'Verdict',
    blurb: 'A second, separately-authorised person concludes it. Whoever investigates does not sign off.',
    scope: 'alerts:close',
    to: '/investigations',
    locked: 'Concluding requires a supervisor — alerts:close. This is four-eyes, not an oversight.',
  },
  {
    id: 'retraining',
    title: 'Retraining',
    blurb: 'The verdict becomes one training label for the whole scheme, not one per alert.',
    scope: 'feedback:export',
    locked: 'Exporting verdicts as training data needs feedback:export.',
  },
  {
    id: 'audit',
    title: 'Audit trail',
    blurb: 'Every state change, who made it and when — reconstructable years later.',
    scope: 'audit:read',
    to: '/audit',
    locked: 'The trail describes the analysts, so reading it needs audit:read.',
    branch: true,
  },
];

/* ------------------------------------------------------------------ *
 * What this user personally does
 * ------------------------------------------------------------------ */

export interface Capability {
  scope: string;
  /** Imperative, addressed to the user. */
  does: string;
  /** Why they cannot, when the scope is absent. Written as a fact, not a refusal. */
  cannot: string;
  /** Only listed as a restriction when absent AND worth explaining. */
  notableWhenAbsent: boolean;
}

export const CAPABILITIES: readonly Capability[] = [
  {
    scope: 'transactions:read',
    does: 'Browse the full ledger — every payment, flagged or not.',
    cannot: 'You cannot open the transaction ledger.',
    notableWhenAbsent: true,
  },
  {
    scope: 'alerts:read',
    does: 'Open a flagged transaction and read the four signals and rules behind its score.',
    cannot: 'You cannot open alerts, cases or the evidence behind a score.',
    notableWhenAbsent: true,
  },
  {
    scope: 'entities:read',
    does: 'Look up the person, company or account behind a movement, and who else signs on it.',
    cannot: 'You cannot look up the parties behind a transaction.',
    notableWhenAbsent: false,
  },
  {
    scope: 'alerts:read:all',
    does: 'See every team, not just your own.',
    cannot: 'You see one team only. The server filters this, not the screen.',
    notableWhenAbsent: true,
  },
  {
    scope: 'alerts:update',
    does: 'Pick a case up, move it through review, and attach or detach alerts the grouping got wrong.',
    cannot: 'You cannot change a case’s status or its membership.',
    notableWhenAbsent: false,
  },
  {
    scope: 'alerts:assign',
    does: 'Assign work to analysts.',
    cannot: 'You cannot assign work to other people.',
    notableWhenAbsent: false,
  },
  {
    scope: 'alerts:close',
    does: 'Conclude an investigation — label, confidence and model agreement, all required.',
    cannot:
      'You cannot conclude a case. Whoever investigates is deliberately not who signs it off.',
    notableWhenAbsent: true,
  },
  {
    scope: 'audit:read',
    does: 'Read the audit trail: who did what, when, from where.',
    cannot: 'You cannot read the audit trail. It records the analysts’ own actions.',
    notableWhenAbsent: false,
  },
  {
    scope: 'feedback:export',
    does: 'Pull recorded verdicts as training data for the next model.',
    cannot: 'You cannot export verdicts for retraining.',
    notableWhenAbsent: false,
  },
  {
    scope: 'users:manage',
    does: 'Create users, assign their roles, and deactivate accounts.',
    cannot: 'You cannot create or deactivate user accounts.',
    notableWhenAbsent: false,
  },
];

export function isLit(stage: Stage, scopes: readonly string[]): boolean {
  return stage.scope === null || scopes.includes(stage.scope);
}

/** What this user does, in pipeline order. */
export function capabilitiesFor(scopes: readonly string[]): Capability[] {
  return CAPABILITIES.filter((c) => scopes.includes(c.scope));
}

/** The restrictions worth explaining rather than silently enforcing. */
export function restrictionsFor(scopes: readonly string[]): Capability[] {
  return CAPABILITIES.filter((c) => c.notableWhenAbsent && !scopes.includes(c.scope));
}

/**
 * A one-line summary of the user's part in the flow, assembled from scopes.
 *
 * Three different scope sets produce three visibly different sentences without
 * anyone writing `if (role === 'ANALYST')`.
 */
export function roleSummary(scopes: readonly string[]): string {
  const has = (scope: string) => scopes.includes(scope);

  if (has('alerts:close')) {
    return 'You decide. You review what analysts prepare, conclude investigations, and your verdict becomes the training label for the whole scheme.';
  }
  if (has('alerts:update')) {
    return 'You investigate. You work alerts and cases for your team and hand them to a supervisor — you do not sign off your own work.';
  }
  if (has('users:manage')) {
    return 'You administer. You manage people and read the trail; the case files themselves are deliberately out of reach.';
  }
  if (has('alerts:read')) {
    return 'You observe. You can read alerts and cases but not move them.';
  }
  return 'Your account carries no investigative scopes yet.';
}
