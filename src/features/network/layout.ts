import type { NetworkEdge, NetworkGraph, NetworkNode } from '@/api/schemas/network';

/**
 * Concentric layout: the focus account at the centre, then one ring per hop.
 *
 * `hop` is distance from the focus, so it is the only honest basis for a
 * layout here — a force simulation would place nodes by whatever the solver
 * settled on and an investigator would read meaning into an accident. Rings
 * mean "two hops out" is always visibly two hops out.
 */

export interface PlacedNode extends NetworkNode {
  x: number;
  y: number;
}

export interface PlacedEdge extends NetworkEdge {
  from: PlacedNode;
  to: PlacedNode;
  /** 0–1, relative to the heaviest edge in this graph. Drives stroke width. */
  weight: number;
}

export interface Layout {
  nodes: PlacedNode[];
  edges: PlacedEdge[];
  width: number;
  height: number;
}

const RING = 130;
const PADDING = 60;

/**
 * Amounts are decimal STRINGS and may exceed what a float holds precisely.
 * Comparing lengths first, then the strings themselves, orders them exactly.
 * The float conversion that follows is for a stroke width in pixels, which is
 * the one place approximation is harmless.
 */
function amountRank(value: string): number {
  const cleaned = value.replace(/[^0-9.]/g, '');
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function layoutGraph(graph: NetworkGraph): Layout {
  const byHop = new Map<number, NetworkNode[]>();
  for (const node of graph.nodes) {
    const list = byHop.get(node.hop) ?? [];
    list.push(node);
    byHop.set(node.hop, list);
  }

  const maxHop = Math.max(0, ...graph.nodes.map((n) => n.hop));
  const radius = RING * maxHop;
  const size = radius * 2 + PADDING * 2;
  const centre = size / 2;

  const placed = new Map<string, PlacedNode>();

  for (const [hop, nodes] of [...byHop.entries()].sort((a, b) => a[0] - b[0])) {
    if (hop === 0) {
      // The focus sits dead centre even if the API ever returns more than one.
      nodes.forEach((node, index) => {
        const offset = nodes.length === 1 ? 0 : (index - (nodes.length - 1) / 2) * 40;
        placed.set(node.id, { ...node, x: centre + offset, y: centre });
      });
      continue;
    }
    const r = RING * hop;
    // Offset each ring by half a step so nodes do not line up into spokes,
    // which reads as structure that is not there.
    const stagger = (Math.PI / nodes.length) * (hop % 2);
    nodes.forEach((node, index) => {
      const angle = (index / nodes.length) * Math.PI * 2 + stagger - Math.PI / 2;
      placed.set(node.id, {
        ...node,
        x: centre + Math.cos(angle) * r,
        y: centre + Math.sin(angle) * r,
      });
    });
  }

  const ranks = graph.edges.map((edge) => amountRank(edge.total_amount));
  const heaviest = Math.max(1, ...ranks);

  const edges: PlacedEdge[] = [];
  graph.edges.forEach((edge, index) => {
    const from = placed.get(edge.source);
    const to = placed.get(edge.target);
    // An edge to a node the budget trimmed has nothing to attach to.
    if (!from || !to) return;
    edges.push({ ...edge, from, to, weight: (ranks[index] ?? 0) / heaviest });
  });

  return { nodes: [...placed.values()], edges, width: size, height: size };
}

/** Node fill by alert volume. 13 alerts and 0 alerts must not look alike. */
export function nodeTone(alertCount: number): { fill: string; label: string } {
  if (alertCount >= 10) return { fill: 'var(--carmine)', label: 'ten or more alerts' };
  if (alertCount >= 3) return { fill: 'var(--amber)', label: 'three to nine alerts' };
  if (alertCount >= 1) return { fill: 'var(--ultra)', label: 'one or two alerts' };
  return { fill: 'var(--ink-3)', label: 'no alerts' };
}

/**
 * Shapes worth naming, derived from the edge list.
 *
 * These are the patterns the view exists to make visible — stated in words as
 * well as drawn, because a shape only a sighted user can see is unusable to a
 * screen reader and uncitable in a report.
 */
export interface Shape {
  kind: 'fan-in' | 'fan-out' | 'pass-through' | 'cycle';
  detail: string;
}

export function describeShapes(graph: NetworkGraph): Shape[] {
  const inbound = new Map<string, number>();
  const outbound = new Map<string, number>();
  const pairs = new Set<string>();

  for (const edge of graph.edges) {
    inbound.set(edge.target, (inbound.get(edge.target) ?? 0) + 1);
    outbound.set(edge.source, (outbound.get(edge.source) ?? 0) + 1);
    pairs.add(`${edge.source}>${edge.target}`);
  }

  const label = (id: string) => {
    const node = graph.nodes.find((n) => n.id === id);
    if (!node) return id.slice(0, 8);
    return node.account_last4 ? `••••${node.account_last4}` : (node.label ?? id.slice(0, 8));
  };

  const shapes: Shape[] = [];

  for (const [id, count] of inbound) {
    if (count >= 3) {
      shapes.push({
        kind: 'fan-in',
        detail: `${count} accounts pay into ${label(id)}.`,
      });
    }
  }
  for (const [id, count] of outbound) {
    if (count >= 3) {
      shapes.push({ kind: 'fan-out', detail: `${label(id)} pays out to ${count} accounts.` });
    }
  }
  for (const id of new Set([...inbound.keys(), ...outbound.keys()])) {
    if ((inbound.get(id) ?? 0) >= 1 && (outbound.get(id) ?? 0) >= 1) {
      const node = graph.nodes.find((n) => n.id === id);
      // Only worth calling out when it is not simply the account being examined.
      if (node && !node.is_focus && (inbound.get(id) ?? 0) + (outbound.get(id) ?? 0) >= 4) {
        shapes.push({
          kind: 'pass-through',
          detail: `${label(id)} receives from ${inbound.get(id)} and forwards to ${outbound.get(id)}.`,
        });
      }
    }
  }
  for (const key of pairs) {
    const [source, target] = key.split('>');
    if (source && target && pairs.has(`${target}>${source}`) && source < target) {
      shapes.push({
        kind: 'cycle',
        detail: `Money moves both ways between ${label(source)} and ${label(target)}.`,
      });
    }
  }

  return shapes.slice(0, 8);
}
