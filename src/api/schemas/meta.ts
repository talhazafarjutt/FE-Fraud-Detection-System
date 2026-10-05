import { z } from 'zod';

/**
 * `GET /v1/meta` — what this deployment offers: the active layers, the typology
 * vocabulary (core plus each layer's) and the products the layers understand.
 * Empty `layers` means core only, and the console then looks exactly as it does
 * without any layer.
 */

export const layerProductSchema = z
  .object({
    code: z.string(),
    label: z.string().nullish(),
    events: z.array(z.string()).nullish(),
    /** The layer that defines the product. */
    layer: z.string().nullish(),
  })
  .passthrough();
export type LayerProduct = z.infer<typeof layerProductSchema>;

export const metaSchema = z
  .object({
    layers: z.array(z.string()).default([]),
    typologies: z.array(z.string()).default([]),
    // Typed as free objects on the server; keep the ones that name a code.
    products: z
      .array(z.unknown())
      .default([])
      .transform((entries) =>
        entries.flatMap((entry) => {
          const parsed = layerProductSchema.safeParse(entry);
          return parsed.success ? [parsed.data] : [];
        }),
      ),
  })
  .passthrough();
export type Meta = z.infer<typeof metaSchema>;
