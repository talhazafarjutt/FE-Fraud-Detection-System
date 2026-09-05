import { Suspense, lazy, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { tokenStore } from '@/auth/tokenStore';
import { Button, Eyebrow, Skeleton } from '@/components/primitives';
import { errorStatus } from '@/lib/problem';
import { formatAmount } from '@/lib/money';
import {
  ModelHealth,
  MyQueue,
  OutcomeGrid,
  PanelSection,
  RiskDistribution,
  TeamThroughput,
  Tile,
  TooFewPoints,
} from './panels';
import { ThresholdExplorer } from './ThresholdExplorer';
import { WINDOWS, type WindowId, useDashboardAlerts, useMetricsQuery, windowLabel, windowToQuery } from './queries';

const FlowChart = lazy(() => import('./FlowChart'));

const OPEN_STATUSES = new Set(['OPEN', 'IN_REVIEW', 'ESCALATED']);

export default function DashboardPage() {
  const { session, hasScope } = useAuth();
  const [windowId, setWindowId] = useState<WindowId>('7d');
  const query = useMemo(() => windowToQuery(windowId), [windowId]);
  const label = windowLabel(windowId);

  const metrics = useMetricsQuery(query);
  const queue = useDashboardAlerts();

  const isSupervisor = hasScope('alerts:read:all');
  const me = session?.subject ?? null;

  // Memoised so the fallback array does not get a new identity every render,
  // which would defeat the work memo below and re-render every child panel.
  const alerts = useMemo(() => queue.data?.items ?? [], [queue.data]);

  const work = useMemo(() => {
    const open = alerts.filter((a) => OPEN_STATUSES.has(a.status));
    const mine = open.filter((a) => me !== null && a.assigned_to === me);
    const unassigned = open.filter((a) => a.assigned_to === null);
    const oldest = open.reduce<string | null>(
      (acc, a) => (acc === null || Date.parse(a.opened_at) < Date.parse(acc) ? a.opened_at : acc),
      null,
    );
    const oldestHours =
      oldest === null ? null : Math.floor((Date.now() - Date.parse(oldest)) / 3_600_000);
    const top = [...open].sort((a, b) => b.fraud_probability - a.fraud_probability).slice(0, 10);
    return { open, mine, unassigned, oldestHours, top };
  }, [alerts, me]);

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-rule pb-6">
        <div>
          <Eyebrow className="!mb-2">Dashboard</Eyebrow>
          <h1>{isSupervisor ? 'Team and model overview' : 'What to work on now'}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="window" className="mono-label text-ink-3">
            Window
          </label>
          <select
            id="window"
            className="field w-auto"
            value={windowId}
            onChange={(event) => setWindowId(event.target.value)}
          >
            {WINDOWS.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </select>
          <Button
            variant="ghost"
            onClick={() => {
              void metrics.refetch();
              void queue.refetch();
            }}
            disabled={metrics.isFetching || queue.isFetching}
          >
            {metrics.isFetching || queue.isFetching ? 'Refreshing' : 'Refresh'}
          </Button>
        </div>
      </header>

      {/* Row 1 — my work. Sourced from the alerts page, not from metrics. */}
      <section>
        <dl className="grid gap-px border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
          <Tile
            label="My open cases"
            value={queue.isPending ? null : String(work.mine.length)}
            window="assigned to me, currently open"
          />
          <Tile
            label="Unassigned in my team"
            value={queue.isPending ? null : String(work.unassigned.length)}
            window="the pool to pull from"
          />
          <Tile
            label="Oldest open"
            value={
              queue.isPending
                ? null
                : work.oldestHours === null
                  ? '—'
                  : `${work.oldestHours}h`
            }
            window="age of the longest-waiting case"
            tone={work.oldestHours !== null && work.oldestHours > 24 ? 'danger' : 'normal'}
          />
          <Tile
            label="Awaiting score"
            value={metrics.isPending ? null : String(metrics.data?.queue_health.pending_scores ?? 0)}
            detail={
              metrics.data?.queue_health.oldest_pending_seconds
                ? `Oldest ${metrics.data.queue_health.oldest_pending_seconds}s`
                : undefined
            }
            window="if this climbs, the worker is behind"
            tone={(metrics.data?.queue_health.pending_scores ?? 0) > 0 ? 'warn' : 'normal'}
          />
        </dl>
      </section>

      {metrics.isError ? (
        <MetricsUnavailable status={errorStatus(metrics.error)} onRetry={() => void metrics.refetch()} />
      ) : metrics.isPending ? (
        <Skeleton className="h-72 w-full" />
      ) : metrics.data ? (
        <>
          <PanelSection
            index="01"
            title="Transaction flow"
            hint="Fraud and non-fraud together. Most traffic is fine, and the system says so."
          >
            {metrics.data.series.length < 2 ? (
              <TooFewPoints count={metrics.data.series.length} />
            ) : (
              <div className="border border-rule bg-surface p-6">
                <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                  <FlowChart series={metrics.data.series} />
                </Suspense>
              </div>
            )}
            <p className="text-[15px] leading-relaxed text-ink-2">
              {metrics.data.totals.transactions.toLocaleString('en-GB')} transactions,{' '}
              {metrics.data.totals.alerted.toLocaleString('en-GB')} flagged (
              {(metrics.data.totals.alert_rate * 100).toFixed(2)}%),{' '}
              {metrics.data.outcomes.confirmed_fraud.toLocaleString('en-GB')} confirmed fraud —{' '}
              {label}. {formatAmount(metrics.data.totals.flagged_amount)}{' '}
              {metrics.data.totals.currency} of{' '}
              {formatAmount(metrics.data.totals.total_amount)} {metrics.data.totals.currency}{' '}
              flagged.
            </p>
          </PanelSection>

          <PanelSection
            index="02"
            title="Risk distribution"
            hint={`Where the mass of traffic sits relative to the alert threshold — ${label}.`}
          >
            <RiskDistribution
              byRiskLevel={metrics.data.by_risk_level}
              total={metrics.data.totals.transactions}
            />
          </PanelSection>
        </>
      ) : null}

      <PanelSection
        index="03"
        title="My queue"
        hint="The ten highest-probability open cases visible to you."
        actions={
          <Link to="/alerts" className="btn btn--ghost">
            Full queue
          </Link>
        }
      >
        {queue.isPending ? <Skeleton className="h-64 w-full" /> : <MyQueue alerts={work.top} />}
      </PanelSection>

      {/*
        Supervisor sections are extra panels on the same route, gated on
        alerts:read:all — not a separate page.
      */}
      {isSupervisor ? (
        <>
          <PanelSection
            index="04"
            title="Outcome quality"
            hint="The confusion terms we can actually measure from closed cases."
          >
            {metrics.isPending ? (
              <Skeleton className="h-64 w-full" />
            ) : metrics.data ? (
              <OutcomeGrid outcomes={metrics.data.outcomes} />
            ) : (
              <p className="border border-rule-soft px-6 py-8 text-ink-2">
                Outcome quality needs the metrics endpoint.
              </p>
            )}
          </PanelSection>

          <PanelSection
            index="05"
            title="Threshold explorer"
            hint="How a different alert threshold would have changed the workload on cases already resolved."
          >
            {queue.isPending ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ThresholdExplorer alerts={alerts} />
            )}
          </PanelSection>

          <PanelSection
            index="06"
            title="Team throughput"
            hint="Workload across the team, for rebalancing the queue."
          >
            {queue.isPending ? <Skeleton className="h-48 w-full" /> : <TeamThroughput alerts={alerts} />}
          </PanelSection>

          <PanelSection index="07" title="Model health" hint="Is the model behaving as it did yesterday?">
            {metrics.isPending ? (
              <Skeleton className="h-40 w-full" />
            ) : metrics.data ? (
              <ModelHealth
                latency={metrics.data.latency}
                queueHealth={metrics.data.queue_health}
                alertRate={metrics.data.totals.alert_rate}
                windowLabel={label}
              />
            ) : (
              <p className="border border-rule-soft px-6 py-8 text-ink-2">
                Model health needs the metrics endpoint.
              </p>
            )}
          </PanelSection>
        </>
      ) : null}

      <p className="border-t border-rule pt-6 font-mono text-[10px] uppercase tracking-tag text-ink-3">
        Team {tokenStore.get()?.team ?? (isSupervisor ? 'all teams' : '—')} · figures cover the{' '}
        {label}
      </p>
    </div>
  );
}

/**
 * §15.1 is explicit: do not fake the dashboard with client-side aggregation and
 * do not invent endpoint names. So when `/v1/metrics/overview` is absent, the
 * dashboard says exactly that instead of inventing numbers.
 */
function MetricsUnavailable({ status, onRetry }: { status: number | undefined; onRetry: () => void }) {
  const notBuilt = status === 404 || status === 405;
  return (
    <div className="border border-amber bg-surface p-8">
      <Eyebrow className="text-amber">
        {notBuilt ? 'Metrics endpoint not available' : 'Metrics unavailable'}
      </Eyebrow>
      <h2 className="mb-3">
        {notBuilt ? 'This backend does not expose /v1/metrics/overview yet.' : 'Aggregates could not be loaded.'}
      </h2>
      <p className="mb-6 max-w-2xl text-ink-2">
        {notBuilt ? (
          <>
            The flow chart, risk distribution and outcome quality panels are driven entirely by that
            endpoint. They are deliberately left blank rather than filled with figures aggregated in
            the browser, which would break past the first page and misstate the totals. The
            case-based panels below still work.
          </>
        ) : (
          'The platform did not return aggregates. It may be restarting.'
        )}
      </p>
      <Button onClick={onRetry}>Retry</Button>
    </div>
  );
}
