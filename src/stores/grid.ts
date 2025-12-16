import { signal } from "../core/signal";

class GridStore {
  // Pixel grid settings (1px spacing, shows between each pixel)
  pixelGridEnabled = signal<boolean>(true);
  pixelGridColor = signal<string>("#000000");
  pixelGridOpacity = signal<number>(1.0);
  autoShowThreshold = signal<number>(16); // Zoom level to auto-show

  // Tile grid settings (larger spacing for sprite sheets, tiles)
  tileGridEnabled = signal<boolean>(false);
  tileGridSize = signal<number>(16); // Pixels per tile
  tileGridColor = signal<string>("#0088ff");
  tileGridOpacity = signal<number>(0.4);

  /**
   * Toggle pixel grid visibility
   */
  togglePixelGrid(): void {
    this.pixelGridEnabled.value = !this.pixelGridEnabled.value;
  }

  /**
   * Toggle tile grid visibility
   */
  toggleTileGrid(): void {
    this.tileGridEnabled.value = !this.tileGridEnabled.value;
  }

  /**
   * Set tile grid size
   */
  setTileSize(size: number): void {
    if (size > 0) {
      this.tileGridSize.value = size;
    }
  }

  /**
   * Set auto-show threshold for pixel grid
   */
  setAutoShowThreshold(zoom: number): void {
    if (zoom > 0) {
      this.autoShowThreshold.value = zoom;
    }
  }

  /**
   * Set pixel grid color
   */
  setPixelGridColor(color: string): void {
    this.pixelGridColor.value = color;
  }

  /**
   * Set pixel grid opacity (0-1)
   */
  setPixelGridOpacity(opacity: number): void {
    this.pixelGridOpacity.value = Math.max(0, Math.min(1, opacity));
  }

  /**
   * Set tile grid color
   */
  setTileGridColor(color: string): void {
    this.tileGridColor.value = color;
  }

  /**
   * Set tile grid opacity (0-1)
   */
  setTileGridOpacity(opacity: number): void {
    this.tileGridOpacity.value = Math.max(0, Math.min(1, opacity));
  }
}

export const gridStore = new GridStore();
