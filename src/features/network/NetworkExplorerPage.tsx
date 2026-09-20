import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getAccountNetwork, getEntityNetwork } from '@/api/endpoints/network';
import { listEntities } from '@/api/endpoints/entities';
import { NETWORK_LIMITS, type NetworkParams } from '@/api/schemas/network';
import { ApiErrorPanel, EmptyPanel, LoadingRows } from '@/components/ApiStates';
import { Button, Eyebrow, SectionHeading } from '@/components/primitives';
import { NetworkGraphView } from './NetworkGraphView';

/**
 * The case drawn as a graph.
 *
 * This is how a human sees a ring rather than reading seventeen rows. The
 * entry point is either an account or a party; clicking any node re-centres on
 * it, so the graph is something you travel rather than a single picture.
 */
export default function NetworkExplorerPage() {
  const [params, setParams] = useSearchParams();
  const accountId = params.get('account');
  const partyId = params.get('party');

  const [controls, setControls] = useState<Required<NetworkParams>>({
    depth: NETWORK_LIMITS.depth.default,
    window_days: NETWORK_LIMITS.window_days.default,
    max_nodes: NETWORK_LIMITS.max_nodes.default,
  });

  const focus = accountId ?? partyId ?? null;

  const graph = useQuery({
    queryKey: ['network', accountId ? 'account' : 'party', focus, controls],
    queryFn: ({ signal }) =>
      accountId
        ? getAccountNetwork(accountId, controls, signal)
        : getEntityNetwork(partyId ?? '', controls, signal),
    enabled: focus !== null,
  });

  const recentre = (nextAccountId: string) => {
    setParams({ account: nextAccountId }, { replace: false });
  };

  return (
    <div className="space-y-8">
      <SectionHeading
        index="04"
        title="Network explorer"
        hint="Accounts as nodes, money movements as edges. Fan-in, pass-through and cycles are recognisable shapes — and they are the point of this view."
      />

      {focus === null ? (
        <StartingPoints />
      ) : (
        <>
          <section className="border border-rule bg-surface">
            <div className="grid gap-px bg-rule md:grid-cols-4">
              <Control
                label="Depth"
                hint="Hops from the focus account"
                value={controls.depth}
                min={NETWORK_LIMITS.depth.min}
                max={NETWORK_LIMITS.depth.max}
                onChange={(depth) => setControls((c) => ({ ...c, depth }))}
              />
              <Control
                label="Window"
                hint="Days of history"
                value={controls.window_days}
                min={NETWORK_LIMITS.window_days.min}
                max={NETWORK_LIMITS.window_days.max}
                onChange={(window_days) => setControls((c) => ({ ...c, window_days }))}
              />
              <Control
                label="Node budget"
                hint="Stops runaway expansion"
                value={controls.max_nodes}
                min={NETWORK_LIMITS.max_nodes.min}
                max={NETWORK_LIMITS.max_nodes.max}
                step={10}
                onChange={(max_nodes) => setControls((c) => ({ ...c, max_nodes }))}
              />
              <div className="bg-surface p-4">
                <Eyebrow className="!mb-2">Focus</Eyebrow>
                <p className="break-all font-mono text-[12px] text-ink-2">{focus}</p>
                <Link
                  to="/network"
                  className="mt-2 inline-block font-mono text-[11px] uppercase tracking-label text-ink-3 hover:text-ultra"
                >
                  Change
                </Link>
              </div>
            </div>
          </section>

          {graph.isError ? (
            <ApiErrorPanel
              error={graph.error}
              what="this network"
              scopeHint="alerts:read"
              onRetry={() => void graph.refetch()}
            />
          ) : graph.isPending ? (
            <LoadingRows label="Building the graph" rows={4} />
          ) : graph.data.nodes.length === 0 ? (
            <EmptyPanel
              title="No connected accounts"
              body="Nothing moved to or from this account inside the selected window. Widen the window or increase the depth."
            />
          ) : (
            <>
              {/*
               * A trimmed graph read as a complete one produces a false
               * conclusion — "the ring is five accounts" when the budget cut it
               * off at five. So this is stated, and the fix is offered rather
               * than the warning being dismissible.
               */}
              {graph.data.truncated ? (
                <div className="flex flex-wrap items-center justify-between gap-4 border border-amber bg-surface p-5">
                  <div>
                    <Eyebrow className="text-amber">Graph truncated</Eyebrow>
                    <p className="max-w-2xl text-ink-2">
                      The node budget stopped the expansion at {graph.data.nodes.length} accounts.
                      The network continues past what is drawn — do not read this as the whole ring.
                    </p>
                  </div>
                  <Button
                    onClick={() =>
                      setControls((c) => ({
                        ...c,
                        max_nodes: Math.min(NETWORK_LIMITS.max_nodes.max, c.max_nodes * 2),
                      }))
                    }
                    disabled={controls.max_nodes >= NETWORK_LIMITS.max_nodes.max}
                  >
                    {controls.max_nodes >= NETWORK_LIMITS.max_nodes.max
                      ? 'At maximum'
                      : `Expand to ${Math.min(NETWORK_LIMITS.max_nodes.max, controls.max_nodes * 2)} nodes`}
                  </Button>
                </div>
              ) : null}

              <NetworkGraphView
                graph={graph.data}
                onFocusNode={recentre}
                selectedId={accountId ?? undefined}
              />

              <p className="font-mono text-[11px] uppercase tracking-label text-ink-3">
                {graph.data.nodes.length} accounts · {graph.data.edges.length} flows · depth{' '}
                {graph.data.depth} · {graph.data.window_days} days
                {graph.data.truncated ? ' · truncated' : ''}
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The explorer needs somewhere to start. Rather than asking for a UUID, offer
 * the parties with the most traffic — a high transaction count on a single
 * account is exactly the shape worth opening first.
 */
function StartingPoints() {
  const entities = useQuery({
    queryKey: ['entities', 'network-starting-points'],
    queryFn: ({ signal }) => listEntities({ limit: 50, min_risk_tier: 3 }, null, signal),
  });

  const candidates = useMemo(
    () =>
      [...(entities.data?.items ?? [])]
        .sort((a, b) => (b.transaction_count ?? 0) - (a.transaction_count ?? 0))
        .slice(0, 12),
    [entities.data],
  );

  return (
    <div className="space-y-6">
      <div className="border border-rule bg-surface p-8">
        <Eyebrow>Pick a starting point</Eyebrow>
        <h2 className="mb-3">The graph is entered from an account or a party.</h2>
        <p className="max-w-2xl text-ink-2">
          Open any entity or alert and choose &ldquo;Network&rdquo;, or start from one of the
          higher-risk parties below. Most traffic on a single account is the usual first thread to
          pull.
        </p>
      </div>

      {entities.isError ? (
        <ApiErrorPanel
          error={entities.error}
          what="starting points"
          scopeHint="entities:read"
          onRetry={() => void entities.refetch()}
        />
      ) : entities.isPending ? (
        <LoadingRows label="Loading starting points" rows={4} />
      ) : candidates.length === 0 ? (
        <EmptyPanel
          title="No parties to start from"
          body="Your team has not transacted with any higher-risk party yet."
        />
      ) : (
        <ul className="grid gap-px border border-rule bg-rule md:grid-cols-3">
          {candidates.map((entity) => (
            <li key={entity.id} className="bg-surface p-4">
              <Link to={`/network?party=${entity.id}`} className="font-medium hover:text-ultra">
                {entity.display_name}
              </Link>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-label text-ink-3">
                tier {entity.risk_tier} · {entity.transaction_count ?? 0} transactions ·{' '}
                {entity.account_count ?? 0} accounts
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Control({
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block bg-surface p-4">
      <Eyebrow className="!mb-2">{label}</Eyebrow>
      <input
        type="range"
        className="w-full accent-[var(--ultra)]"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <p className="mt-1 font-mono text-[12px] tabular-nums text-ink-2">
        {value} <span className="text-ink-3">· {hint}</span>
      </p>
    </label>
  );
}
