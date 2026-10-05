import type { IslamicSummary } from '@/api/schemas/islamic';
import type { LayerProduct } from '@/api/schemas/meta';
import { cx } from '@/components/primitives';
import { productLabel } from '@/features/layers/facts';

const PRODUCT_COLUMNS = [
  'Product',
  'Transactions',
  'Alerts',
  'Set aside',
  'Confirmed fraud',
  'False positives',
] as const;

const KIND_LABEL: Record<string, string> = { added: 'Added', set_aside: 'Set aside' };

/** Per product: traffic, alerts, rules set aside and closed outcomes; then each layer rule. */
export function IslamicProducts({
  summary,
  products,
}: {
  summary: IslamicSummary;
  products: readonly LayerProduct[];
}) {
  const numbers = (row: IslamicSummary['products'][number]) => [
    row.transactions,
    row.alerts,
    row.set_aside,
    row.confirmed_fraud,
    row.false_positive,
  ];

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto border border-rule bg-surface">
        <table className="w-full min-w-[640px] border-collapse">
          <caption className="sr-only">Islamic products</caption>
          <thead>
            <tr className="border-b border-rule">
              {PRODUCT_COLUMNS.map((label, index) => (
                <th
                  key={label}
                  scope="col"
                  className={cx(
                    'py-3 pr-4 font-mono text-[11px] font-normal uppercase tracking-tag text-ink-3',
                    index === 0 ? 'pl-4 text-left' : 'text-right',
                  )}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summary.products.length === 0 ? (
              <tr>
                <td colSpan={PRODUCT_COLUMNS.length} className="px-4 py-6 text-ink-2">
                  No Islamic product traffic visible to you.
                </td>
              </tr>
            ) : (
              summary.products.map((row) => (
                <tr key={row.product} className="border-b border-rule-soft">
                  <th scope="row" className="py-3 pl-4 pr-4 text-left font-mono text-[12px] font-normal text-ink">
                    {row.label || productLabel(row.product, products)}
                  </th>
                  {numbers(row).map((value, index) => (
                    <td
                      key={PRODUCT_COLUMNS[index + 1]}
                      className="num py-3 pr-4 text-right font-mono text-[12px] tabular-nums text-ink"
                    >
                      {value.toLocaleString('en-GB')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto border border-rule bg-surface">
        <table className="w-full min-w-[480px] border-collapse">
          <caption className="sr-only">Islamic layer rules</caption>
          <thead>
            <tr className="border-b border-rule">
              {['Rule', 'Kind', 'Count'].map((label, index) => (
                <th
                  key={label}
                  scope="col"
                  className={cx(
                    'py-3 pr-4 font-mono text-[11px] font-normal uppercase tracking-tag text-ink-3',
                    index === 0 && 'pl-4',
                    index === 2 ? 'text-right' : 'text-left',
                  )}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summary.rules.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-ink-2">
                  No Islamic rule has fired or been applied yet.
                </td>
              </tr>
            ) : (
              summary.rules.map((row) => (
                <tr key={`${row.kind}-${row.rule}`} className="border-b border-rule-soft">
                  <td className="py-3 pl-4 pr-4 font-mono text-[12px] text-ink">{row.rule}</td>
                  <td
                    className={cx(
                      'py-3 pr-4 font-mono text-[11px] uppercase tracking-tag',
                      row.kind === 'set_aside' ? 'text-amber' : 'text-ink-2',
                    )}
                  >
                    {KIND_LABEL[row.kind] ?? row.kind}
                  </td>
                  <td className="num py-3 pr-4 text-right font-mono text-[12px] tabular-nums text-ink">
                    {row.count.toLocaleString('en-GB')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <p className="border-t border-rule px-5 py-4 text-[13px] text-ink-3">
          Added rules raised or kept a score; set-aside rules were removed because the contract
          explained them. Each set-aside stays visible on the alert or score it applied to.
        </p>
      </div>
    </div>
  );
}
