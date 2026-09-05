import { useFormContext, useWatch } from 'react-hook-form';
import type { TransactionFormValues } from '@/api/schemas/transactions';
import { formatIban, isValidIban } from '@/lib/iban';
import { Field } from './fields';

type Side = 'source_account' | 'destination_account';

/**
 * PERSON and COMPANY accept different field sets and the server rejects a mix
 * with a 422, so the form switches its fields on party_type rather than showing
 * both and hoping.
 */
export function AccountFields({ side }: { side: Side }) {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<TransactionFormValues>();

  const partyType = useWatch({ control, name: `${side}.holder.party_type` });
  const iban = useWatch({ control, name: `${side}.iban` });
  const sideErrors = errors[side];

  const ibanOk = typeof iban === 'string' && iban.length > 0 && isValidIban(iban);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="md:col-span-2">
        <Field
          label="IBAN"
          htmlFor={`${side}.iban`}
          error={sideErrors?.iban}
          hint={ibanOk ? `Checksum passes — ${formatIban(iban)}` : 'ISO 13616, checked locally.'}
        >
          <input
            id={`${side}.iban`}
            className="field uppercase"
            placeholder="AE07 0331 2345 6789 0123 456"
            aria-invalid={sideErrors?.iban ? 'true' : 'false'}
            {...register(`${side}.iban`)}
          />
        </Field>
      </div>

      <Field label="Institution BIC" htmlFor={`${side}.institution_bic`} error={sideErrors?.institution_bic}>
        <input
          id={`${side}.institution_bic`}
          className="field uppercase"
          placeholder="EBILAEAD"
          {...register(`${side}.institution_bic`)}
        />
      </Field>

      <Field
        label="Account currency"
        htmlFor={`${side}.currency`}
        error={sideErrors?.currency}
        hint="Must match the transaction currency — cross-currency is rejected."
      >
        <input
          id={`${side}.currency`}
          className="field uppercase"
          maxLength={3}
          {...register(`${side}.currency`)}
        />
      </Field>

      <Field label="Opened on" htmlFor={`${side}.opened_on`} error={sideErrors?.opened_on}>
        <input
          id={`${side}.opened_on`}
          type="date"
          className="field"
          {...register(`${side}.opened_on`)}
        />
      </Field>

      <Field
        label="Holder type"
        htmlFor={`${side}.holder.party_type`}
        error={sideErrors?.holder?.party_type}
      >
        <select
          id={`${side}.holder.party_type`}
          className="field"
          {...register(`${side}.holder.party_type`)}
        >
          <option value="PERSON">Person</option>
          <option value="COMPANY">Company</option>
        </select>
      </Field>

      <Field
        label="Holder name"
        htmlFor={`${side}.holder.display_name`}
        error={sideErrors?.holder?.display_name}
      >
        <input
          id={`${side}.holder.display_name`}
          className="field"
          {...register(`${side}.holder.display_name`)}
        />
      </Field>

      <Field
        label="Country"
        htmlFor={`${side}.holder.country_code`}
        error={sideErrors?.holder?.country_code}
      >
        <input
          id={`${side}.holder.country_code`}
          className="field uppercase"
          maxLength={2}
          {...register(`${side}.holder.country_code`)}
        />
      </Field>

      <Field
        label="Risk tier (1–5)"
        htmlFor={`${side}.holder.risk_tier`}
        error={sideErrors?.holder?.risk_tier}
      >
        <input
          id={`${side}.holder.risk_tier`}
          type="number"
          min={1}
          max={5}
          className="field"
          {...register(`${side}.holder.risk_tier`)}
        />
      </Field>

      <Field
        label="External reference"
        htmlFor={`${side}.holder.external_ref`}
        error={sideErrors?.holder?.external_ref}
      >
        <input
          id={`${side}.holder.external_ref`}
          className="field"
          {...register(`${side}.holder.external_ref`)}
        />
      </Field>

      {partyType === 'PERSON' ? (
        <>
          <Field
            label="National ID"
            htmlFor={`${side}.holder.national_id`}
            error={sideErrors?.holder?.national_id}
          >
            <input
              id={`${side}.holder.national_id`}
              className="field"
              {...register(`${side}.holder.national_id`)}
            />
          </Field>

          <Field
            label="Date of birth"
            htmlFor={`${side}.holder.date_of_birth`}
            error={sideErrors?.holder?.date_of_birth}
          >
            <input
              id={`${side}.holder.date_of_birth`}
              type="date"
              className="field"
              {...register(`${side}.holder.date_of_birth`)}
            />
          </Field>

          <div className="md:col-span-2">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[color:var(--ultra)]"
                {...register(`${side}.holder.pep_flag`)}
              />
              <span className="mono-label text-ink-2">Politically exposed person</span>
            </label>
          </div>
        </>
      ) : (
        <>
          <Field
            label="Registration number"
            htmlFor={`${side}.holder.registration_no`}
            error={sideErrors?.holder?.registration_no}
          >
            <input
              id={`${side}.holder.registration_no`}
              className="field"
              {...register(`${side}.holder.registration_no`)}
            />
          </Field>

          <Field
            label="Legal form"
            htmlFor={`${side}.holder.legal_form`}
            error={sideErrors?.holder?.legal_form}
          >
            <input
              id={`${side}.holder.legal_form`}
              className="field"
              {...register(`${side}.holder.legal_form`)}
            />
          </Field>

          <Field
            label="Sector code"
            htmlFor={`${side}.holder.sector_code`}
            error={sideErrors?.holder?.sector_code}
          >
            <input
              id={`${side}.holder.sector_code`}
              className="field"
              {...register(`${side}.holder.sector_code`)}
            />
          </Field>
        </>
      )}
    </div>
  );
}
