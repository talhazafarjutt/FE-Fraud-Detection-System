import { useQuery } from '@tanstack/react-query';
import { listCases } from '@/api/endpoints/cases';
import { getMetricsOverview } from '@/api/endpoints/metrics';
import { listAuditLogs } from '@/api/endpoints/audit';
import { useAuth } from '@/auth/AuthProvider';
import { useObservedTeam } from '@/auth/observeTeam';
import type { StageId } from './stages';

/** Stable identity so the observation effect does not re-run every render. */
const EMPTY: readonly { team?: string | null }[] = [];

/**
 * Real numbers from the user's own data.
 *
 * A flow diagram with invented counts trains people to distrust the screen, so
 * nothing here is a placeholder: a count either comes back from an endpoint or
 * it is absent. Each query is gated on the scope that endpoint requires, so an
 * ADMIN never fires a request that would 403 just to fill a number in.
 */
export function useFlowCounts(): {
  counts: Partial<Record<StageId, string>>;
  loading: boolean;
} {
  const { hasScope } = useAuth();

  const metrics = useQuery({
    queryKey: ['flow', 'metrics'],
    queryFn: ({ signal }) => getMetricsOverview({}, signal),
    enabled: hasScope('alerts:read'),
    staleTime: 60_000,
  });

  const openCases = useQuery({
    queryKey: ['flow', 'cases', 'OPEN'],
    queryFn: ({ signal }) => listCases({ status: 'OPEN', limit: 100 }, null, signal),
    enabled: hasScope('alerts:read'),
    staleTime: 60_000,
  });

  const activeCases = useQuery({
    queryKey: ['flow', 'cases', 'IN_REVIEW'],
    queryFn: ({ signal }) => listCases({ status: 'IN_REVIEW', limit: 100 }, null, signal),
    enabled: hasScope('alerts:read'),
    staleTime: 60_000,
  });

  const audit = useQuery({
    queryKey: ['flow', 'audit'],
    queryFn: ({ signal }) => listAuditLogs({ limit: 1 }, null, signal),
    enabled: hasScope('audit:read'),
    staleTime: 60_000,
  });

  /*
   * The token carries no team claim, so the team shown on this page is learned
   * from the rows the server returned. Doing it here means the flow view can
   * name the team on first load rather than only after visiting the queue.
   */
  useObservedTeam(openCases.data?.items ?? EMPTY, !hasScope('alerts:read:all'));

  const counts: Partial<Record<StageId, string>> = {};

  if (metrics.data) {
    const totals = metrics.data.totals;
    if (totals?.transactions != null) counts.transaction = `${totals.transactions} seen`;
    if (totals?.alerted != null) counts.score = `${totals.alerted} scored above threshold`;

    const open = metrics.data.by_alert_status?.['OPEN'];
    if (open != null) counts.alert = `${open} open`;
  }

  // A page that came back full may well have more behind its cursor. Saying
  // "100+" is honest; saying "100" would not be.
  const pageCount = (page: { items: unknown[]; next_cursor: string | null } | undefined) =>
    page ? `${page.items.length}${page.next_cursor ? '+' : ''}` : undefined;

  const open = pageCount(openCases.data);
  if (open) counts.case = `${open} open`;

  const active = pageCount(activeCases.data);
  if (active) counts.investigation = `${active} in review`;

  if (audit.data?.items.length) counts.audit = 'recording';

  return {
    counts,
    loading:
      metrics.isLoading || openCases.isLoading || activeCases.isLoading || audit.isLoading,
  };
}
