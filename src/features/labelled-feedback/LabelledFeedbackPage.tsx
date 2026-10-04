import { useEffect, useId, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelExportBatch,
  createExportBatch,
  curateLabelledFeedback,
  getLabelledFeedback,
  listExportBatches,
  listLabelledFeedback,
} from '@/api/endpoints/labelledFeedback';
import type { LabelledFeedback, LabelledFeedbackPatch } from '@/api/schemas/labelledFeedback';
import { ApiErrorPanel, EmptyPanel, LoadingRows, SkippedRowsNotice } from '@/components/ApiStates';
import { Button, Eyebrow, SectionHeading, cx } from '@/components/primitives';
import { useToasts } from '@/components/Toasts';
import { formatAbsolute, formatRelative } from '@/lib/format';
import { formatRiskScore } from '@/lib/risk';
import { describeFailure, errorStatus } from '@/lib/problem';
import { UserName } from '@/features/users/UserName';
import { CreateBatchModal } from './CreateBatchModal';
import { BatchStatusChip, CurationStatusChip, OutcomeChip } from './parts';
import { RecordEditor } from './RecordEditor';

const STATUS_FILTERS = [
  { value: 'PENDING', label: 'Awaiting validation' },
  { value: 'VALIDATED', label: 'Validated' },
  { value: 'EXCLUDED', label: 'Excluded' },
  { value: '', label: 'All records' },
] as const;

const OUTCOME_FILTERS = [
  { value: '', label: 'Any outcome' },
  { value: 'CONFIRMED_FRAUD', label: 'Confirmed fraud' },
  { value: 'FALSE_POSITIVE', label: 'False positive' },
  { value: 'INCONCLUSIVE', label: 'Inconclusive' },
] as const;

/**
 * Labelled feedback — supervisor only.
 *
 * The step between "a case was concluded" and "its label left the system".
 * Every concluded verdict arrives here awaiting validation. A supervisor
 * validates the clear ones, excludes the rest with a reason, then picks
 * validated records and creates an export batch. The ML service processes the
 * batch and reports an engine check back.
 *
 * Nothing on this screen changes the live model: a verdict cannot leave the
 * system without two deliberate human decisions.
 */
