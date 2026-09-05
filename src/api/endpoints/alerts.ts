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

  return requestData(`/v1/fraud-alerts/${alertId}`, {
    method: 'PATCH',
    body,
    schema: alertSchema,
  });
}
