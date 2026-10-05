import { requestData, route } from '../client';
import { type IslamicSummary, islamicSummarySchema } from '../schemas/islamic';

/**
 * Mounted by the Islamic layer only while it is switched on; the console asks
 * for it only when `meta.layers` says so.
 */
export async function getIslamicSummary(signal?: AbortSignal): Promise<IslamicSummary> {
  return requestData(route('/v1/islamic/summary'), {
    schema: islamicSummarySchema,
    ...(signal ? { signal } : {}),
  });
}
