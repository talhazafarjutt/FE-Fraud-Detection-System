import { z } from 'zod';
import { decimalString, isoDateTime, transactionTypeSchema, uuid } from './common';

/**
 * Entities — the people, companies and accounts behind the transactions.
 *
 * PRIVACY, BY CONTRACT: there is no `national_id`, no `iban` and no `iban_hash`
 * in any response on this API. Accounts are identified by `id` and
 * `account_last4` only. Nothing here may be widened to carry them, and if a
 * screen ever seems to need a full IBAN the answer is that it does not exist
 * client-side. `tests/security-invariants.test.ts` pins this.
 */

export const partyTypeSchema = z.union([z.enum(['PERSON', 'COMPANY']), z.string()]);

/**
 * One person may hold several accounts and one account may have several
 * holders. A non-PRIMARY role on a suspect account — a beneficial owner who is
 * not the named holder, a signatory across three accounts in one ring — is a
 * finding in itself, so the role is surfaced rather than flattened away.
 */
export const HOLDER_ROLES = ['PRIMARY', 'JOINT', 'BENEFICIAL_OWNER', 'SIGNATORY'] as const;

export const entityAccountSchema = z
  .object({
    id: uuid,
    account_last4: z.string(),
    currency: z.string().nullish(),
    country_code: z.string().nullish(),
    status: z.string().nullish(),
    holder_role: z.string(),
    opened_on: z.string().nullish(),
  })
  .passthrough();
export type EntityAccount = z.infer<typeof entityAccountSchema>;

export const entitySchema = z
  .object({
    id: uuid,
    party_type: partyTypeSchema,
    display_name: z.string(),
    country_code: z.string(),
    external_ref: z.string().nullish(),
    risk_tier: z.number().int(),
    created_at: isoDateTime,
    account_count: z.number().int().nullish(),
    /**
     * The reason to visit this screen at all: one account and fifteen inbound
     * transfers is a fan-in mule, readable from the list without opening it.
     */
    transaction_count: z.number().int().nullish(),
    /** PERSON only — null on a COMPANY. */
    pep_flag: z.boolean().nullish(),
    /** COMPANY only — null on a PERSON. */
    registration_no: z.string().nullish(),
    legal_form: z.string().nullish(),
    sector_code: z.string().nullish(),
  })
  .passthrough();
export type EntityRow = z.infer<typeof entitySchema>;

export const entityDetailSchema = entitySchema
  .extend({
    date_of_birth: z.string().nullish(),
    accounts: z.array(entityAccountSchema).nullish(),
  })
  .passthrough();
export type EntityDetail = z.infer<typeof entityDetailSchema>;

/**
 * `direction` is RELATIVE to the party being viewed. The same transaction reads
 * OUT on the sender's page and IN on the receiver's, so it must be labelled
 * from the entity's point of view and never as a fixed property of the row.
 */
export const DIRECTIONS = ['IN', 'OUT', 'INTERNAL'] as const;
export const directionSchema = z.union([z.enum(DIRECTIONS), z.string()]);
export type Direction = (typeof DIRECTIONS)[number];

export const entityTransactionSchema = z
  .object({
    id: uuid,
    external_ref: z.string().nullish(),
    direction: directionSchema,
    amount: decimalString,
    currency: z.string(),
    booked_at: isoDateTime,
    transaction_type: z.union([transactionTypeSchema, z.string()]),
    scoring_status: z.string(),
    counterparty_account_id: z.string().nullish(),
    src_account_id: z.string().nullish(),
    dst_account_id: z.string().nullish(),
  })
  .passthrough();
export type EntityTransaction = z.infer<typeof entityTransactionSchema>;

export interface EntityFilters {
  party_type?: string;
  country_code?: string;
  min_risk_tier?: number;
  q?: string;
  cursor?: string;
  limit?: number;
}
