import { z } from 'zod';
import { isValidIban, normaliseIban } from '@/lib/iban';
import { isValidAmount, isValidBalance } from '@/lib/money';
import {
  isoDateTime,
  looseExplanationSchema,
  modelDecisionSchema,
  transactionTypeSchema,
  uuid,
} from './common';

/* ------------------------------------------------------------------ *
 * Outbound — mirrors the server's Pydantic rules so the user sees the
 * error before the round-trip. Every rule here exists on the backend too;
 * this is a UX layer, not the authority.
 * ------------------------------------------------------------------ */

/** The only currency the platform accepts. Cross-currency is rejected outright. */
export const ALLOWED_CURRENCY = 'AED';

const amountField = z
  .string()
  .trim()
  .min(1, 'Amount is required.')
  .refine(isValidAmount, 'Use a positive amount with at most 2 decimal places.');

const balanceField = z
  .string()
  .trim()
  .min(1, 'Balance is required — the model relies on it.')
  .refine(isValidBalance, 'Use a non-negative amount with at most 2 decimal places.');

const ibanField = z
  .string()
  .trim()
  .min(1, 'IBAN is required.')
  .transform(normaliseIban)
  .refine((v) => /^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(v), 'IBAN format is not valid.')
  .refine(isValidIban, 'IBAN checksum (ISO 13616) does not pass.');

const partySchema = z
  .object({
    party_type: z.enum(['PERSON', 'COMPANY']),
    display_name: z.string().trim().min(1, 'Name is required.').max(255),
    country_code: z
      .string()
      .trim()
      .regex(/^[A-Z]{2}$/, 'Use a two-letter uppercase country code.'),
    external_ref: z.string().max(128).optional().or(z.literal('')),
    risk_tier: z.coerce.number().int().min(1).max(5).default(1),
    // PERSON-only
    national_id: z.string().max(64).optional().or(z.literal('')),
    date_of_birth: z.string().optional().or(z.literal('')),
    pep_flag: z.boolean().default(false),
    // COMPANY-only
    registration_no: z.string().max(64).optional().or(z.literal('')),
    legal_form: z.string().max(64).optional().or(z.literal('')),
    sector_code: z.string().max(16).optional().or(z.literal('')),
  })
  .superRefine((party, ctx) => {
    // The backend forbids mixing the two shapes (extra="forbid" plus a
    // validator). Catch it here so the form can switch fields instead.
    if (party.party_type === 'PERSON') {
      for (const field of ['registration_no', 'legal_form', 'sector_code'] as const) {
        if (party[field]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: 'Company fields are not accepted on a PERSON party.',
          });
        }
      }
    } else {
      for (const field of ['national_id', 'date_of_birth'] as const) {
        if (party[field]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: 'Person fields are not accepted on a COMPANY party.',
          });
        }
      }
    }
  });

const accountSchema = z.object({
  iban: ibanField,
  institution_bic: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]{8,11}$/, 'BIC must be 8–11 uppercase letters or digits.')
    .optional()
    .or(z.literal('')),
  currency: z.literal(ALLOWED_CURRENCY, {
    errorMap: () => ({ message: `Account currency must be ${ALLOWED_CURRENCY}.` }),
  }),
  opened_on: z.string().optional().or(z.literal('')),
  holder: partySchema,
});

const metadataEntrySchema = z.object({
  key: z.string().trim().max(64, 'Metadata keys are limited to 64 characters.'),
  value: z.string().trim().max(512, 'Metadata values are limited to 512 characters.'),
});

export const transactionFormSchema = z
  .object({
    external_ref: z.string().trim().max(128).optional().or(z.literal('')),
    amount: amountField,
    currency: z.literal(ALLOWED_CURRENCY, {
      errorMap: () => ({ message: `Only ${ALLOWED_CURRENCY} is accepted.` }),
    }),
    booked_at: z.string().min(1, 'Booking time is required.'),
    transaction_type: transactionTypeSchema,
    mcc: z
      .union([z.literal(''), z.coerce.number().int().min(1).max(9999)])
      .optional(),
    sender_balance_before: balanceField,
    receiver_balance_before: balanceField,
    source_account: accountSchema,
    destination_account: accountSchema,
    metadata: z.array(metadataEntrySchema).max(25, 'At most 25 metadata entries.').default([]),
  })
  .superRefine((tx, ctx) => {
    if (tx.source_account.iban && tx.source_account.iban === tx.destination_account.iban) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['destination_account', 'iban'],
        message: 'Destination IBAN must differ from the source IBAN.',
      });
    }
    // booked_at may not be more than 5 minutes in the future.
    const booked = Date.parse(tx.booked_at);
    if (!Number.isNaN(booked) && booked > Date.now() + 5 * 60_000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['booked_at'],
        message: 'Booking time cannot be more than 5 minutes in the future.',
      });
    }
    const keys = tx.metadata.map((m) => m.key).filter(Boolean);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['metadata'],
        message: 'Metadata keys must be unique.',
      });
    }
  });

export type TransactionFormValues = z.input<typeof transactionFormSchema>;
export type TransactionFormParsed = z.output<typeof transactionFormSchema>;

/* ------------------------------------------------------------------ *
 * Inbound
 * ------------------------------------------------------------------ */

