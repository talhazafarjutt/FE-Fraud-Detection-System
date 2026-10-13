import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getContract } from '@/api/endpoints/islamic';
import type { ContractDetail, ContractPayment } from '@/api/schemas/contracts';
import { ApiErrorPanel, EmptyPanel, LoadingRows } from '@/components/ApiStates';
import { SeverityChip } from '@/components/Chips';
import { Eyebrow, SectionHeading, cx } from '@/components/primitives';
import { productLabel } from '@/features/layers/facts';
import { ISLAMIC_LAYER, useLayers, useMeta } from '@/features/layers/useMeta';
import { formatAbsolute, shortId, teamLabel } from '@/lib/format';
import { errorStatus } from '@/lib/problem';
import { formatAmount } from '@/lib/money';
import { formatRiskScore } from '@/lib/risk';
import { ContractStatusChip, contractsKey, scheduleText } from './parts';

/**
 * One registered contract: its terms (IBANs as their last four only), status,
 * approved payers, the schedule the rules check payments against, and every
 * payment the system has seen on it with what the layer made of each.
 */
export default function ContractDetailPage() {
  const { contractId = '' } = useParams();
  const meta = useMeta();
  const layers = useLayers();
  const layerOn = layers.isActive(ISLAMIC_LAYER);

  const query = useQuery({
    queryKey: [...contractsKey, 'detail', contractId],
    queryFn: ({ signal }) => getContract(contractId, signal),
    enabled: layerOn && contractId !== '',
    retry: false,
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-4">
        <Link
          to="/contracts"
          className="font-mono text-[11px] uppercase tracking-label text-ink-3 hover:text-ultra"
        >
          ← Contracts
        </Link>
        <p className="font-mono text-[11px] uppercase tracking-label text-ink-3">
          Read-only — the bank&rsquo;s own system registers contracts and reports their status.
        </p>
      </div>

      {meta.isPending ? (
        <LoadingRows label="Loading contract" />
      ) : !layerOn ? (
        <EmptyPanel
          title="The Islamic layer is off"
          body="This deployment runs without the Islamic banking layer, so there is no contract register to read."
        />
      ) : query.isError ? (
        errorStatus(query.error) === 404 ? (
          <EmptyPanel
            title={`Contract ${contractId} is not registered`}
            body="It is not in the register, or it belongs to another team. Transactions that name it are checked against their own labels only."
          />
        ) : (
          <ApiErrorPanel
            error={query.error}
            what="this contract"
            scopeHint="alerts:read"
            onRetry={() => void query.refetch()}
          />
        )
      ) : query.isPending ? (
        <LoadingRows label="Loading contract" />
      ) : (
        <ContractView contract={query.data} />
      )}
    </div>
  );
}

function ContractView({ contract }: { contract: ContractDetail }) {
  const { products } = useLayers();
  const label = contract.product_label || productLabel(contract.product, products, ISLAMIC_LAYER);
  const schedule = scheduleText(contract.tenor, contract.scheduled_amount, formatAmount);
  const frequency = contract.frequency_months ?? 1;

  return (
    <>
      <header className="space-y-3 border-b border-rule pb-6">
        <Eyebrow className="!mb-0">{label} contract</Eyebrow>
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="font-mono text-[28px]">{contract.contract_id}</h1>
          <ContractStatusChip status={contract.status} />
          {contract.team ? <span className="tag">{teamLabel(contract.team)}</span> : null}
        </div>
        <p className="font-mono text-[12px] text-ink-3">
          {contract.payments_seen} payment{contract.payments_seen === 1 ? '' : 's'} seen ·{' '}
          {contract.alerts} alert{contract.alerts === 1 ? '' : 's'}
        </p>
      </header>

      <section className="space-y-4" aria-label="Terms">
        <SectionHeading index="01" title="Terms" hint="As the bank registered them. Terms never change once registered; only the status and the approved payers do." />
        <dl className="grid gap-px border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
          <Term label="Customer IBAN" value={last4(contract.customer_iban_last4)} />
          <Term label="Supplier IBAN" value={last4(contract.supplier_iban_last4)} />
          <Term label="Asset / invoice" value={contract.asset_id ?? '—'} />
          <Term label="Contract start" value={contract.contract_start ?? '—'} />
          <Term label="Schedule" value={schedule ?? 'None registered'} />
          <Term
            label="Frequency"
            value={frequency === 1 ? 'Monthly' : `Every ${frequency} months`}
          />
          <Term label="First due" value={contract.first_due_date ?? '—'} />
          <Term label="Financed amount" value={contract.financed_amount ? formatAmount(contract.financed_amount) : '—'} />
          <Term label="Registered" value={contract.created_at ? formatAbsolute(contract.created_at) : '—'} />
          <Term label="Last updated" value={contract.updated_at ? formatAbsolute(contract.updated_at) : '—'} />
        </dl>
      </section>

      <section className="space-y-4" aria-label="Approved payers">
        <SectionHeading
          index="02"
          title="Approved payers"
          hint="Accounts the bank declared may pay for the customer — a guarantor, a parent, an employer. A payment from one of them is not a third-party repayment."
        />
        {contract.approved_payers.length === 0 ? (
          <p className="text-[14px] text-ink-2">None declared: only the customer&rsquo;s own account pays.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {contract.approved_payers.map((payer, index) => (
              <li key={`${payer.iban_last4}-${index}`} className="tag font-mono">
                •••• {payer.iban_last4}
              </li>
            ))}
          </ul>
        )}
      </section>

      <ScheduleSection contract={contract} />
      <PaymentsSection payments={contract.payments} />
    </>
  );
}

function last4(value: string | null | undefined): string {
  return value ? `•••• ${value}` : '—';
}

function Term({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface p-4">
      <dt className="mono-label mb-1 text-ink-3">{label}</dt>
      <dd className="font-mono text-[13px] text-ink">{value}</dd>
    </div>
  );
}

/** Events that are one numbered payment of the schedule. */
const SCHEDULED_EVENTS = new Set(['INSTALMENT', 'RENTAL', 'PROFIT_DISTRIBUTION', 'CONTRIBUTION']);

type Seen = { kind: 'paid' | 'settled'; payment: ContractPayment } | null;

/**
 * Whether a payment was seen for each instalment: a scheduled payment that
 * names it, or an early settlement made at or before it (which settles every
 * instalment from its own number on).
 */
function seenByInstalment(payments: readonly ContractPayment[]): (n: number) => Seen {
  const paid = new Map<number, ContractPayment>();
  let settlement: ContractPayment | null = null;
  for (const payment of payments) {
    const n = payment.instalment_no;
    if (payment.event === 'EARLY_SETTLEMENT') {
      if (!settlement || (n ?? Infinity) < (settlement.instalment_no ?? Infinity)) settlement = payment;
    } else if (typeof n === 'number' && (!payment.event || SCHEDULED_EVENTS.has(payment.event))) {
      if (!paid.has(n)) paid.set(n, payment);
    }
  }
  return (n) => {
    const payment = paid.get(n);
    if (payment) return { kind: 'paid', payment };
    if (settlement && typeof settlement.instalment_no === 'number' && n >= settlement.instalment_no) {
      return { kind: 'settled', payment: settlement };
    }
    return null;
  };
}

function ScheduleSection({ contract }: { contract: ContractDetail }) {
  const seen = useMemo(() => seenByInstalment(contract.payments), [contract.payments]);
  const listed = contract.schedule.length;
  return (
    <section className="space-y-4" aria-label="Schedule">
      <SectionHeading
        index="03"
        title="Schedule"
        hint="When each payment falls due on the registered schedule. A scheduled payment is checked against its amount and this date."
      />
      {listed === 0 ? (
        <p className="text-[14px] text-ink-2">
          No schedule registered (it needs a tenor and a first due date), so no payment on this contract can be
          verified against one.
        </p>
      ) : (
        <div className="max-h-[480px] overflow-auto border border-rule bg-surface">
          <table className="w-full border-collapse text-left" aria-label="Schedule">
            <thead>
              <tr className="border-b border-rule">
                {['No.', 'Due date', 'Amount', 'Payment seen'].map((label, i) => (
                  <th
                    key={label}
                    className={cx(
                      'px-4 py-3 font-mono text-[11px] uppercase tracking-label text-ink-3',
                      (i === 0 || i === 2) && 'text-right',
                    )}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contract.schedule.map((item) => {
                const hit = seen(item.instalment_no);
                return (
                  <tr key={item.instalment_no} className="border-b border-rule-soft last:border-0">
                    <td className="px-4 py-2 text-right font-mono text-[12px] tabular-nums">{item.instalment_no}</td>
                    <td className="px-4 py-2 font-mono text-[12px]">{item.due_date}</td>
                    <td className="px-4 py-2 text-right font-mono text-[12px] tabular-nums">
                      {item.amount ? formatAmount(item.amount) : '—'}
                    </td>
                    <td className="px-4 py-2 font-mono text-[11px] uppercase tracking-tag">
                      {hit ? (
                        <span
                          className={hit.kind === 'paid' ? 'text-sage' : 'text-ink-2'}
                          title={formatAbsolute(hit.payment.booked_at)}
                        >
                          {hit.kind === 'paid' ? 'Paid' : 'Settled early'} · {hit.payment.booked_at.slice(0, 10)}
                        </span>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {typeof contract.tenor === 'number' && contract.tenor > listed ? (
            <p className="border-t border-rule px-4 py-3 text-[13px] text-ink-3">
              First {listed} of {contract.tenor} instalments listed.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

function PaymentsSection({ payments }: { payments: readonly ContractPayment[] }) {
  return (
    <section className="space-y-4" aria-label="Payments">
      <SectionHeading
        index="04"
        title="Payments"
        hint="Every transaction seen on this contract, newest first, with its score and what the Islamic layer added or set aside."
      />
      {payments.length === 0 ? (
        <p className="text-[14px] text-ink-2">No payment has been seen on this contract yet.</p>
      ) : (
        <div className="overflow-x-auto border border-rule bg-surface">
          <table className="w-full border-collapse text-left" aria-label="Payments">
            <thead>
              <tr className="border-b border-rule">
                {['Booked', 'Event', 'Amount', 'Score', 'Alert', 'Rules added', 'Set aside', 'Transaction'].map(
                  (label, i) => (
                    <th
                      key={label}
                      className={cx(
                        'px-4 py-3 font-mono text-[11px] uppercase tracking-label text-ink-3',
                        (i === 2 || i === 3) && 'text-right',
                      )}
                    >
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.transaction_id} className="border-b border-rule-soft align-top last:border-0">
                  <td className="px-4 py-3 font-mono text-[12px]" title={formatAbsolute(payment.booked_at)}>
                    {payment.booked_at.slice(0, 10)}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] uppercase tracking-tag text-ink-2">
                    {eventText(payment)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[12px] tabular-nums">
                    {formatAmount(payment.amount)}
                    {payment.currency ? <span className="ml-1 text-ink-3">{payment.currency}</span> : null}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[12px] tabular-nums">
                    {typeof payment.risk_score === 'number' ? formatRiskScore(payment.risk_score) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {payment.alert_id ? (
                      <Link
                        to={`/alerts/${payment.alert_id}`}
                        className="inline-flex items-center gap-2 hover:text-ultra"
                        title="Open the alert"
                      >
                        {payment.alert_severity ? <SeverityChip severity={payment.alert_severity} /> : null}
                        <span className="font-mono text-[11px] uppercase tracking-label text-ultra">
                          {payment.alert_status ? payment.alert_status.replace(/_/g, ' ').toLowerCase() : 'Open'} →
                        </span>
                      </Link>
                    ) : (
                      <span className="font-mono text-[11px] uppercase tracking-tag text-ink-3">No alert</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <RuleList rules={payment.rules_added} tone="text-carmine" />
                  </td>
                  <td className="px-4 py-3">
                    <RuleList rules={payment.rules_set_aside} tone="text-amber" />
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-ink-3" title={payment.transaction_id}>
                    {payment.alert_id ? (
                      <Link to={`/alerts/${payment.alert_id}`} className="hover:text-ultra">
                        {shortId(payment.transaction_id)}
                      </Link>
                    ) : (
                      shortId(payment.transaction_id)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function eventText(payment: ContractPayment): string {
  if (!payment.event) return '—';
  const event = payment.event.replace(/_/g, ' ').toLowerCase();
  return typeof payment.instalment_no === 'number' && SCHEDULED_EVENTS.has(payment.event)
    ? `${event} ${payment.instalment_no}`
    : event;
}

function RuleList({ rules, tone }: { rules: readonly string[]; tone: string }) {
  if (rules.length === 0) return <span className="font-mono text-[11px] text-ink-3">—</span>;
  return (
    <ul className="space-y-1">
      {rules.map((rule) => (
        <li key={rule} className={cx('font-mono text-[11px]', tone)}>
          {rule}
        </li>
      ))}
    </ul>
  );
}
