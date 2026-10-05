import { z } from 'zod';

/**
 * What an active layer (the Islamic banking layer, for one) read off a
 * transaction and did to its verdict. Keyed by layer name wherever it appears:
 * `layer_findings` on a score and the alert detail, `original_layer_findings`
 * on a verdict, and `layer_facts` (the facts alone) on queue and case-member
 * rows.
 *
 * Read layer by layer: one malformed entry is dropped instead of failing the
 * alert or verdict it travels on.
 */

export const layerFactsSchema = z
  .object({
    product: z.string().nullish(),
    event: z.string().nullish(),
    contract_id: z.string().nullish(),
    instalment_no: z.number().nullish(),
    tenor: z.number().nullish(),
  })
  .passthrough();
export type LayerFacts = z.infer<typeof layerFactsSchema>;

/** A rule the layer added. `source` is the layer's name. */
export const layerRuleSchema = z
  .object({
    rule: z.string(),
    severity: z.string().nullish(),
    description: z.string().nullish(),
    source: z.string().nullish(),
  })
  .passthrough();
export type LayerRule = z.infer<typeof layerRuleSchema>;

/** An engine rule the layer explained away. Removed from the score, kept here. */
export const setAsideSchema = z
  .object({
    rule: z.string(),
    severity: z.string().nullish(),
    description: z.string().nullish(),
    reason: z.string().nullish(),
  })
  .passthrough();
export type SetAside = z.infer<typeof setAsideSchema>;

export const layerFindingSchema = z
  .object({
    facts: layerFactsSchema.nullish().transform((facts): LayerFacts => facts ?? {}),
    added: z
      .array(layerRuleSchema)
      .nullish()
      .transform((rules) => rules ?? []),
    set_aside: z
      .array(setAsideSchema)
      .nullish()
      .transform((rules) => rules ?? []),
    score_before: z.number().nullish(),
    score_after: z.number().nullish(),
  })
  .passthrough();
export type LayerFinding = z.infer<typeof layerFindingSchema>;

export type LayerFindings = Record<string, LayerFinding>;
export type LayerFactsByLayer = Record<string, LayerFacts>;

function byLayer<T>(entry: z.ZodType<T, z.ZodTypeDef, unknown>) {
  return z.unknown().transform((value): Record<string, T> | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const out: Record<string, T> = {};
    for (const [name, raw] of Object.entries(value)) {
      const parsed = entry.safeParse(raw);
      if (parsed.success) out[name] = parsed.data;
    }
    return Object.keys(out).length > 0 ? out : null;
  });
}

/** `{"<layer>": {facts, added, set_aside, score_before, score_after}}`, or null. */
export const layerFindingsSchema = byLayer(layerFindingSchema);

/** `{"<layer>": facts}`, or null. */
export const layerFactsByLayerSchema = byLayer(layerFactsSchema);
