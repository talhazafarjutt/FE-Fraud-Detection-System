import type { LayerFinding, LayerFindings as Findings } from '@/api/schemas/layers';
import type { LayerProduct } from '@/api/schemas/meta';
import { RuleSeverity } from '@/features/alerts/EvidencePanels';
import { formatRiskScore } from '@/lib/risk';
import { layerLabel } from './facts';
import { ProductChip } from './ProductChip';

/**
 * One block per layer that spoke on this score: the product it read, the rules
 * it added, the engine rules it set aside and why, and the score before and
 * after. Rendered from the recorded findings themselves, so a set-aside stays
 * visible wherever the score is shown — it is never dropped from view.
 */
export function LayerFindings({
  findings,
  products,
}: {
  findings: Findings | null | undefined;
  products?: readonly LayerProduct[] | undefined;
}) {
  const entries = findings ? Object.entries(findings) : [];
  if (entries.length === 0) return null;
  return (
    <div className="space-y-4">
      {entries.map(([layer, finding]) => (
        <LayerBlock key={layer} layer={layer} finding={finding} products={products} />
      ))}
    </div>
  );
}

function LayerBlock({
  layer,
  finding,
  products,
}: {
  layer: string;
  finding: LayerFinding;
  products: readonly LayerProduct[] | undefined;
}) {
  const name = `${layerLabel(layer)} layer`;
  const { facts, added, set_aside: setAside } = finding;

  return (
    <section aria-label={name} className="border border-rule bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-5 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="mono-label text-ultra">{name}</span>
          <ProductChip facts={facts} layer={layer} products={products} />
          {facts.contract_id ? (
            <span className="font-mono text-[11px] text-ink-3">Contract {facts.contract_id}</span>
          ) : null}
        </div>
        <ScoreShift before={finding.score_before} after={finding.score_after} />
      </div>

      {added.length === 0 && setAside.length === 0 ? (
        <p className="px-5 py-4 text-[14px] text-ink-2">No rule added or set aside.</p>
      ) : (
        <ul className="divide-y divide-rule-soft">
          {added.map((rule) => (
            <li key={`added-${rule.rule}`} className="flex flex-wrap items-start gap-4 p-5">
              <RuleSeverity severity={rule.severity} />
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[12px] text-ink">{rule.rule}</p>
                {rule.description ? (
                  <p className="mt-1 text-[14px] text-ink-2">{rule.description}</p>
                ) : null}
              </div>
              <span className="mono-label text-ink-3">Added by {name}</span>
            </li>
          ))}
          {setAside.map((rule) => (
            <li
              key={`set-aside-${rule.rule}`}
              className="flex flex-wrap items-start gap-4 border-l-2 border-l-amber bg-paper p-5"
            >
              <span className="inline-flex border border-dashed border-amber px-2 py-1 font-mono text-[10px] uppercase leading-none tracking-tag text-amber">
                Set aside
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[12px] text-ink-2">
                  {rule.rule}
                  {rule.severity ? <span className="ml-2 text-ink-3">{rule.severity}</span> : null}
                </p>
                {rule.description ? (
                  <p className="mt-1 text-[14px] text-ink-3">{rule.description}</p>
                ) : null}
                {rule.reason ? (
                  <p className="mt-2 text-[14px] text-ink">
                    <span className="mono-label mr-2 text-ink-3">Reason</span>
                    {rule.reason}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ScoreShift({
  before,
  after,
}: {
  before: number | null | undefined;
  after: number | null | undefined;
}) {
  if (typeof before !== 'number' || typeof after !== 'number') return null;
  return (
    <p
      className="font-mono text-[12px] tabular-nums text-ink"
      title="Risk score before and after this layer, 0–100"
    >
      <span className="mono-label mr-2 text-ink-3">Score</span>
      {formatRiskScore(before)} <span aria-hidden="true">→</span>
      <span className="sr-only">to</span> {formatRiskScore(after)}
    </p>
  );
}
