import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelTrainingRun,
  getTrainingRun,
  listTrainingRunRecords,
} from '@/api/endpoints/training';
import type { RunMetrics } from '@/api/schemas/training';
import { ApiErrorPanel, EmptyPanel, LoadingRows } from '@/components/ApiStates';
import { Button, Eyebrow, Panel, SectionHeading } from '@/components/primitives';
import { useToasts } from '@/components/Toasts';
import { formatAbsolute, formatRelative, shortId } from '@/lib/format';
import { formatRiskScore } from '@/lib/risk';
import { OutcomeChip, RunStatusChip } from './parts';

/**
 * One training run: what was asked for, what the ML service reported, and the
 * exact frozen dataset it trained on.
 *
 * The dataset shown here is the run's own copy. If a verdict has since been
 * edited or its case re-concluded, the live record differs — this does not.
 */
export default function RunDetailPage() {
  const { runId = '' } = useParams<{ runId: string }>();
  const queryClient = useQueryClient();
  const toast = useToasts();

  const run = useQuery({
    queryKey: ['training', 'run', runId],
    queryFn: ({ signal }) => getTrainingRun(runId, signal),
    enabled: Boolean(runId),
    refetchInterval: (query) =>
      query.state.data?.status === 'QUEUED' || query.state.data?.status === 'RUNNING'
        ? 5_000
        : false,
  });

  const dataset = useQuery({
    queryKey: ['training', 'run', runId, 'records'],
    queryFn: ({ signal }) => listTrainingRunRecords(runId, null, signal),
    enabled: Boolean(runId),
  });

  const cancel = useMutation({
    mutationFn: () => cancelTrainingRun(runId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['training'] });
      toast.push({ tone: 'info', title: 'Training run cancelled.' });
    },
    onError: (error) => toast.pushError(error, 'Could not cancel this run'),
  });

  if (run.isError) {
    return (
      <div className="space-y-6">
        <BackLink />
        <ApiErrorPanel
          error={run.error}
          what="this training run"
          scopeHint="training:manage"
          onRetry={() => void run.refetch()}
        />
      </div>
    );
  }
  if (run.isPending) {
    return (
      <div className="space-y-6">
        <BackLink />
        <LoadingRows label="Loading training run" />
      </div>
    );
  }

  const r = run.data;
  const metrics = (r.metrics ?? null) as RunMetrics | null;
  const evaluationOnly = metrics?.mode === 'evaluation_only';
  const status = String(r.status);

  return (
    <div className="space-y-8">
      <BackLink />
      <SectionHeading
        index="08"
        title={r.name}
        hint={r.notes ?? 'A supervisor-requested training run.'}
        actions={
          <>
            <RunStatusChip status={status} />
            {status === 'QUEUED' ? (
              <Button variant="ghost" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
                Cancel run
              </Button>
            ) : null}
          </>
        }
      />

      {/* --- Where it is in its life ----------------------------------- */}
      <div className="grid gap-px border border-rule bg-rule md:grid-cols-4">
        <Stat label="Records" value={String(r.record_count)} />
        <Stat
          label="Requested"
          value={formatRelative(r.requested_at)}
          hint={formatAbsolute(r.requested_at)}
        />
        <Stat
          label="Trained from"
          value={r.base_model_version ? `model ${r.base_model_version}` : '—'}
          hint="The model version these verdicts were scored by"
        />
        <Stat
          label="Result"
          value={
            r.result_model_version
              ? `model ${r.result_model_version}`
              : status === 'COMPLETED'
                ? 'no new model'
                : 'waiting'
          }
          hint={r.executor ? `reported by ${r.executor}` : 'not picked up yet'}
        />
      </div>

      {status === 'QUEUED' ? (
        <Panel className="p-6">
          <Eyebrow>Waiting for the ML service</Eyebrow>
          <p className="max-w-2xl text-ink-2">
            The records are frozen and the run is queued. The ML service picks it up, trains, and
            reports back here — this page refreshes on its own. Civitas never trains inside the
            platform itself: a new model has to be compared with the current one before it can go
            live.
          </p>
        </Panel>
      ) : null}

      {status === 'FAILED' ? (
        <Panel className="border-carmine p-6">
          <Eyebrow>The run failed</Eyebrow>
          <p className="text-ink-2">{r.error ?? 'No reason was given.'}</p>
        </Panel>
      ) : null}

      {(r.warnings ?? []).length ? (
        <ul className="space-y-2 border border-amber px-4 py-3 text-[13px] text-ink-2">
          {(r.warnings ?? []).map((warning) => (
            <li key={warning}>⚠ {warning}</li>
          ))}
        </ul>
      ) : null}

      {/* --- What it found -------------------------------------------- */}
      {metrics ? (
        <section className="space-y-4">
          <Eyebrow>What the run reported</Eyebrow>
          {evaluationOnly ? (
            <p className="max-w-3xl border border-rule bg-surface px-4 py-3 text-[13px] text-ink-2">
              <strong>Evaluation only — no new model was trained.</strong>{' '}
              {metrics.note ??
                'The current engine was measured against these approved labels.'}{' '}
              These numbers show where the engine already agreed with your investigators and where
              it did not — which is what a retraining job is for.
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

      {/* --- The frozen dataset --------------------------------------- */}
      <section className="space-y-4">
        <Eyebrow>Dataset, as frozen when the run was requested</Eyebrow>
        {dataset.isError ? (
          <ApiErrorPanel
            error={dataset.error}
            what="this run's dataset"
            onRetry={() => void dataset.refetch()}
          />
        ) : dataset.isPending ? (
          <LoadingRows label="Loading dataset" rows={4} />
        ) : dataset.data.items.length === 0 ? (
          <EmptyPanel title="No records" />
        ) : (
          <div className="overflow-x-auto border border-rule bg-surface">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-rule">
                  {['Case', 'Outcome', 'Confidence', 'Risk at decision', 'Typology', 'Reference'].map(
                    (label) => (
                      <th
                        key={label}
                        className="px-4 py-3 font-mono text-[11px] uppercase tracking-label text-ink-3"
                      >
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {dataset.data.items.map((item) => {
                  const s = item.snapshot as Record<string, unknown>;
                  const risk = typeof s['original_risk_score'] === 'number' ? s['original_risk_score'] : null;
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
  hint?: string;
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
      to="/training?tab=runs"
      className="font-mono text-[11px] uppercase tracking-label text-ink-3 hover:text-ultra"
    >
      ← All training runs
    </Link>
  );
}
