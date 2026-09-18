import { Link } from 'react-router-dom';
import { BackendPending } from '@/components/BackendPending';
import { Eyebrow } from '@/components/primitives';

/**
 * Cases and Investigations are the same object seen two ways: Cases is all of
 * them, Investigations is the ones actively being worked. Both depend on
 * /v1/cases, which is not deployed, so both render the same pending panel with
 * different framing rather than pretending one of them works.
 */
export default function CasesPage({ investigationsOnly = false }: { investigationsOnly?: boolean }) {
  return (
    <div className="space-y-8">
      <header className="border-b border-rule pb-6">
        <Eyebrow className="!mb-2">{investigationsOnly ? 'Investigations' : 'Cases'}</Eyebrow>
        <h1 className="mb-4">
          {investigationsOnly ? 'What the team is working now' : 'One scheme, one case'}
        </h1>
        <p className="max-w-2xl text-ink-2">
          {investigationsOnly
            ? 'Cases currently in review or escalated — the active workload, rather than the full history.'
            : 'Alerts that belong to the same scheme are grouped into a single case, so a nine-alert mule ring is investigated once and judged once.'}
        </p>
      </header>

      <BackendPending
        feature="cases"
        context={
          investigationsOnly
            ? 'Filtering to the active ones needs the same case endpoint as the full list.'
            : 'Alerts are visible individually today; what is missing is the grouping that turns them into one investigation.'
        }
      />

      <section className="border border-rule bg-surface p-6">
        <Eyebrow>What does work today</Eyebrow>
        <p className="max-w-2xl text-ink-2">
          Every alert can be opened, triaged and moved through its own workflow. Until cases exist,
          each alert is worked on its own rather than grouped with the others from the same scheme.
        </p>
        <Link to="/alerts" className="btn btn--ghost mt-5">
          Go to the alert queue
        </Link>
      </section>
    </div>
  );
}
