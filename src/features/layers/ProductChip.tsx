import type { LayerFacts, LayerFactsByLayer } from '@/api/schemas/layers';
import type { LayerProduct } from '@/api/schemas/meta';
import { activeProductFacts, productText } from './facts';
import type { Layers } from './useMeta';

/**
 * The contract behind a transaction, in one line: "Murabaha · instalment 8/36".
 * Renders nothing for a transaction that names no product.
 */
export function ProductChip({
  facts,
  products,
  layer,
}: {
  facts: LayerFacts | null | undefined;
  products?: readonly LayerProduct[] | undefined;
  layer?: string | undefined;
}) {
  const text = productText(facts, products, layer);
  if (!text) return null;
  return (
    <span
      className="inline-flex items-center border border-ink-3 px-2 py-1 font-mono text-[11px] leading-none tracking-tag text-ink"
      title={facts?.contract_id ? `Contract ${facts.contract_id}` : undefined}
    >
      {text}
    </span>
  );
}

/**
 * The chip for whichever active layer read a product off this transaction.
 * Nothing at all unless that layer is on.
 */
export function ActiveProductChip({
  facts,
  layers,
}: {
  facts: LayerFactsByLayer | null | undefined;
  layers: Pick<Layers, 'layers' | 'products'>;
}) {
  const picked = activeProductFacts(facts, layers.layers);
  if (!picked) return null;
  return <ProductChip facts={picked.facts} layer={picked.layer} products={layers.products} />;
}
