import { useCallback, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Alert } from '@/api/schemas/alerts';
import { tokenStore } from '@/auth/tokenStore';
import { useAuth } from '@/auth/AuthProvider';
import { Button, EmptyState, Eyebrow, Skeleton } from '@/components/primitives';
import { errorStatus } from '@/lib/problem';
import { formatProbability } from '@/lib/risk';
import { AlertFilterBar } from './AlertFilterBar';
import { AlertRow } from './AlertRow';
import { prefetchAlert, useAlertsQuery } from './queries';
import { useAlertFilters } from './useAlertFilters';

const COLUMNS = [
  { label: 'Severity', align: 'left' },
  { label: 'Probability', align: 'right' },
  { label: 'Amount', align: 'right' },
  { label: 'Status', align: 'left' },
  { label: 'Team', align: 'left' },
  { label: 'Opened', align: 'left' },
  { label: 'Assignee', align: 'left' },
  { label: '', align: 'right' },
] as const;

/** Median without sorting the caller's array in place. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  const low = sorted[middle - 1];
  const high = sorted[middle];
  if (low === undefined || high === undefined) return null;
  return (low + high) / 2;
}

export default function AlertQueuePage() {
  const filterState = useAlertFilters();
  const { filters } = filterState;
  const queryClient = useQueryClient();
  const { hasScope } = useAuth();

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPending,
    isError,
    refetch,
  } = useAlertsQuery(filters);

  const alerts = useMemo<Alert[]>(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  );

  // The token carries no team claim (verified against the running backend), so
  // the caller's team is inferred from the rows the server chose to return.
  // With alerts:read:all that inference is meaningless, so we skip it.
  const crossTeam = hasScope('alerts:read:all');
  useEffect(() => {
    if (crossTeam || alerts.length === 0) return;
    const teams = new Set(alerts.map((alert) => alert.team));
    tokenStore.setObservedTeam(teams.size === 1 ? (alerts[0]?.team ?? null) : null);
  }, [alerts, crossTeam]);

  const onHover = useCallback(
    (alertId: string) => prefetchAlert(queryClient, alertId),
    [queryClient],
  );

  const stats = useMemo(() => {
    const open = alerts.filter((alert) => alert.status === 'OPEN').length;
    const severe = alerts.filter(
      (alert) => alert.severity === 'HIGH' || alert.severity === 'CRITICAL',
    ).length;
    const med = median(alerts.map((alert) => alert.fraud_probability));
    return { open, severe, median: med };
  }, [alerts]);

  if (isError) {
    const status = errorStatus(error);
    return (
      <div className="border border-carmine bg-surface p-8">
        <Eyebrow className="text-carmine">Queue unavailable</Eyebrow>
        <h2 className="mb-3">The alert queue could not be loaded.</h2>
        <p className="mb-6 max-w-xl text-ink-2">
          {status === 403
            ? 'This account does not carry the scope required to read alerts.'
            : 'The platform did not return a queue. It may be restarting.'}
        </p>
        <Button onClick={() => void refetch()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-6">
        <div>
          <Eyebrow className="!mb-2">01 — Alert queue</Eyebrow>
          <h1>Cases awaiting triage</h1>
        </div>
        <p className="max-w-sm text-[14px] text-ink-2">
          {crossTeam
            ? 'Your scope includes alerts:read:all, so alerts from every team are listed.'
            : 'The platform scopes this queue to your team. Alerts from other teams are not listed.'}
        </p>
      </div>

      {/* Tiles are computed from loaded pages only. The API returns no total
          count by design, so any figure here that claimed to be global would be
          a lie — the label says exactly what it is. */}
      <section>
        <dl className="grid gap-px border border-rule bg-rule sm:grid-cols-3">
          <Tile label="Open alerts" value={isPending ? null : String(stats.open)} />
          <Tile label="High or critical" value={isPending ? null : String(stats.severe)} />
          <Tile
            label="Median probability"
            value={
              isPending ? null : stats.median === null ? '—' : `${formatProbability(stats.median)}%`
            }
          />
        </dl>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-tag text-ink-3">
          From loaded pages — {alerts.length} row{alerts.length === 1 ? '' : 's'} loaded
        </p>
      </section>

      <AlertFilterBar {...filterState} />

      <section>
        {isPending ? (
          <TableSkeleton />
        ) : alerts.length === 0 ? (
          <EmptyState
            title="No alerts match these filters"
            body="Widen the probability threshold or clear the status and severity filters."
          />
        ) : (
          <>
            <div className="overflow-x-auto border border-rule bg-surface">
              <table className="w-full min-w-[900px] border-collapse">
                <thead>
                  <tr className="border-b border-rule">
                    {COLUMNS.map((column, index) => (
                      <th
                        key={column.label || `col-${index}`}
                        scope="col"
                        className={`px-0 py-3 font-mono text-[11px] font-normal uppercase tracking-tag text-ink-3 ${
                          column.align === 'right' ? 'text-right' : 'text-left'
                        } ${index === 0 ? 'pl-4' : ''} ${
                          index === COLUMNS.length - 1 ? 'pr-4' : 'pr-4'
                        }`}
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="[&>tr>td:first-child]:pl-4 [&>tr>td:last-child]:pr-4">
                  {alerts.map((alert) => (
                    <AlertRow key={alert.id} alert={alert} onHover={onHover} />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <span className="mono-label text-ink-3">
                {hasNextPage ? 'More pages available' : 'End of queue'}
              </span>
              {hasNextPage ? (
                <Button
                  variant="ghost"
                  onClick={() => void fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? 'Loading' : 'Load more'}
                </Button>
              ) : null}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="bg-surface p-6">
      <dt className="mono-label mb-3 text-ink-3">{label}</dt>
      <dd className="font-display text-[34px] font-bold leading-none tracking-tight text-ink">
        {value === null ? <Skeleton className="h-8 w-20" /> : value}
      </dd>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="border border-rule bg-surface p-4">
      <Skeleton className="mb-4 h-3 w-full" />
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="flex items-center gap-4 border-b border-rule-soft py-4">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-2 w-24" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="ml-auto h-3 w-20" />
        </div>
      ))}
    </div>
  );
}
