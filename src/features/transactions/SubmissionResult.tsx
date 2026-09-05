import { Link } from 'react-router-dom';
import type { TransactionCreated } from '@/api/schemas/transactions';
import { BandChip, SeverityChip, StatusChip } from '@/components/Chips';
import { Button, Eyebrow } from '@/components/primitives';
import { formatProbability } from '@/lib/risk';
import { shortId, titleCase } from '@/lib/format';
import { useScorePoller } from './useScorePoller';

export interface Submission {
  key: string;
  idempotencyKey: string;
  reference: string;
  status: number;
  replayed: boolean;
  result: TransactionCreated;
  submittedAt: string;
}

/**
 * The response code carries meaning and all three paths are shown as distinct
 * outcomes: 201 stored and scored, 200 idempotent replay, 202 stored but the
 * model has not answered yet.
 */
export function SubmissionResult({
  submission,
  onReplay,
  replayPending,
}: {
  submission: Submission;
  onReplay: () => void;
  replayPending: boolean;
}) {
  const { result, status, replayed } = submission;
  const pending = result.scoring === 'PENDING';
  const { state, retry } = useScorePoller(result.transaction_id, pending);

  const risk = result.risk ?? (state.phase === 'scored' ? state.risk : null);

  return (
    <div className="border border-rule bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-6 py-4">
        <Eyebrow className="!mb-0">
          {replayed
            ? `${status} — idempotent replay`
            : status === 202
              ? '202 — stored, scoring in progress'
              : '201 — stored and scored'}
        </Eyebrow>
        <span className="font-mono text-[11px] uppercase tracking-tag text-ink-3">
          {submission.reference}
        </span>
      </div>

      <div className="space-y-6 p-6">
        {replayed ? (
          <p className="border border-sage px-4 py-3 text-[14px] text-ink-2">
            The platform recognised this Idempotency-Key and returned the original result. No second
            transaction was created and no second alert was raised.
          </p>
        ) : null}

        <dl className="grid gap-px border border-rule bg-rule sm:grid-cols-2">
          <Cell label="Transaction" value={shortId(result.transaction_id)} mono />
          <Cell label="Scoring" value={titleCase(result.scoring)} />
          <Cell label="Idempotency key" value={shortId(submission.idempotencyKey)} mono />
          <Cell label="Submitted" value={submission.submittedAt} mono />
        </dl>

        {risk ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <span className="font-display text-[38px] font-bold leading-none tracking-tighter text-ink">
                {formatProbability(risk.fraud_probability)}
                <span className="ml-1 font-mono text-[12px] font-normal tracking-tag text-ink-3">
                  %
                </span>
              </span>
              <BandChip probability={risk.fraud_probability} />
              <span className="tag">{risk.model_name}</span>
              <span className="tag">{risk.model_version}</span>
              {risk.latency_ms !== null ? (
                <span className="tag">{risk.latency_ms} ms</span>
              ) : null}
            </div>
            <p className="text-[14px] text-ink-2">
              Model suggestion:{' '}
              <span className="font-mono uppercase tracking-tag">
                {risk.model_decision ? titleCase(risk.model_decision) : 'none'}
              </span>
              . The platform decides independently whether that raises a case.
            </p>
          </div>
        ) : null}

        {pending && !risk ? <PollStatus state={state} onRetry={retry} /> : null}

        {result.alert ? (
          <div className="border border-rule-soft p-4">
            <p className="mono-label mb-3 text-ink-3">Alert raised</p>
            <div className="flex flex-wrap items-center gap-3">
              <SeverityChip severity={result.alert.severity} />
              <StatusChip status={result.alert.status} />
              <Link
                to={`/alerts/${result.alert.alert_id}`}
                className="font-mono text-[11px] uppercase tracking-label text-ultra hover:text-ultra-lift"
              >
                Open case
              </Link>
            </div>
          </div>
        ) : result.scoring === 'COMPLETE' ? (
          <p className="border border-rule-soft px-4 py-3 text-[14px] text-ink-2">
            The score sat below the review threshold, so no case was raised.
          </p>
        ) : null}

        <div className="border-t border-rule pt-5">
          <p className="mb-3 text-[14px] text-ink-2">
            Submitting again with the same Idempotency-Key returns the original result rather than
            creating a duplicate.
          </p>
          <Button variant="ghost" onClick={onReplay} disabled={replayPending}>
            {replayPending ? 'Submitting' : 'Submit again with the same key'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PollStatus({
  state,
  onRetry,
}: {
  state: ReturnType<typeof useScorePoller>['state'];
  onRetry: () => void;
}) {
  if (state.phase === 'polling' || state.phase === 'idle') {
    const attempt = state.phase === 'polling' ? state.attempt : 1;
    return (
      <div className="border border-amber px-4 py-4">
        <p className="mono-label mb-2 text-amber">Scoring in progress</p>
        <p className="text-[14px] text-ink-2">
          The transaction is stored. The model has not returned a score yet, so the platform is
          asking again with a widening interval. Attempt {attempt}.
        </p>
      </div>
    );
  }

  if (state.phase === 'gave-up') {
    return (
      <div className="border border-amber px-4 py-4">
        <p className="mono-label mb-2 text-amber">No score after 60 seconds</p>
        <p className="mb-4 text-[14px] text-ink-2">
          The transaction is stored and will be scored when the model returns. Nothing was lost.
        </p>
        <Button variant="ghost" onClick={onRetry}>
          Check again
        </Button>
      </div>
    );
  }

  if (state.phase === 'failed') {
    return (
      <div className="border border-carmine px-4 py-4">
        <p className="mono-label mb-2 text-carmine">Score unavailable</p>
        <p className="mb-4 text-[14px] text-ink-2">{state.message}</p>
        <Button variant="ghost" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }

  return null;
}

function Cell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-surface p-4">
      <p className="mono-label mb-2 text-ink-3">{label}</p>
      <p className={mono ? 'font-mono text-[12px] text-ink' : 'text-[14px] text-ink'}>{value}</p>
    </div>
  );
}
