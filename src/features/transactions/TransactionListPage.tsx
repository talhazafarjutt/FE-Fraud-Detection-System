import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { listTransactions } from '@/api/endpoints/transactions';
import type { TransactionFilters, TransactionListItem } from '@/api/schemas/transactions';
import { SeverityChip } from '@/components/Chips';
import { Button, EmptyState, Eyebrow, Skeleton, cx } from '@/components/primitives';
import { formatAbsolute, formatRelative, shortId } from '@/lib/format';
import { formatAmount } from '@/lib/money';
import { errorStatus } from '@/lib/problem';
import { BAND_HEX, riskDisplay } from '@/lib/risk';

const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;
const TX_TYPES = ['TRANSFER', 'CASH_OUT', 'CASH_IN', 'PAYMENT', 'DEBIT'] as const;
const SCORING = ['COMPLETE', 'PENDING', 'FAILED'] as const;

const COLUMNS = [
  { label: 'Reference', align: 'left' },
  { label: 'Risk', align: 'right' },
  { label: 'Amount', align: 'right' },
  { label: 'Type', align: 'left' },
  { label: 'Booked', align: 'left' },
  { label: 'Accounts', align: 'left' },
  { label: 'Alert', align: 'left' },
  { label: '', align: 'right' },
] as const;

/**
 * The transaction ledger — fraud and non-fraud together.
 *
 * `has_alert` is the switch that makes that visible: a view built only from
 * alerts shows the small flagged slice and hides the traffic that passed.
 */
