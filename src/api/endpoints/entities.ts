import { requestData, route } from '../client';
import { parsePageTolerant, type TolerantPage } from '../compat';
import {
  type EntityDetail,
  type EntityFilters,
  type EntityRow,
  type EntityTransaction,
  entityDetailSchema,
  entitySchema,
  entityTransactionSchema,
} from '../schemas/entities';

/**
 * An entity is visible only if your team has transacted with it. An entity
 * outside your team returns 404, NOT 403 — the API denies cross-team access by
 * claiming the thing does not exist, so a detail 404 here means "not yours",
 * not "broken link".
 */
export async function listEntities(
  filters: EntityFilters,
  cursor: string | null,
  signal?: AbortSignal,
): Promise<TolerantPage<EntityRow>> {
  const payload = await requestData<unknown>(
    route('/v1/entities', {
      party_type: filters.party_type,
      country_code: filters.country_code,
      min_risk_tier: filters.min_risk_tier,
      q: filters.q,
      limit: filters.limit,
      cursor,
    }),
    { ...(signal ? { signal } : {}) },
  );
  return parsePageTolerant(entitySchema, payload);
}

export async function getEntity(partyId: string, signal?: AbortSignal): Promise<EntityDetail> {
  return requestData(route('/v1/entities/{party_id}', { party_id: partyId }), {
    schema: entityDetailSchema,
    ...(signal ? { signal } : {}),
  });
}

/** `direction` filters from THIS party's point of view: IN, OUT or INTERNAL. */
export async function listEntityTransactions(
  partyId: string,
  direction: string | undefined,
  cursor: string | null,
  signal?: AbortSignal,
): Promise<TolerantPage<EntityTransaction>> {
  const payload = await requestData<unknown>(
    route('/v1/entities/{party_id}/transactions', { party_id: partyId }, { direction, cursor }),
    { ...(signal ? { signal } : {}) },
  );
  return parsePageTolerant(entityTransactionSchema, payload);
}
