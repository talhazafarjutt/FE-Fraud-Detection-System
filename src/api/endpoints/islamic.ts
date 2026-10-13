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
import {
  type PilotReport,
  type RuleSettings,
  type RuleSettingsChange,
  type SettingsVersion,
  pilotReportSchema,
  ruleSettingsSchema,
  settingsHistorySchema,
} from '../schemas/ruleSettings';

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

/* ------------------------------------------------------------------ *
 * Rule settings and the pilot report. Settings are per deployment, not per
 * team: anyone with alerts:read reads them, rules:manage (SUPERVISOR) changes
 * them. The pilot report is team-scoped like every other read.
 * ------------------------------------------------------------------ */

export async function getRuleSettings(signal?: AbortSignal): Promise<RuleSettings> {
  return requestData(route('/v1/islamic/settings'), {
    schema: ruleSettingsSchema,
    ...(signal ? { signal } : {}),
  });
}

/** Only what changes. 422 names each bad field; a change that changes nothing is a 422 too. */
export async function updateRuleSettings(change: RuleSettingsChange): Promise<RuleSettings> {
  return requestData(route('/v1/islamic/settings'), {
    method: 'PUT',
    body: change,
    schema: ruleSettingsSchema,
  });
}

/** Back to the shipped defaults, recorded as a new version. */
export async function resetRuleSettings(reason: string): Promise<RuleSettings> {
  return requestData(route('/v1/islamic/settings/reset'), {
    method: 'POST',
    body: { reason },
    schema: ruleSettingsSchema,
  });
}

/** Newest first, each with the fields it changed. */
export async function getRuleSettingsHistory(
  limit = 50,
  signal?: AbortSignal,
): Promise<SettingsVersion[]> {
  return requestData(route('/v1/islamic/settings/history', { limit }), {
    schema: settingsHistorySchema,
    ...(signal ? { signal } : {}),
  });
}

export async function getPilotReport(days: number, signal?: AbortSignal): Promise<PilotReport> {
  return requestData(route('/v1/islamic/pilot-report', { days }), {
    schema: pilotReportSchema,
    ...(signal ? { signal } : {}),
  });
}
