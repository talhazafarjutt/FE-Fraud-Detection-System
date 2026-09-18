import type { AlertDetail, DecisionReason, Signals, TriggeredRule } from '@/api/schemas/alerts';
import { cx } from '@/components/primitives';
import { titleCase } from '@/lib/format';

/**
 * The evidence surface: the four signals, the rules that fired, the reasons
 * grouped by source, and the network neighbourhood.
 *
 * VERIFIED: these fields are present on the deployed alert detail but null or
 * empty on every alert sampled — the risk engine is deployed but not producing.
 * Each panel therefore has a real, explicit empty state. An alert can legitimately
 * be raised by network evidence alone with a near-zero model score, so nothing
 * here treats the model as the headline and the rest as footnotes.
 */

const SIGNAL_ORDER = [
  { key: 'model_score', label: 'Model', colour: 'var(--ultra)' },
  { key: 'rule_score', label: 'Rule', colour: 'var(--carmine)' },
  { key: 'anomaly_score', label: 'Anomaly', colour: 'var(--amber)' },
  { key: 'network_score', label: 'Network', colour: 'var(--sage)' },
] as const;

export function SignalBars({ signals }: { signals: Signals | null }) {
  if (!signals) {
    return <Empty>The risk engine has not recorded a signal breakdown for this alert.</Empty>;
  }

  const present = SIGNAL_ORDER.filter((s) => typeof signals[s.key] === 'number');
  if (present.length === 0) {
    return <Empty>No individual signal scores were returned.</Empty>;
  }

  return (
    <div className="space-y-5 border border-rule bg-surface p-6">
      {present.map((signal) => {
        const value = signals[signal.key] as number;
        return (
          <div key={signal.key}>
            <div className="mb-2 flex items-baseline justify-between gap-4">
              <span className="mono-label text-ink-2">{signal.label}</span>
              <span className="num font-mono text-[12px] tabular-nums text-ink">
                {Math.round(value)}
              </span>
            </div>
            <div className="h-[10px] w-full bg-paper">
              <div
                className="h-full"
                style={{
                  width: `${Math.max(0, Math.min(100, value))}%`,
                  background: signal.colour,
                }}
              />
            </div>
          </div>
        );
      })}

      {typeof signals.weighted_score === 'number' ? (
        <div className="border-t border-rule pt-4">
          <div className="flex items-baseline justify-between gap-4">
            <span className="mono-label text-ink-3">Weighted</span>
            <span className="num font-mono text-[14px] tabular-nums text-ink">
              {Math.round(signals.weighted_score)}
            </span>
          </div>
        </div>
      ) : null}

      {/*
        A hard rule can set a floor regardless of what the model said. Without
        this marker the weighted score looks inconsistent with the bars above it.
      */}
      {signals.rule_floor_applied ? (
        <p className="border border-amber px-4 py-3 text-[13px] leading-relaxed text-ink-2">
          <span className="mono-label mr-2 text-amber">Rule floor applied</span>
          A rule set a minimum score here, so the final figure is higher than the individual
          signals alone would give.
        </p>
      ) : null}
    </div>
  );
}

export function TriggeredRules({ rules }: { rules: readonly TriggeredRule[] }) {
  if (rules.length === 0) return <Empty>No rules fired on this alert.</Empty>;

  return (
    <div className="border border-rule bg-surface">
      <ul className="divide-y divide-rule-soft">
        {rules.map((rule) => (
          <li key={rule.rule} className="flex flex-wrap items-start gap-4 p-5">
            <span
              className={cx(
                'inline-flex border px-2 py-1 font-mono text-[10px] uppercase leading-none tracking-tag',
                rule.severity === 'HIGH' || rule.severity === 'CRITICAL'
                  ? 'border-carmine text-carmine'
                  : rule.severity === 'MEDIUM'
                    ? 'border-amber text-amber'
                    : 'border-rule text-ink-3',
              )}
            >
              {rule.severity ?? 'RULE'}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[12px] text-ink">{rule.rule}</p>
              {rule.description ? (
                <p className="mt-1 text-[14px] text-ink-2">{rule.description}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const SOURCE_LABEL: Record<string, string> = {
  MODEL: 'Model',
  RULE: 'Rules',
  ANOMALY: 'Anomaly',
  NETWORK: 'Network',
};

export function DecisionReasons({ reasons }: { reasons: readonly DecisionReason[] }) {
  if (reasons.length === 0) {
    return <Empty>No decision reasons were recorded for this alert.</Empty>;
  }

  // Grouped by source so a reader can see which part of the engine spoke.
  const grouped = new Map<string, DecisionReason[]>();
  for (const reason of reasons) {
    const list = grouped.get(reason.source) ?? [];
    list.push(reason);
    grouped.set(reason.source, list);
  }

  return (
    <div className="grid gap-px border border-rule bg-rule sm:grid-cols-2">
      {[...grouped.entries()].map(([source, list]) => (
        <div key={source} className="bg-surface p-5">
          <p className="mono-label mb-3 text-ink-3">{SOURCE_LABEL[source] ?? titleCase(source)}</p>
          <ul className="space-y-3">
            {list.map((reason, index) => (
              <li key={`${reason.code ?? 'reason'}-${index}`}>
                {reason.code ? (
                  <p className="font-mono text-[11px] uppercase tracking-tag text-ink">
                    {reason.code}
                  </p>
                ) : null}
                {reason.description ? (
                  <p className="mt-1 text-[14px] leading-relaxed text-ink-2">
                    {reason.description}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * The neighbourhood around this one alert. Deliberately not interactive: there
 * is no endpoint for the next hop, so a clickable node would be a dead end.
 */
export function NetworkNeighbourhood({ network }: { network: AlertDetail['network'] }) {
  if (!network) return <Empty>No network analysis was recorded for this alert.</Empty>;

  const nodes = network.neighborhood?.nodes ?? [];
  const edges = network.neighborhood?.edges ?? [];
  const evidence = network.evidence ?? [];

  if (nodes.length === 0 && evidence.length === 0) {
    return <Empty>The network signal returned no evidence for this alert.</Empty>;
  }

  return (
    <div className="space-y-5 border border-rule bg-surface p-6">
      {typeof network.network_score === 'number' ? (
        <div className="flex items-baseline justify-between gap-4 border-b border-rule-soft pb-4">
          <span className="mono-label text-ink-3">Network score</span>
          <span className="num font-mono text-[14px] tabular-nums text-ink">
            {Math.round(network.network_score)}
          </span>
        </div>
      ) : null}

      {nodes.length > 0 ? (
        <p className="font-mono text-[11px] uppercase tracking-tag text-ink-2">
          {nodes.length} account{nodes.length === 1 ? '' : 's'}, {edges.length} connection
          {edges.length === 1 ? '' : 's'}
        </p>
      ) : null}

      {evidence.length > 0 ? (
        <ul className="space-y-2">
          {evidence.map((item, index) => (
            <li
              key={index}
              className="border border-rule-soft px-4 py-3 font-mono text-[11px] text-ink-2"
            >
              {typeof item === 'string' ? item : JSON.stringify(item)}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="border-t border-rule-soft pt-4 text-[13px] leading-relaxed text-ink-3">
        This is the neighbourhood recorded for this alert, not a graph you can travel. Walking
        outward needs an endpoint that returns the next hop.
      </p>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="border border-rule-soft px-4 py-6 text-[14px] text-ink-2">{children}</p>
  );
}
