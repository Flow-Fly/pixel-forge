

export type PlaybackMode = 'all' | 'tag';

/** Helper to generate cel key from layer and frame IDs */
export function getCelKey(layerId: string, frameId: string): string {
  return `${layerId}:${frameId}`;
}

/** Parse a cel key back into layer and frame IDs */
export function parseCelKey(key: string): { layerId: string; frameId: string } {
  const [layerId, frameId] = key.split(':');
  return { layerId, frameId };
}
