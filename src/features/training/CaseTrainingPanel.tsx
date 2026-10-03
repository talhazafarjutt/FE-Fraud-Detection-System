import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getTrainingRecord, patchTrainingRecord } from '@/api/endpoints/training';
import type { TrainingRecordPatch } from '@/api/schemas/training';
import { Button, Eyebrow, Panel } from '@/components/primitives';
import { useToasts } from '@/components/Toasts';
import { formatRelative } from '@/lib/format';
import { describeFailure } from '@/lib/problem';
import { TrainingStatusChip } from './parts';

/**
 * "Should the model learn from this case?" — asked where the supervisor just
 * finished deciding it.
 *
 * Rendered only for holders of `training:manage`. The verdict above it is the
 * investigation's outcome; this is a second, separate judgement about whether
 * that outcome makes a good training example. A correct verdict on an unusual
 * case can still be a bad example.
 */
export function CaseTrainingPanel({ feedbackId }: { feedbackId: string }) {
  const queryClient = useQueryClient();
  const toast = useToasts();
  const [excluding, setExcluding] = useState(false);
  const [reason, setReason] = useState('');

  const record = useQuery({
    queryKey: ['training', 'record', feedbackId],
    queryFn: ({ signal }) => getTrainingRecord(feedbackId, signal),
  });

  const update = useMutation({
    mutationFn: (patch: TrainingRecordPatch) => patchTrainingRecord(feedbackId, patch),
    onSuccess: (updated) => {
      setExcluding(false);
      setReason('');
      void queryClient.invalidateQueries({ queryKey: ['training'] });
      toast.push({
        tone: 'success',
        title:
          updated.training_status === 'APPROVED'
            ? 'Approved for training.'
            : updated.training_status === 'EXCLUDED'
              ? 'Excluded from training.'
              : 'Sent back for review.',
        detail: 'Recorded in the audit trail.',
      });
    },
  });

  if (record.isPending || record.isError) {
    // The verdict panel above is the primary content; a failed training lookup
    // must not take over the case page. Show the error inline and small.
    return record.isError ? (
      <Panel className="p-4 text-[12px] text-ink-3">
        Training status unavailable: {describeFailure(record.error).detail}
      </Panel>
    ) : null;
  }

  const r = record.data;
  const status = String(r.training_status);
  const inconclusive = r.final_label === 'INCONCLUSIVE';

  return (
    <Panel className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Eyebrow className="!mb-1">Use for training? — supervisor only</Eyebrow>
          <p className="max-w-2xl text-[13px] text-ink-2">
            Concluding a case does not teach the model anything. You decide whether this verdict is
            a good example to train on.
          </p>
        </div>
        <TrainingStatusChip status={status} />
      </div>

      {r.training_note ? (
        <p className="mb-4 border-l-2 border-rule pl-3 text-[13px] text-ink-2">
          {r.training_note}
          {r.training_reviewed_at ? (
            <span className="ml-2 text-ink-3">— {formatRelative(r.training_reviewed_at)}</span>
          ) : null}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {status !== 'APPROVED' && !inconclusive ? (
          <Button
            disabled={update.isPending}
            onClick={() =>
              update.mutate({
                training_status: 'APPROVED',
                training_note: 'Approved from the case page after investigation.',
              })
            }
          >
            Approve for training
          </Button>
        ) : null}
        {status !== 'EXCLUDED' ? (
          <Button variant="ghost" disabled={update.isPending} onClick={() => setExcluding(true)}>
            Exclude…
          </Button>
        ) : null}
        {status !== 'CANDIDATE' && !inconclusive ? (
          <Button
            variant="ghost"
            disabled={update.isPending}
            onClick={() => update.mutate({ training_status: 'CANDIDATE' })}
          >
            Back to review
          </Button>
        ) : null}
        <Link
          to={`/training?review=${r.id}`}
          className="font-mono text-[11px] uppercase tracking-label text-ultra hover:underline"
        >
          Open in Training →
        </Link>
      </div>

      {inconclusive ? (
        <p className="mt-3 text-[12px] text-ink-3">
          An inconclusive verdict is not a label, so it cannot be trained on.
        </p>
      ) : null}

      {excluding ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            className="field max-w-xl"
            placeholder="Why this should not be trained on (required)"
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button
            variant="danger"
            disabled={!reason.trim() || update.isPending}
            onClick={() => update.mutate({ training_status: 'EXCLUDED', training_note: reason.trim() })}
          >
            Exclude
          </Button>
          <Button variant="ghost" onClick={() => setExcluding(false)}>
            Cancel
          </Button>
        </div>
      ) : null}

      {update.error ? (
        <p className="mt-3 border border-carmine px-3 py-2 text-carmine" role="alert">
          {describeFailure(update.error).detail}
        </p>
      ) : null}

      {status === 'APPROVED' ? (
        <p className="mt-4 text-[12px] text-ink-3">
          Approved records wait in Training until a supervisor selects them for a training run.
        </p>
      ) : null}
    </Panel>
  );
}
