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
    /**
     * Whether the contract was found in the layer's contract register, and
     * its registered status. Absent on scores recorded before the register
     * existed — "unknown", not "not registered".
     */
    contract_registered: z.boolean().nullish(),
    contract_status: z.string().nullish(),
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

/**
 * What a set-aside could not touch, recorded beside it: the network evidence
 * codes still on the verdict (any of them opens an alert) and the anomaly
 * flag. Present only when the layer set something aside; older findings
 * have none.
 */
export const keptEvidenceSchema = z
  .object({
    network_evidence: z
      .array(z.string())
      .nullish()
      .transform((codes) => codes ?? []),
    anomaly: z.boolean().nullish().transform((flag) => flag ?? false),
  })
  .passthrough();
export type KeptEvidence = z.infer<typeof keptEvidenceSchema>;

/**
 * What the layer's rules on trial (PILOT) would have done, in the same shapes
 * as `added` and `set_aside`. Recorded only: nothing here reached the score,
 * the triggered rules or the alert. Present only when a PILOT rule produced
 * something; older findings have none.
 */
export const shadowSchema = z
  .object({
    added: z
      .array(layerRuleSchema)
      .nullish()
      .transform((rules) => rules ?? []),
    set_aside: z
      .array(setAsideSchema)
      .nullish()
      .transform((rules) => rules ?? []),
  })
  .passthrough();
export type Shadow = z.infer<typeof shadowSchema>;

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
    // A malformed `kept` is dropped, not allowed to cost the whole entry.
    kept: keptEvidenceSchema.nullish().catch(null),
    /** The settings version the layer scored under. Absent on older findings. */
    settings_version: z.number().nullish().catch(null),
    // Like `kept`: a malformed shadow block is dropped, not allowed to cost the entry.
    shadow: shadowSchema.nullish().catch(null),
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

/**
 * `{"<layer>": {facts, added, set_aside, score_before, score_after, kept?,
 * settings_version?, shadow?}}`, or null.
 */
export const layerFindingsSchema = byLayer(layerFindingSchema);

/** `{"<layer>": facts}`, or null. */
export const layerFactsByLayerSchema = byLayer(layerFactsSchema);
