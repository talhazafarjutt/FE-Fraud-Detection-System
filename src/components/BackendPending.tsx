import { NOT_IMPLEMENTED, VERIFIED_AT, type MissingFeature } from '@/api/unavailable';
import { Eyebrow } from './primitives';

/**
 * The one way this console says "not built yet".
 *
 * No spinner, no skeleton, no placeholder rows — those all read as "loading" or,
 * worse, as real data. This states plainly what is missing, what was observed
 * when we called for it, and what it would unlock, so a viewer can tell the
 * difference between a gap and a fault.
 */
export function BackendPending({
  feature,
  context,
}: {
  feature: MissingFeature;
  /** Optional line about where the user is, e.g. which alert they came from. */
  context?: string;
}) {
  const missing = NOT_IMPLEMENTED[feature];

  return (
    <section className="border border-amber bg-surface">
      <div className="border-b border-rule px-6 py-4">
        <Eyebrow className="!mb-0 text-amber">Needs a backend endpoint</Eyebrow>
      </div>

      <div className="space-y-5 p-6">
        <div>
          <h2 className="mb-2">{missing.title}</h2>
          <p className="max-w-2xl text-ink-2">{missing.unlocks}</p>
          {context ? <p className="mt-2 max-w-2xl text-[14px] text-ink-3">{context}</p> : null}
        </div>

        <div className="border-t border-rule-soft pt-5">
          <p className="mono-label mb-3 text-ink-3">Waiting on</p>
          <ul className="space-y-1">
            {missing.endpoints.map((endpoint) => (
              <li key={endpoint} className="font-mono text-[12px] text-ink">
                {endpoint}
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-rule-soft pt-5">
          <p className="mono-label mb-2 text-ink-3">What we observed</p>
          <p className="max-w-2xl text-[14px] text-ink-2">{missing.observed}</p>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-tag text-ink-3">
            Checked against the deployed API on {VERIFIED_AT}
          </p>
        </div>

        {/*
          Deliberately no retry button. Retrying cannot help — the route does not
          exist — and offering one would imply this is a transient failure.
        */}
        <p className="border-t border-rule-soft pt-5 text-[13px] leading-relaxed text-ink-3">
          Nothing is shown here rather than a placeholder, so this screen is never mistaken for
          real data.
        </p>
      </div>
    </section>
  );
}
