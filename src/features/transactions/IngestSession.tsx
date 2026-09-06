import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { clientToken } from '@/api/endpoints/auth';
import { clientCredentialsSchema } from '@/api/schemas/auth';
import { type MachineSession, machineTokenStore } from '@/auth/machineTokenStore';
import { Button } from '@/components/primitives';
import { useToasts } from '@/components/Toasts';

/**
 * WHY THIS PANEL EXISTS
 *
 * `transactions:write` is held only by the INGEST_CLIENT machine client. No
 * human role carries it — analyst@ and supervisor@ both get 403 with
 * `required_scopes: ["transactions:write"]` from the running backend. Ingestion
 * is a machine integration, so it is presented as one: a separate, explicitly
 * labelled session, not a capability of the signed-in analyst.
 *
 * The credentials are typed by hand. They are never compiled into the bundle,
 * never read from a committed .env, and the resulting token is held in a store
 * that is kept apart from the human session.
 */
export function IngestSession({ onChange }: { onChange: (session: MachineSession | null) => void }) {
  const [session, setSession] = useState<MachineSession | null>(() => machineTokenStore.get());
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { push, pushError } = useToasts();

  useEffect(() => machineTokenStore.subscribe(setSession), []);
  useEffect(() => onChange(session), [session, onChange]);

  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = clientCredentialsSchema.safeParse({
        client_id: clientId.trim(),
        client_secret: clientSecret,
      });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'Credentials are not valid.');
      }
      const token = await clientToken(parsed.data);
      return machineTokenStore.set(token, parsed.data.client_id);
    },
    onSuccess: (opened) => {
      setClientSecret('');
      setError(null);
      push({
        tone: 'success',
        title: 'Ingest session open',
        detail: `${opened.clientId} — scopes: ${opened.scopes.join(', ')}.`,
      });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Could not open an ingest session.');
      pushError(err, 'Ingest session refused');
    },
  });

  if (session) {
    const minutesLeft = Math.max(0, Math.round((session.expiresAt - Date.now()) / 60_000));
    return (
      <div className="border border-ultra bg-surface">
        <div className="border-b border-rule bg-band px-6 py-3">
          <p className="mono-label text-on-band">
            Machine integration — not part of the analyst experience
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="tag">{session.clientId}</span>
            <span className="tag">{session.scopes.join(' · ')}</span>
            <span className="tag">Expires in {minutesLeft} min</span>
          </div>
          <Button variant="ghost" onClick={() => machineTokenStore.clear()}>
            Close ingest session
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-rule bg-surface">
      <div className="border-b border-rule bg-band px-6 py-3">
        <p className="mono-label text-on-band">
          Machine integration — not part of the analyst experience
        </p>
      </div>

      <div className="space-y-5 p-6">
        <p className="max-w-3xl text-ink-2">
          Ingestion is a service-to-service path. The scope it needs,{' '}
          <span className="font-mono text-[13px]">transactions:write</span>, is granted to the ingest
          client and to no human role — an analyst who submits this form receives a 403. Open a
          short-lived ingest session below to demonstrate the path end to end. Credentials are typed
          here and held in memory only.
        </p>

        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label htmlFor="client_id" className="mono-label mb-2 block text-ink-3">
              Client ID
            </label>
            <input
              id="client_id"
              className="field"
              autoComplete="off"
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="client_secret" className="mono-label mb-2 block text-ink-3">
              Client secret
            </label>
            <input
              id="client_secret"
              type="password"
              className="field"
              autoComplete="off"
              value={clientSecret}
              onChange={(event) => setClientSecret(event.target.value)}
            />
          </div>
        </div>

        {error ? (
          <p className="font-mono text-[11px] uppercase tracking-tag text-carmine">{error}</p>
        ) : null}

        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? 'Opening' : 'Open ingest session'}
        </Button>

        {import.meta.env.DEV ? (
          <p className="border-t border-rule-soft pt-4 text-[13px] text-ink-3">
            Local seed client: <span className="font-mono">ingest-loader</span> with secret{' '}
            <span className="font-mono">demo-ingest-secret-not-for-production</span>. Synthetic
            credentials for the local stack only.
          </p>
        ) : null}
      </div>
    </div>
  );
}
