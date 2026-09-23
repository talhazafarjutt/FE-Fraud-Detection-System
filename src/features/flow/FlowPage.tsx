import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { Eyebrow, Panel, SectionHeading, Tag } from '@/components/primitives';
import { teamLabel } from '@/lib/format';
import { FlowPipeline } from './FlowPipeline';
import { useFlowCounts } from './useFlowCounts';
import { capabilitiesFor, restrictionsFor, roleSummary } from './stages';
import { markIntroSeen } from './introState';
import { useIsDesktop } from '@/lib/useIsDesktop';

/**
 * "What am I supposed to do here?"
 *
 * A first-time user opens this console and sees nine nav items and a table of
 * numbers. Nothing on that screen explains what a case is, why alerts are
 * grouped, or which step belongs to them. This answers that in the product
 * rather than in a PDF nobody opens.
 */
export default function FlowPage() {
  const { scopes, session, hasScope } = useAuth();
  const { counts } = useFlowCounts();
  // Explainers start collapsed on a phone: the operational content is the
  // pipeline and the two scope lists, and a page of prose above them means
  // scrolling past the explanation every single visit.
  const isDesktop = useIsDesktop();

  // Reaching this screen is what counts as having seen it, so the landing route
  // stops redirecting here and sends the user to their own first screen instead.
  useEffect(() => {
    markIntroSeen(session?.subject ?? null);
  }, [session?.subject]);

  const capabilities = capabilitiesFor(scopes);
  const restrictions = restrictionsFor(scopes);
  const crossTeam = hasScope('alerts:read:all');

  return (
    <div className="space-y-10">
      <SectionHeading
        index="00"
        title="Your workflow"
        hint="How money becomes a case, and which part of it is yours. Derived from your token's scopes."
      />

      <Panel className="p-6">
        <Eyebrow>Where you sit</Eyebrow>
        <p className="max-w-3xl text-[17px] text-ink">{roleSummary(scopes)}</p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {/*
           * Naming the team matters. An analyst seeing zero of everything needs
           * to know they are looking at one team's work, not at a broken
           * screen — team-beta genuinely has no traffic in the seeded data.
           */}
          {crossTeam ? (
            <Tag title="alerts:read:all">Every team</Tag>
          ) : session?.team ? (
            <Tag title="The server filters your results to this team">
              {teamLabel(session.team)}
            </Tag>
          ) : null}
          {session?.email ? <Tag>{session.email}</Tag> : null}
        </div>

        {!crossTeam && session?.team ? (
          <p className="mt-4 max-w-2xl text-[13px] text-ink-3">
            You see <strong>{session.team}</strong> only. An empty list means no matching traffic,
            not a failure.
          </p>
        ) : null}
      </Panel>

      <section className="space-y-4">
        <Eyebrow>The pipeline</Eyebrow>
        <p className="max-w-3xl text-[14px] text-ink-2 md:text-[16px]">
          Lit stages are yours. Dimmed ones belong to someone else.
        </p>
        <FlowPipeline scopes={scopes} counts={counts} />
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <Eyebrow>What you do</Eyebrow>
          {capabilities.length === 0 ? (
            <p className="text-ink-2">
              Your account carries no investigative scopes. An administrator grants these per role.
            </p>
          ) : (
            <ol className="space-y-3">
              {capabilities.map((capability, index) => (
                <li key={capability.scope} className="flex gap-4 border-b border-rule-soft pb-3">
                  <span className="mono-label shrink-0 text-ink-3">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <p className="text-ink">{capability.does}</p>
                    <p className="mt-1 font-mono text-[11px] text-ink-3">{capability.scope}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section>
          <Eyebrow>What you cannot, and why</Eyebrow>
          {restrictions.length === 0 ? (
            <p className="text-ink-2">
              You hold every scope this console checks for. Nothing here is closed to you.
            </p>
          ) : (
            <ul className="space-y-3">
              {restrictions.map((restriction) => (
                <li key={restriction.scope} className="border-b border-rule-soft pb-3">
                  <p className="text-ink-2">{restriction.cannot}</p>
                  <p className="mt-1 font-mono text-[11px] text-ink-3">
                    needs {restriction.scope}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-5 max-w-xl text-[13px] text-ink-3">
            Not UI preferences — the server answers 403, or 404 across teams.
          </p>
        </section>
      </div>

      <Panel className="p-6">
        <details open={isDesktop}>
          <summary className="cursor-pointer list-none md:cursor-default">
            <Eyebrow className="!mb-0 inline">How a case actually gets solved</Eyebrow>
            <span className="ml-2 font-mono text-[11px] text-ink-3 md:hidden">tap to expand</span>
          </summary>
          <ol className="mt-5 grid gap-x-8 gap-y-4 md:grid-cols-2">
            {WALKTHROUGH.map((step, index) => (
              <li key={step.title} className="flex gap-4">
                <span className="mono-label shrink-0 text-ink-3">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div>
                  <p className="font-medium text-ink">{step.title}</p>
                  <p className="text-[13px] text-ink-2">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </details>
      </Panel>

      <p className="text-ink-3">
        <Link to="/dashboard" className="hover:text-ultra">
          ← Back to the dashboard
        </Link>
      </p>
    </div>
  );
}

/** The canonical walkthrough. Deliberately concrete rather than abstract. */
const WALKTHROUGH = [
  {
    title: 'An alert appears',
    body: 'A transfer scored 93 out of 100. The queue shows it, ranked by severity.',
  },
  {
    title: 'Open the case',
    body: 'It holds not one alert but nine — the same ring, already grouped for you.',
  },
  {
    title: 'Read why',
    body: 'Risk 93 = model 96, rule 100, anomaly 88, network 40. A hard rule fired: ORIGIN_ACCOUNT_DRAIN. Not a hunch — a specific tripwire.',
  },
  {
    title: 'Look at the network',
    body: 'Four accounts pay into one; that one pays a fifth; the fifth pays back the first. Fan-in, pass-through, and a cycle.',
  },
  {
    title: 'Check the entities',
    body: 'The receiving account was opened eleven days ago, and its holder signs on two others in the same ring.',
  },
  {
    title: 'Decide',
    body: 'Conclude as CONFIRMED_FRAUD, confidence HIGH, typology MULE_RING — recording what drove it and what was missing.',
  },
  {
    title: 'Supervisor review',
    body: 'Only a holder of alerts:close can conclude. Whoever investigated does not sign off.',
  },
  {
    title: 'It becomes validated labelled data',
    body: 'One label for the scheme, not nine. Nothing retrains automatically — the label is stored for review and controlled export.',
  },
] as const;
