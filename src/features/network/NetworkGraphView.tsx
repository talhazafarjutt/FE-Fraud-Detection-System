import { useId } from 'react';
import type { NetworkGraph } from '@/api/schemas/network';
import { cx } from '@/components/primitives';
import { formatMoney } from '@/lib/money';
import { type PlacedNode, describeShapes, layoutGraph, nodeTone } from './layout';

/**
 * The graph itself.
 *
 * Accessibility is not an afterthought here: an SVG is unusable to a screen
 * reader and uncitable in a report, so the same graph is also published as a
 * table of nodes and edges plus a written summary of the shapes found. Both are
 * generated from the same data, so they cannot disagree.
 */
export function NetworkGraphView({
  graph,
  onFocusNode,
  selectedId,
}: {
  graph: NetworkGraph;
  onFocusNode: (accountId: string) => void;
  selectedId?: string;
}) {
  const titleId = useId();
  const descId = useId();
  const { nodes, edges, width, height } = layoutGraph(graph);
  const shapes = describeShapes(graph);

  const summary =
    `${nodes.length} accounts and ${edges.length} money flows, ` +
    `${graph.depth} hop${graph.depth === 1 ? '' : 's'} from the focus account ` +
    `over ${graph.window_days} days.` +
    (shapes.length ? ` Patterns found: ${shapes.map((s) => s.detail).join(' ')}` : '');

  return (
    <div className="space-y-6">
      <div className="overflow-auto border border-rule bg-surface">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full min-w-[640px]"
          role="img"
          aria-labelledby={`${titleId} ${descId}`}
        >
          <title id={titleId}>Money-flow network around the focus account</title>
          <desc id={descId}>{summary}</desc>

          <defs>
            <marker
              id="civitas-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--rule)" />
            </marker>
          </defs>

          {/* Hop rings, drawn first so nothing sits on top of a node. */}
          {Array.from(new Set(nodes.map((n) => n.hop)))
            .filter((hop) => hop > 0)
            .map((hop) => (
              <circle
                key={`ring-${hop}`}
                cx={width / 2}
                cy={height / 2}
                r={130 * hop}
                fill="none"
                stroke="var(--rule-soft)"
                strokeDasharray="2 6"
              />
            ))}

          {edges.map((edge, index) => (
            <line
              key={`${edge.source}-${edge.target}-${index}`}
              x1={edge.from.x}
              y1={edge.from.y}
              x2={edge.to.x}
              y2={edge.to.y}
              stroke="var(--rule)"
              /* Thickness is money moved, not how many times it moved. */
              strokeWidth={1 + edge.weight * 7}
              strokeOpacity={0.55}
              markerEnd="url(#civitas-arrow)"
            >
              <title>
                {formatMoney(edge.total_amount, edge.currency)} across {edge.transaction_count}{' '}
                transaction{edge.transaction_count === 1 ? '' : 's'}
              </title>
            </line>
          ))}

          {nodes.map((node) => (
            <NodeMark
              key={node.id}
              node={node}
              selected={node.id === selectedId}
              onFocus={() => onFocusNode(node.id)}
            />
          ))}
        </svg>
      </div>

      <Legend />

      {shapes.length ? (
        <section className="border border-rule bg-surface p-5">
          <p className="eyebrow !mb-3">Patterns in this neighbourhood</p>
          <ul className="space-y-2 text-ink-2">
            {shapes.map((shape, i) => (
              <li key={`${shape.kind}-${i}`} className="flex gap-3">
                <span className="mono-label shrink-0 text-ink-3">
                  {shape.kind.replace('-', ' ')}
                </span>
                <span>{shape.detail}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[12px] text-ink-3">
            Derived from the edges drawn above. Fan-in is many accounts paying one; pass-through is
            money arriving and leaving again; a cycle is money returning where it started.
          </p>
        </section>
      ) : null}

      {/* The non-visual equivalent of the drawing above. */}
      <details className="border border-rule bg-surface">
        <summary className="cursor-pointer px-5 py-4 font-mono text-[11px] uppercase tracking-label text-ink-3">
          Graph as a table ({nodes.length} accounts, {edges.length} flows)
        </summary>
        <div className="overflow-x-auto border-t border-rule">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">{summary}</caption>
            <thead>
              <tr className="border-b border-rule">
                {['From', 'To', 'Total moved', 'Transactions', 'Last booked'].map((label) => (
                  <th
                    key={label}
                    className="px-4 py-3 font-mono text-[11px] uppercase tracking-label text-ink-3"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {edges.map((edge, index) => (
                <tr key={`row-${index}`} className="border-b border-rule-soft last:border-0">
                  <td className="px-4 py-3 font-mono text-[12px]">{nodeLabel(edge.from)}</td>
                  <td className="px-4 py-3 font-mono text-[12px]">{nodeLabel(edge.to)}</td>
                  <td className="px-4 py-3 font-mono text-[12px] tabular-nums">
                    {formatMoney(edge.total_amount, edge.currency)}
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px] tabular-nums">
                    {edge.transaction_count}
                  </td>
                  <td className="px-4 py-3 text-ink-2">{edge.last_booked_at ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function nodeLabel(node: PlacedNode): string {
  if (node.account_last4) return `••••${node.account_last4}`;
  return node.label ?? node.id.slice(0, 8);
}

function NodeMark({
  node,
  selected,
  onFocus,
}: {
  node: PlacedNode;
  selected: boolean;
  onFocus: () => void;
}) {
  const tone = nodeTone(node.alert_count);
  const r = node.is_focus ? 15 : 9;

  return (
    <g
      transform={`translate(${node.x} ${node.y})`}
      className="cursor-pointer"
      tabIndex={0}
      role="button"
      aria-label={`${nodeLabel(node)}, hop ${node.hop}, ${node.alert_count} alerts, ${tone.label}. Activate to re-centre the graph here.`}
      onClick={onFocus}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onFocus();
        }
      }}
    >
      {node.is_focus || selected ? (
        <circle r={r + 6} fill="none" stroke="var(--ultra)" strokeWidth={2} />
      ) : null}
      <circle r={r} fill={tone.fill} stroke="var(--paper)" strokeWidth={2} />
      {node.alert_count > 0 ? (
        <text
          y={4}
          textAnchor="middle"
          className="pointer-events-none fill-[var(--on-carmine)] font-mono text-[10px]"
        >
          {node.alert_count}
        </text>
      ) : null}
      <text
        y={r + 14}
        textAnchor="middle"
        className="pointer-events-none fill-[var(--ink-3)] font-mono text-[10px]"
      >
        {node.account_last4 ? `••••${node.account_last4}` : ''}
      </text>
      <title>
        {nodeLabel(node)} · hop {node.hop} · {node.alert_count} alerts
        {node.country_code ? ` · ${node.country_code}` : ''}
        {node.status ? ` · ${node.status}` : ''}
      </title>
    </g>
  );
}

const LEGEND: Array<{ fill: string; label: string }> = [
  { fill: 'var(--ink-3)', label: 'No alerts' },
  { fill: 'var(--ultra)', label: '1–2 alerts' },
  { fill: 'var(--amber)', label: '3–9 alerts' },
  { fill: 'var(--carmine)', label: '10 or more' },
];

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] text-ink-3">
      {LEGEND.map((entry) => (
        <span key={entry.label} className="inline-flex items-center gap-2">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ background: entry.fill }}
            aria-hidden="true"
          />
          {entry.label}
        </span>
      ))}
      <span className={cx('inline-flex items-center gap-2')}>
        <span className="inline-block h-[6px] w-6 bg-rule" aria-hidden="true" />
        Line thickness is the total amount moved
      </span>
    </div>
  );
}
