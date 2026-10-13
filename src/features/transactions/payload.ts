import type { IslamicContractParsed, TransactionFormParsed } from '@/api/schemas/transactions';
import { normaliseAmount } from '@/lib/money';

/**
 * Form values -> request body.
 *
 * The endpoint is `extra="forbid"`, so an empty string or a null for an
 * optional field is a 422 rather than "unset". Everything the user left blank
 * is therefore omitted from the payload entirely, and the PERSON/COMPANY field
 * sets are kept apart because mixing them is also a 422.
 *
 * Amounts go out as strings. They are never converted to a JS number anywhere
 * along this path.
 *
 * The Islamic contract section is a form concern only: on the wire its
 * fields are just more entries in `metadata`, exactly where
 * civitas_islamic/contract.py expects to find them. instalment_no and tenor go
 * out as JSON integers — the backend 422s a string ("8" is not 8).
 */

type Party = TransactionFormParsed['source_account']['holder'];
type Account = TransactionFormParsed['source_account'];

function buildParty(party: Party): Record<string, unknown> {
  const base: Record<string, unknown> = {
    party_type: party.party_type,
    display_name: party.display_name,
    country_code: party.country_code,
    risk_tier: party.risk_tier,
  };
  if (party.external_ref) base['external_ref'] = party.external_ref;

  if (party.party_type === 'PERSON') {
    if (party.national_id) base['national_id'] = party.national_id;
    if (party.date_of_birth) base['date_of_birth'] = party.date_of_birth;
    base['pep_flag'] = party.pep_flag;
  } else {
    if (party.registration_no) base['registration_no'] = party.registration_no;
    if (party.legal_form) base['legal_form'] = party.legal_form;
    if (party.sector_code) base['sector_code'] = party.sector_code;
  }
  return base;
}

function buildAccount(account: Account): Record<string, unknown> {
  const base: Record<string, unknown> = {
    iban: account.iban,
    currency: account.currency,
    holder: buildParty(account.holder),
  };
  if (account.institution_bic) base['institution_bic'] = account.institution_bic;
  if (account.opened_on) base['opened_on'] = account.opened_on;
  return base;
}

/** The Islamic contract section's fields, as `metadata` entries. */
function buildIslamicMetadata(islamic: IslamicContractParsed): Record<string, unknown> {
  if (!islamic.product) return {};
  const out: Record<string, unknown> = { product: islamic.product, event: islamic.event };
  if (islamic.contract_id) out['contract_id'] = islamic.contract_id;
  if (typeof islamic.instalment_no === 'number') out['instalment_no'] = islamic.instalment_no;
  if (typeof islamic.tenor === 'number') out['tenor'] = islamic.tenor;
  if (islamic.scheduled_amount) out['scheduled_amount'] = normaliseAmount(islamic.scheduled_amount);
  if (islamic.contract_start) out['contract_start'] = islamic.contract_start;
  if (islamic.due_date) out['due_date'] = islamic.due_date;
  if (islamic.customer_iban) out['customer_iban'] = islamic.customer_iban;
  if (islamic.supplier_iban) out['supplier_iban'] = islamic.supplier_iban;
  if (islamic.asset_id) out['asset_id'] = islamic.asset_id;
  return out;
}

export function buildTransactionPayload(values: TransactionFormParsed): Record<string, unknown> {
  const body: Record<string, unknown> = {
    amount: normaliseAmount(values.amount),
    currency: values.currency,
    // datetime-local has no timezone; the server expects an instant.
    booked_at: new Date(values.booked_at).toISOString(),
    transaction_type: values.transaction_type,
    sender_balance_before: normaliseAmount(values.sender_balance_before),
    receiver_balance_before: normaliseAmount(values.receiver_balance_before),
    source_account: buildAccount(values.source_account),
    destination_account: buildAccount(values.destination_account),
  };

  if (values.external_ref) body['external_ref'] = values.external_ref;
  if (values.mcc !== '' && values.mcc !== undefined) body['mcc'] = values.mcc;

  const freeForm = values.metadata.filter((entry) => entry.key !== '');
  const islamic = buildIslamicMetadata(values.islamic);
  const metadata = { ...Object.fromEntries(freeForm.map((entry) => [entry.key, entry.value])), ...islamic };
  if (Object.keys(metadata).length > 0) body['metadata'] = metadata;

  return body;
}
