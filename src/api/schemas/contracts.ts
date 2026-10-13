import { z } from 'zod';
import type { components } from '../schema';

/**
 * The Islamic layer's contract register — `/v1/islamic/contracts`. The bank's
 * own record of each contract (customer, supplier, asset, schedule, status,
 * approved payers), which the layer's rules check a transaction against
 * instead of trusting the labels it carries.
 *
 * The console only reads it (alerts:read, team-scoped). Registration and
 * status changes are the bank's system's job (transactions:write, the ingest
 * client); the one writer here is the sample runner, under the ingest session.
 * IBANs never come back in full: only their last four characters.
 */

export const CONTRACT_STATUSES = ['ACTIVE', 'SETTLED', 'CANCELLED', 'DEFAULTED'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

/** Products the register accepts: Zakat is a payment, not a contract. */
export const CONTRACT_PRODUCTS = [
  'MURABAHA',
  'IJARA',
  'MUSHARAKA',
  'MUDARABA',
  'SUKUK',
  'TAKAFUL',
  'QARD_HASAN',
] as const;

const payerSchema = z.object({ iban_last4: z.string() }).passthrough();

export const contractSchema = z
  .object({
    contract_id: z.string(),
    product: z.string(),
    product_label: z.string().nullish(),
    status: z.string(),
    team: z.string().nullish(),
    customer_iban_last4: z.string().nullish(),
    supplier_iban_last4: z.string().nullish(),
    asset_id: z.string().nullish(),
    contract_start: z.string().nullish(),
    tenor: z.number().nullish(),
    scheduled_amount: z.string().nullish(),
    first_due_date: z.string().nullish(),
    frequency_months: z.number().nullish(),
    financed_amount: z.string().nullish(),
    approved_payers: z
      .array(payerSchema)
      .nullish()
      .transform((payers) => payers ?? []),
    created_at: z.string().nullish(),
    updated_at: z.string().nullish(),
  })
  .passthrough();
export type Contract = z.infer<typeof contractSchema>;

export const contractListItemSchema = contractSchema.extend({
  payments_seen: z.number().nullish().transform((n) => n ?? 0),
  alerts: z.number().nullish().transform((n) => n ?? 0),
  last_payment_at: z.string().nullish(),
});
export type ContractListItem = z.infer<typeof contractListItemSchema>;

export const contractPageSchema = z
  .object({
    items: z.array(contractListItemSchema),
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
  })
  .passthrough();
export type ContractPage = z.infer<typeof contractPageSchema>;

export const scheduleItemSchema = z
  .object({
    instalment_no: z.number(),
    due_date: z.string(),
    amount: z.string().nullish(),
  })
  .passthrough();
export type ScheduleItem = z.infer<typeof scheduleItemSchema>;

export const contractPaymentSchema = z
  .object({
    transaction_id: z.string(),
    booked_at: z.string(),
    amount: z.string(),
    currency: z.string().nullish(),
    event: z.string().nullish(),
    instalment_no: z.number().nullish(),
    risk_score: z.number().nullish(),
    risk_level: z.string().nullish(),
    alert_id: z.string().nullish(),
    alert_severity: z.string().nullish(),
    alert_status: z.string().nullish(),
    rules_added: z
      .array(z.string())
      .nullish()
      .transform((rules) => rules ?? []),
    rules_set_aside: z
      .array(z.string())
      .nullish()
      .transform((rules) => rules ?? []),
  })
  .passthrough();
export type ContractPayment = z.infer<typeof contractPaymentSchema>;

export const contractDetailSchema = contractListItemSchema.extend({
  schedule: z
    .array(scheduleItemSchema)
    .nullish()
    .transform((items) => items ?? []),
  /** Newest first, as the server sends them. */
  payments: z
    .array(contractPaymentSchema)
    .nullish()
    .transform((items) => items ?? []),
});
export type ContractDetail = z.infer<typeof contractDetailSchema>;

export interface ContractFilters {
  status?: string;
  product?: string;
  /** Matches within contract_id. */
  q?: string;
  limit?: number;
  offset?: number;
}

/** `POST /v1/islamic/contracts` body, straight from the generated schema. */
export type ContractRegistration = components['schemas']['ContractIn'];
