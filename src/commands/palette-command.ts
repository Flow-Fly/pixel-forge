import type { Command } from "./index";
import { paletteStore } from "../stores/palette";
import { animationStore } from "../stores/animation";

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
 * Command for adding a color to the palette.
 */
export class PaletteAddColorCommand implements Command {
  id: string;
  name: string;
  userId?: string;
  timestamp?: number;
  readonly memorySize: number = 100;

  private color: string;
  private insertIndex: number | null = null; // Will be set after execute

  constructor(color: string) {
    this.id = crypto.randomUUID();
    this.name = "Add Palette Color";
    this.color = color;
    this.timestamp = Date.now();
  }

  execute(): void {
    const existingIndex = paletteStore.getColorIndex(this.color);
    if (existingIndex !== 0) {
      this.insertIndex = null;
      return;
    }

    const previousLength = paletteStore.mainColors.value.length;
    const index = paletteStore.addColor(this.color);
    this.insertIndex =
      paletteStore.mainColors.value.length > previousLength ? index : null;
  }

  undo(): void {
    if (this.insertIndex !== null) {
      paletteStore.removeColorByIndex(this.insertIndex);
    }
  }
}

/**
 * Command for removing a color from the palette.
 */
export class PaletteRemoveColorCommand implements Command {
  id: string;
  name: string;
  userId?: string;
  timestamp?: number;
  readonly memorySize: number = 100;

  private paletteIndex: number;
  private removedColor: string;

  constructor(paletteIndex: number, color: string) {
    this.id = crypto.randomUUID();
    this.name = "Remove Palette Color";
    this.paletteIndex = paletteIndex;
    this.removedColor = color;
    this.timestamp = Date.now();
  }

  execute(): void {
    paletteStore.removeColorByIndex(this.paletteIndex);
    animationStore.rebuildAllCelCanvases();
  }

  undo(): void {
    // Re-insert the color at the same position
    paletteStore.insertColorAt(this.paletteIndex, this.removedColor);
    animationStore.rebuildAllCelCanvases();
  }
}
