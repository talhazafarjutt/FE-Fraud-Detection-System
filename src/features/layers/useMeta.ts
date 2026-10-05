import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMeta } from '@/api/endpoints/meta';
import type { LayerProduct, Meta } from '@/api/schemas/meta';
import { useAuth } from '@/auth/AuthProvider';

/** The Islamic banking layer's name in `meta.layers` and in layer findings. */
export const ISLAMIC_LAYER = 'islamic';

export const metaKey = ['meta'] as const;

/** What a deployment offers changes on a redeploy, not during a session. */
const META_STALE_MS = 30 * 60_000;

export function useMeta() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: metaKey,
    queryFn: ({ signal }) => getMeta(signal),
    enabled: isAuthenticated,
    staleTime: META_STALE_MS,
  });
}

export interface Layers {
  /** Active layer names. Empty while loading, on error, and with layers off. */
  layers: readonly string[];
  typologies: readonly string[];
  products: readonly LayerProduct[];
  /** An active layer defines products, so product columns are worth drawing. */
  hasProducts: boolean;
  isActive: (name: string) => boolean;
}

export function layersFrom(meta: Meta | undefined): Layers {
  const layers = meta?.layers ?? [];
  const products = meta?.products ?? [];
  return {
    layers,
    typologies: meta?.typologies ?? [],
    products,
    hasProducts: layers.length > 0 && products.length > 0,
    isActive: (name) => layers.includes(name),
  };
}

/**
 * Layer-aware UI reads this and renders nothing extra until the server says a
 * layer is on. A failed or pending meta request therefore means "core only",
 * never a half-drawn layer.
 */
export function useLayers(): Layers {
  const { data } = useMeta();
  return useMemo(() => layersFrom(data), [data]);
}
