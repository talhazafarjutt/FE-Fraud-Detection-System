import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelTrainingRun,
  createTrainingRun,
  getTrainingRecord,
  listTrainingRecords,
  listTrainingRuns,
  patchTrainingRecord,
} from '@/api/endpoints/training';
import type { TrainingRecord, TrainingRecordPatch } from '@/api/schemas/training';
import { ApiErrorPanel, EmptyPanel, LoadingRows, SkippedRowsNotice } from '@/components/ApiStates';
import { Button, Eyebrow, SectionHeading, cx } from '@/components/primitives';
import { useToasts } from '@/components/Toasts';
import { formatAbsolute, formatRelative } from '@/lib/format';
import { formatRiskScore } from '@/lib/risk';
import { describeFailure } from '@/lib/problem';
import { OutcomeChip, RunStatusChip, TrainingStatusChip } from './parts';
import { RecordEditor } from './RecordEditor';
import { StartRunModal } from './StartRunModal';

const STATUS_FILTERS = [
  { value: 'CANDIDATE', label: 'Awaiting review' },
  { value: 'APPROVED', label: 'Approved for training' },
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
 * Training data — supervisor only.
 *
 * The step between "a case was concluded" and "a model learned from it". Every
 * concluded verdict arrives here awaiting review. A supervisor approves the
 * ones that make good examples, excludes the rest with a reason, then picks
 * approved records and requests a training run. The ML service trains and
 * reports back.
 *
 * Nothing on this screen retrains anything by itself, and that is the point:
 * a verdict cannot reach a model without two deliberate human decisions.
 */
export default function TrainingPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'runs' ? 'runs' : 'records';

  return (
    <div className="space-y-8">
      <SectionHeading
        index="08"
        title="Training data"
        hint="Concluded verdicts a supervisor has reviewed to teach the model. Nothing trains on its own."
      />

      <nav className="flex gap-px border border-rule bg-rule" aria-label="Training sections">
        {(
          [
            ['records', 'Records to review'],
            ['runs', 'Training runs'],
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

      {tab === 'records' ? <RecordsTab /> : <RunsTab />}
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

  const [trainingStatus, setTrainingStatus] = useState<string>('CANDIDATE');
  const [outcome, setOutcome] = useState<string>('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<TrainingRecord | null>(null);
  const [starting, setStarting] = useState<TrainingRecord[] | null>(null);
  const [excluding, setExcluding] = useState(false);
  const [excludeReason, setExcludeReason] = useState('');

  // Arriving from a case page: open that record straight away, whatever the
  // current filter shows.
  const [params, setParams] = useSearchParams();
  const reviewId = params.get('review');
  const deepLinked = useQuery({
    queryKey: ['training', 'record', reviewId],
    queryFn: ({ signal }) => getTrainingRecord(reviewId ?? '', signal),
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
    queryKey: ['training', 'records', trainingStatus, outcome],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      listTrainingRecords(
        {
          ...(trainingStatus ? { training_status: trainingStatus } : {}),
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
  const allApproved = chosen.length > 0 && chosen.every((r) => r.training_status === 'APPROVED');
  const anyInconclusive = chosen.some((r) => r.final_label === 'INCONCLUSIVE');

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['training'] });
  };

  const save = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TrainingRecordPatch }) =>
      patchTrainingRecord(id, patch),
    onSuccess: () => {
      closeEditor();
      refresh();
      toast.push({ tone: 'success', title: 'Record updated.', detail: 'Recorded in the audit trail.' });
    },
  });

  /** Bulk approve or exclude. One request per record; failures are reported, not hidden. */
  const bulk = useMutation({
    mutationFn: async (patch: TrainingRecordPatch) => {
      const results = await Promise.allSettled(chosen.map((r) => patchTrainingRecord(r.id, patch)));
      const failed = results.filter((r) => r.status === 'rejected').length;
      return { done: results.length - failed, failed };
    },
    onSuccess: ({ done, failed }, patch) => {
      setSelected(new Set());
      setExcluding(false);
      setExcludeReason('');
      refresh();
      const verb = patch.training_status === 'APPROVED' ? 'approved' : 'excluded';
      toast.push({
        tone: failed ? 'error' : 'success',
        title: `${done} record${done === 1 ? '' : 's'} ${verb}.`,
        ...(failed ? { detail: `${failed} could not be updated.` } : {}),
      });
    },
  });

  const startRun = useMutation({
    mutationFn: (input: { name: string; notes: string }) =>
      createTrainingRun({
        name: input.name,
        ...(input.notes ? { notes: input.notes } : {}),
        record_ids: (starting ?? []).map((r) => r.id),
      }),
    onSuccess: (run) => {
      setStarting(null);
      setSelected(new Set());
      refresh();
      toast.push({
        tone: 'success',
        title: `Training run queued: ${run.name}`,
        detail: `${run.record_count} records frozen and sent to the ML service.`,
      });
      navigate(`/training/runs/${run.id}`);
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
      <section className="border border-rule bg-surface">
        <div className="grid gap-px bg-rule md:grid-cols-3">
          <label className="block bg-surface p-4">
            <Eyebrow className="!mb-2">Training status</Eyebrow>
            <select
              className="field"
              value={trainingStatus}
              onChange={(e) => {
                setTrainingStatus(e.target.value);
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
              Review → approve or exclude → select approved records → start a training run.
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
              title={anyInconclusive ? 'Inconclusive verdicts cannot be approved.' : undefined}
              onClick={() => bulk.mutate({ training_status: 'APPROVED' })}
            >
              Approve
            </Button>
            <Button variant="ghost" disabled={bulk.isPending} onClick={() => setExcluding(true)}>
              Exclude…
            </Button>
            <Button
              disabled={!allApproved}
              title={allApproved ? undefined : 'Only approved records can be trained on.'}
              onClick={() => setStarting(chosen)}
            >
              Start training run…
            </Button>
            <Button variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
          {!allApproved ? (
            <p className="text-[12px] text-ink-3">
              Only approved records can be trained on. Approve the selection first.
            </p>
          ) : null}
          {excluding ? (
            <div className="flex flex-wrap items-center gap-3">
              <input
                className="field max-w-xl"
                placeholder="Why these should not be trained on (required)"
                maxLength={2000}
                value={excludeReason}
                onChange={(e) => setExcludeReason(e.target.value)}
              />
              <Button
                variant="danger"
                disabled={!excludeReason.trim() || bulk.isPending}
                onClick={() =>
                  bulk.mutate({ training_status: 'EXCLUDED', training_note: excludeReason.trim() })
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
          what="training records"
          scopeHint="training:manage"
          onRetry={() => void records.refetch()}
        />
      ) : records.isPending ? (
        <LoadingRows label="Loading training records" />
      ) : rows.length === 0 ? (
        <EmptyPanel
          title={trainingStatus === 'CANDIDATE' ? 'Nothing awaiting review' : 'No records'}
          body={
            trainingStatus === 'CANDIDATE'
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
                    'Training',
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
                      <TrainingStatusChip status={String(row.training_status)} />
                      {(row.run_count ?? 0) > 0 ? (
                        <span
                          className="ml-2 font-mono text-[11px] text-ink-3"
                          title="Training runs that froze a copy of this record"
                        >
                          ×{row.run_count}
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

      <StartRunModal
        records={starting}
        onClose={() => {
          setStarting(null);
          startRun.reset();
        }}
        onSubmit={(input) => startRun.mutate(input)}
        submitting={startRun.isPending}
        error={startRun.error ? describeFailure(startRun.error).detail : undefined}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Runs
 * ------------------------------------------------------------------ */

function RunsTab() {
  const queryClient = useQueryClient();
  const toast = useToasts();

  const runs = useQuery({
    queryKey: ['training', 'runs'],
    queryFn: ({ signal }) => listTrainingRuns(null, signal),
    // A queued run is waiting on the ML service; show it moving without a reload.
    refetchInterval: (query) =>
      query.state.data?.items.some((r) => r.status === 'QUEUED' || r.status === 'RUNNING')
        ? 5_000
        : false,
  });

  const cancel = useMutation({
    mutationFn: (runId: string) => cancelTrainingRun(runId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['training'] });
      toast.push({ tone: 'info', title: 'Training run cancelled.' });
    },
    onError: (error) => toast.pushError(error, 'Could not cancel that run'),
  });

  if (runs.isError) {
    return (
      <ApiErrorPanel
        error={runs.error}
        what="training runs"
        scopeHint="training:manage"
        onRetry={() => void runs.refetch()}
      />
    );
  }
  if (runs.isPending) return <LoadingRows label="Loading training runs" />;

  const items = runs.data.items;
  if (items.length === 0) {
    return (
      <EmptyPanel
        title="No training runs yet"
        body="Approve some records, select them on the Records tab, and start a training run."
      />
    );
  }

  return (
    <div className="overflow-x-auto border border-rule bg-surface">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-rule">
            {['Run', 'Status', 'Records', 'Outcomes', 'Requested', 'Finished', 'Result', ''].map(
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
          {items.map((run) => (
            <tr key={run.id} className="border-b border-rule-soft last:border-0">
              <td className="px-4 py-3">
                <Link to={`/training/runs/${run.id}`} className="font-medium hover:text-ultra">
                  {run.name}
                </Link>
              </td>
              <td className="px-4 py-3">
                <RunStatusChip status={String(run.status)} />
              </td>
              <td className="px-4 py-3 text-right font-mono tabular-nums">{run.record_count}</td>
              <td className="px-4 py-3 font-mono text-[11px] text-ink-2">
                {Object.entries(run.label_counts ?? {})
                  .map(([label, n]) => `${label.replace(/_/g, ' ').toLowerCase()} ${n}`)
                  .join(' · ')}
              </td>
              <td className="px-4 py-3 text-ink-2" title={formatAbsolute(run.requested_at)}>
                {formatRelative(run.requested_at)}
              </td>
              <td className="px-4 py-3 text-ink-2" title={formatAbsolute(run.finished_at)}>
                {run.finished_at ? formatRelative(run.finished_at) : '—'}
              </td>
              <td className="px-4 py-3 font-mono text-[11px] text-ink-2">
                {run.result_model_version
                  ? `model ${run.result_model_version}`
                  : (run.metrics as { mode?: string } | null)?.mode === 'evaluation_only'
                    ? 'evaluation only'
                    : '—'}
              </td>
              <td className="px-4 py-3 text-right">
                {run.status === 'QUEUED' ? (
                  <Button
                    variant="ghost"
                    disabled={cancel.isPending}
                    onClick={() => cancel.mutate(run.id)}
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
