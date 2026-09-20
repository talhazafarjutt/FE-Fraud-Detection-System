import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { listCases } from '@/api/endpoints/cases';
import type { CaseRow } from '@/api/schemas/cases';
import { ApiErrorPanel, EmptyPanel, LoadingRows, SkippedRowsNotice } from '@/components/ApiStates';
import { SeverityChip, StatusChip } from '@/components/Chips';
import { Button, Eyebrow, SectionHeading, cx } from '@/components/primitives';
import { useAuth } from '@/auth/AuthProvider';
import { TeamScopeNote } from '@/components/TeamScopeNote';
import { useObservedTeam } from '@/auth/observeTeam';
import { formatAbsolute, formatRelative } from '@/lib/format';

const STATUSES = [
  'OPEN',
  'IN_REVIEW',
  'ESCALATED',
  'CONFIRMED_FRAUD',
  'FALSE_POSITIVE',
  'CLOSED',
] as const;
const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

/** Investigations is the same list, filtered to what is actively being worked. */
const ACTIVE = ['IN_REVIEW', 'ESCALATED'] as const;

/**
 * Cases — the unit of human judgement.
 *
 * Criminals do not commit one transaction. A mule ring moves funds through many
 * accounts in small steps, each step raising its own alert; one ring in the
 * seeded data produces 17 alerts and exactly 1 case. Without the grouping an
 * analyst investigates the same ring seventeen times.
 *
 * `alert_count` is therefore the loudest column on this screen.
 */
