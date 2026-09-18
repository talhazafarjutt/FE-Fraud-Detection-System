import { Link } from 'react-router-dom';
import { BackendPending } from '@/components/BackendPending';
import { Eyebrow } from '@/components/primitives';

export default function AuditLogPage() {
  return (
    <div className="space-y-8">
      <header className="border-b border-rule pb-6">
        <Eyebrow className="!mb-2">Audit log</Eyebrow>
        <h1 className="mb-4">Every action, across the platform</h1>
        <p className="max-w-2xl text-ink-2">
          Who did what, to which case, and when — searchable across the whole system.
        </p>
      </header>

      <BackendPending
        feature="auditLog"
        context="The platform is recording these events; it just does not expose a way to read them back."
      />

      <section className="border border-rule bg-surface p-6">
        <Eyebrow>What does work today</Eyebrow>
        <p className="max-w-2xl text-ink-2">
          Each alert carries its own complete history — every status change, the note attached to
          it, who made it and when. That trail is real and is shown on the alert itself. What is
          missing is the view across all of them at once.
        </p>
        <Link to="/alerts" className="btn btn--ghost mt-5">
          Go to alerts
        </Link>
      </section>
    </div>
  );
}
