import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type BatchDownloadFormat,
  cancelExportBatch,
  downloadExportBatch,
  getExportBatch,
  listExportBatchRecords,
} from '@/api/endpoints/labelledFeedback';
import type { BatchMetrics } from '@/api/schemas/labelledFeedback';
import { ApiErrorPanel, EmptyPanel, LoadingRows } from '@/components/ApiStates';
import { Button, Eyebrow, Panel, SectionHeading } from '@/components/primitives';
import { useToasts } from '@/components/Toasts';
import { UserName } from '@/features/users/UserName';
import { saveBlob } from '@/lib/download';
import { formatAbsolute, formatRelative, shortId } from '@/lib/format';
import { formatRiskScore } from '@/lib/risk';
import { BatchStatusChip, OutcomeChip } from './parts';

/**
 * One export batch: what was asked for, what the ML service reported, and the
 * exact frozen records it contains.
 *
 * The records shown here are the batch's own copy. If a verdict has since been
 * edited or its case re-concluded, the live record differs — this does not.
 */
export default function BatchDetailPage() {
  const { batchId = '' } = useParams<{ batchId: string }>();
  const queryClient = useQueryClient();
  const toast = useToasts();

  const batch = useQuery({
    queryKey: ['labelled-feedback', 'batch', batchId],
    queryFn: ({ signal }) => getExportBatch(batchId, signal),
    enabled: Boolean(batchId),
    refetchInterval: (query) =>
      query.state.data?.status === 'QUEUED' || query.state.data?.status === 'PROCESSING'
        ? 5_000
        : false,
  });

  const records = useInfiniteQuery({
    queryKey: ['labelled-feedback', 'batch', batchId, 'records'],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => listExportBatchRecords(batchId, pageParam, signal),
    getNextPageParam: (last) => last.next_cursor,
    enabled: Boolean(batchId),
  });
  const rows = records.data?.pages.flatMap((page) => page.items) ?? [];

  const cancel = useMutation({
    mutationFn: () => cancelExportBatch(batchId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['labelled-feedback'] });
      toast.push({ tone: 'info', title: 'Export batch cancelled.' });
    },
    onError: (error) => toast.pushError(error, 'Could not cancel this batch'),
  });

  const download = useMutation({
    mutationFn: (format: BatchDownloadFormat) => downloadExportBatch(batchId, format),
    onSuccess: ({ blob, filename }) => saveBlob(blob, filename),
    onError: (error) => toast.pushError(error, 'Could not download this batch'),
  });

  if (batch.isError) {
    return (
      <div className="space-y-6">
        <BackLink />
        <ApiErrorPanel
          error={batch.error}
          what="this export batch"
          scopeHint="feedback:review"
          onRetry={() => void batch.refetch()}
        />
      </div>
    );
  }
  if (batch.isPending) {
    return (
      <div className="space-y-6">
        <BackLink />
        <LoadingRows label="Loading export batch" />
      </div>
    );
  }

  const b = batch.data;
  const metrics = (b.metrics ?? null) as BatchMetrics | null;
  const engineCheck = metrics?.mode === 'engine_check';
  const status = String(b.status);

  return (
    <div className="space-y-8">
      <BackLink />
      <SectionHeading
        index="08"
        title={b.name}
        hint={b.notes ?? 'A supervisor-requested export batch.'}
        actions={
          <>
            <BatchStatusChip status={status} />
            {status !== 'CANCELLED' ? (
              <>
                <Button
                  variant="ghost"
                  disabled={download.isPending}
                  onClick={() => download.mutate('csv')}
                >
                  Download CSV
                </Button>
                <Button
                  variant="ghost"
                  disabled={download.isPending}
                  onClick={() => download.mutate('jsonl')}
                >
                  Download JSONL
                </Button>
              </>
            ) : null}
            {status === 'QUEUED' ? (
              <Button variant="ghost" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
                Cancel batch
              </Button>
            ) : null}
          </>
        }
      />

      {/* --- Where it is in its life ----------------------------------- */}
      <div className="grid gap-px border border-rule bg-rule md:grid-cols-4">
        <Stat label="Records" value={String(b.record_count)} />
        <Stat
          label="Requested"
          value={formatRelative(b.requested_at)}
          hint={
            b.requested_by ? (
              <>
                by <UserName id={b.requested_by} /> · {formatAbsolute(b.requested_at)}
              </>
            ) : (
              formatAbsolute(b.requested_at)
            )
          }
        />
        <Stat
          label="Scored by"
          value={b.base_model_version ? `model ${b.base_model_version}` : '—'}
          hint="The model version these verdicts were scored by"
        />
        <Stat
          label="Candidate model"
          value={
            b.candidate_model_version
              ? `model ${b.candidate_model_version}`
              : status === 'QUEUED' || status === 'PROCESSING'
                ? 'waiting'
                : status === 'COMPLETED'
                  ? 'none — engine check only'
                  : '—'
          }
          hint={
            b.processed_by
              ? `reported by ${b.processed_by}`
              : status === 'CANCELLED'
                ? 'cancelled before processing'
                : 'not picked up yet'
          }
        />
      </div>

      {status === 'QUEUED' ? (
        <Panel className="p-6">
          <Eyebrow>Waiting for the ML service</Eyebrow>
          <p className="max-w-2xl text-ink-2">
            The records are frozen and the batch is queued. The ML service picks it up, runs an
            engine check, and reports back here — this page refreshes on its own.
          </p>
        </Panel>
      ) : null}

      {status === 'FAILED' ? (
        <Panel className="border-carmine p-6">
          <Eyebrow>The batch failed</Eyebrow>
          <p className="text-ink-2">{b.error ?? 'No reason was given.'}</p>
        </Panel>
      ) : null}

      {(b.warnings ?? []).length ? (
        <ul className="space-y-2 border border-amber px-4 py-3 text-[13px] text-ink-2">
          {(b.warnings ?? []).map((warning) => (
            <li key={warning}>⚠ {warning}</li>
          ))}
        </ul>
      ) : null}

      {/* --- What it found -------------------------------------------- */}
      {metrics ? (
        <section className="space-y-4">
          <Eyebrow>{engineCheck ? 'Engine check' : 'What the ML service reported'}</Eyebrow>
          {engineCheck ? (
            <p className="max-w-3xl border border-rule bg-surface px-4 py-3 text-[13px] text-ink-2">
              {metrics.note ?? 'The current engine, measured against these validated labels.'} These
              numbers show where the engine already agreed with your investigators and where it did
              not.
            </p>
          ) : null}
          <div className="grid gap-px border border-rule bg-rule md:grid-cols-5">
            <Stat
              label="Engine caught"
              value={num(metrics.engine_caught)}
              hint="Confirmed frauds the engine already scored high"
            />
            <Stat
              label="Engine missed"
              value={num(metrics.engine_missed)}
              hint="Frauds your team found that the engine let through — the most valuable examples"
              tone={metrics.engine_missed ? 'carmine' : undefined}
            />
            <Stat
              label="False alarms"
              value={num(metrics.engine_false_alarms)}
              hint="Legitimate activity the engine flagged anyway"
              tone={metrics.engine_false_alarms ? 'amber' : undefined}
            />
            <Stat label="Precision" value={pct(metrics.precision)} hint="On this set" />
            <Stat
              label="Recall"
              value={pct(metrics.recall_on_curated_set)}
              hint="On this set only — not the platform's recall"
            />
          </div>
          {metrics.threshold !== undefined ? (
            <p className="text-[12px] text-ink-3">
              Measured at the alert threshold of {String(metrics.threshold)}.
            </p>
          ) : null}
        </section>
      ) : null}

      {/* --- The frozen records --------------------------------------- */}
      <section className="space-y-4">
        <Eyebrow>Records, as frozen when the batch was created</Eyebrow>
        {records.isError ? (
          <ApiErrorPanel
            error={records.error}
            what="this batch's records"
            onRetry={() => void records.refetch()}
          />
        ) : records.isPending ? (
          <LoadingRows label="Loading records" rows={4} />
        ) : rows.length === 0 ? (
          <EmptyPanel title="No records" />
        ) : (
          <>
            <div className="overflow-x-auto border border-rule bg-surface">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-rule">
                    {[
                      'Case',
                      'Outcome',
                      'Confidence',
                      'Risk at decision',
                      'Typology',
                      'Reference',
                    ].map((label) => (
                      <th
                        key={label}
                        className="px-4 py-3 font-mono text-[11px] uppercase tracking-label text-ink-3"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => {
                    const s = item.snapshot as Record<string, unknown>;
                    const risk =
                      typeof s['original_risk_score'] === 'number'
                        ? s['original_risk_score']
                        : null;
                    return (
                      <tr key={item.id} className="border-b border-rule-soft last:border-0">
                        <td className="px-4 py-3 font-mono text-[12px]">
                          {item.case_id ? (
                            <Link to={`/cases/${item.case_id}`} className="hover:text-ultra">
                              {shortId(item.case_id)}
                            </Link>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <OutcomeChip label={item.final_label} />
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-ink-2">
                          {String(s['confidence'] ?? '—')}
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums">
                          {risk === null ? '—' : formatRiskScore(risk)}
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-ink-2">
                          {String(s['fraud_typology'] ?? '—')}
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-ink-3">
                          {String(s['external_ref'] ?? '—')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {records.hasNextPage ? (
              <div className="flex flex-wrap items-center gap-4">
                <Button
                  variant="ghost"
                  disabled={records.isFetchingNextPage}
                  onClick={() => void records.fetchNextPage()}
                >
                  {records.isFetchingNextPage ? 'Loading…' : 'Load more'}
                </Button>
                <span className="text-[12px] text-ink-3">
                  Showing {rows.length} of {b.record_count}.
                </span>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

function num(value: unknown): string {
  return typeof value === 'number' ? String(value) : '—';
}

function pct(value: unknown): string {
  return typeof value === 'number' ? `${Math.round(value * 100)}%` : '—';
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  tone?: 'carmine' | 'amber' | undefined;
}) {
  return (
    <div className="bg-surface p-4">
      <Eyebrow className="!mb-2">{label}</Eyebrow>
      <p
        className={
          tone === 'carmine'
            ? 'font-mono text-[22px] text-carmine'
            : tone === 'amber'
              ? 'font-mono text-[22px] text-amber'
              : 'font-mono text-[22px] text-ink'
        }
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-[11px] text-ink-3">{hint}</p> : null}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/labelled-feedback?tab=batches"
      className="font-mono text-[11px] uppercase tracking-label text-ink-3 hover:text-ultra"
    >
      ← All export batches
    </Link>
  );
}
