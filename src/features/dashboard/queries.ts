import { useQuery } from '@tanstack/react-query';
import { getMetricsOverview } from '@/api/endpoints/metrics';
import { listAlerts } from '@/api/endpoints/alerts';
import type { MetricsQuery } from '@/api/schemas/metrics';

/**
 * §15.5: the whole dashboard renders from TWO requests — `/v1/metrics/overview`
 * and one page of alerts. If a third is needed, the API is wrong, not the UI.
 *
 * `staleTime` is 60s with manual refresh. A dashboard refetching every few
 * seconds during a presentation is a distraction and a load generator.
 */

export const DASHBOARD_STALE_MS = 60_000;

export const dashboardKeys = {
  metrics: (query: MetricsQuery) => ['metrics', 'overview', query] as const,
  queue: () => ['alerts', 'list', { dashboard: true }] as const,
};

export function useMetricsQuery(query: MetricsQuery) {
  return useQuery({
    queryKey: dashboardKeys.metrics(query),
    queryFn: ({ signal }) => getMetricsOverview(query, signal),
    staleTime: DASHBOARD_STALE_MS,
    // The endpoint does not exist on the backend yet; a 404/405 is a state the
    // dashboard renders deliberately, so retrying it is wasted time on stage.
    retry: false,
  });
}

/** One page of alerts — feeds the work tiles, the queue list and the what-if. */
export function useDashboardAlerts() {
  return useQuery({
    queryKey: dashboardKeys.queue(),
    queryFn: ({ signal }) => listAlerts({ limit: 200 }, null, signal),
    staleTime: DASHBOARD_STALE_MS,
  });
}

/** Windows offered by the range control. Every figure is labelled with one. */
export const WINDOWS = [
  { id: '24h', label: 'Last 24 hours', hours: 24, bucket: 'hour' as const },
  { id: '7d', label: 'Last 7 days', hours: 24 * 7, bucket: 'day' as const },
  { id: '30d', label: 'Last 30 days', hours: 24 * 30, bucket: 'day' as const },
];

export type WindowId = (typeof WINDOWS)[number]['id'];

export function windowToQuery(id: WindowId): MetricsQuery {
  const win = WINDOWS.find((w) => w.id === id) ?? WINDOWS[1]!;
  return {
    from: new Date(Date.now() - win.hours * 3_600_000).toISOString(),
    to: new Date().toISOString(),
    bucket: win.bucket,
  };
}

export function windowLabel(id: WindowId): string {
  return (WINDOWS.find((w) => w.id === id) ?? WINDOWS[1]!).label.toLowerCase();
}
