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
