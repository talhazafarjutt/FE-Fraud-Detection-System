import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getPilotReport } from '@/api/endpoints/islamic';
import {
  PILOT_WINDOWS,
  type PilotHit,
  type PilotReport as Report,
} from '@/api/schemas/ruleSettings';
import { ApiErrorPanel, EmptyPanel, LoadingRows } from '@/components/ApiStates';
import { cx } from '@/components/primitives';
import { TeamScopeNote } from '@/components/TeamScopeNote';
import { LayerRuleSeverity } from '@/features/layers/LayerFindings';
import { productLabel } from '@/features/layers/facts';
import { ISLAMIC_LAYER, useLayers } from '@/features/layers/useMeta';
import { formatAbsolute, formatRelative } from '@/lib/format';
import { formatRiskScore } from '@/lib/risk';
import { ModeChip } from './parts';
import { pilotReportKey, ruleMeaning } from './rules';

export const PILOT_EXPLAINER =
  'Pilot rules run silently: they record what they would have done but never change a score or open an alert.';

const DEFAULT_WINDOW = 30;

/**
 * What rules on trial would have done over a window, against how the cases on
 * those transactions were concluded — the evidence for making a rule live, or
 * not. Team-scoped like every other read.
 */
export function PilotReport() {
  const [days, setDays] = useState<number>(DEFAULT_WINDOW);
  const query = useQuery({
    queryKey: [...pilotReportKey, days],
    queryFn: ({ signal }) => getPilotReport(days, signal),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-2xl text-ink-2">{PILOT_EXPLAINER}</p>
        <div
          role="radiogroup"
          aria-label="Report window"
          className="flex gap-px border border-rule bg-rule"
        >
          {PILOT_WINDOWS.map((window) => (
            <button
              key={window}
              type="button"
              role="radio"
              aria-checked={days === window}
              onClick={() => setDays(window)}
              className={cx(
                'px-4 py-2 font-mono text-[11px] uppercase tracking-label',
                days === window ? 'bg-ultra text-on-ultra' : 'bg-surface text-ink-2 hover:text-ink',
              )}
            >
              {window} days
            </button>
          ))}
        </div>
      </div>

      {query.isError ? (
        <ApiErrorPanel
          error={query.error}
          what="the pilot report"
          scopeHint="alerts:read"
          onRetry={() => void query.refetch()}
        />
      ) : query.isPending ? (
        <LoadingRows label="Loading the pilot report" />
      ) : (
        <ReportBody report={query.data} />
      )}
    </div>
  );
}

const RULE_COLUMNS = [
  'Rule',
  'Mode now',
  'Would flag',
  'Would remove',
  'Confirmed fraud',
  'False positive',
  'Open case',
  'No case',
] as const;

function ReportBody({ report }: { report: Report }) {
  return (
    <div className="space-y-8">
      <div className="overflow-x-auto border border-rule bg-surface">
        <table className="w-full min-w-[760px] border-collapse">
          <caption className="sr-only">Pilot results by rule, last {report.days} days</caption>
          <thead>
            <tr className="border-b border-rule">
              {RULE_COLUMNS.map((label, index) => (
                <th
                  key={label}
                  scope="col"
                  className={cx(
                    'py-3 pr-4 font-mono text-[11px] font-normal uppercase tracking-tag text-ink-3',
                    index === 0 ? 'pl-4 text-left' : index === 1 ? 'text-left' : 'text-right',
                  )}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.rules.length === 0 ? (
              <tr>
                <td colSpan={RULE_COLUMNS.length} className="px-4 py-6 text-ink-2">
                  No layer rules reported.
                </td>
              </tr>
            ) : (
              report.rules.map((row) => {
                const numbers = [
                  row.would_flag,
                  row.would_set_aside,
                  row.outcomes.confirmed_fraud,
                  row.outcomes.false_positive,
                  row.outcomes.open_case,
                  row.outcomes.no_case,
                ];
                const quiet = numbers.every((value) => value === 0) && row.mode_now !== 'PILOT';
                return (
                  <tr
                    key={row.rule}
                    className={cx('border-b border-rule-soft', quiet && 'text-ink-3')}
                  >
                    <th
                      scope="row"
                      className="py-3 pl-4 pr-4 text-left font-mono text-[12px] font-normal"
                      title={ruleMeaning(row.rule) ?? undefined}
                    >
                      {row.rule}
                    </th>
                    <td className="py-3 pr-4">
                      <ModeChip mode={row.mode_now} />
                    </td>
                    {numbers.map((value, index) => (
                      <td
                        key={RULE_COLUMNS[index + 2]}
                        className="num py-3 pr-4 text-right font-mono text-[12px] tabular-nums"
                      >
                        {value.toLocaleString('en-GB')}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <section aria-labelledby="pilot-hits" className="space-y-3">
        <h3
          id="pilot-hits"
          className="font-mono text-[13px] font-normal uppercase tracking-label text-ink"
        >
          Hits
        </h3>
        {report.hits.length === 0 ? (
          <EmptyPanel
            title={`No pilot hits in the last ${report.days} days`}
            body={
              <>
                A rule in Pilot that would have added or removed something shows up here, newest
                first. <TeamScopeNote noun="pilot hits" />
              </>
            }
          />
        ) : (
          <HitsTable hits={report.hits} />
        )}
      </section>
    </div>
  );
}

const HIT_COLUMNS = [
  'Booked',
  'Rule',
  'Would',
  'Product',
  'Severity',
  'Risk',
  'Outcome',
  'Alert',
] as const;

function HitsTable({ hits }: { hits: readonly PilotHit[] }) {
  const { products } = useLayers();
  return (
    <div className="overflow-x-auto border border-rule bg-surface">
      <table className="w-full min-w-[880px] border-collapse">
        <caption className="sr-only">Pilot hits, newest first</caption>
        <thead>
          <tr className="border-b border-rule">
            {HIT_COLUMNS.map((label, index) => (
              <th
                key={label}
                scope="col"
                className={cx(
                  'py-3 pr-4 text-left font-mono text-[11px] font-normal uppercase tracking-tag text-ink-3',
                  index === 0 && 'pl-4',
                  label === 'Risk' && 'text-right',
                )}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hits.map((hit) => (
            <tr
              key={`${hit.transaction_id}-${hit.rule}-${hit.kind}`}
              className="border-b border-rule-soft align-top"
            >
              <td className="py-3 pl-4 pr-4 font-mono text-[12px] text-ink-2">
                <time dateTime={hit.booked_at} title={formatAbsolute(hit.booked_at)}>
                  {formatRelative(hit.booked_at)}
                </time>
              </td>
              <td className="py-3 pr-4 font-mono text-[12px] text-ink">{hit.rule}</td>
              <td className="py-3 pr-4 text-[13px] text-ink-2">
                {hit.kind === 'set_aside' ? 'Remove' : hit.kind === 'added' ? 'Add' : hit.kind}
              </td>
              <td className="py-3 pr-4 text-[13px] text-ink-2">
                {hit.product
                  ? [
                      productLabel(hit.product, products, ISLAMIC_LAYER),
                      hit.event ? hit.event.toLowerCase().replace(/_/g, ' ') : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : '—'}
              </td>
              <td className="py-3 pr-4">
                {hit.severity ? <LayerRuleSeverity severity={hit.severity} /> : '—'}
              </td>
              <td className="num py-3 pr-4 text-right font-mono text-[12px] tabular-nums text-ink">
                {typeof hit.risk_score === 'number' ? formatRiskScore(hit.risk_score) : '—'}
              </td>
              <td className="py-3 pr-4 text-[13px] text-ink-2">{outcomeText(hit)}</td>
              <td className="py-3 pr-4 font-mono text-[12px]">
                {hit.alert_id ? (
                  <Link
                    to={`/alerts/${hit.alert_id}`}
                    className="text-ink underline decoration-rule underline-offset-2 hover:text-ultra"
                  >
                    Open alert
                  </Link>
                ) : (
                  <span className="text-ink-3">No alert</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The same four outcomes the per-rule columns count. */
export function outcomeText(hit: Pick<PilotHit, 'final_label' | 'case_status'>): string {
  if (hit.final_label === 'CONFIRMED_FRAUD') return 'Confirmed fraud';
  if (hit.final_label === 'FALSE_POSITIVE') return 'False positive';
  if (hit.case_status) return `Open case · ${hit.case_status.toLowerCase().replace(/_/g, ' ')}`;
  return 'No case';
}
