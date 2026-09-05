import { queryString, request, requestData } from '../client';
import {
  type Transaction,
  type TransactionCreated,
  type TransactionFilters,
  type TransactionPage,
  type Risk,
  riskSchema,
  transactionCreatedSchema,
  transactionPageSchema,
  transactionSchema,
} from '../schemas/transactions';

export interface CreateTransactionResult {
  data: TransactionCreated;
  status: number;
  /** True when the backend recognised the Idempotency-Key and replayed. */
  replayed: boolean;
}

/**
 * `bearer` is the ingest client's machine token. transactions:write is not held
 * by any human role, so this call is made with the machine session when one has
 * been opened, and falls back to the human token only so the 403 is visible
 * rather than hidden.
 */
export async function createTransaction(
  body: unknown,
  idempotencyKey: string,
  bearer?: string,
): Promise<CreateTransactionResult> {
  const result = await request('/v1/transactions', {
    method: 'POST',
    body,
    schema: transactionCreatedSchema,
    headers: { 'Idempotency-Key': idempotencyKey },
    wantHeaders: ['Idempotent-Replay'],
    ...(bearer ? { bearerOverride: bearer } : {}),
  });
  return {
    data: result.data,
    status: result.status,
    replayed: result.headers['Idempotent-Replay'] === 'true' || result.status === 200,
  };
}

export async function getTransaction(id: string, signal?: AbortSignal): Promise<Transaction> {
  return requestData(`/v1/transactions/${id}`, {
    schema: transactionSchema,
    ...(signal ? { signal } : {}),
  });
}

/** 404s until a score exists — that is the documented PENDING path, not an error. */
export async function getTransactionScore(id: string, signal?: AbortSignal): Promise<Risk> {
  return requestData(`/v1/transactions/${id}/score`, {
    schema: riskSchema,
    ...(signal ? { signal } : {}),
  });
}

/**
 * §15.2 list and filter. Returns 405 today — GET is not routed on this path.
 * `has_alert` is the fraud / non-fraud switch.
 */
export async function listTransactions(
  filters: TransactionFilters,
  cursor: string | null,
  signal?: AbortSignal,
): Promise<TransactionPage> {
  const qs = queryString({
    risk_level: filters.risk_level,
    min_probability: filters.min_probability,
    max_probability: filters.max_probability,
    transaction_type: filters.transaction_type,
    scoring_status: filters.scoring_status,
    has_alert: filters.has_alert === undefined ? undefined : String(filters.has_alert),
    from: filters.from,
    to: filters.to,
    min_amount: filters.min_amount,
    max_amount: filters.max_amount,
    q: filters.q,
    limit: filters.limit,
    cursor,
  });
  return requestData(`/v1/transactions${qs}`, {
    schema: transactionPageSchema,
    ...(signal ? { signal } : {}),
  });
}
