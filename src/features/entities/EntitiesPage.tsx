import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { listEntities } from '@/api/endpoints/entities';
import type { EntityFilters, EntityRow } from '@/api/schemas/entities';
import { ApiErrorPanel, EmptyPanel, LoadingRows, SkippedRowsNotice } from '@/components/ApiStates';
import { Button, Eyebrow, SectionHeading, Tag, cx } from '@/components/primitives';
import { useAuth } from '@/auth/AuthProvider';
import { TeamScopeNote } from '@/components/TeamScopeNote';
import { RiskTier } from './RiskTier';

const PARTY_TYPES = ['PERSON', 'COMPANY'] as const;

/**
 * Entities — the parties behind the transactions.
 *
 * `transaction_count` is the reason to open this screen at all: one account
 * with fifteen inbound transfers is a fan-in mule, and that is readable from
 * the list without opening anything. So it is a sortable-looking, prominent
 * column rather than a detail-page footnote.
 *
 * An entity is visible only if your team has transacted with it. An empty list
 * for a team with no traffic is CORRECT, and the empty state says so by name
 * rather than leaving an analyst to wonder what broke.
 */
export default function EntitiesPage() {
  const { hasScope } = useAuth();
  const [filters, setFilters] = useState<EntityFilters>({ limit: 50 });
  const [search, setSearch] = useState('');

  const query = useInfiniteQuery({
    queryKey: ['entities', 'list', filters],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => listEntities(filters, pageParam, signal),
    getNextPageParam: (last) => last.next_cursor,
  });

  const rows = useMemo<EntityRow[]>(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data],
  );
  const skipped = useMemo(
    () => query.data?.pages.reduce((sum, p) => sum + p.skipped, 0) ?? 0,
    [query.data],
  );

  const set = useCallback(
    <K extends keyof EntityFilters>(key: K, value: EntityFilters[K]) => {
      setFilters((current) => {
        const next = { ...current };
        if (value === undefined || value === '') delete next[key];
        else next[key] = value;
        return next;
      });
    },
    [],
  );

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    set('q', search.trim() || undefined);
  };

  return (
    <div className="space-y-8">
      <SectionHeading
        index="05"
        title="Entities"
        hint="The people, companies and accounts behind the transactions. One person may hold several accounts; one account may have several holders — and those shared relationships are the edges that make a network."
      />

      {!hasScope('entities:read') ? (
        <EmptyPanel
          title="entities:read not granted"
          body="This account cannot read party records. Ask an administrator for the entities:read scope."
        />
      ) : null}

      <section className="border border-rule bg-surface">
        <div className="grid gap-px bg-rule md:grid-cols-4">
          <Field label="Party type">
            <select
              className="field"
              value={filters.party_type ?? ''}
              onChange={(e) => set('party_type', e.target.value || undefined)}
            >
              <option value="">Any</option>
              {PARTY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Country">
            <input
              className="field"
              placeholder="AE"
              maxLength={2}
              value={filters.country_code ?? ''}
              onChange={(e) => set('country_code', e.target.value.toUpperCase() || undefined)}
            />
          </Field>

          <Field label="Minimum risk tier">
            <select
              className="field"
              value={filters.min_risk_tier ?? ''}
              onChange={(e) =>
                set('min_risk_tier', e.target.value ? Number(e.target.value) : undefined)
              }
            >
              <option value="">Any</option>
              {[1, 2, 3, 4, 5].map((t) => (
                <option key={t} value={t}>
                  {t} and above
                </option>
              ))}
            </select>
          </Field>

          <Field label="Search">
            <form onSubmit={submitSearch} className="flex gap-2">
              <input
                className="field"
                placeholder="Name or reference"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Button variant="ghost" type="submit">
                Go
              </Button>
            </form>
          </Field>
        </div>
      </section>

      <SkippedRowsNotice skipped={skipped} />

      {query.isError ? (
        <ApiErrorPanel
          error={query.error}
          what="the entity list"
          scopeHint="entities:read"
          onRetry={() => void query.refetch()}
        />
      ) : query.isPending ? (
        <LoadingRows label="Loading entities" />
      ) : rows.length === 0 ? (
        <EmptyPanel
          title="No entities"
          body={
            <>
              An entity only becomes visible once your team has transacted with it.{' '}
              <TeamScopeNote noun="parties" />
            </>
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto border border-rule bg-surface">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-rule">
                  {['Party', 'Type', 'Country', 'Risk tier', 'Accounts', 'Transactions', 'Flags', ''].map(
                    (label, i) => (
                      <th
                        key={label || i}
                        className={cx(
                          'px-4 py-3 font-mono text-[11px] uppercase tracking-label text-ink-3',
                          i >= 3 && i <= 5 && 'text-right',
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
                      <Link to={`/entities/${row.id}`} className="font-medium hover:text-ultra">
                        {row.display_name}
                      </Link>
                      {row.external_ref ? (
                        <span className="ml-2 font-mono text-[11px] text-ink-3">
                          {row.external_ref}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] uppercase tracking-tag text-ink-2">
                      {String(row.party_type)}
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px]">{row.country_code}</td>
                    <td className="px-4 py-3 text-right">
                      <RiskTier tier={row.risk_tier} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[12px] tabular-nums">
                      {row.account_count ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[12px] tabular-nums">
                      {row.transaction_count ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {row.pep_flag ? <Tag className="border-amber text-amber">PEP</Tag> : null}
                        {row.registration_no ? <Tag>{row.registration_no}</Tag> : null}
                        {row.legal_form ? <Tag>{row.legal_form}</Tag> : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/network?party=${row.id}`}
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

          {query.hasNextPage ? (
            <Button
              variant="ghost"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          ) : (
            <p className="font-mono text-[11px] uppercase tracking-label text-ink-3">
              End of results — {rows.length} shown
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block bg-surface p-4">
      <Eyebrow className="!mb-2">{label}</Eyebrow>
      {children}
    </label>
  );
}
