import { type QueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { getAlert, listAlerts } from '@/api/endpoints/alerts';
import type { AlertFilters } from '@/api/schemas/alerts';

export const alertKeys = {
  all: ['alerts'] as const,
  list: (filters: AlertFilters) => ['alerts', 'list', filters] as const,
  detail: (alertId: string) => ['alerts', 'detail', alertId] as const,
};

/**
 * Keyset pagination. There is no page number and no total count by design
 * (O(1) deep pages), so pages are chained on `next_cursor` and page 1..n is
 * never refetched to reach n+1.
 */
export function useAlertsQuery(filters: AlertFilters) {
  return useInfiniteQuery({
    queryKey: alertKeys.list(filters),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => listAlerts(filters, pageParam, signal),
    getNextPageParam: (lastPage) => lastPage.next_cursor,
  });
}

/** Warm the detail cache on row hover so the click feels instant on stage. */
export function prefetchAlert(queryClient: QueryClient, alertId: string): void {
  void queryClient.prefetchQuery({
    queryKey: alertKeys.detail(alertId),
    queryFn: ({ signal }) => getAlert(alertId, signal),
    staleTime: 30_000,
  });
}
