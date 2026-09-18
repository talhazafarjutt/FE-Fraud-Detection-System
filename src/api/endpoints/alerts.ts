import { queryString, requestData } from '../client';
import {
  type Alert,
  type AlertDetail,
  type AlertFilters,
  type AlertPage,
  type AlertPatch,
  alertDetailSchema,
  alertPageSchema,
  alertSchema,
} from '../schemas/alerts';

export async function listAlerts(
  filters: AlertFilters,
  cursor: string | null,
  signal?: AbortSignal,
): Promise<AlertPage> {
  const qs = queryString({
    status: filters.status,
    severity: filters.severity,
    min_probability: filters.min_probability,
    limit: filters.limit,
    cursor,
  });
  return requestData(`/v1/fraud-alerts${qs}`, {
    schema: alertPageSchema,
    ...(signal ? { signal } : {}),
  });
}

export async function getAlert(alertId: string, signal?: AbortSignal): Promise<AlertDetail> {
  return requestData(`/v1/fraud-alerts/${alertId}`, {
    schema: alertDetailSchema,
    ...(signal ? { signal } : {}),
  });
}

export async function patchAlert(alertId: string, patch: AlertPatch): Promise<Alert> {
  // The server uses extra="forbid": sending an undefined key as null is a 422,
  // so strip anything the user did not actually set.
  const body: Record<string, unknown> = {};
  if (patch.status !== undefined) body['status'] = patch.status;
  if (patch.assigned_to !== undefined) body['assigned_to'] = patch.assigned_to;
  if (patch.note !== undefined && patch.note !== '') body['note'] = patch.note;
  /**
   * `feedback` is deliberately NOT sent.
   *
   * The verdict moved from the alert to the case: the deployed API rejects a
   * `feedback` block on this endpoint with 422 "One or more fields are
   * invalid." (verified against production). One scheme gets one judgement,
   * because a verdict per alert would emit several correlated training labels
   * for a single fraud event.
   *
   * The replacement is `PATCH /v1/cases/{id}`, which does not exist yet —
   * see NOT_IMPLEMENTED.caseVerdict in src/api/unavailable.ts. Until it ships,
   * the console records triage transitions here and shows the verdict step as
   * pending rather than firing a request that cannot succeed.
   */

  return requestData(`/v1/fraud-alerts/${alertId}`, {
    method: 'PATCH',
    body,
    schema: alertSchema,
  });
}
