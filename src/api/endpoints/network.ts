import { requestData, route } from '../client';
import {
  type NetworkGraph,
  type NetworkParams,
  NETWORK_LIMITS,
  networkGraphSchema,
} from '../schemas/network';

/** Clamp rather than 422: the server rejects out-of-range params outright. */
function clamp(value: number | undefined, limits: { min: number; max: number; default: number }) {
  if (value === undefined || !Number.isFinite(value)) return limits.default;
  return Math.min(limits.max, Math.max(limits.min, Math.round(value)));
}

function graphQuery(params: NetworkParams) {
  return {
    depth: clamp(params.depth, NETWORK_LIMITS.depth),
    window_days: clamp(params.window_days, NETWORK_LIMITS.window_days),
    max_nodes: clamp(params.max_nodes, NETWORK_LIMITS.max_nodes),
  };
}

/** Clicking a node re-centres the graph here. */
export async function getAccountNetwork(
  accountId: string,
  params: NetworkParams = {},
  signal?: AbortSignal,
): Promise<NetworkGraph> {
  return requestData(
    route('/v1/network/accounts/{account_id}', { account_id: accountId }, graphQuery(params)),
    { schema: networkGraphSchema, ...(signal ? { signal } : {}) },
  );
}

/** Entered via the party's first account; the server resolves which one. */
export async function getEntityNetwork(
  partyId: string,
  params: NetworkParams = {},
  signal?: AbortSignal,
): Promise<NetworkGraph> {
  return requestData(
    route('/v1/network/entities/{party_id}', { party_id: partyId }, graphQuery(params)),
    { schema: networkGraphSchema, ...(signal ? { signal } : {}) },
  );
}