export default function LabelledFeedbackPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'batches' ? 'batches' : 'records';

  return (
    <div className="space-y-8">
      <SectionHeading
        index="08"
        title="Labelled Feedback"
        hint="A supervisor validates concluded verdicts and exports them in frozen batches. Nothing changes the live model."
      />

      <nav
        className="flex gap-px border border-rule bg-rule"
        aria-label="Labelled feedback sections"
      >
        {(
          [
            ['records', 'Records to review'],
            ['batches', 'Export batches'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setParams(key === 'records' ? {} : { tab: key })}
            className={cx(
              'flex-1 px-4 py-3 text-left font-mono text-[11px] uppercase tracking-label',
              tab === key ? 'bg-ultra text-on-ultra' : 'bg-surface text-ink-2 hover:text-ink',
            )}
            aria-current={tab === key ? 'page' : undefined}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'records' ? <RecordsTab /> : <BatchesTab />}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Records
 * ------------------------------------------------------------------ */

function RecordsTab() {
  const queryClient = useQueryClient();
  const toast = useToasts();
  const navigate = useNavigate();

  const [curationStatus, setCurationStatus] = useState<string>('PENDING');
  const [outcome, setOutcome] = useState<string>('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<LabelledFeedback | null>(null);
  const [batching, setBatching] = useState<LabelledFeedback[] | null>(null);
  const [excluding, setExcluding] = useState(false);
  const [excludeReason, setExcludeReason] = useState('');
  const excludeReasonId = useId();

  // Arriving from a case page: open that record straight away, whatever the
  // current filter shows.
  const [params, setParams] = useSearchParams();
  const reviewId = params.get('review');
  const deepLinked = useQuery({
    queryKey: ['labelled-feedback', 'record', reviewId],
    queryFn: ({ signal }) => getLabelledFeedback(reviewId ?? '', signal),
    enabled: Boolean(reviewId),
  });
  useEffect(() => {
    if (deepLinked.data) setEditing(deepLinked.data);
  }, [deepLinked.data]);
  const closeEditor = () => {
    setEditing(null);
    if (reviewId) {
      const next = new URLSearchParams(params);
      next.delete('review');
      setParams(next, { replace: true });
    }
  };

  const records = useInfiniteQuery({
    queryKey: ['labelled-feedback', 'records', curationStatus, outcome],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      listLabelledFeedback(
        {
          ...(curationStatus ? { curation_status: curationStatus } : {}),
          ...(outcome ? { final_label: outcome } : {}),
          limit: 50,
        },
        pageParam,
        signal,
      ),
    getNextPageParam: (last) => last.next_cursor,
  });

  const rows = useMemo(
    () => records.data?.pages.flatMap((p) => p.items) ?? [],
    [records.data],
  );
  const skipped = records.data?.pages.reduce((sum, p) => sum + p.skipped, 0) ?? 0;
  const chosen = rows.filter((r) => selected.has(r.id));
  const allValidated = chosen.length > 0 && chosen.every((r) => r.curation_status === 'VALIDATED');
  const anyInconclusive = chosen.some((r) => r.final_label === 'INCONCLUSIVE');

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['labelled-feedback'] });
  };

  const save = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: LabelledFeedbackPatch }) =>
      curateLabelledFeedback(id, patch),
    onSuccess: () => {
      closeEditor();
      refresh();
      toast.push({ tone: 'success', title: 'Record updated.', detail: 'Recorded in the audit trail.' });
    },
  });

  /** Bulk validate or exclude. One request per record; failures are reported, not hidden. */
  const bulk = useMutation({
    mutationFn: async (patch: LabelledFeedbackPatch) => {
      const results = await Promise.allSettled(
        chosen.map((r) => curateLabelledFeedback(r.id, patch)),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      return { done: results.length - failed, failed };
    },
    onSuccess: ({ done, failed }, patch) => {
      setSelected(new Set());
      setExcluding(false);
      setExcludeReason('');
      refresh();
      const verb = patch.curation_status === 'VALIDATED' ? 'validated' : 'excluded';
      toast.push({
        tone: failed ? 'error' : 'success',
        title: `${done} record${done === 1 ? '' : 's'} ${verb}.`,
        ...(failed ? { detail: `${failed} could not be updated.` } : {}),
      });
    },
  });

  const createBatch = useMutation({
    mutationFn: (input: { name: string; notes: string }) =>
      createExportBatch({
        name: input.name,
        ...(input.notes ? { notes: input.notes } : {}),
        record_ids: (batching ?? []).map((r) => r.id),
      }),
    onSuccess: (batch) => {
      setBatching(null);
      setSelected(new Set());
      refresh();
      toast.push({
        tone: 'success',
        title: `Export batch queued: ${batch.name}`,
        detail: `${batch.record_count} records frozen and sent to the ML service.`,
      });
      navigate(`/labelled-feedback/batches/${batch.id}`);
    },
  });

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((current) =>
      current.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)),
    );

  return (
    <div className="space-y-6">
      {reviewId && deepLinked.isError ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 border border-amber px-4 py-3 text-[13px] text-ink-2"
          role="status"
        >
          <span>
            {errorStatus(deepLinked.error) === 404
              ? 'The linked record was not found. It may belong to another team or no longer exist.'
              : `The linked record could not be opened: ${describeFailure(deepLinked.error).detail}`}
          </span>
          <Button variant="ghost" onClick={closeEditor}>
            Dismiss
          </Button>
        </div>
      ) : null}

      <section className="border border-rule bg-surface">
        <div className="grid gap-px bg-rule md:grid-cols-3">
          <label className="block bg-surface p-4">
            <Eyebrow className="!mb-2">Curation status</Eyebrow>
            <select
              className="field"
              value={curationStatus}
              onChange={(e) => {
                setCurationStatus(e.target.value);
                setSelected(new Set());
              }}
            >
              {STATUS_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block bg-surface p-4">
            <Eyebrow className="!mb-2">Outcome</Eyebrow>
            <select
              className="field"
              value={outcome}
              onChange={(e) => {
                setOutcome(e.target.value);
                setSelected(new Set());
              }}
            >
              {OUTCOME_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <div className="bg-surface p-4">
            <Eyebrow className="!mb-2">How this works</Eyebrow>
            <p className="text-[13px] text-ink-2">
              Review → validate or exclude → select validated records → create an export batch.
            </p>
          </div>
        </div>
      </section>

      {/* --- Selection toolbar ------------------------------------------- */}
      {chosen.length ? (
        <section className="space-y-3 border border-ultra bg-surface p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[12px] uppercase tracking-label text-ink">
              {chosen.length} selected
            </span>
            <Button
              variant="ghost"
              disabled={bulk.isPending || anyInconclusive}
              title={anyInconclusive ? 'Inconclusive verdicts cannot be validated.' : undefined}
              onClick={() => bulk.mutate({ curation_status: 'VALIDATED', curation_note: null })}
            >
              Validate
            </Button>
            <Button variant="ghost" disabled={bulk.isPending} onClick={() => setExcluding(true)}>
              Exclude…
            </Button>
            <Button
              disabled={!allValidated}
              title={allValidated ? undefined : 'Only validated records can be exported.'}
              onClick={() => setBatching(chosen)}
            >
              Create export batch
            </Button>
            <Button variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
          {!allValidated ? (
            <p className="text-[12px] text-ink-3">
              Only validated records can be exported. Validate the selection first.
            </p>
          ) : null}
          {excluding ? (
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor={excludeReasonId} className="mono-label w-full text-ink-3">
                Reason for excluding
              </label>
              <input
                id={excludeReasonId}
                className="field max-w-xl"
                placeholder="Why these should not be exported (required)"
                maxLength={2000}
                value={excludeReason}
                onChange={(e) => setExcludeReason(e.target.value)}
              />
              <Button
                variant="danger"
                disabled={!excludeReason.trim() || bulk.isPending}
                onClick={() =>
                  bulk.mutate({ curation_status: 'EXCLUDED', curation_note: excludeReason.trim() })
                }
              >
                Exclude {chosen.length}
              </Button>
              <Button variant="ghost" onClick={() => setExcluding(false)}>
                Cancel
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      <SkippedRowsNotice skipped={skipped} />

      {records.isError ? (
        <ApiErrorPanel
          error={records.error}
          what="labelled feedback"
          scopeHint="feedback:review"
          onRetry={() => void records.refetch()}
        />
      ) : records.isPending ? (
        <LoadingRows label="Loading labelled feedback" />
      ) : rows.length === 0 ? (
        <EmptyPanel
          title={curationStatus === 'PENDING' ? 'Nothing awaiting validation' : 'No records'}
          body={
            curationStatus === 'PENDING'
              ? 'Every concluded verdict has been reviewed. New ones arrive here when a supervisor concludes a case.'
              : 'No concluded verdicts match these filters.'
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto border border-rule bg-surface">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-rule">
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all records"
                      checked={rows.length > 0 && selected.size === rows.length}
                      onChange={toggleAll}
                    />
                  </th>
                  {[
                    'Investigation',
                    'Outcome',
                    'Risk at decision',
                    'Engine',
                    'Typology',
                    'Decided',
                    'Curation',
                    '',
                  ].map((label, i) => (
                    <th
                      key={label || i}
                      className={cx(
                        'px-4 py-3 font-mono text-[11px] uppercase tracking-label text-ink-3',
                        i === 2 && 'text-right',
                      )}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className={cx(
                      'border-b border-rule-soft last:border-0',
                      selected.has(row.id) && 'bg-paper',
                    )}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.case_title ?? row.id}`}
                        checked={selected.has(row.id)}
                        onChange={() => toggle(row.id)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/cases/${row.case_id}`} className="font-medium hover:text-ultra">
                        {row.case_title ?? 'Investigation'}
                      </Link>
                      <span className="ml-2 font-mono text-[11px] text-ink-3">
                        {row.alert_count ?? 1} alert{(row.alert_count ?? 1) === 1 ? '' : 's'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <OutcomeChip label={String(row.final_label)} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {typeof row.original_risk_score === 'number'
                        ? formatRiskScore(row.original_risk_score)
                        : '—'}
                    </td>
                    <td
                      className="px-4 py-3 font-mono text-[11px] text-ink-2"
                      title="Did the investigator agree with the engine?"
                    >
                      {String(row.model_agreement)}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-ink-2">
                      {row.fraud_typology ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-ink-2" title={formatAbsolute(row.decided_at)}>
                      {formatRelative(row.decided_at)}
                    </td>
                    <td className="px-4 py-3">
                      <CurationStatusChip status={String(row.curation_status)} />
                      {(row.batch_count ?? 0) > 0 ? (
                        <span
                          className="ml-2 font-mono text-[11px] text-ink-3"
                          title="Export batches that froze a copy of this record"
                        >
                          ×{row.batch_count}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" onClick={() => setEditing(row)}>
                        Review
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {records.hasNextPage ? (
            <Button
              variant="ghost"
              disabled={records.isFetchingNextPage}
              onClick={() => void records.fetchNextPage()}
            >
              {records.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          ) : null}
        </>
      )}

      <RecordEditor
        record={editing}
        onClose={() => {
          closeEditor();
          save.reset();
        }}
        onSave={(patch) => editing && save.mutate({ id: editing.id, patch })}
        saving={save.isPending}
        error={save.error ? describeFailure(save.error).detail : undefined}
      />

      <CreateBatchModal
        records={batching}
        onClose={() => {
          setBatching(null);
          createBatch.reset();
        }}
        onSubmit={(input) => createBatch.mutate(input)}
        submitting={createBatch.isPending}
        error={createBatch.error ? describeFailure(createBatch.error).detail : undefined}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Export batches
 * ------------------------------------------------------------------ */

function BatchesTab() {
  const queryClient = useQueryClient();
  const toast = useToasts();

  const batches = useQuery({
    queryKey: ['labelled-feedback', 'batches'],
    queryFn: ({ signal }) => listExportBatches(null, signal),
    // A queued batch is waiting on the ML service; show it moving without a reload.
    refetchInterval: (query) =>
      query.state.data?.items.some((b) => b.status === 'QUEUED' || b.status === 'PROCESSING')
        ? 5_000
        : false,
  });

  const cancel = useMutation({
    mutationFn: (batchId: string) => cancelExportBatch(batchId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['labelled-feedback'] });
      toast.push({ tone: 'info', title: 'Export batch cancelled.' });
    },
    onError: (error) => toast.pushError(error, 'Could not cancel that batch'),
  });

  if (batches.isError) {
    return (
      <ApiErrorPanel
        error={batches.error}
        what="export batches"
        scopeHint="feedback:review"
        onRetry={() => void batches.refetch()}
      />
    );
  }
  if (batches.isPending) return <LoadingRows label="Loading export batches" />;

  const items = batches.data.items;
  if (items.length === 0) {
    return (
      <EmptyPanel
        title="No export batches yet"
        body="Validate some records, select them on the Records tab, and create an export batch."
      />
    );
  }

  return (
    <div className="overflow-x-auto border border-rule bg-surface">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-rule">
            {['Batch', 'Status', 'Records', 'Outcomes', 'Requested', 'Finished', 'Result', ''].map(
              (label, i) => (
                <th
                  key={label || i}
                  className={cx(
                    'px-4 py-3 font-mono text-[11px] uppercase tracking-label text-ink-3',
                    i === 2 && 'text-right',
                  )}
                >
                  {label}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((batch) => (
            <tr key={batch.id} className="border-b border-rule-soft last:border-0">
              <td className="px-4 py-3">
                <Link
                  to={`/labelled-feedback/batches/${batch.id}`}
                  className="font-medium hover:text-ultra"
                >
                  {batch.name}
                </Link>
              </td>
              <td className="px-4 py-3">
                <BatchStatusChip status={String(batch.status)} />
              </td>
              <td className="px-4 py-3 text-right font-mono tabular-nums">{batch.record_count}</td>
              <td className="px-4 py-3 font-mono text-[11px] text-ink-2">
                {Object.entries(batch.label_counts ?? {})
                  .map(([label, n]) => `${label.replace(/_/g, ' ').toLowerCase()} ${n}`)
                  .join(' · ')}
              </td>
              <td className="px-4 py-3 text-ink-2">
                <span title={formatAbsolute(batch.requested_at)}>
                  {formatRelative(batch.requested_at)}
                </span>
                {batch.requested_by ? (
                  <span className="block text-[12px] text-ink-3">
                    by <UserName id={batch.requested_by} />
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-3 text-ink-2" title={formatAbsolute(batch.finished_at)}>
                {batch.finished_at ? formatRelative(batch.finished_at) : '—'}
              </td>
              <td className="px-4 py-3 font-mono text-[11px] text-ink-2">
                {batch.candidate_model_version
                  ? `candidate ${batch.candidate_model_version}`
                  : (batch.metrics as { mode?: string } | null)?.mode === 'engine_check'
                    ? 'engine check'
                    : '—'}
              </td>
              <td className="px-4 py-3 text-right">
                {batch.status === 'QUEUED' ? (
                  <Button
                    variant="ghost"
                    disabled={cancel.isPending}
                    onClick={() => cancel.mutate(batch.id)}
                  >
                    Cancel
                  </Button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