export default function TransactionListPage() {
  const [filters, setFilters] = useState<TransactionFilters>({ limit: 50 });

  const query = useInfiniteQuery({
    queryKey: ['transactions', 'list', filters],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => listTransactions(filters, pageParam, signal),
    getNextPageParam: (last) => last.next_cursor,
  });

  const rows = useMemo<TransactionListItem[]>(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data],
  );

  // Rows the API returned that did not match the expected shape. Shown rather
  // than hidden: a quietly shorter table is worse than an honest count.
  const skipped = useMemo(
    () => query.data?.pages.reduce((sum, p) => sum + (p.skipped ?? 0), 0) ?? 0,
    [query.data],
  );

  const set = useCallback(<K extends keyof TransactionFilters>(
    key: K,
    value: TransactionFilters[K],
  ) => {
    setFilters((current) => {
      const next = { ...current };
      if (value === undefined || value === '') delete next[key];
      else next[key] = value;
      return next;
    });
  }, []);

  // Only the score actually returned is counted — a null risk_score is not a zero.
  const scored = rows.filter((r) => riskDisplay(r.risk_score, r.fraud_probability) !== null);
  const flagged = rows.filter((r) => r.alert_id !== null);

  if (query.isError) {
    const status = errorStatus(query.error);
    return (
      <div className="space-y-6">
        <Header />
        <div className="border border-carmine bg-surface p-8">
          <Eyebrow className="text-carmine">Ledger unavailable</Eyebrow>
          <h2 className="mb-3">Transactions could not be loaded.</h2>
          <p className="mb-6 max-w-xl text-ink-2">
            {status === 403
              ? 'This account does not carry the transactions:read scope.'
              : 'The platform did not return the ledger. It may be restarting.'}
          </p>
          <Button onClick={() => void query.refetch()}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Header />

      <section className="border border-rule bg-surface">
        <div className="grid gap-px bg-rule md:grid-cols-4">
          <Field label="Risk level">
            <select
              className="field"
              value={filters.risk_level ?? ''}
              onChange={(e) => set('risk_level', e.target.value || undefined)}
            >
              <option value="">Any</option>
              {RISK_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Type">
            <select
              className="field"
              value={filters.transaction_type ?? ''}
              onChange={(e) => set('transaction_type', e.target.value || undefined)}
            >
              <option value="">Any</option>
              {TX_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Scoring">
            <select
              className="field"
              value={filters.scoring_status ?? ''}
              onChange={(e) => set('scoring_status', e.target.value || undefined)}
            >
              <option value="">Any</option>
              {SCORING.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>

          {/* The fraud / non-fraud switch. */}
          <Field label="Flagged">
            <select
              className="field"
              value={filters.has_alert === undefined ? '' : String(filters.has_alert)}
              onChange={(e) =>
                set('has_alert', e.target.value === '' ? undefined : e.target.value === 'true')
              }
            >
              <option value="">Everything</option>
              <option value="true">Flagged only</option>
              <option value="false">Clean only</option>
            </select>
          </Field>

          {/*
            booked_from / booked_to — the API's real parameter names. It ignores
            unknown query params silently, so the previous `from`/`to` looked
            like a working filter that never changed the results.
          */}
          <Field label="Booked from">
            <input
              type="date"
              className="field"
              value={(filters.booked_from ?? '').slice(0, 10)}
              onChange={(e) =>
                set('booked_from', e.target.value ? `${e.target.value}T00:00:00Z` : undefined)
              }
            />
          </Field>

          <Field label="Booked to">
            <input
              type="date"
              className="field"
              value={(filters.booked_to ?? '').slice(0, 10)}
              onChange={(e) =>
                set('booked_to', e.target.value ? `${e.target.value}T23:59:59Z` : undefined)
              }
            />
          </Field>

          <Field label="Reference">
            <input
              className="field"
              placeholder="TXN-000123"
              value={filters.q ?? ''}
              onChange={(e) => set('q', e.target.value || undefined)}
            />
          </Field>

          <Field label="Page size">
            <select
              className="field"
              value={String(filters.limit ?? 50)}
              onChange={(e) => set('limit', Number(e.target.value))}
            >
              {[25, 50, 100, 200].map((n) => (
                <option key={n} value={n}>
                  {n} per page
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule px-4 py-3">
          <span className="mono-label text-ink-3">
            {query.isPending
              ? 'Loading'
              : `${rows.length} loaded · ${flagged.length} flagged · ${scored.length} scored`}
            {/* A bad row is dropped, not fatal — but never silently. */}
            {skipped > 0 ? (
              <span className="ml-3 text-amber" title="These rows did not match the expected shape and were left out.">
                {skipped} row{skipped === 1 ? '' : 's'} skipped
              </span>
            ) : null}
          </span>
          <Button variant="ghost" onClick={() => setFilters({ limit: filters.limit ?? 50 })}>
            Clear filters
          </Button>
        </div>
      </section>

      <section>
        {query.isPending ? (
          <TableSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No transactions match these filters"
            body="Widen the date range or clear the risk and type filters."
          />
        ) : (
          <>
            <div className="overflow-x-auto border border-rule bg-surface">
              <table className="w-full min-w-[980px] border-collapse">
                <thead>
                  <tr className="border-b border-rule">
                    {COLUMNS.map((c, i) => (
                      <th
                        key={c.label || i}
                        scope="col"
                        className={cx(
                          'py-3 pr-4 font-mono text-[11px] font-normal uppercase tracking-tag text-ink-3',
                          i === 0 && 'pl-4',
                          c.align === 'right' ? 'text-right' : 'text-left',
                        )}
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <Row key={row.id} row={row} />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <span className="mono-label text-ink-3">
                {query.hasNextPage ? 'More pages available' : 'End of ledger'}
              </span>
              {query.hasNextPage ? (
                <Button
                  variant="ghost"
                  onClick={() => void query.fetchNextPage()}
                  disabled={query.isFetchingNextPage}
                >
                  {query.isFetchingNextPage ? 'Loading' : 'Load more'}
                </Button>
              ) : null}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Header() {
  return (
    <header className="flex flex-wrap items-end justify-between gap-6 border-b border-rule pb-6">
      <div>
        <Eyebrow className="!mb-2">Transactions</Eyebrow>
        <h1>The ledger</h1>
      </div>
      <Link to="/transactions/submit" className="btn btn--ghost">
        Submit a transaction
      </Link>
    </header>
  );
}

function AccountRef({
  last4,
  accountId,
}: {
  last4: string | null;
  accountId: string | null | undefined;
}) {
  const label = `••${last4 ?? '????'}`;
  if (!accountId) return <>{label}</>;
  return (
    <Link
      to={`/network?account=${accountId}`}
      className="hover:text-ultra"
      title="Open this account in the network explorer"
      onClick={(event) => event.stopPropagation()}
    >
      {label}
    </Link>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="bg-surface p-4">
      <span className="mono-label mb-2 block text-ink-3">{label}</span>
      {children}
    </label>
  );
}

function Row({ row }: { row: TransactionListItem }) {
  const risk = riskDisplay(row.risk_score, row.fraud_probability);

  return (
    <tr className="border-b border-rule-soft align-middle hover:bg-paper">
      <td className="py-3 pl-4 pr-4">
        <span className="font-mono text-[12px] text-ink" title={row.id}>
          {row.external_ref ?? shortId(row.id)}
        </span>
      </td>

      {/*
        Risk as a 0–100 score, never a percentage. When it comes from the legacy
        fraud_probability the cell says so rather than passing it off as the new
        score — every current row is in that state.
      */}
      <td className="py-3 pr-4">
        {risk === null ? (
          <span className="block text-right font-mono text-[11px] uppercase tracking-tag text-ink-3">
            {row.scoring_status === 'PENDING' ? 'Pending' : '—'}
          </span>
        ) : (
          <div className="flex items-center justify-end gap-3">
            <span className="h-[6px] w-16 bg-rule-soft" aria-hidden="true">
              <span
                className="block h-full"
                style={{ width: `${risk.value}%`, background: BAND_HEX[risk.band] }}
              />
            </span>
            <span
              className="num w-12 text-right font-mono text-[12px] tabular-nums text-ink"
              title={
                risk.derived
                  ? 'Derived from fraud_probability — this alert predates the risk engine, which returns risk_score directly.'
                  : 'risk_score, 0–100'
              }
            >
              {risk.value}
              {risk.derived ? <span className="ml-0.5 text-ink-3">*</span> : null}
            </span>
          </div>
        )}
      </td>

      <td className="py-3 pr-4 text-right">
        <span className="num font-mono text-[12px] tabular-nums text-ink">
          {formatAmount(row.amount)}
        </span>
        <span className="ml-2 font-mono text-[11px] uppercase tracking-tag text-ink-3">
          {row.currency}
        </span>
      </td>

      <td className="py-3 pr-4">
        <span className="font-mono text-[11px] uppercase tracking-tag text-ink-2">
          {row.transaction_type.replace(/_/g, ' ')}
        </span>
      </td>

      <td className="py-3 pr-4">
        <span
          className="font-mono text-[11px] uppercase tracking-tag text-ink-2"
          title={formatAbsolute(row.booked_at)}
        >
          {formatRelative(row.booked_at)}
        </span>
      </td>

      {/*
        Each side links into the network explorer centred on that account. The
        backend added `src_account_id`/`dst_account_id` for exactly this: the
        last4 is what a human reads, the id is what the graph endpoint needs.
        Falls back to plain text on the older contract, which sends neither.
      */}
      <td className="py-3 pr-4">
        <span className="font-mono text-[11px] text-ink-3">
          <AccountRef last4={row.src_account_last4} accountId={row.src_account_id} /> →{' '}
          <AccountRef last4={row.dst_account_last4} accountId={row.dst_account_id} />
        </span>
      </td>

      {/* alert_severity is returned on every flagged row — it was being dropped
          by the response schema before, so this column rendered blank. */}
      <td className="py-3 pr-4">
        {row.alert_severity ? (
          <SeverityChip severity={row.alert_severity} />
        ) : (
          <span className="font-mono text-[11px] uppercase tracking-tag text-ink-3">Clean</span>
        )}
      </td>

      <td className="py-3 pr-4 text-right">
        {row.alert_id ? (
          <Link
            to={`/alerts/${row.alert_id}`}
            className="font-mono text-[11px] uppercase tracking-label text-ultra hover:text-ultra-lift"
          >
            Open case
          </Link>
        ) : (
          <span className="font-mono text-[11px] uppercase tracking-tag text-ink-3">—</span>
        )}
      </td>
    </tr>
  );
}

function TableSkeleton() {
  return (
    <div className="border border-rule bg-surface p-4">
      <Skeleton className="mb-4 h-3 w-full" />
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-rule-soft py-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-2 w-16" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="ml-auto h-3 w-20" />
        </div>
      ))}
    </div>
  );
}
