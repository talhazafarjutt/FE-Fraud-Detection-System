import { z } from 'zod';
import { isoDateTime } from './common';

/**
 * The audit trail: append-only, newest first.
 *
 * In a financial-crime system every state change must be reconstructable years
 * later. There is no write route — a POST returns 405 — and the trail describes
 * the analysts rather than being readable by them: `audit:read` is held by
 * SUPERVISOR and ADMIN only.
 */

export const auditEntrySchema = z
  .object({
    id: z.number().int(),
    actor: z.string(),
    actor_type: z.string(),
    action: z.string(),
    entity: z.string(),
    entity_id: z.string().nullish(),
    request_id: z.string().nullish(),
    ip: z.string().nullish(),
    /** Free-form per action — rendered as key/value, never assumed. */
    detail: z.record(z.unknown()).nullish(),
    created_at: isoDateTime,
  })
  .passthrough();
export type AuditEntry = z.infer<typeof auditEntrySchema>;

export interface AuditFilters {
  entity?: string;
  entity_id?: string;
  action?: string;
  actor?: string;
  created_from?: string;
  created_to?: string;
  cursor?: string;
  limit?: number;
}
