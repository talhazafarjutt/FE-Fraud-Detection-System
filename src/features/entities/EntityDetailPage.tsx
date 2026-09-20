import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { getEntity, listEntityTransactions } from '@/api/endpoints/entities';
import { DIRECTIONS, type EntityTransaction } from '@/api/schemas/entities';
import { ApiErrorPanel, EmptyPanel, LoadingRows, SkippedRowsNotice } from '@/components/ApiStates';
import { Button, Eyebrow, SectionHeading, Tag, cx } from '@/components/primitives';
import { formatAbsolute, formatRelative } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { RiskTier } from './RiskTier';

/**
 * A party, its accounts and its money.
 *
 * Two things on this page do investigative work:
 *
 *  1. `holder_role`. A BENEFICIAL_OWNER or SIGNATORY on a suspect account —
 *     someone who controls it without being its named holder — is a finding in
 *     itself, and it is the usual way a company front is exposed.
 *  2. `direction`, which is RELATIVE TO THIS PARTY. The same transaction is OUT
 *     here and IN on the counterparty's page. It is labelled from this entity's
 *     point of view and never as a property of the row.
 */
export default function EntityDetailPage() {
  const { partyId = '' } = useParams();
  const [direction, setDirection] = useState<string | undefined>(undefined);

  const entity = useQuery({
    queryKey: ['entities', 'detail', partyId],
    queryFn: ({ signal }) => getEntity(partyId, signal),
    enabled: partyId !== '',
  });

  const transactions = useInfiniteQuery({
    queryKey: ['entities', 'transactions', partyId, direction],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      listEntityTransactions(partyId, direction, pageParam, signal),
    getNextPageParam: (last) => last.next_cursor,
    enabled: partyId !== '',
  });

  const rows = useMemo<EntityTransaction[]>(
    () => transactions.data?.pages.flatMap((p) => p.items) ?? [],
    [transactions.data],
  );
  const skipped = useMemo(
    () => transactions.data?.pages.reduce((sum, p) => sum + p.skipped, 0) ?? 0,
    [transactions.data],
  );

  if (entity.isError) {
    return (
      <div className="space-y-6">
        <BackLink />
        <ApiErrorPanel
          error={entity.error}
          what="this party"
          scopeHint="entities:read"
          onRetry={() => void entity.refetch()}
        />
      </div>
    );
  }

  if (entity.isPending) {
    return (
      <div className="space-y-6">
        <BackLink />
        <LoadingRows label="Loading party" />
      </div>
    );
  }

  const party = entity.data;
  const accounts = party.accounts ?? [];

  return (
    <div className="space-y-8">
      <BackLink />

      <SectionHeading
        index="05"
        title={party.display_name}
        hint={
          party.party_type === 'COMPANY'
            ? 'A company. Its accounts, its holders and the money that moved through them.'
            : 'A person. The accounts they hold or sign on, and the money that moved through them.'
        }
        actions={
          <Link to={`/network?party=${party.id}`} className="btn btn--ghost">
            Open in network explorer
          </Link>
        }
      />

      <div className="grid gap-px border border-rule bg-rule md:grid-cols-4">
        <Fact label="Type" value={String(party.party_type)} />
        <Fact label="Country" value={party.country_code} />
        <Fact label="Risk tier" value={<RiskTier tier={party.risk_tier} />} />
        <Fact
          label="First seen"
          value={formatAbsolute(party.created_at)}
          hint={formatRelative(party.created_at)}
        />
        <Fact label="Accounts" value={String(party.account_count ?? accounts.length)} />
        <Fact
          label="Transactions"
          value={String(party.transaction_count ?? '—')}
          hint="A single account with many inbound transfers is a fan-in pattern."
        />
        {party.party_type === 'COMPANY' ? (
          <>
            <Fact label="Registration" value={party.registration_no ?? '—'} />
            <Fact
              label="Legal form"
              value={`${party.legal_form ?? '—'}${party.sector_code ? ` · ${party.sector_code}` : ''}`}
            />
          </>
        ) : (
          <>
            <Fact
              label="PEP"
              value={party.pep_flag ? 'Yes' : party.pep_flag === false ? 'No' : '—'}
              hint={party.pep_flag ? 'Politically exposed person.' : undefined}
            />
            <Fact label="Date of birth" value={party.date_of_birth ?? '—'} />
          </>
        )}
      </div>

      <section className="space-y-4">
        <Eyebrow>Accounts held</Eyebrow>
        {accounts.length === 0 ? (
          <EmptyPanel title="No accounts on this party" />
        ) : (
          <div className="overflow-x-auto border border-rule bg-surface">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-rule">
                  {['Account', 'Holder role', 'Status', 'Currency', 'Country', 'Opened', ''].map(
                    (label, i) => (
                      <th
                        key={label || i}
                        className="px-4 py-3 font-mono text-[11px] uppercase tracking-label text-ink-3"
                      >
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id} className="border-b border-rule-soft last:border-0">
                    {/* Accounts are identified by last4 only. There is no IBAN in
                        any response on this API, by design. */}
                    <td className="px-4 py-3 font-mono text-[12px]">••••{account.account_last4}</td>
                    <td className="px-4 py-3">
                      <HolderRole role={account.holder_role} />
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] uppercase tracking-tag text-ink-2">
                      {account.status ?? '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px]">{account.currency ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-[12px]">
                      {account.country_code ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-ink-2">{account.opened_on ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/network?account=${account.id}`}
                        className="font-mono text-[11px] uppercase tracking-label text-ink-3 hover:text-ultra"
                      >
                        Network →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Transactions</Eyebrow>
            <p className="max-w-xl text-ink-2">
              Direction is from <strong>{party.display_name}</strong>&rsquo;s point of view. The
              same payment reads OUT here and IN on the counterparty.
            </p>
          </div>
          <div className="flex gap-px border border-rule bg-rule">
            {[undefined, ...DIRECTIONS].map((value) => (
              <button
                key={value ?? 'ALL'}
                type="button"
                onClick={() => setDirection(value)}
                className={cx(
                  'bg-surface px-4 py-2 font-mono text-[11px] uppercase tracking-label',
                  direction === value ? 'text-ultra' : 'text-ink-3 hover:text-ink',
                )}
              >
                {value ?? 'All'}
              </button>
            ))}
          </div>
        </div>

        <SkippedRowsNotice skipped={skipped} />

        {transactions.isError ? (
          <ApiErrorPanel
            error={transactions.error}
            what="this party's transactions"
            onRetry={() => void transactions.refetch()}
          />
        ) : transactions.isPending ? (
          <LoadingRows label="Loading transactions" />
        ) : rows.length === 0 ? (
          <EmptyPanel
            title={direction ? `No ${direction} transactions` : 'No transactions'}
            body="Nothing has moved through this party's accounts in the visible window."
          />
        ) : (
          <>
            <div className="overflow-x-auto border border-rule bg-surface">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-rule">
                    {['Direction', 'Reference', 'Amount', 'Type', 'Booked', 'Scoring'].map(
                      (label, i) => (
                        <th
                          key={label}
                          className={cx(
                            'px-4 py-3 font-mono text-[11px] uppercase tracking-label text-ink-3',
                            i === 2 && 'text-right',
                          )}
                        >
                          {label}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-rule-soft last:border-0">
                      <td className="px-4 py-3">
                        <DirectionChip direction={String(row.direction)} />
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/transactions?q=${row.external_ref ?? ''}`}
                          className="font-mono text-[12px] hover:text-ultra"
                        >
                          {row.external_ref ?? row.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[12px] tabular-nums">
                        {formatMoney(row.amount, row.currency)}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] uppercase tracking-tag text-ink-2">
                        {String(row.transaction_type)}
                      </td>
                      <td className="px-4 py-3 text-ink-2" title={formatAbsolute(row.booked_at)}>
                        {formatRelative(row.booked_at)}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] uppercase tracking-tag text-ink-3">
                        {row.scoring_status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {transactions.hasNextPage ? (
              <Button
                variant="ghost"
                disabled={transactions.isFetchingNextPage}
                onClick={() => void transactions.fetchNextPage()}
              >
                {transactions.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/entities"
      className="font-mono text-[11px] uppercase tracking-label text-ink-3 hover:text-ultra"
    >
      ← All entities
    </Link>
  );
}

function Fact({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="bg-surface p-4">
      <Eyebrow className="!mb-2">{label}</Eyebrow>
      <div className="text-ink">{value}</div>
      {hint ? <p className="mt-1 text-[12px] text-ink-3">{hint}</p> : null}
    </div>
  );
}

/**
 * Anything other than PRIMARY is worth a second look: control without being the
 * named holder is how a front is structured.
 */
function HolderRole({ role }: { role: string }) {
  const notable = role !== 'PRIMARY';
  return (
    <Tag className={notable ? 'border-amber text-amber' : undefined}>
      {role.replace(/_/g, ' ')}
    </Tag>
  );
}

function DirectionChip({ direction }: { direction: string }) {
  const tone =
    direction === 'IN'
      ? 'border-sage text-sage'
      : direction === 'OUT'
        ? 'border-carmine text-carmine'
        : 'border-ink-3 text-ink-3';
  const arrow = direction === 'IN' ? '↓' : direction === 'OUT' ? '↑' : '↔';
  return (
    <Tag className={tone}>
      <span aria-hidden="true" className="mr-1">
        {arrow}
      </span>
      {direction}
    </Tag>
  );
}
