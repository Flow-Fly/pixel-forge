import type { Command } from "./index";
import { paletteStore } from "../stores/palette";
import { animationStore } from "../stores/animation";
import type { Cel } from "../types/animation";
import { findClosestColorIndex } from "../stores/palette/indexed-color";
import { remapPaletteIndexAfterDelete } from "../stores/animation/index-buffer";

export type DeletePaletteColorReplacement = "nearest" | "transparent";

/**
 * Command for changing a single palette color.
 * Triggers canvas rebuild on execute/undo since all pixels using this color will change.
 */
export class PaletteChangeCommand implements Command {
  id: string;
  name: string;
  userId?: string;
  timestamp?: number;
  readonly memorySize: number = 100; // Small memory footprint

  private paletteIndex: number; // 1-based palette index
  private previousColor: string;
  private newColor: string;

  constructor(paletteIndex: number, previousColor: string, newColor: string) {
    this.id = crypto.randomUUID();
    this.name = "Change Palette Color";
    this.paletteIndex = paletteIndex;
    this.previousColor = previousColor;
    this.newColor = newColor;
    this.timestamp = Date.now();
  }

  execute(): void {
    // Update the color in the palette (this triggers canvas rebuild via event)
    paletteStore.updateColorDirect(this.paletteIndex, this.newColor);
    animationStore.rebuildAllCelCanvases();
  }

  undo(): void {
    // Restore the previous color
    paletteStore.updateColorDirect(this.paletteIndex, this.previousColor);
    animationStore.rebuildAllCelCanvases();
  }
}

/**
 * Command for deleting a palette color and remapping all indexed pixels.
 */
export class DeletePaletteColorCommand implements Command {
  id: string;
  name: string;
  userId?: string;
  timestamp?: number;
  memorySize = 100;

  private oldColors: string[] | null = null;
  private newColors: string[] | null = null;
  private oldNewColorFlags: Set<string> | null = null;
  private newColorFlags: Set<string> | null = null;
  private oldIndexBuffers: Map<string, Uint8Array> | null = null;
  private newIndexBuffers: Map<string, Uint8Array> | null = null;
  private readonly paletteIndex: number;
  private readonly replacement: DeletePaletteColorReplacement;

  constructor(
    paletteIndex: number,
    replacement: DeletePaletteColorReplacement
  ) {
    this.id = crypto.randomUUID();
    this.name = "Delete Palette Color";
    this.paletteIndex = paletteIndex;
    this.replacement = replacement;
    this.timestamp = Date.now();
  }

  execute(): void {
    this.ensureSnapshots();
    if (!this.newColors || !this.newColorFlags || !this.newIndexBuffers) return;

    this.applyState(this.newColors, this.newColorFlags, this.newIndexBuffers);
  }

  undo(): void {
    if (!this.oldColors || !this.oldNewColorFlags || !this.oldIndexBuffers) return;

    this.applyState(this.oldColors, this.oldNewColorFlags, this.oldIndexBuffers);
  }

  private ensureSnapshots(): void {
    if (this.oldColors) return;

    const oldColors = [...paletteStore.mainColors.value];
    const removedArrayIndex = this.paletteIndex - 1;
    if (removedArrayIndex < 0 || removedArrayIndex >= oldColors.length) return;

    const removedColor = oldColors[removedArrayIndex];
    const newColors = oldColors.filter((_, index) => index !== removedArrayIndex);
    const replacementIndex = this.getReplacementIndex(removedColor, newColors);
    const oldIndexBuffers = cloneIndexBuffers(animationStore.cels.value);
    const remappedCels = remapPaletteIndexAfterDelete(
      animationStore.cels.value,
      this.paletteIndex,
      replacementIndex,
      oldColors.length
    );

    this.oldColors = oldColors;
    this.newColors = newColors;
    this.oldNewColorFlags = new Set(paletteStore.newColorFlags.value);
    this.newColorFlags = withoutDeletedColor(this.oldNewColorFlags, removedColor);
    this.oldIndexBuffers = oldIndexBuffers;
    this.newIndexBuffers = cloneIndexBuffers(remappedCels);
    this.memorySize =
      bufferBytes(this.oldIndexBuffers) + bufferBytes(this.newIndexBuffers) + 200;
  }

  private getReplacementIndex(removedColor: string, newColors: string[]): number {
    if (this.replacement === "transparent") return 0;
    if (newColors.length === 0) return 0;

    return findClosestColorIndex(removedColor, newColors);
  }

  private applyState(
    colors: string[],
    newColorFlags: Set<string>,
    indexBuffers: Map<string, Uint8Array>
  ): void {
    paletteStore.setColorsDirect(colors, newColorFlags);
    animationStore.cels.value = withIndexBuffers(
      animationStore.cels.value,
      indexBuffers
    );
    animationStore.rebuildAllCelCanvases();
  }
}

function cloneIndexBuffers(cels: Map<string, Cel>): Map<string, Uint8Array> {
  const buffers = new Map<string, Uint8Array>();

  for (const [key, cel] of cels) {
    if (!cel.indexBuffer) continue;
    if (cel.textCelData) continue;

    buffers.set(key, new Uint8Array(cel.indexBuffer));
  }

  return buffers;
}

function withIndexBuffers(
  cels: Map<string, Cel>,
  indexBuffers: Map<string, Uint8Array>
): Map<string, Cel> {
  const newCels = new Map(cels);

  for (const [key, buffer] of indexBuffers) {
    const cel = newCels.get(key);
    if (!cel) continue;

    newCels.set(key, { ...cel, indexBuffer: new Uint8Array(buffer) });
  }

  return newCels;
}

function withoutDeletedColor(flags: Set<string>, removedColor: string): Set<string> {
  const nextFlags = new Set(flags);
  nextFlags.delete(removedColor.toLowerCase());
  return nextFlags;
}

function bufferBytes(buffers: Map<string, Uint8Array>): number {
  let bytes = 0;
  for (const buffer of buffers.values()) {
    bytes += buffer.byteLength;
  }
  return bytes;
}
