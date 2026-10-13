import { requestData, route } from '../client';
import {
  type Contract,
  type ContractDetail,
  type ContractFilters,
  type ContractPage,
  type ContractRegistration,
  contractDetailSchema,
  contractPageSchema,
  contractSchema,
} from '../schemas/contracts';
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

/** The register, team-scoped like every other read (alerts:read). */
export async function listContracts(
  filters: ContractFilters,
  signal?: AbortSignal,
): Promise<ContractPage> {
  return requestData(
    route('/v1/islamic/contracts', {
      status: filters.status,
      product: filters.product,
      q: filters.q,
      limit: filters.limit,
      offset: filters.offset,
    }),
    { schema: contractPageSchema, ...(signal ? { signal } : {}) },
  );
}

/** 404 when it is not registered, or is another team's. */
export async function getContract(id: string, signal?: AbortSignal): Promise<ContractDetail> {
  return requestData(route('/v1/islamic/contracts/{contract_id}', { contract_id: id }), {
    schema: contractDetailSchema,
    ...(signal ? { signal } : {}),
  });
}

/**
 * Registration is the bank's system's job (transactions:write, held by the
 * ingest client only). The console calls it from the sample runner alone,
 * with the ingest session's bearer — never from an analyst's screen.
 */
export async function registerContract(
  body: ContractRegistration,
  bearer: string,
): Promise<Contract> {
  return requestData(route('/v1/islamic/contracts'), {
    method: 'POST',
    body,
    schema: contractSchema,
    bearerOverride: bearer,
  });
}
