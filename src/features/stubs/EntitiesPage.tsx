import { BackendPending } from '@/components/BackendPending';
import { Eyebrow } from '@/components/primitives';

export default function EntitiesPage() {
  return (
    <div className="space-y-8">
      <header className="border-b border-rule pb-6">
        <Eyebrow className="!mb-2">Entities</Eyebrow>
        <h1 className="mb-4">People, companies and accounts</h1>
        <p className="max-w-2xl text-ink-2">
          The parties behind a transaction — who holds an account, which company is registered
          against it, and everything they have moved.
        </p>
      </header>
      <BackendPending
        feature="entities"
        context="The records exist in the database; there is simply no route that returns them."
      />
    </div>
  );
}
