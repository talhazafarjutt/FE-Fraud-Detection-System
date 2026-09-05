import { useCallback, useRef, useState } from 'react';
import { FormProvider, useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createTransaction } from '@/api/endpoints/transactions';
import {
  type TransactionFormParsed,
  type TransactionFormValues,
  transactionFormSchema,
} from '@/api/schemas/transactions';
import type { MachineSession } from '@/auth/machineTokenStore';
import { Button, EmptyState, Eyebrow } from '@/components/primitives';
import { useToasts } from '@/components/Toasts';
import { formatAbsolute, shortId } from '@/lib/format';
import { AccountFields } from './AccountFields';
import { IngestSession } from './IngestSession';
import { Field, FormSection } from './fields';
import { buildTransactionPayload } from './payload';
import { EMPTY_FORM, SAMPLES } from './samples';
import { SubmissionResult, type Submission } from './SubmissionResult';

const TRANSACTION_TYPES = ['TRANSFER', 'CASH_OUT', 'CASH_IN', 'PAYMENT', 'DEBIT'] as const;

export default function TransactionsPage() {
  const queryClient = useQueryClient();
  const { push, pushError } = useToasts();

  // transactions:write belongs to the ingest client, not to any human role, so
  // submission is gated on an open machine session rather than on user scopes.
  const [ingest, setIngest] = useState<MachineSession | null>(null);
  const canWrite = ingest !== null;

  // There is no list-transactions endpoint on the backend, so this list is
  // what THIS browser session submitted. It is in memory and clears on reload;
  // we do not pretend it is a global ledger.
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [replayingKey, setReplayingKey] = useState<string | null>(null);

  // One Idempotency-Key per logical submit, reused across retries of that
  // submit — that is the whole point of the header.
  const idempotencyKey = useRef<string>(crypto.randomUUID());

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: EMPTY_FORM,
    mode: 'onBlur',
  });

  const {
    register,
    control,
    handleSubmit,
    reset,
    getValues,
    formState: { errors, isSubmitting },
  } = form;

  const metadata = useFieldArray({ control, name: 'metadata' });

  const submitMutation = useMutation({
    mutationFn: async (input: {
      values: TransactionFormParsed;
      key: string;
      bearer: string | undefined;
    }) => {
      const body = buildTransactionPayload(input.values);
      return createTransaction(body, input.key, input.bearer);
    },
    onSuccess: (response, input) => {
      setSubmissions((current) => [
        {
          key: `${input.key}-${response.status}-${Date.now()}`,
          idempotencyKey: input.key,
          reference: input.values.external_ref || shortId(response.data.transaction_id),
          status: response.status,
          replayed: response.replayed,
          result: response.data,
          submittedAt: formatAbsolute(new Date().toISOString()),
        },
        ...current,
      ]);

      if (response.replayed) {
        push({
          tone: 'info',
          title: 'Idempotent replay',
          detail: 'The original result was returned. No duplicate was created.',
        });
      } else {
        push({
          tone: 'success',
          title: response.status === 202 ? 'Stored, scoring pending' : 'Stored and scored',
          detail: `Transaction ${shortId(response.data.transaction_id)}.`,
        });
        // A new alert may have been raised — let the queue pick it up.
        void queryClient.invalidateQueries({ queryKey: ['alerts', 'list'] });
      }
    },
    onError: (error) => pushError(error, 'The transaction was not accepted'),
    onSettled: () => setReplayingKey(null),
  });

  const onSubmit = handleSubmit((values) => {
    // A fresh logical submit gets a fresh key.
    idempotencyKey.current = crypto.randomUUID();
    submitMutation.mutate({
      values: values as TransactionFormParsed,
      key: idempotencyKey.current,
      bearer: ingest?.accessToken,
    });
  });

  const replay = useCallback(
    (submission: Submission) => {
      const parsed = transactionFormSchema.safeParse(getValues());
      if (!parsed.success) {
        pushError(
          new Error('The form no longer passes validation, so it cannot be replayed.'),
          'Replay unavailable',
        );
        return;
      }
      setReplayingKey(submission.idempotencyKey);
      // Same key, same body — this is the retry the Idempotency-Key exists for.
      submitMutation.mutate({
        values: parsed.data,
        key: submission.idempotencyKey,
        bearer: ingest?.accessToken,
      });
    },
    [getValues, pushError, submitMutation, ingest],
  );

  const loadSample = (sampleId: string) => {
    const sample = SAMPLES.find((entry) => entry.id === sampleId);
    if (!sample) return;
    reset(sample.build());
    push({ tone: 'info', title: 'Sample loaded', detail: sample.summary });
  };

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-rule pb-6">
        <div>
          <Eyebrow className="!mb-2">Transactions</Eyebrow>
          <h1>Submit a transaction</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="mono-label text-ink-3" htmlFor="sample">
            Load sample
          </label>
          <select
            id="sample"
            className="field w-auto"
            defaultValue=""
            onChange={(event) => {
              loadSample(event.target.value);
              event.target.value = '';
            }}
          >
            <option value="" disabled>
              Choose a scenario
            </option>
            {SAMPLES.map((sample) => (
              <option key={sample.id} value={sample.id}>
                {sample.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      <IngestSession onChange={setIngest} />

      <FormProvider {...form}>
        <form onSubmit={onSubmit} noValidate className="space-y-10">
          <FormSection
            index="01"
            title="Movement"
            description="Amounts are held as decimal strings end to end. They are never converted to a floating-point number."
          >
            <div className="grid gap-6 md:grid-cols-3">
              <Field label="External reference" htmlFor="external_ref" error={errors.external_ref}>
                <input id="external_ref" className="field" {...register('external_ref')} />
              </Field>

              <Field label="Amount" htmlFor="amount" error={errors.amount}>
                <input
                  id="amount"
                  inputMode="decimal"
                  className="field text-right"
                  placeholder="0.00"
                  aria-invalid={errors.amount ? 'true' : 'false'}
                  {...register('amount')}
                />
              </Field>

              <Field
                label="Currency"
                htmlFor="currency"
                error={errors.currency}
                hint="AED is the only accepted currency."
              >
                <input
                  id="currency"
                  className="field uppercase"
                  maxLength={3}
                  {...register('currency')}
                />
              </Field>

              <Field
                label="Booked at"
                htmlFor="booked_at"
                error={errors.booked_at}
                hint="No more than 5 minutes in the future."
              >
                <input
                  id="booked_at"
                  type="datetime-local"
                  className="field"
                  {...register('booked_at')}
                />
              </Field>

              <Field label="Type" htmlFor="transaction_type" error={errors.transaction_type}>
                <select id="transaction_type" className="field" {...register('transaction_type')}>
                  {TRANSACTION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="MCC" htmlFor="mcc" error={errors.mcc}>
                <input
                  id="mcc"
                  inputMode="numeric"
                  className="field text-right"
                  placeholder="6011"
                  {...register('mcc')}
                />
              </Field>

              <Field
                label="Sender balance before"
                htmlFor="sender_balance_before"
                error={errors.sender_balance_before}
                hint="Required — one of the model's strongest features."
              >
                <input
                  id="sender_balance_before"
                  inputMode="decimal"
                  className="field text-right"
                  placeholder="0.00"
                  {...register('sender_balance_before')}
                />
              </Field>

              <Field
                label="Receiver balance before"
                htmlFor="receiver_balance_before"
                error={errors.receiver_balance_before}
                hint="Required — a silent zero would corrupt the score."
              >
                <input
                  id="receiver_balance_before"
                  inputMode="decimal"
                  className="field text-right"
                  placeholder="0.00"
                  {...register('receiver_balance_before')}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection index="02" title="Source" description="Where the money leaves from.">
            <AccountFields side="source_account" />
          </FormSection>

          <FormSection index="03" title="Destination" description="Where the money arrives.">
            <AccountFields side="destination_account" />
          </FormSection>

          <FormSection
            index="04"
            title="Context"
            description="Free-form metadata. At most 25 entries; keys 64 characters, values 512."
          >
            <div className="space-y-3">
              {metadata.fields.map((entry, index) => (
                <div key={entry.id} className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[180px] flex-1">
                    <label
                      className="mono-label mb-2 block text-ink-3"
                      htmlFor={`metadata.${index}.key`}
                    >
                      Key
                    </label>
                    <input
                      id={`metadata.${index}.key`}
                      className="field"
                      {...register(`metadata.${index}.key`)}
                    />
                  </div>
                  <div className="min-w-[180px] flex-[2]">
                    <label
                      className="mono-label mb-2 block text-ink-3"
                      htmlFor={`metadata.${index}.value`}
                    >
                      Value
                    </label>
                    <input
                      id={`metadata.${index}.value`}
                      className="field"
                      {...register(`metadata.${index}.value`)}
                    />
                  </div>
                  <Button variant="ghost" onClick={() => metadata.remove(index)}>
                    Remove
                  </Button>
                </div>
              ))}

              {errors.metadata?.message ? (
                <p className="font-mono text-[11px] uppercase tracking-tag text-carmine">
                  {errors.metadata.message}
                </p>
              ) : null}

              <Button
                variant="ghost"
                onClick={() => metadata.append({ key: '', value: '' })}
                disabled={metadata.fields.length >= 25}
              >
                Add metadata
              </Button>
            </div>
          </FormSection>

          <div className="flex flex-wrap items-center gap-4 border-t border-rule pt-8">
            <Button
              type="submit"
              disabled={!canWrite || isSubmitting || submitMutation.isPending}
              title={canWrite ? undefined : 'Submitting requires an open ingest session.'}
            >
              {submitMutation.isPending ? 'Submitting' : 'Submit transaction'}
            </Button>
            {!canWrite ? (
              <p className="font-mono text-[11px] uppercase tracking-tag text-amber">
                Open an ingest session to submit.
              </p>
            ) : null}
            <Button variant="ghost" onClick={() => reset(EMPTY_FORM)}>
              Reset form
            </Button>
          </div>
        </form>
      </FormProvider>

      <section className="space-y-6 border-t border-rule pt-10">
        <div>
          <Eyebrow className="!mb-2">Submitted this session</Eyebrow>
          <p className="max-w-2xl text-ink-2">
            The platform exposes no list-transactions endpoint, so this list covers only what this
            browser session submitted. It is held in memory and clears on reload.
          </p>
        </div>

        {submissions.length === 0 ? (
          <EmptyState
            title="Nothing submitted yet"
            body="Load a sample scenario and submit it to see the scoring path end to end."
          />
        ) : (
          <div className="space-y-6">
            {submissions.map((submission) => (
              <SubmissionResult
                key={submission.key}
                submission={submission}
                onReplay={() => replay(submission)}
                replayPending={replayingKey === submission.idempotencyKey}
              />
            ))}
          </div>
        )}

        <p className="text-[14px] text-ink-3">
          Cases raised by these submissions appear in the{' '}
          <Link to="/alerts" className="text-ultra hover:text-ultra-lift">
            alert queue
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
