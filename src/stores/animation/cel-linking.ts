/**
 * Cel linking and copy-on-write management.
 *
 * Linked cels share the same canvas for memory efficiency.
 * - Soft links: Auto-created during frame duplication, break on edit
 * - Hard links: User-explicit, stay linked during edits
 * - Empty cel links: Share transparent canvas singleton
 */

import type { Cel } from '../../types/animation';
import { cloneIndexBuffer, createIndexBuffer } from '../../utils/indexed-color';
import { EMPTY_CEL_LINK_ID, getCelKey } from './types';

/**
 * Link multiple cels together. They will share the same canvas.
 * Returns the linkedCelId if successful, null otherwise.
 */
export function linkCels(
  cels: Map<string, Cel>,
  celKeys: string[],
  linkType: 'soft' | 'hard' = 'hard'
): { cels: Map<string, Cel>; linkedCelId: string | null } {
  if (celKeys.length < 2) {
    return { cels, linkedCelId: null };
  }

  const newCels = new Map(cels);
  const linkedCelId = crypto.randomUUID();

  // Get the first cel's canvas to use as shared canvas
  const firstCel = newCels.get(celKeys[0]);
  if (!firstCel) {
    return { cels, linkedCelId: null };
  }

  const sharedCanvas = firstCel.canvas;
  const sharedIndexBuffer = firstCel.indexBuffer;

  // Update all cels to share the same canvas, index buffer, and linkedCelId
  for (const key of celKeys) {
    const cel = newCels.get(key);
    if (cel) {
      newCels.set(key, {
        ...cel,
        canvas: sharedCanvas,
        indexBuffer: sharedIndexBuffer,
        linkedCelId,
        linkType
      });
    }
  }

  return { cels: newCels, linkedCelId };
}

/**
 * Unlink cels - each gets its own copy of the canvas and index buffer.
 */
export function unlinkCels(
  cels: Map<string, Cel>,
  celKeys: string[]
): Map<string, Cel> {
  const newCels = new Map(cels);

  for (const key of celKeys) {
    const cel = newCels.get(key);
    if (cel && cel.linkedCelId) {
      // Create a copy of the canvas
      const newCanvas = document.createElement('canvas');
      newCanvas.width = cel.canvas.width;
      newCanvas.height = cel.canvas.height;
      const ctx = newCanvas.getContext('2d', {
        alpha: true,
        willReadFrequently: true
      });
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(cel.canvas, 0, 0);
      }

      // Clone index buffer if present
      const newIndexBuffer = cel.indexBuffer ? cloneIndexBuffer(cel.indexBuffer) : undefined;

      newCels.set(key, {
        ...cel,
        canvas: newCanvas,
        indexBuffer: newIndexBuffer,
        linkedCelId: undefined,
        linkType: undefined
      });
    }
  }

  return newCels;
}

/**
 * Get all cels in a link group.
 */
export function getCelLinkGroup(
  cels: Map<string, Cel>,
  linkedCelId: string
): Array<{ key: string; cel: Cel }> {
  const result: Array<{ key: string; cel: Cel }> = [];
  for (const [key, cel] of cels) {
    if (cel.linkedCelId === linkedCelId) {
      result.push({ key, cel });
    }
  }
  return result;
}

/**
 * Ensure a cel is unlinked before editing (copy-on-write).
 * Only breaks SOFT links - hard links stay linked.
 * Returns { cels, wasUnlinked } where wasUnlinked indicates if unlink occurred.
 */
export function ensureUnlinkedForEdit(
  cels: Map<string, Cel>,
  layerId: string,
  frameId: string,
  syncLayerCanvases: () => void
): { cels: Map<string, Cel>; wasUnlinked: boolean } {
  const key = getCelKey(layerId, frameId);
  let cel = cels.get(key);

  // Cel doesn't exist yet - sync will create it
  if (!cel) {
    syncLayerCanvases();
    return { cels, wasUnlinked: true };
  }

  // Not linked - nothing to do
  if (!cel.linkedCelId) {
    return { cels, wasUnlinked: false };
  }

  // Hard links stay linked
  if (cel.linkType === 'hard') {
    return { cels, wasUnlinked: false };
  }

  // Empty cel special case: give it a new canvas and index buffer
  if (cel.linkedCelId === EMPTY_CEL_LINK_ID) {
    const newCels = new Map(cels);

    const newCanvas = document.createElement('canvas');
    newCanvas.width = cel.canvas.width;
    newCanvas.height = cel.canvas.height;
    const ctx = newCanvas.getContext('2d', {
      alpha: true,
      willReadFrequently: true
    });
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
    }

    const newIndexBuffer = createIndexBuffer(newCanvas.width, newCanvas.height);

    newCels.set(key, {
      ...cel,
      canvas: newCanvas,
      indexBuffer: newIndexBuffer,
      linkedCelId: undefined,
      linkType: undefined
    });

    return { cels: newCels, wasUnlinked: true };
  }

  // Check if there are other cels in the same link group
  const group = getCelLinkGroup(cels, cel.linkedCelId);
  if (group.length <= 1) {
    return { cels, wasUnlinked: false };
  }

  // Clone canvas for this cel only (copy-on-write for soft links)
  const newCels = unlinkCels(cels, [key]);
  return { cels: newCels, wasUnlinked: true };
}

/**
 * Set opacity for multiple cels.
 */
export function setCelOpacity(
  cels: Map<string, Cel>,
  celKeys: string[],
  opacity: number
): Map<string, Cel> {
  const newCels = new Map(cels);
  const clampedOpacity = Math.max(0, Math.min(100, opacity));

  for (const key of celKeys) {
    const cel = newCels.get(key);
    if (cel) {
      newCels.set(key, {
        ...cel,
        opacity: clampedOpacity
      });
    }
  }

  return newCels;
}

/**
 * Get the link color for a cel (for visual badge).
 * Returns a consistent color based on the linkedCelId.
 */
export function getLinkColor(linkedCelId: string): string {
  const linkColors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];
  let hash = 0;
  for (let i = 0; i < linkedCelId.length; i++) {
    hash = ((hash << 5) - hash) + linkedCelId.charCodeAt(i);
    hash = hash & hash;
  }
  return linkColors[Math.abs(hash) % linkColors.length];
}
