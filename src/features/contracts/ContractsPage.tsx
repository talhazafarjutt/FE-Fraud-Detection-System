import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { listContracts } from '@/api/endpoints/islamic';
import { CONTRACT_PRODUCTS, CONTRACT_STATUSES, type ContractFilters } from '@/api/schemas/contracts';
import { ApiErrorPanel, EmptyPanel, LoadingRows } from '@/components/ApiStates';
import { Button, Eyebrow, SectionHeading, cx } from '@/components/primitives';
import { TeamScopeNote } from '@/components/TeamScopeNote';
import { productLabel } from '@/features/layers/facts';
import { ISLAMIC_LAYER, useLayers, useMeta } from '@/features/layers/useMeta';
import { formatAbsolute, formatRelative } from '@/lib/format';
import { formatAmount } from '@/lib/money';
import { ContractStatusChip, contractPath, contractsKey, scheduleText } from './parts';

const PAGE_SIZE = 50;

/**
 * The Islamic layer's contract register, as the bank registered it. Read-only
 * here: the bank's own system registers contracts and reports their status
 * (transactions:write); the console reads the register, team-scoped.
 */
export default function ContractsPage() {
  const meta = useMeta();
  const layers = useLayers();
  const [filters, setFilters] = useState<ContractFilters>({ limit: PAGE_SIZE, offset: 0 });
  const [search, setSearch] = useState('');
  const layerOn = layers.isActive(ISLAMIC_LAYER);

  const query = useQuery({
    queryKey: [...contractsKey, 'list', filters],
    queryFn: ({ signal }) => listContracts(filters, signal),
    enabled: layerOn,
    placeholderData: keepPreviousData,
  });

  const set = useCallback((key: 'status' | 'product' | 'q', value: string | undefined) => {
    setFilters((current) => {
      const next: ContractFilters = { ...current, offset: 0 };
      if (!value) delete next[key];
      else next[key] = value;
      return next;
    });
  }, []);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    set('q', search.trim() || undefined);
  };

  const page = query.data;
  const offset = filters.offset ?? 0;
  const limit = filters.limit ?? PAGE_SIZE;

  return (
    <div className="space-y-8">
      <SectionHeading
        index="06"
        title="Contracts"
        hint="The Islamic contract register: each contract's customer, supplier, asset, schedule, status and approved payers, as the bank registered them. When a transaction names a registered contract, the rules check it against these terms instead of trusting its labels."
      />
      <p className="font-mono text-[11px] uppercase tracking-label text-ink-3">
        Read-only — the bank&rsquo;s own system registers contracts and reports their status.
      </p>

      {meta.isPending ? (
        <LoadingRows label="Loading contracts" />
      ) : !layerOn ? (
        <EmptyPanel
          title="The Islamic layer is off"
          body="This deployment runs without the Islamic banking layer, so there is no contract register to read."
        />
      ) : (
        <>
          <section className="border border-rule bg-surface">
            <div className="grid gap-px bg-rule md:grid-cols-3">
              <FilterField label="Status">
                <select
                  className="field"
                  aria-label="Status"
                  value={filters.status ?? ''}
                  onChange={(e) => set('status', e.target.value || undefined)}
                >
                  <option value="">Any</option>
                  {CONTRACT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status.toLowerCase()}
                    </option>
                  ))}
                </select>
              </FilterField>

              <FilterField label="Product">
                <select
                  className="field"
                  aria-label="Product"
                  value={filters.product ?? ''}
                  onChange={(e) => set('product', e.target.value || undefined)}
                >
                  <option value="">Any</option>
                  {CONTRACT_PRODUCTS.map((code) => (
                    <option key={code} value={code}>
                      {productLabel(code, layers.products, ISLAMIC_LAYER)}
                    </option>
                  ))}
                </select>
              </FilterField>

              <FilterField label="Search">
                <form onSubmit={submitSearch} className="flex gap-2" role="search">
                  <input
                    className="field"
                    aria-label="Contract number"
                    placeholder="Contract number"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <Button variant="ghost" type="submit">
                    Go
                  </Button>
                </form>
              </FilterField>
            </div>
          </section>

          {query.isError ? (
            <ApiErrorPanel
              error={query.error}
              what="the contract register"
              scopeHint="alerts:read"
              onRetry={() => void query.refetch()}
            />
          ) : query.isPending || !page ? (
            <LoadingRows label="Loading contracts" />
          ) : page.items.length === 0 ? (
            <EmptyPanel
              title="No contracts"
              body={
                <>
                  {filters.status || filters.product || filters.q
                    ? 'Nothing in the register matches these filters. '
                    : 'Nothing has been registered yet. '}
                  <TeamScopeNote noun="contracts" />
                </>
              }
            />
          ) : (
            <>
              <div className="overflow-x-auto border border-rule bg-surface">
                <table className="w-full border-collapse text-left" aria-label="Registered contracts">
                  <thead>
                    <tr className="border-b border-rule">
                      {[
                        'Contract',
                        'Product',
                        'Status',
                        'Customer',
                        'Schedule',
                        'Start',
                        'Payments',
                        'Alerts',
                        'Last payment',
                      ].map((label, i) => (
                        <th
                          key={label}
                          className={cx(
                            'px-4 py-3 font-mono text-[11px] uppercase tracking-label text-ink-3',
                            (i === 6 || i === 7) && 'text-right',
                          )}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {page.items.map((row) => (
                      <tr key={row.contract_id} className="border-b border-rule-soft last:border-0">
                        <td className="px-4 py-3">
                          <Link
                            to={contractPath(row.contract_id)}
                            className="font-mono text-[12px] hover:text-ultra"
                          >
                            {row.contract_id}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-[14px]">
                          {row.product_label || productLabel(row.product, layers.products, ISLAMIC_LAYER)}
                        </td>
                        <td className="px-4 py-3">
                          <ContractStatusChip status={row.status} />
                        </td>
                        <td className="px-4 py-3 font-mono text-[12px] text-ink-2">
                          {row.customer_iban_last4 ? `•••• ${row.customer_iban_last4}` : '—'}
                        </td>
                        <td className="px-4 py-3 font-mono text-[12px] tabular-nums">
                          {scheduleText(row.tenor, row.scheduled_amount, formatAmount) ?? '—'}
                        </td>
                        <td className="px-4 py-3 font-mono text-[12px]">{row.contract_start ?? '—'}</td>
                        <td className="px-4 py-3 text-right font-mono text-[12px] tabular-nums">
                          {row.payments_seen}
                        </td>
                        <td
                          className={cx(
                            'px-4 py-3 text-right font-mono text-[12px] tabular-nums',
                            row.alerts > 0 && 'text-carmine',
                          )}
                        >
                          {row.alerts}
                        </td>
                        <td
                          className="px-4 py-3 font-mono text-[11px] uppercase tracking-tag text-ink-3"
                          title={row.last_payment_at ? formatAbsolute(row.last_payment_at) : undefined}
                        >
                          {row.last_payment_at ? formatRelative(row.last_payment_at) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="font-mono text-[11px] uppercase tracking-label text-ink-3">
                  {offset + 1}–{offset + page.items.length} of {page.total}
                </p>
                <div className="flex gap-3">
                  <Button
                    variant="ghost"
                    disabled={offset === 0 || query.isFetching}
                    onClick={() =>
                      setFilters((current) => ({ ...current, offset: Math.max(0, offset - limit) }))
                    }
                  >
                    Previous
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={offset + page.items.length >= page.total || query.isFetching}
                    onClick={() => setFilters((current) => ({ ...current, offset: offset + limit }))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="block bg-surface p-4">
      <Eyebrow className="!mb-2">{label}</Eyebrow>
      {children}
    </div>
  );
}
