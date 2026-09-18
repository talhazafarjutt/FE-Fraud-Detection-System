/**
 * Capabilities the console is designed for that the deployed API cannot serve.
 *
 * Every entry was verified against the live backend on the date below — none of
 * this is assumed from a spec. When an endpoint ships, delete its entry here and
 * the compiler points at every screen that needs wiring up.
 *
 * The rule this enforces: a screen that silently renders fabricated data is
 * worse than one that says "not available yet", because it gets demoed to a
 * client as if it were real.
 */

export const VERIFIED_AT = '2026-09-10';
export const API_ORIGIN = 'https://fraud-detection-system-fmh3.onrender.com';

export interface MissingCapability {
  /** Short label for the panel heading. */
  readonly title: string;
  /** The endpoint(s) this needs, exactly as they would be called. */
  readonly endpoints: readonly string[];
  /** What was observed when we called it. */
  readonly observed: string;
  /** What the user would be able to do once it exists. */
  readonly unlocks: string;
}

export const NOT_IMPLEMENTED = {
  /** §3.1 — parties, persons, companies and accounts exist in the database. */
  entities: {
    title: 'Entity records',
    endpoints: ['GET /v1/entities', 'GET /v1/entities/{id}', 'GET /v1/entities/{id}/transactions'],
    observed: 'No entity route is present in the API schema.',
    unlocks:
      'Looking up the person, company or account behind a transaction, and every movement they are party to.',
  },

  /** §3.2 — no traversable graph. */
  networkExplorer: {
    title: 'Network explorer',
    endpoints: ['GET /v1/network/{entity_id}', 'GET /v1/network/expand'],
    observed: 'No graph route exists. Nothing is traversable beyond a single alert.',
    unlocks:
      'Walking outward from an account to the ring around it, one hop at a time.',
  },

  /** §3.3 — the backend writes audit records but exposes no read endpoint. */
  auditLog: {
    title: 'Audit log',
    endpoints: ['GET /v1/audit'],
    observed: 'Audit records are written server-side but no read route is exposed.',
    unlocks:
      'A searchable record of every action taken across the platform, not just one alert at a time.',
  },

  /**
   * NOT in the original missing list — the V1 spec presents these as available.
   * They are not: every /v1/cases route returns 404 against the deployed API,
   * confirmed by both the OpenAPI schema and live calls.
   *
   * This is the investigation layer: grouping the alerts of one scheme, and
   * holding the single verdict for that scheme.
   */
  cases: {
    title: 'Cases and investigations',
    endpoints: [
      'GET /v1/cases',
      'GET /v1/cases/{id}',
      'PATCH /v1/cases/{id}',
      'POST /v1/cases/{id}/alerts',
      'DELETE /v1/cases/{id}/alerts/{alert_id}',
    ],
    observed: 'All five routes return 404. No case route appears in the API schema.',
    unlocks:
      'Grouping the alerts of one scheme into a single investigation, and editing which alerts belong to it.',
  },

  /**
   * The verdict itself. Split from `cases` because it is the capability the
   * close button depends on, and it is what a supervisor actually asks for.
   */
  caseVerdict: {
    title: 'Recording a verdict',
    endpoints: ['PATCH /v1/cases/{id} with a feedback block'],
    observed:
      'The case route does not exist, and the alert route now rejects a feedback block with 422 — the verdict has moved but its new home is not deployed.',
    unlocks:
      'Concluding an investigation once for the whole scheme, and feeding that judgement back as a training label.',
  },

  /** Retraining pull. Also absent despite being listed as available. */
  feedbackExport: {
    title: 'Feedback export',
    endpoints: ['GET /v1/feedback/export'],
    observed: 'Returns 404. No feedback:export scope is granted on any seeded account either.',
    unlocks: 'Pulling recorded verdicts as training data for the next model.',
  },
} as const satisfies Record<string, MissingCapability>;

export type MissingFeature = keyof typeof NOT_IMPLEMENTED;
