import { queryString, requestData } from '../client';
import {
  type MetricsOverview,
  type MetricsQuery,
  metricsOverviewSchema,
} from '../schemas/metrics';

/**
 * §15.2. Not implemented on the backend yet (404 today) — the dashboard
 * handles that as an explicit unavailable state rather than a crash.
 */
export async function getMetricsOverview(
  query: MetricsQuery,
  signal?: AbortSignal,
): Promise<MetricsOverview> {
  const qs = queryString({ from: query.from, to: query.to, bucket: query.bucket });
  return requestData(`/v1/metrics/overview${qs}`, {
    schema: metricsOverviewSchema,
    ...(signal ? { signal } : {}),
  });
}