export default function CasesPage({ investigationsOnly = false }: { investigationsOnly?: boolean }) {
  const { hasScope } = useAuth();
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [severity, setSeverity] = useState<string | undefined>(undefined);

  /*
   * `/v1/cases` takes a single status. Investigations is two of them, so it is
   * two queries merged here rather than a filter the API cannot express.
   */
  const statuses: (string | undefined)[] = investigationsOnly
    ? status
      ? [status]
      : [...ACTIVE]
    : [status];

  const queries = useInfiniteQuery({
    queryKey: ['cases', 'list', statuses, severity],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) => {
      const pages = await Promise.all(
        statuses.map((s) => listCases({ status: s, severity, limit: 50 }, pageParam, signal)),
      );
      return {
        items: pages.flatMap((p) => p.items),
        skipped: pages.reduce((sum, p) => sum + p.skipped, 0),
        // Merged lists cannot share one cursor honestly. Paging stops at the
        // first page here; the full list view pages normally.
        next_cursor: statuses.length === 1 ? (pages[0]?.next_cursor ?? null) : null,
        page_size: pages.reduce((sum, p) => sum + p.page_size, 0),
      };
    },
    getNextPageParam: (last) => last.next_cursor,
  });

  const rows = useMemo<CaseRow[]>(() => {
    const all = queries.data?.pages.flatMap((p) => p.items) ?? [];
    return [...all].sort(
      (a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime(),
    );
  }, [queries.data]);

  const skipped = useMemo(
    () => queries.data?.pages.reduce((sum, p) => sum + p.skipped, 0) ?? 0,
    [queries.data],
  );

  useObservedTeam(rows, !hasScope('alerts:read:all'));

  const grouped = rows.filter((c) => (c.alert_count ?? 1) > 1);
  const totalAlerts = rows.reduce((sum, c) => sum + (c.alert_count ?? 1), 0);

  return (
    <div className="space-y-8">
      <SectionHeading
        index={investigationsOnly ? '03' : '07'}
        title={investigationsOnly ? 'Investigations' : 'Cases'}
        hint={
          investigationsOnly
            ? 'Cases in review or escalated — the active workload rather than the full history.'
            : 'Alerts belonging to one scheme are grouped into a single investigation, so a nine-alert mule ring is worked once and judged once.'
        }
        actions={
          !hasScope('alerts:close') ? (
            <span className="tag" title="alerts:close is held by a supervisor">
              You cannot conclude
            </span>
          ) : null
        }
      />

      <section className="border border-rule bg-surface">
        <div className="grid gap-px bg-rule md:grid-cols-3">
          <Field label="Status">
            <select
              className="field"
              value={status ?? ''}
              onChange={(e) => setStatus(e.target.value || undefined)}
            >
              <option value="">{investigationsOnly ? 'In review and escalated' : 'Any'}</option>
              {(investigationsOnly ? ACTIVE : STATUSES).map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Severity">
            <select
              className="field"
              value={severity ?? ''}
              onChange={(e) => setSeverity(e.target.value || undefined)}
            >
              <option value="">Any</option>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <div className="bg-surface p-4">
            <Eyebrow className="!mb-2">Grouping</Eyebrow>
            <p className="text-ink-2">
              <span className="font-mono text-[16px] tabular-nums text-ink">{rows.length}</span>{' '}
              case{rows.length === 1 ? '' : 's'} covering{' '}
              <span className="font-mono text-[16px] tabular-nums text-ink">{totalAlerts}</span>{' '}
              alert{totalAlerts === 1 ? '' : 's'}
              {grouped.length ? `, ${grouped.length} of them multi-alert` : ''}.
            </p>
          </div>
        </div>
      </section>

      <SkippedRowsNotice skipped={skipped} />

      {queries.isError ? (
        <ApiErrorPanel
          error={queries.error}
          what="the case list"
          scopeHint="alerts:read"
          onRetry={() => void queries.refetch()}
        />
      ) : queries.isPending ? (
        <LoadingRows label="Loading cases" />
      ) : rows.length === 0 ? (
        <EmptyPanel
          title={investigationsOnly ? 'Nothing in review' : 'No cases'}
          body={
            <>
              {investigationsOnly
                ? 'No case has been picked up yet. A case moves here once an analyst takes it from OPEN to IN REVIEW.'
                : 'No scheme has been grouped into an investigation.'}{' '}
              <TeamScopeNote noun="cases" />
            </>
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto border border-rule bg-surface">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-rule">
                  {['Investigation', 'Alerts', 'Status', 'Severity', 'Team', 'Opened', 'Closed'].map(
                    (label, i) => (
                      <th
                        key={label}
                        className={cx(
                          'px-4 py-3 font-mono text-[11px] uppercase tracking-label text-ink-3',
                          i === 1 && 'text-right',
                        )}
                      >
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-rule-soft last:border-0">
                    <td className="px-4 py-3">
                      <Link to={`/cases/${row.id}`} className="font-medium hover:text-ultra">
                        {row.title}
                      </Link>
                      {row.assigned_to ? (
                        <span className="ml-2 font-mono text-[11px] text-ink-3">assigned</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <AlertCount count={row.alert_count ?? 1} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip status={String(row.status)} />
                    </td>
                    <td className="px-4 py-3">
                      <SeverityChip severity={String(row.severity)} />
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-ink-2">{row.team}</td>
                    <td className="px-4 py-3 text-ink-2" title={formatAbsolute(row.opened_at)}>
                      {formatRelative(row.opened_at)}
                    </td>
                    <td className="px-4 py-3 text-ink-2" title={formatAbsolute(row.closed_at)}>
                      {row.closed_at ? formatRelative(row.closed_at) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {queries.hasNextPage ? (
            <Button
              variant="ghost"
              disabled={queries.isFetchingNextPage}
              onClick={() => void queries.fetchNextPage()}
            >
              {queries.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * The number that makes the grouping visible. A 17-alert case must not look
 * like a 1-alert case at a glance, so it is weighted rather than plain.
 */
function AlertCount({ count }: { count: number }) {
  return (
    <span
      className={cx(
        'font-mono tabular-nums',
        count >= 5 ? 'text-[16px] text-carmine' : count > 1 ? 'text-[14px] text-amber' : 'text-[12px] text-ink-3',
      )}
      title={`${count} alert${count === 1 ? '' : 's'} in this investigation`}
    >
      {count}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block bg-surface p-4">
      <Eyebrow className="!mb-2">{label}</Eyebrow>
      {children}
    </label>
  );
}
