import type { TransactionFormParsed } from '@/api/schemas/transactions';
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

  const metadata = values.metadata.filter((entry) => entry.key !== '');
  if (metadata.length > 0) {
    body['metadata'] = Object.fromEntries(metadata.map((entry) => [entry.key, entry.value]));
  }

  return body;
}
