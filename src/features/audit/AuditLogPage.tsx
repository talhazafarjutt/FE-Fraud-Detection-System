import { useCallback, useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { listAuditLogs } from '@/api/endpoints/audit';
import type { AuditEntry, AuditFilters } from '@/api/schemas/audit';
import { ApiErrorPanel, EmptyPanel, LoadingRows, SkippedRowsNotice } from '@/components/ApiStates';
import { Button, Eyebrow, SectionHeading, Tag } from '@/components/primitives';
import { formatAbsolute, formatRelative, shortId } from '@/lib/format';

/**
 * The audit trail. Append-only, newest first.
 *
 * In a financial-crime system every state change has to be reconstructable
 * years later. There is no write route — a POST returns 405 — and `audit:read`
 * is held by SUPERVISOR and ADMIN only: the trail describes the analysts, so
 * they do not get to read it.
 */
const ENTITIES = ['fraud_case', 'fraud_alert', 'transaction', 'app_user'] as const;

export default function AuditLogPage() {
  const [filters, setFilters] = useState<AuditFilters>({ limit: 50 });
  const [actor, setActor] = useState('');

  const query = useInfiniteQuery({
    queryKey: ['audit', 'list', filters],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => listAuditLogs(filters, pageParam, signal),
    getNextPageParam: (last) => last.next_cursor,
  });

  const rows = useMemo<AuditEntry[]>(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data],
  );
  const skipped = useMemo(
    () => query.data?.pages.reduce((sum, p) => sum + p.skipped, 0) ?? 0,
    [query.data],
  );

  const set = useCallback(<K extends keyof AuditFilters>(key: K, value: AuditFilters[K]) => {
    setFilters((current) => {
      const next = { ...current };
      if (value === undefined || value === '') delete next[key];
      else next[key] = value;
      return next;
    });
  }, []);

  return (
    <div className="space-y-8">
      <SectionHeading
        index="09"
        title="Audit log"
        hint="Who did what, when, and from where. Append-only: there is no route that writes here from the console, and nothing in this table can be edited or removed."
      />

      <section className="border border-rule bg-surface">
        <div className="grid gap-px bg-rule md:grid-cols-4">
          <Field label="Entity">
            <select
              className="field"
              value={filters.entity ?? ''}
              onChange={(e) => set('entity', e.target.value || undefined)}
            >
              <option value="">Any</option>
              {ENTITIES.map((entity) => (
                <option key={entity} value={entity}>
                  {entity.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Action">
            <input
              className="field"
              placeholder="case.patch"
              value={filters.action ?? ''}
              onChange={(e) => set('action', e.target.value || undefined)}
            />
          </Field>

          <Field label="Actor">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                set('actor', actor.trim() || undefined);
              }}
              className="flex gap-2"
            >
              <input
                className="field"
                placeholder="User id"
                value={actor}
                onChange={(e) => setActor(e.target.value)}
              />
              <Button variant="ghost" type="submit">
                Go
              </Button>
            </form>
          </Field>

          <div className="grid grid-cols-2 gap-px bg-rule">
            <Field label="From">
              <input
                type="date"
                className="field"
                value={(filters.created_from ?? '').slice(0, 10)}
                onChange={(e) =>
                  set('created_from', e.target.value ? `${e.target.value}T00:00:00Z` : undefined)
                }
              />
            </Field>
            <Field label="To">
              <input
                type="date"
                className="field"
                value={(filters.created_to ?? '').slice(0, 10)}
                onChange={(e) =>
                  set('created_to', e.target.value ? `${e.target.value}T23:59:59Z` : undefined)
                }
              />
            </Field>
          </div>
        </div>
      </section>

      <SkippedRowsNotice skipped={skipped} />

      {query.isError ? (
        <ApiErrorPanel
          error={query.error}
          what="the audit trail"
          scopeHint="audit:read"
          onRetry={() => void query.refetch()}
        />
      ) : query.isPending ? (
        <LoadingRows label="Loading audit trail" />
      ) : rows.length === 0 ? (
        <EmptyPanel
          title="No entries match"
          body="Nothing has been recorded against these filters. The trail is complete — an empty result means no matching action was taken."
        />
      ) : (
        <>
          <AuditTable rows={rows} />
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
              End of trail — {rows.length} entries shown
            </p>
          )}
        </>
      )}
    </div>
  );
}

export function AuditTable({ rows, compact = false }: { rows: AuditEntry[]; compact?: boolean }) {
  return (
    <div className="overflow-x-auto border border-rule bg-surface">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-rule">
            {['When', 'Action', 'Entity', 'Actor', ...(compact ? [] : ['Source']), 'Detail'].map(
              (label) => (
                <th
                  key={label}
                  className="px-4 py-3 font-mono text-[11px] uppercase tracking-label text-ink-3"
                >
                  {label}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-rule-soft last:border-0 align-top">
              <td className="whitespace-nowrap px-4 py-3 text-ink-2" title={formatAbsolute(row.created_at)}>
                {formatRelative(row.created_at)}
              </td>
              <td className="px-4 py-3">
                <Tag>{row.action}</Tag>
              </td>
              <td className="px-4 py-3">
                <span className="font-mono text-[11px] uppercase tracking-tag text-ink-2">
                  {row.entity.replace(/_/g, ' ')}
                </span>
                {row.entity_id ? (
                  <span className="ml-2 font-mono text-[11px] text-ink-3" title={row.entity_id}>
                    {shortId(row.entity_id)}
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-3">
                <span className="font-mono text-[11px] text-ink-2" title={row.actor}>
                  {shortId(row.actor)}
                </span>
                <span className="ml-2 text-[11px] text-ink-3">{row.actor_type}</span>
              </td>
              {compact ? null : (
                <td className="px-4 py-3 font-mono text-[11px] text-ink-3">
                  {row.ip ?? '—'}
                  {row.request_id ? (
                    <span className="block" title={row.request_id}>
                      req {row.request_id.slice(0, 8)}
                    </span>
                  ) : null}
                </td>
              )}
              <td className="px-4 py-3">
                <Detail detail={row.detail} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** `detail` is free-form per action, so it is rendered as pairs, never assumed. */
function Detail({ detail }: { detail: Record<string, unknown> | null | undefined }) {
  if (!detail || Object.keys(detail).length === 0) {
    return <span className="text-ink-3">—</span>;
  }
  return (
    <dl className="space-y-1">
      {Object.entries(detail).map(([key, value]) => (
        <div key={key} className="flex gap-2 font-mono text-[11px]">
          <dt className="text-ink-3">{key}</dt>
          <dd className="text-ink-2">
            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
          </dd>
        </div>
      ))}
    </dl>
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
