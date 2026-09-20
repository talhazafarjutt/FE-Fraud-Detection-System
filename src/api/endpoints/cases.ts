import { request, requestData, route } from '../client';
import { parsePageTolerant, type TolerantPage } from '../compat';
import {
  type CaseDetail,
  type CasePatchInput,
  type CaseRow,
  caseDetailSchema,
  caseSchema,
} from '../schemas/cases';

export interface CaseFilters {
  status?: string;
  severity?: string;
  limit?: number;
}

export async function listCases(
  filters: CaseFilters,
  cursor: string | null,
  signal?: AbortSignal,
): Promise<TolerantPage<CaseRow>> {
  const payload = await requestData<unknown>(
    route('/v1/cases', {
      status: filters.status,
      severity: filters.severity,
      limit: filters.limit,
      cursor,
    }),
    { ...(signal ? { signal } : {}) },
  );
  return parsePageTolerant(caseSchema, payload);
}

export async function getCase(caseId: string, signal?: AbortSignal): Promise<CaseDetail> {
  return requestData(route('/v1/cases/{case_id}', { case_id: caseId }), {
    schema: caseDetailSchema,
    ...(signal ? { signal } : {}),
  });
}

/**
 * Triage, assignment and the verdict all land here.
 *
 * The server uses `extra="forbid"` and treats an explicit null as a value, so
 * only keys the caller actually set are sent. A status change into a verdict
 * (CONFIRMED_FRAUD / FALSE_POSITIVE) without `feedback` is a 409 by design —
 * the label is the point of concluding, not a side effect of it.
 */
export async function patchCase(caseId: string, patch: CasePatchInput): Promise<CaseDetail> {
  const body: Record<string, unknown> = {};
  if (patch.status !== undefined) body['status'] = patch.status;
  if (patch.title !== undefined) body['title'] = patch.title;
  if (patch.assigned_to !== undefined) body['assigned_to'] = patch.assigned_to;
  if (patch.note !== undefined && patch.note !== '') body['note'] = patch.note;
  if (patch.feedback !== undefined) {
    const f = patch.feedback;
    body['feedback'] = {
      final_label: f.final_label,
      confidence: f.confidence,
      model_agreement: f.model_agreement,
      ...(f.fraud_typology ? { fraud_typology: f.fraud_typology } : {}),
      ...(f.decision_drivers.length ? { decision_drivers: f.decision_drivers } : {}),
      ...(f.missing_signals.length ? { missing_signals: f.missing_signals } : {}),
      ...(f.notes ? { notes: f.notes } : {}),
    };
  }

  return requestData(route('/v1/cases/{case_id}', { case_id: caseId }), {
    method: 'PATCH',
    body,
    schema: caseDetailSchema,
  });
}

/** Grouping the engine missed: pull an alert into this investigation. */
export async function attachAlert(caseId: string, alertId: string): Promise<CaseDetail> {
  return requestData(route('/v1/cases/{case_id}/alerts', { case_id: caseId }), {
    method: 'POST',
    body: { alert_id: alertId },
    schema: caseDetailSchema,
  });
}

/** Grouping the engine got wrong: an alert an investigator judged unrelated. */
export async function detachAlert(caseId: string, alertId: string): Promise<void> {
  await request(
    route('/v1/cases/{case_id}/alerts/{alert_id}', { case_id: caseId, alert_id: alertId }),
    { method: 'DELETE' },
  );
}
