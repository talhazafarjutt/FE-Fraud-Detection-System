import { requestData, route } from '../client';
import {
  type MetricsOverview,
  type MetricsQuery,
  metricsOverviewSchema,
} from '../schemas/metrics';

/**
 * VERIFIED on the wire: this endpoint takes `from`/`to`/`bucket`. It does NOT
 * take `days`, despite the brief saying so — an unknown param would be ignored
 * silently and the window would quietly be the server default.
 */
export async function getMetricsOverview(
  query: MetricsQuery,
  signal?: AbortSignal,
): Promise<MetricsOverview> {
  return requestData(
    route('/v1/metrics/overview', { from: query.from, to: query.to, bucket: query.bucket }),
    {
      schema: metricsOverviewSchema,
      ...(signal ? { signal } : {}),
    },
  );
}
