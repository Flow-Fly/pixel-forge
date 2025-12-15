/**
 * Text cel data management.
 *
 * Text cels store text content instead of pixel data,
 * allowing for editable text layers in the animation.
 */

import type { Cel } from '../../types/animation';
import type { TextCelData } from '../../types/text';
import { getCelKey } from './types';

/**
 * Get text cel data for a specific cel.
 */
export function getTextCelData(
  cels: Map<string, Cel>,
  layerId: string,
  frameId: string
): TextCelData | undefined {
  const key = getCelKey(layerId, frameId);
  return cels.get(key)?.textCelData;
}

/**
 * Set text cel data for a specific cel.
 * Creates a cel if one doesn't exist.
 */
export function setTextCelData(
  cels: Map<string, Cel>,
  layerId: string,
  frameId: string,
  textCelData: TextCelData
): Map<string, Cel> {
  const key = getCelKey(layerId, frameId);
  const newCels = new Map(cels);
  const cel = newCels.get(key);

  if (cel) {
    newCels.set(key, {
      ...cel,
      textCelData
    });
  } else {
    // Create a new cel for text layer (no canvas needed)
    newCels.set(key, {
      id: crypto.randomUUID(),
      layerId,
      frameId,
      canvas: null as unknown as HTMLCanvasElement,
      opacity: 255,
      textCelData
    });
  }

  return newCels;
}

/**
 * Update text cel data (partial update).
 * Creates a cel if one doesn't exist.
 */
export function updateTextCelData(
  cels: Map<string, Cel>,
  layerId: string,
  frameId: string,
  updates: Partial<TextCelData>
): Map<string, Cel> {
  const key = getCelKey(layerId, frameId);
  const newCels = new Map(cels);
  const cel = newCels.get(key);

  if (cel) {
    const currentData = cel.textCelData || { content: '', x: 0, y: 0 };
    newCels.set(key, {
      ...cel,
      textCelData: { ...currentData, ...updates }
    });
  } else {
    const defaultData: TextCelData = { content: '', x: 0, y: 0 };
    newCels.set(key, {
      id: crypto.randomUUID(),
      layerId,
      frameId,
      canvas: null as unknown as HTMLCanvasElement,
      opacity: 255,
      textCelData: { ...defaultData, ...updates }
    });
  }

  return newCels;
}

/**
 * Clear text cel data (e.g., when deleting text content).
 */
export function clearTextCelData(
  cels: Map<string, Cel>,
  layerId: string,
  frameId: string
): Map<string, Cel> {
  const key = getCelKey(layerId, frameId);
  const newCels = new Map(cels);
  const cel = newCels.get(key);

  if (cel) {
    const { textCelData: _, ...celWithoutText } = cel;
    newCels.set(key, celWithoutText as Cel);
  }

  return newCels;
}
