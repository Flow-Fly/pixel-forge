import { BaseTool, type ModifierKeys } from './base-tool';
import { colorStore } from '../stores/colors';
import { paletteStore } from '../stores/palette';
import { animationStore } from '../stores/animation';
import { layerStore } from '../stores/layers';

export class EyedropperTool extends BaseTool {
  name = 'eyedropper';
  cursor = 'crosshair';

  constructor(context: CanvasRenderingContext2D) {
    super();
    this.setContext(context);
  }

  onDown(x: number, y: number, modifiers?: ModifierKeys) {
    this.pickColor(x, y, modifiers);
  }

  onDrag(x: number, y: number, modifiers?: ModifierKeys) {
    this.pickColor(x, y, modifiers);
  }

  onUp(_x: number, _y: number) {}

  private pickColor(x: number, y: number, modifiers?: ModifierKeys) {
    if (!this.context) return;

    const pixelX = Math.floor(x);
    const pixelY = Math.floor(y);
    const width = this.context.canvas.width;

    // Try to get color from index buffer first (indexed color mode)
    const layerId = layerStore.activeLayerId.value;
    const frameId = animationStore.currentFrameId.value;
    let hex: string | null = null;

    if (layerId) {
      const indexBuffer = animationStore.getCelIndexBuffer(layerId, frameId);
      if (indexBuffer) {
        const pixelIndex = pixelY * width + pixelX;
        const paletteIndex = indexBuffer[pixelIndex];

        if (paletteIndex > 0) {
          // Get color from palette
          hex = paletteStore.getColorByIndex(paletteIndex);
        }
      }
    }

    // Fallback: read from canvas if no index buffer or transparent pixel
    if (!hex) {
      const pixel = this.context.getImageData(pixelX, pixelY, 1, 1).data;
      // If pixel is transparent, don't pick anything
      if (pixel[3] < 128) return;

      hex = '#' +
        pixel[0].toString(16).padStart(2, '0') +
        pixel[1].toString(16).padStart(2, '0') +
        pixel[2].toString(16).padStart(2, '0');
    }

    if (modifiers?.button === 2) {
      // Right click: pick to secondary/background color
      colorStore.setSecondaryColor(hex);
    } else {
      // Left click: pick to primary/foreground color
      colorStore.setPrimaryColor(hex);
      colorStore.updateLightnessVariations(hex);
    }
  }
}
