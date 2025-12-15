import type { Frame, Cel, OnionSkinSettings, FrameTag } from '../../types/animation';

export type { Frame, Cel, OnionSkinSettings, FrameTag };

export type PlaybackMode = 'all' | 'tag';

/** Special marker for empty cels that share the transparent canvas */
export const EMPTY_CEL_LINK_ID = '__empty__';

/** Helper to generate cel key from layer and frame IDs */
export function getCelKey(layerId: string, frameId: string): string {
  return `${layerId}:${frameId}`;
}

/** Parse a cel key back into layer and frame IDs */
export function parseCelKey(key: string): { layerId: string; frameId: string } {
  const [layerId, frameId] = key.split(':');
  return { layerId, frameId };
}
