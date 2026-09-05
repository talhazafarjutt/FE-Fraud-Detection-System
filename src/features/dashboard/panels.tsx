import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Alert } from '@/api/schemas/alerts';
import type { MetricsOverview } from '@/api/schemas/metrics';
import { SeverityChip, StatusChip } from '@/components/Chips';
import { Skeleton, cx } from '@/components/primitives';
import { formatRelative, shortId } from '@/lib/format';
import { formatAmount } from '@/lib/money';
import { RISK_THRESHOLDS, formatProbability } from '@/lib/risk';

/**
 * §15.5: every number carries its time window. A tile reading "512" with no
 * "last 7 days" beside it is not information.
 */
export function Tile({
  label,
  value,
  window,
  detail,
  tone,
}: {
  label: string;
  value: string | null;
  window?: string;
  detail?: string;
  tone?: 'normal' | 'warn' | 'danger';
}) {
  return (
    <div className="bg-surface p-6">
      <p className="mono-label mb-3 text-ink-3">{label}</p>
      <p
        className={cx(
          'font-display text-[34px] font-bold leading-none tracking-tight',
          tone === 'danger' && 'text-carmine',
          tone === 'warn' && 'text-amber',
          (!tone || tone === 'normal') && 'text-ink',
        )}
      >
        {value === null ? <Skeleton className="h-8 w-20" /> : value}
      </p>
      {detail ? <p className="mt-3 text-[13px] text-ink-2">{detail}</p> : null}
      {window ? (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-tag text-ink-3">{window}</p>
      ) : null}
    </div>
  );
}

