import { useFormContext, useWatch } from 'react-hook-form';
import {
  ISLAMIC_PRODUCTS,
  ISLAMIC_PRODUCT_EVENTS,
  type IslamicContractFieldKey,
  type IslamicProduct,
  islamicRequiredFields,
  type TransactionFormValues,
} from '@/api/schemas/transactions';
import type { LayerProduct } from '@/api/schemas/meta';
import { productLabel } from '@/features/layers/facts';
import { Field } from './fields';

/**
 * The Islamic contract terms, shown only when the Islamic layer is active
 * (see TransactionsPage). They are a distinct form section but travel inside
 * `metadata` on the wire — payload.ts does that merge — so this component
 * only ever reads and writes `islamic.*` on the shared form.
 */

const FIELD_LABEL: Record<IslamicContractFieldKey, string> = {
  contract_id: 'Contract number',
  instalment_no: 'Instalment number',
  tenor: 'Tenor',
  scheduled_amount: 'Scheduled amount',
  contract_start: 'Contract start',
  customer_iban: 'Customer IBAN',
  supplier_iban: 'Supplier IBAN',
};

function eventsFor(product: string, products: readonly LayerProduct[]): readonly string[] {
  if (!product) return [];
  const live = products.find((p) => p.code === product)?.events;
  if (live && live.length > 0) return live;
  return ISLAMIC_PRODUCT_EVENTS[product as IslamicProduct] ?? [];
}

export function IslamicFields({ products }: { products: readonly LayerProduct[] }) {
  const {
    register,
    control,
    setValue,
    formState: { errors },
  } = useFormContext<TransactionFormValues>();

  const product = useWatch({ control, name: 'islamic.product' }) || '';
  const event = useWatch({ control, name: 'islamic.event' }) || '';
  const errs = errors.islamic;
  const events = eventsFor(product, products);
  const required = islamicRequiredFields(product, event);
  const isRequired = (key: IslamicContractFieldKey) => required.includes(key);
  const mark = (key: IslamicContractFieldKey) => (isRequired(key) ? ' *' : '');

  const productField = register('islamic.product');

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <Field label="Product" htmlFor="islamic.product" error={errs?.product}>
          <select
            id="islamic.product"
            className="field"
            {...productField}
            onChange={(event_) => {
              void productField.onChange(event_);
              // A new product invalidates whatever event was chosen for the old one.
              setValue('islamic.event', '');
            }}
          >
            <option value="">None — conventional payment</option>
            {ISLAMIC_PRODUCTS.map((code) => (
              <option key={code} value={code}>
                {productLabel(code, products, 'islamic')}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Event"
          htmlFor="islamic.event"
          error={errs?.event}
          hint={!product ? 'Choose a product first.' : undefined}
        >
          <select id="islamic.event" className="field" disabled={!product} {...register('islamic.event')}>
            <option value="">{product ? 'Choose an event' : '—'}</option>
            {events.map((code) => (
              <option key={code} value={code}>
                {code.replace(/_/g, ' ').toLowerCase()}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {product ? (
        <>
          <p className="text-[13px] text-ink-3">
            {required.length > 0 ? (
              <>Required for this event: {required.map((key) => FIELD_LABEL[key]).join(', ')}.</>
            ) : (
              <>Nothing beyond the product and event is required for this event.</>
            )}
          </p>

          <div className="grid gap-6 md:grid-cols-3">
            <Field
              label={`Contract number${mark('contract_id')}`}
              htmlFor="islamic.contract_id"
              error={errs?.contract_id}
            >
              <input id="islamic.contract_id" className="field" {...register('islamic.contract_id')} />
            </Field>

            <Field
              label={`Instalment no.${mark('instalment_no')}`}
              htmlFor="islamic.instalment_no"
              error={errs?.instalment_no}
              hint="n of the tenor's N scheduled payments."
            >
              <input
                id="islamic.instalment_no"
                inputMode="numeric"
                className="field text-right"
                {...register('islamic.instalment_no')}
              />
            </Field>

            <Field label={`Tenor${mark('tenor')}`} htmlFor="islamic.tenor" error={errs?.tenor}>
              <input
                id="islamic.tenor"
                inputMode="numeric"
                className="field text-right"
                {...register('islamic.tenor')}
              />
            </Field>

            <Field
              label={`Scheduled amount${mark('scheduled_amount')}`}
              htmlFor="islamic.scheduled_amount"
              error={errs?.scheduled_amount}
            >
              <input
                id="islamic.scheduled_amount"
                inputMode="decimal"
                className="field text-right"
                placeholder="0.00"
                {...register('islamic.scheduled_amount')}
              />
            </Field>

            <Field
              label={`Contract start${mark('contract_start')}`}
              htmlFor="islamic.contract_start"
              error={errs?.contract_start}
            >
              <input
                id="islamic.contract_start"
                type="date"
                className="field"
                {...register('islamic.contract_start')}
              />
            </Field>

            <Field
              label={`Customer IBAN${mark('customer_iban')}`}
              htmlFor="islamic.customer_iban"
              error={errs?.customer_iban}
            >
              <input
                id="islamic.customer_iban"
                className="field uppercase"
                {...register('islamic.customer_iban')}
              />
            </Field>

            <Field
              label={`Supplier IBAN${mark('supplier_iban')}`}
              htmlFor="islamic.supplier_iban"
              error={errs?.supplier_iban}
            >
              <input
                id="islamic.supplier_iban"
                className="field uppercase"
                {...register('islamic.supplier_iban')}
              />
            </Field>
          </div>
        </>
      ) : null}
    </div>
  );
}
