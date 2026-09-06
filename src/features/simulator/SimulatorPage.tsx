import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { requestData } from '@/api/client';
import { clientToken } from '@/api/endpoints/auth';
import { clientCredentialsSchema } from '@/api/schemas/auth';
import { type ScorePushInput, scorePushResultSchema, scorePushSchema } from '@/api/schemas/scores';
import { Button, Eyebrow } from '@/components/primitives';
import { useToasts } from '@/components/Toasts';
import { shortId } from '@/lib/format';

/**
 * Machine-integration harness. Reachable only when VITE_ENABLE_SIMULATOR is
 * 'true' at build time, so it is tree-shaken out of a production bundle
 * entirely (see routes/router.tsx).
 *
 * Nothing here is part of the analyst experience. Credentials are typed by
 * hand and held only for the life of this page — no secret is compiled into
 * the bundle or read from a committed .env.
 */
export default function SimulatorPage() {
  const [token, setToken] = useState<{ value: string; scopes: string[]; clientId: string } | null>(
    null,
  );
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const { push, pushError } = useToasts();

  const auth = useMutation({
    mutationFn: async () => {
      const parsed = clientCredentialsSchema.parse({
        client_id: clientId.trim(),
        client_secret: clientSecret,
      });
      const response = await clientToken(parsed);
      return { value: response.access_token, scopes: response.scopes, clientId: parsed.client_id };
    },
    onSuccess: (result) => {
      setToken(result);
      setClientSecret('');
      push({
        tone: 'success',
        title: 'Machine token issued',
        detail: `${result.clientId}: ${result.scopes.join(', ')}.`,
      });
    },
    onError: (error) => pushError(error, 'Client credentials refused'),
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ScorePushInput>({
    resolver: zodResolver(scorePushSchema),
    defaultValues: {
      transaction_id: '',
      fraud_probability: 0.85,
      risk_level: 'HIGH',
      decision: 'REVIEW',
      model_name: 'fraud-model',
      model_version: 'sim-v1',
      latency_ms: 40,
    },
  });

  const pushScore = useMutation({
    mutationFn: (input: ScorePushInput) =>
      requestData('/v1/scores', {
        method: 'POST',
        body: input,
        schema: scorePushResultSchema,
        bearerOverride: token?.value ?? '',
      }),
    onSuccess: (result) => {
      push({
        tone: 'success',
        title: 'Score accepted',
        detail: result.alert_id
          ? `Alert ${shortId(result.alert_id)} raised.`
          : 'No alert was raised for this score.',
      });
    },
    onError: (error) => pushError(error, 'The score was not accepted'),
  });

  return (
    <div className="space-y-10">
      <div className="border border-carmine bg-surface">
        <div className="bg-band px-6 py-4">
          <p className="mono-label text-on-band">
            Machine integration — not part of the analyst experience
          </p>
        </div>
        <p className="px-6 py-5 text-ink-2">
          This screen exercises the service-to-service paths: client-credentials tokens and the ML
          service&apos;s score push. It exists for integration testing and is excluded from
          production builds.
        </p>
      </div>

      <section className="space-y-6">
        <Eyebrow className="!mb-0">01 — Client credentials</Eyebrow>
        <div className="grid max-w-3xl gap-5 md:grid-cols-2">
          <div>
            <label htmlFor="sim_client_id" className="mono-label mb-2 block text-ink-3">
              Client ID
            </label>
            <input
              id="sim_client_id"
              className="field"
              autoComplete="off"
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="sim_client_secret" className="mono-label mb-2 block text-ink-3">
              Client secret
            </label>
            <input
              id="sim_client_secret"
              type="password"
              className="field"
              autoComplete="off"
              value={clientSecret}
              onChange={(event) => setClientSecret(event.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => auth.mutate()} disabled={auth.isPending}>
            {auth.isPending ? 'Requesting' : 'Request machine token'}
          </Button>
          {token ? (
            <>
              <span className="tag">{token.clientId}</span>
              <span className="tag">{token.scopes.join(' · ')}</span>
            </>
          ) : null}
        </div>

        {import.meta.env.DEV ? (
          <p className="text-[13px] text-ink-3">
            Local seed clients: <span className="font-mono">ingest-loader</span> and{' '}
            <span className="font-mono">ml-service</span>. Secrets are in the project README for the
            local stack only.
          </p>
        ) : null}
      </section>

      <section className="space-y-6 border-t border-rule pt-10">
        <div>
          <Eyebrow className="!mb-2">02 — Push a score</Eyebrow>
          <p className="max-w-2xl text-ink-2">
            The path the ML service uses. Requires the{' '}
            <span className="font-mono text-[13px]">scores:write</span> scope, held by{' '}
            <span className="font-mono text-[13px]">ml-service</span>.
          </p>
        </div>

        <form
          onSubmit={handleSubmit((values) => pushScore.mutate(values))}
          noValidate
          className="grid max-w-3xl gap-5 md:grid-cols-2"
        >
          <div className="md:col-span-2">
            <label htmlFor="transaction_id" className="mono-label mb-2 block text-ink-3">
              Transaction ID
            </label>
            <input id="transaction_id" className="field" {...register('transaction_id')} />
            {errors.transaction_id ? (
              <p className="mt-2 font-mono text-[11px] uppercase tracking-tag text-carmine">
                {errors.transaction_id.message}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="fraud_probability" className="mono-label mb-2 block text-ink-3">
              Fraud probability
            </label>
            <input
              id="fraud_probability"
              type="number"
              step="0.01"
              min={0}
              max={1}
              className="field text-right"
              {...register('fraud_probability')}
            />
          </div>

          <div>
            <label htmlFor="risk_level" className="mono-label mb-2 block text-ink-3">
              Risk level
            </label>
            <select id="risk_level" className="field" {...register('risk_level')}>
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
            </select>
          </div>

          <div>
            <label htmlFor="decision" className="mono-label mb-2 block text-ink-3">
              Decision
            </label>
            <select id="decision" className="field" {...register('decision')}>
              <option value="ALLOW">ALLOW</option>
              <option value="REVIEW">REVIEW</option>
              <option value="BLOCK">BLOCK</option>
            </select>
          </div>

          <div>
            <label htmlFor="model_version" className="mono-label mb-2 block text-ink-3">
              Model version
            </label>
            <input id="model_version" className="field" {...register('model_version')} />
          </div>

          <div className="md:col-span-2">
            <Button type="submit" disabled={!token || pushScore.isPending}>
              {pushScore.isPending ? 'Pushing' : 'Push score'}
            </Button>
            {!token ? (
              <p className="mt-2 font-mono text-[11px] uppercase tracking-tag text-amber">
                Request a machine token first.
              </p>
            ) : null}
          </div>
        </form>
      </section>
    </div>
  );
}
