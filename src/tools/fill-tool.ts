import { BaseTool } from './base-tool';
import { colorStore } from '../stores/colors';
import { paletteStore } from '../stores/palette';
import { animationStore } from '../stores/animation';
import { layerStore } from '../stores/layers';
import { floodFill } from '../services/drawing/algorithms';

export class FillTool extends BaseTool {
  name = 'fill';
  cursor = 'crosshair'; // Or bucket icon if available

  onDown(x: number, y: number) {
    if (!this.ctx) return;

    const startX = Math.floor(x);
    const startY = Math.floor(y);
    const width = this.ctx.canvas.width;
    const height = this.ctx.canvas.height;

    if (startX < 0 || startX >= width || startY < 0 || startY >= height) return;

    const imageData = this.ctx.getImageData(0, 0, width, height);

    // Get index buffer for indexed color mode
    const layerId = layerStore.activeLayerId.value;
    const frameId = animationStore.currentFrameId.value;
    const hex = colorStore.primaryColor.value;
    let indexBuffer: Uint8Array | undefined;
    let fillPaletteIndex = 0;

    if (layerId) {
      indexBuffer = animationStore.ensureCelIndexBuffer(layerId, frameId);
      // Get palette index for drawing - adds to the palette if needed
      fillPaletteIndex = paletteStore.getOrAddColorForDrawing(hex);
    }

    const bounds = floodFill(
      imageData.data,
      width,
      height,
      startX,
      startY,
      {
        r: parseInt(hex.slice(1, 3), 16),
        g: parseInt(hex.slice(3, 5), 16),
        b: parseInt(hex.slice(5, 7), 16),
        a: 255, // Assuming full opacity for now
        paletteIndex: fillPaletteIndex,
      },
      indexBuffer
    );
    if (!bounds) return;

    this.ctx.putImageData(imageData, 0, 0);
    this.markDirty(bounds.x, bounds.y, bounds.width, bounds.height);
  }

  onMove(_x: number, _y: number) {}
  onDrag(_x: number, _y: number) {}
  onUp(_x: number, _y: number) {}
}
