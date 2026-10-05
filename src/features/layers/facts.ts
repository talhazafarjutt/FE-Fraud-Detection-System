import type { LayerFacts, LayerFactsByLayer, LayerFindings } from '@/api/schemas/layers';
import type { LayerProduct } from '@/api/schemas/meta';
import { titleCase } from '@/lib/format';

/** "islamic" → "Islamic". */
export function layerLabel(name: string): string {
  return titleCase(name);
}

/** The label `meta.products` gives a product code, else the code in title case. */
export function productLabel(
  code: string,
  products: readonly LayerProduct[] = [],
  layer?: string,
): string {
  const match =
    products.find((p) => p.code === code && (!layer || !p.layer || p.layer === layer)) ??
    products.find((p) => p.code === code);
  return match?.label || titleCase(code);
}

/**
 * Events that are one of a schedule's numbered payments. The layer also sends
 * `instalment_no` on an early settlement (the instalment it settles from), but
 * "early settlement 10/48" would read as if it were the tenth of 48.
 */
const SCHEDULED_EVENTS = new Set(['INSTALMENT', 'RENTAL', 'PROFIT_DISTRIBUTION', 'CONTRIBUTION']);

/**
 * "Murabaha · instalment 8/36", "Murabaha · early settlement", "Takaful · claim".
 * Null when the facts name no product — a plain transaction has none.
 */
export function productText(
  facts: LayerFacts | null | undefined,
  products: readonly LayerProduct[] = [],
  layer?: string,
): string | null {
  if (!facts?.product) return null;
  const parts = [productLabel(facts.product, products, layer)];
  if (facts.event) {
    let event = facts.event.toLowerCase().replace(/_/g, ' ');
    if (SCHEDULED_EVENTS.has(facts.event) && typeof facts.instalment_no === 'number') {
      event +=
        typeof facts.tenor === 'number'
          ? ` ${facts.instalment_no}/${facts.tenor}`
          : ` ${facts.instalment_no}`;
    }
    parts.push(event);
  }
  return parts.join(' · ');
}

/** The facts each layer recorded, taken from its findings. */
export function factsFromFindings(
  findings: LayerFindings | null | undefined,
): LayerFactsByLayer | null {
  if (!findings) return null;
  const out: LayerFactsByLayer = {};
  for (const [layer, finding] of Object.entries(findings)) out[layer] = finding.facts;
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * The distinct products across several alerts (a case's members), in order,
 * one entry per distinct chip text.
 */
export function distinctProductFacts(
  sources: ReadonlyArray<LayerFactsByLayer | null | undefined>,
  active: readonly string[],
  products: readonly LayerProduct[] = [],
): { layer: string; facts: LayerFacts; text: string }[] {
  const seen = new Set<string>();
  const out: { layer: string; facts: LayerFacts; text: string }[] = [];
  for (const source of sources) {
    const picked = activeProductFacts(source, active);
    const text = picked ? productText(picked.facts, products, picked.layer) : null;
    if (!picked || !text || seen.has(text)) continue;
    seen.add(text);
    out.push({ ...picked, text });
  }
  return out;
}

/** The first active layer whose facts name a product. */
export function activeProductFacts(
  byLayer: LayerFactsByLayer | null | undefined,
  active: readonly string[],
): { layer: string; facts: LayerFacts } | null {
  if (!byLayer) return null;
  for (const layer of active) {
    const facts = byLayer[layer];
    if (facts?.product) return { layer, facts };
  }
  return null;
}
