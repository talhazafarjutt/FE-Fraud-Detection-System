import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { curateLabelledFeedback, getLabelledFeedback } from '@/api/endpoints/labelledFeedback';
import type { LabelledFeedbackPatch } from '@/api/schemas/labelledFeedback';
import { Button, Eyebrow, Panel } from '@/components/primitives';
import { useToasts } from '@/components/Toasts';
import { formatRelative } from '@/lib/format';
import { describeFailure } from '@/lib/problem';
import { UserName } from '@/features/users/UserName';
import { CurationStatusChip } from './parts';

/**
 * "Is this verdict fit to reuse as a label?" — asked where the supervisor just
 * finished deciding it.
 *
 * Rendered only for holders of `feedback:review`. The verdict above it is the
 * investigation's outcome; this is a second, separate judgement about whether
 * that outcome is a clear, representative label. A correct verdict on an
 * unusual case can still be a poor one.
 */
export function CaseCurationPanel({ feedbackId }: { feedbackId: string }) {
  const queryClient = useQueryClient();
  const toast = useToasts();
  const [excluding, setExcluding] = useState(false);
  const [reason, setReason] = useState('');
  const reasonId = useId();

  const record = useQuery({
    queryKey: ['labelled-feedback', 'record', feedbackId],
    queryFn: ({ signal }) => getLabelledFeedback(feedbackId, signal),
  });

  const update = useMutation({
    mutationFn: (patch: LabelledFeedbackPatch) => curateLabelledFeedback(feedbackId, patch),
    onSuccess: (updated) => {
      setExcluding(false);
      setReason('');
      void queryClient.invalidateQueries({ queryKey: ['labelled-feedback'] });
      toast.push({
        tone: 'success',
        title:
          updated.curation_status === 'VALIDATED'
            ? 'Validated.'
            : updated.curation_status === 'EXCLUDED'
              ? 'Excluded.'
              : 'Sent back for review.',
        detail: 'Recorded in the audit trail.',
      });
    },
  });

  if (record.isPending || record.isError) {
    // The verdict panel above is the primary content; a failed curation lookup
    // must not take over the case page. Show the error inline and small.
    return record.isError ? (
      <Panel className="p-4 text-[12px] text-ink-3">
        Curation status unavailable: {describeFailure(record.error).detail}
      </Panel>
    ) : null;
  }

  const r = record.data;
  const status = String(r.curation_status);
  const inconclusive = r.final_label === 'INCONCLUSIVE';

  return (
    <Panel className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Eyebrow className="!mb-1">Labelled feedback — supervisor only</Eyebrow>
          <p className="max-w-2xl text-[13px] text-ink-2">
            You decide whether this verdict is a clear label to export.
          </p>
        </div>
        <CurationStatusChip status={status} />
      </div>

      {r.curation_note ? (
        <p className="mb-4 border-l-2 border-rule pl-3 text-[13px] text-ink-2">
          {r.curation_note}
          {r.curated_by || r.curated_at ? (
            <span className="ml-2 text-ink-3">
              —{r.curated_by ? (
                <>
                  {' '}
                  <UserName id={r.curated_by} />
                </>
              ) : null}
              {r.curated_at ? ` ${formatRelative(r.curated_at)}` : null}
            </span>
          ) : null}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {status !== 'VALIDATED' && !inconclusive ? (
          <Button
            disabled={update.isPending}
            // Null clears a stale exclusion reason; no note is written for the supervisor.
            onClick={() => update.mutate({ curation_status: 'VALIDATED', curation_note: null })}
          >
            Validate
          </Button>
        ) : null}
        {status !== 'EXCLUDED' ? (
          <Button variant="ghost" disabled={update.isPending} onClick={() => setExcluding(true)}>
            Exclude…
          </Button>
        ) : null}
        {status !== 'PENDING' && !inconclusive ? (
          <Button
            variant="ghost"
            disabled={update.isPending}
            onClick={() => update.mutate({ curation_status: 'PENDING' })}
          >
            Back to review
          </Button>
        ) : null}
        <Link
          to={`/labelled-feedback?review=${r.id}`}
          className="font-mono text-[11px] uppercase tracking-label text-ultra hover:underline"
        >
          Open in Labelled Feedback →
        </Link>
      </div>

      {inconclusive ? (
        <p className="mt-3 text-[12px] text-ink-3">
          An inconclusive verdict is not a label, so it cannot be validated.
        </p>
      ) : null}

      {excluding ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label htmlFor={reasonId} className="mono-label w-full text-ink-3">
            Reason for excluding
          </label>
          <input
            id={reasonId}
            className="field max-w-xl"
            placeholder="Why this should not be exported (required)"
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button
            variant="danger"
            disabled={!reason.trim() || update.isPending}
            onClick={() =>
              update.mutate({ curation_status: 'EXCLUDED', curation_note: reason.trim() })
            }
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

      {status === 'VALIDATED' ? (
        <p className="mt-4 text-[12px] text-ink-3">
          Validated records wait in Labelled Feedback until a supervisor adds them to an export
          batch.
        </p>
      ) : null}
    </Panel>
  );
}
