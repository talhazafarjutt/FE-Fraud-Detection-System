import { layerLabel } from './facts';
import { useLayers } from './useMeta';

/** One header tag per active layer, e.g. "Islamic layer". Nothing with layers off. */
export function LayerBadges() {
  const { layers } = useLayers();
  return (
    <>
      {layers.map((name) => (
        <span key={name} className="tag" title="Active on this deployment (GET /v1/meta)">
          {layerLabel(name)} layer
        </span>
      ))}
    </>
  );
}