export const riskSchema = z.object({
  // VERIFIED against /openapi.json: RiskOut returns `risk_score` (0-100) and
  // carries no `fraud_probability` at all. Requiring the probability here made
  // every submit response fail validation against the current API; keeping it
  // optional is what lets the older contract still parse.
  risk_score: z.number().nullable().default(null),
  fraud_probability: z.number().nullable().optional(),
  risk_level: z.string(),
  model_name: z.string(),
  model_version: z.string(),
  explanation: looseExplanationSchema,
  model_decision: z.union([modelDecisionSchema, z.string()]).nullable().default(null),
  latency_ms: z.number().int().nullable().default(null),
  scored_at: isoDateTime.nullable().default(null),
});
export type Risk = z.infer<typeof riskSchema>;

export const alertRefSchema = z.object({
  alert_id: uuid,
  status: z.string(),
  severity: z.string(),
});

export const transactionCreatedSchema = z.object({
  transaction_id: uuid,
  scoring: z.enum(['COMPLETE', 'PENDING', 'FAILED']),
  risk: riskSchema.nullable().default(null),
  alert: alertRefSchema.nullable().default(null),
  links: z.record(z.string()).default({}),
});
export type TransactionCreated = z.infer<typeof transactionCreatedSchema>;

/**
 * Note the absence of full IBANs: the server returns last-4 only. That masking
 * is a deliberate data-minimisation control and we surface it as one.
 */
export const transactionSchema = z.object({
  id: uuid,
  external_ref: z.string().nullable(),
  amount: z.string(),
  currency: z.string(),
  booked_at: isoDateTime,
  transaction_type: z.string(),
  mcc: z.number().int().nullable(),
  sender_balance_before: z.string(),
  receiver_balance_before: z.string(),
  scoring_status: z.string(),
  src_account_last4: z.string(),
  dst_account_last4: z.string(),
  /**
   * Added by the backend after this console was first written, and picked up by
   * the committed-schema drift check rather than by anyone noticing a blank
   * column. They turn a ledger row into a way into the network explorer:
   * `last4` identifies an account to a human, the id identifies it to the API.
   * Optional, because the older contract does not send them.
   */
  src_account_id: uuid.nullish(),
  dst_account_id: uuid.nullish(),
});
export type Transaction = z.infer<typeof transactionSchema>;

/* ------------------------------------------------------------------ *
 * `GET /v1/transactions` — §15.2 list and filter.
 *
 * THIS ENDPOINT DOES NOT EXIST YET. Verified against the running container:
 * GET on /v1/transactions returns 405 Method Not Allowed (only POST is
 * routed). Written to the specified contract so it works the moment the
 * endpoint ships.
 *
 * `has_alert` is the fraud / non-fraud switch that §15 turns on — a view built
 * from alerts alone shows the ~1% that got flagged and hides the 99% that did
 * not.
 * ------------------------------------------------------------------ */

/**
 * The LIST row is a different, slimmer shape from the detail record — it omits
 * `mcc`, `sender_balance_before` and `receiver_balance_before`. Extending the
 * detail schema made those required, so every response failed to parse and the
 * table sat on "Loading" forever with a 200 in the network panel and nothing in
 * the console. Declared standalone for that reason; do not re-base it on
 * `transactionSchema`.
 *
 * VERIFIED against the deployed API: every field below is returned on every row.
 * `.passthrough()` keeps anything the backend adds later instead of silently
 * dropping it — which is how `risk_score` and `alert_severity` went missing.
 */
export const transactionListItemSchema = z
  .object({
    id: uuid,
    external_ref: z.string().nullable().default(null),
    amount: z.string(),
    currency: z.string(),
    booked_at: isoDateTime,
    transaction_type: z.string(),
    scoring_status: z.string(),
    team: z.string().nullable().default(null),
    src_account_last4: z.string().nullable().default(null),
    dst_account_last4: z.string().nullable().default(null),
    src_account_id: uuid.nullish(),
    dst_account_id: uuid.nullish(),
    /** 0–100. Null on every row the deployed backend currently returns. */
    risk_score: z.number().nullable().default(null),
    risk_level: z.string().nullable().default(null),
    alert_id: z.string().uuid().nullable().default(null),
    alert_status: z.string().nullable().default(null),
    alert_severity: z.string().nullable().default(null),
    /** Still returned, and currently the only populated score. */
    fraud_probability: z.number().nullable().default(null),
  })
  .passthrough();
export type TransactionListItem = z.infer<typeof transactionListItemSchema>;

export const transactionPageSchema = z.object({
  items: z.array(transactionListItemSchema),
  next_cursor: z.string().nullable().default(null),
  page_size: z.number().int(),
});
/** `skipped` counts rows dropped by tolerant parsing — see api/compat.ts. */
export type TransactionPage = z.infer<typeof transactionPageSchema> & { skipped: number };

export interface TransactionFilters {
  risk_level?: string;
  /** 0-100, the engine's risk score. Not a probability. */
  min_risk_score?: number;
  max_risk_score?: number;
  transaction_type?: string;
  scoring_status?: string;
  /** true = flagged only, false = clean only, undefined = everything. */
  has_alert?: boolean;
  /** The API's real parameter names — see the note in endpoints/transactions.ts. */
  booked_from?: string;
  booked_to?: string;
  min_amount?: string;
  max_amount?: string;
  q?: string;
  limit?: number;
}
