import { requestData, route } from '../client';
import { parsePageTolerant, type TolerantPage } from '../compat';
import { type AuditEntry, type AuditFilters, auditEntrySchema } from '../schemas/audit';

/**
 * Newest first, keyset-paged. Requires `audit:read` — an ANALYST gets 403 and
 * the nav item is absent for them entirely.
 *
 * There is no write route: the trail is append-only and a POST returns 405.
 */
export async function listAuditLogs(
  filters: AuditFilters,
  cursor: string | null,
  signal?: AbortSignal,
): Promise<TolerantPage<AuditEntry>> {
  const payload = await requestData<unknown>(
    route('/v1/audit-logs', {
      entity: filters.entity,
      entity_id: filters.entity_id,
      action: filters.action,
      actor: filters.actor,
      created_from: filters.created_from,
      created_to: filters.created_to,
      limit: filters.limit,
      cursor,
    }),
    { ...(signal ? { signal } : {}) },
  );
  return parsePageTolerant(auditEntrySchema, payload);
}

/** Every action taken against one investigation — the case-page timeline. */
export async function listCaseAudit(
  caseId: string,
  signal?: AbortSignal,
): Promise<TolerantPage<AuditEntry>> {
  return listAuditLogs({ entity: 'fraud_case', entity_id: caseId, limit: 50 }, null, signal);
}
