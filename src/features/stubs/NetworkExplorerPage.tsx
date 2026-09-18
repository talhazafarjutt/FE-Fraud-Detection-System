import { Link } from 'react-router-dom';
import { BackendPending } from '@/components/BackendPending';
import { Eyebrow } from '@/components/primitives';

export default function NetworkExplorerPage() {
  return (
    <div className="space-y-8">
      <header className="border-b border-rule pb-6">
        <Eyebrow className="!mb-2">Network explorer</Eyebrow>
        <h1 className="mb-4">The ring around an account</h1>
        <p className="max-w-2xl text-ink-2">
          Walking outward from one account to the accounts it moves money with, a hop at a time.
        </p>
      </header>

      <BackendPending
        feature="networkExplorer"
        context="A global explorer needs an endpoint that returns the next hop. There is none, so clicking a node could not go anywhere."
      />

      <section className="border border-rule bg-surface p-6">
        <Eyebrow>What does work today</Eyebrow>
        <p className="max-w-2xl text-ink-2">
          An individual alert can carry the neighbourhood immediately around it, and where the risk
          engine has supplied one it is drawn on that alert&apos;s own page. It is a snapshot for
          that alert, not a graph you can travel.
        </p>
        <Link to="/alerts" className="btn btn--ghost mt-5">
          Go to alerts
        </Link>
      </section>
    </div>
  );
}