export function PanelSection({
  index,
  title,
  hint,
  actions,
  children,
}: {
  index: string;
  title: string;
  hint?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-6 border-t border-rule pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow !mb-2">
            {index} — {title}
          </p>
          {hint ? <p className="max-w-3xl text-ink-2">{hint}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/**
 * §15.5: charts must degrade. Fewer than two points is a number and a caption,
 * not a broken axis.
 */
export function TooFewPoints({ count }: { count: number }) {
  return (
    <div className="border border-rule-soft px-6 py-10 text-center">
      <p className="mono-label mb-2 text-ink-3">Not enough data to plot</p>
      <p className="text-ink-2">
        {count === 0
          ? 'No transactions in this window.'
          : 'One time bucket so far. A trend needs at least two.'}
      </p>
    </div>
  );
}

/** Horizontal risk distribution with the server's cut points marked. */
export function RiskDistribution({
  byRiskLevel,
  total,
}: {
  byRiskLevel: Record<string, number>;
  total: number;
}) {
  const bands = [
    { id: 'LOW', label: 'Low', bound: `< ${RISK_THRESHOLDS.MEDIUM}`, colour: 'var(--sage)' },
    {
      id: 'MEDIUM',
      label: 'Medium',
      bound: `${RISK_THRESHOLDS.MEDIUM} – ${RISK_THRESHOLDS.HIGH}`,
      colour: 'var(--amber)',
    },
    { id: 'HIGH', label: 'High', bound: `≥ ${RISK_THRESHOLDS.HIGH}`, colour: 'var(--carmine)' },
  ];
  const max = Math.max(1, ...bands.map((b) => byRiskLevel[b.id] ?? 0));

  return (
    <div className="space-y-5 border border-rule bg-surface p-6">
      {bands.map((band) => {
        const count = byRiskLevel[band.id] ?? 0;
        const share = total === 0 ? 0 : (count / total) * 100;
        return (
          <div key={band.id}>
            <div className="mb-2 flex items-baseline justify-between gap-4">
              <span className="mono-label text-ink-2">
                {band.label} <span className="text-ink-3">{band.bound}</span>
              </span>
              <span className="num font-mono text-[12px] tabular-nums text-ink">
                {count.toLocaleString('en-GB')}
                <span className="ml-2 text-ink-3">{share.toFixed(1)}%</span>
              </span>
            </div>
            <div className="h-[10px] w-full bg-paper">
              <div
                className="h-full"
                style={{ width: `${(count / max) * 100}%`, background: band.colour }}
              />
            </div>
          </div>
        );
      })}
      <p className="border-t border-rule-soft pt-4 text-[13px] leading-relaxed text-ink-3">
        The alert threshold sits at {RISK_THRESHOLDS.HIGH}. Everything in the High band raised a
        case; the mass of traffic below it did not.
      </p>
    </div>
  );
}

/** §15.4 outcome quality — only the confusion terms that are measurable. */
export function OutcomeGrid({ outcomes }: { outcomes: MetricsOverview['outcomes'] }) {
  const { confirmed_fraud, false_positives, still_open, precision, precision_note } = outcomes;
  const closed = confirmed_fraud + false_positives;
  const pct = precision === null ? null : Math.round(precision * 100);

  return (
    <div className="space-y-6 border border-rule bg-surface p-6">
      <div className="grid gap-px bg-rule sm:grid-cols-3">
        <div className="bg-surface p-5">
          <p className="mono-label mb-2 text-ink-3">Confirmed fraud</p>
          <p className="font-display text-[30px] font-bold leading-none text-carmine">
            {confirmed_fraud.toLocaleString('en-GB')}
          </p>
        </div>
        <div className="bg-surface p-5">
          <p className="mono-label mb-2 text-ink-3">False positive</p>
          <p className="font-display text-[30px] font-bold leading-none text-amber">
            {false_positives.toLocaleString('en-GB')}
          </p>
        </div>
        <div className="bg-surface p-5">
          <p className="mono-label mb-2 text-ink-3">Still open</p>
          <p className="font-display text-[30px] font-bold leading-none text-ink-2">
            {still_open.toLocaleString('en-GB')}
          </p>
        </div>
      </div>

      <div className="border-t border-rule-soft pt-5">
        <p className="mono-label mb-3 text-ink-3">Precision</p>
        {pct === null ? (
          <p className="text-ink-2">No cases have been closed yet, so precision is not defined.</p>
        ) : (
          <>
            <p className="mb-3 font-display text-[38px] font-bold leading-none tracking-tight text-ink">
              {pct}
              <span className="ml-1 font-mono text-[13px] font-normal tracking-tag text-ink-3">
                %
              </span>
            </p>
            <p className="mb-3 text-[15px] leading-relaxed text-ink-2">
              Of the {closed.toLocaleString('en-GB')} alerts we closed, {pct}% turned out to be real
              fraud. The remaining {100 - pct}% cost analyst time but no money was lost.
            </p>
          </>
        )}
        {/* The caveat ships from the API and is rendered verbatim, not paraphrased. */}
        <p className="font-mono text-[10px] uppercase tracking-tag text-ink-3">{precision_note}</p>
        {/*
          Recall is deliberately absent. It needs false negatives — fraud nobody
          flagged — which by definition were never recorded. Reporting a number
          we cannot measure would be dishonest to a government buyer.
        */}
        <p className="mt-3 text-[13px] leading-relaxed text-ink-3">
          Recall is not shown. It would require counting fraud the system never flagged, which by
          definition was never recorded.
        </p>
      </div>
    </div>
  );
}

/** Top open alerts by probability — not the whole queue, which has its own page. */
export function MyQueue({ alerts }: { alerts: readonly Alert[] }) {
  if (alerts.length === 0) {
    return (
      <div className="border border-rule bg-surface px-6 py-10 text-center">
        <p className="mono-label text-ink-3">Nothing open in your queue</p>
        <p className="mt-3 text-ink-2">Every case visible to you has been triaged.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border border-rule bg-surface">
      <table className="w-full min-w-[720px] border-collapse">
        <thead>
          <tr className="border-b border-rule">
            {['Severity', 'Probability', 'Amount', 'Status', 'Opened', ''].map((label, index) => (
              <th
                key={label || index}
                scope="col"
                className={cx(
                  'py-3 pr-4 font-mono text-[11px] font-normal uppercase tracking-tag text-ink-3',
                  index === 0 && 'pl-4 text-left',
                  index === 1 || index === 2 ? 'text-right' : 'text-left',
                  index === 5 && 'pr-4 text-right',
                )}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {alerts.map((alert) => (
            <tr key={alert.id} className="border-b border-rule-soft hover:bg-paper">
              <td className="py-3 pl-4 pr-4">
                <SeverityChip severity={alert.severity} />
              </td>
              <td className="py-3 pr-4 text-right">
                <span className="num font-mono text-[12px] tabular-nums text-ink">
                  {formatProbability(alert.fraud_probability)}
                  <span className="ml-0.5 text-ink-3">%</span>
                </span>
              </td>
              <td className="py-3 pr-4 text-right">
                <span className="num font-mono text-[12px] tabular-nums text-ink">
                  {formatAmount(alert.amount)}
                </span>
              </td>
              <td className="py-3 pr-4">
                <StatusChip status={alert.status} />
              </td>
              <td className="py-3 pr-4">
                <span className="font-mono text-[11px] uppercase tracking-tag text-ink-2">
                  {formatRelative(alert.opened_at)}
                </span>
              </td>
              <td className="py-3 pr-4 text-right">
                <Link
                  to={`/alerts/${alert.id}`}
                  className="font-mono text-[11px] uppercase tracking-label text-ultra hover:text-ultra-lift"
                >
                  Open case
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** §15.4 model health. A sudden move in the alert rate is worth knowing early. */
export function ModelHealth({
  latency,
  queueHealth,
  alertRate,
  windowLabel: label,
}: {
  latency: MetricsOverview['latency'];
  queueHealth: MetricsOverview['queue_health'];
  alertRate: number;
  windowLabel: string;
}) {
  const rows: Array<[string, string]> = [
    ['Model version', latency.model_version ?? '—'],
    ['Latency p50', latency.p50_ms === null ? '—' : `${latency.p50_ms} ms`],
    ['Latency p95', latency.p95_ms === null ? '—' : `${latency.p95_ms} ms`],
    ['Latency p99', latency.p99_ms === null ? '—' : `${latency.p99_ms} ms`],
    ['Alert rate', `${(alertRate * 100).toFixed(2)}%`],
    ['Deferred scores', queueHealth.pending_scores.toLocaleString('en-GB')],
  ];

  return (
    <div className="border border-rule bg-surface">
      <dl className="grid gap-px bg-rule sm:grid-cols-3">
        {rows.map(([label_, value]) => (
          <div key={label_} className="bg-surface p-5">
            <dt className="mono-label mb-2 text-ink-3">{label_}</dt>
            <dd className="num font-mono text-[14px] tabular-nums text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="border-t border-rule px-5 py-4 text-[13px] text-ink-3">
        Measured over the {label}. A sudden move in the alert rate means the model changed or the
        traffic did.
      </p>
    </div>
  );
}

/** §15.4 team throughput. Labelled workload — used to rebalance, not to rank. */
export function TeamThroughput({ alerts }: { alerts: readonly Alert[] }) {
  const byAssignee = new Map<string, { open: number; inReview: number; closed: number }>();
  for (const alert of alerts) {
    const key = alert.assigned_to ?? 'unassigned';
    const row = byAssignee.get(key) ?? { open: 0, inReview: 0, closed: 0 };
    if (alert.status === 'OPEN') row.open += 1;
    else if (alert.status === 'IN_REVIEW') row.inReview += 1;
    else if (alert.closed_at !== null) row.closed += 1;
    byAssignee.set(key, row);
  }

  const rows = [...byAssignee.entries()].sort((a, b) => b[1].open - a[1].open);

  return (
    <div className="overflow-x-auto border border-rule bg-surface">
      <table className="w-full min-w-[560px] border-collapse">
        <thead>
          <tr className="border-b border-rule">
            {['Analyst', 'Open', 'In review', 'Closed'].map((label, index) => (
              <th
                key={label}
                scope="col"
                className={cx(
                  'py-3 pr-4 font-mono text-[11px] font-normal uppercase tracking-tag text-ink-3',
                  index === 0 ? 'pl-4 text-left' : 'text-right',
                )}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([assignee, row]) => (
            <tr key={assignee} className="border-b border-rule-soft">
              <td className="py-3 pl-4 pr-4 font-mono text-[12px] text-ink">
                {assignee === 'unassigned' ? 'Unassigned pool' : shortId(assignee)}
              </td>
              <td className="num py-3 pr-4 text-right font-mono text-[12px] tabular-nums text-ink">
                {row.open}
              </td>
              <td className="num py-3 pr-4 text-right font-mono text-[12px] tabular-nums text-ink">
                {row.inReview}
              </td>
              <td className="num py-3 pr-4 text-right font-mono text-[12px] tabular-nums text-ink">
                {row.closed}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-rule px-5 py-4 text-[13px] text-ink-3">
        Workload, not a league table — this is for rebalancing the queue. Counts come from the
        alerts currently loaded.
      </p>
    </div>
  );
}
