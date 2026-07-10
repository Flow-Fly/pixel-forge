import type { Layer } from '../types/layer';
import type { ReferenceLayerPosition } from '../types/reference';

export interface ReferenceLayerRenderEntry {
  layerId: string;
  bytes: Uint8Array;
  mimeType: string;
  x: number;
  y: number;
  scale: number;
  opacity: number;
  desaturate: boolean;
  position: ReferenceLayerPosition;
}

export interface ReferenceLayerRenderPlan {
  belowArtwork: ReferenceLayerRenderEntry[];
  aboveArtwork: ReferenceLayerRenderEntry[];
}

function createReferenceLayerRenderEntry(layer: Layer): ReferenceLayerRenderEntry | null {
  if (layer.type !== 'reference' || !layer.visible || !layer.referenceData) return null;

  const referenceData = layer.referenceData;
  const position = referenceData.position ?? 'below';

  return {
    layerId: layer.id,
    bytes: referenceData.bytes,
    mimeType: referenceData.mimeType,
    x: referenceData.x,
    y: referenceData.y,
    scale: referenceData.scale,
    opacity: layer.opacity,
    desaturate: referenceData.desaturate ?? false,
    position,
  };
}

export function createReferenceLayerRenderPlan(
  layers: readonly Layer[]
): ReferenceLayerRenderPlan {
  const plan: ReferenceLayerRenderPlan = {
    belowArtwork: [],
    aboveArtwork: [],
  };

  for (const layer of layers) {
    const entry = createReferenceLayerRenderEntry(layer);
    if (!entry) continue;

    if (entry.position === 'above') {
      plan.aboveArtwork.push(entry);
    } else {
      plan.belowArtwork.push(entry);
    }
  }

  return plan;
}
