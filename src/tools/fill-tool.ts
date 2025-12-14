import { BaseTool } from './base-tool';
import { colorStore } from '../stores/colors';
import { paletteStore } from '../stores/palette';
import { animationStore } from '../stores/animation';
import { layerStore } from '../stores/layers';

export class FillTool extends BaseTool {
  name = 'fill';
  cursor = 'crosshair'; // Or bucket icon if available

  // Bounds tracking for dirty rect
  private boundsMinX = Infinity;
  private boundsMaxX = -Infinity;
  private boundsMinY = Infinity;
  private boundsMaxY = -Infinity;

  onDown(x: number, y: number) {
    if (!this.ctx) return;

    const startX = Math.floor(x);
    const startY = Math.floor(y);
    const width = this.ctx.canvas.width;
    const height = this.ctx.canvas.height;

    if (startX < 0 || startX >= width || startY < 0 || startY >= height) return;

    const imageData = this.ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Get index buffer for indexed color mode
    const layerId = layerStore.activeLayerId.value;
    const frameId = animationStore.currentFrameId.value;
    let indexBuffer: Uint8Array | undefined;
    let fillPaletteIndex = 0;

    if (layerId) {
      indexBuffer = animationStore.ensureCelIndexBuffer(layerId, frameId);
      // Get or add fill color to palette
      const fillHex = colorStore.primaryColor.value;
      fillPaletteIndex = paletteStore.getOrAddColor(fillHex);
    }

    // Get target color
    const targetPos = (startY * width + startX) * 4;
    const targetR = data[targetPos];
    const targetG = data[targetPos + 1];
    const targetB = data[targetPos + 2];
    const targetA = data[targetPos + 3];

    // For indexed mode, also get target palette index
    const targetPaletteIndex = indexBuffer ? indexBuffer[startY * width + startX] : 0;

    // Get fill color
    const hex = colorStore.primaryColor.value;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const a = 255; // Assuming full opacity for now

    // Don't fill if target is same as fill color
    if (indexBuffer) {
      // In indexed mode, compare palette indices
      if (targetPaletteIndex === fillPaletteIndex) return;
    } else {
      // Fallback: compare RGBA
      if (targetR === r && targetG === g && targetB === b && targetA === a) return;
    }

    // Reset bounds tracking
    this.boundsMinX = Infinity;
    this.boundsMaxX = -Infinity;
    this.boundsMinY = Infinity;
    this.boundsMaxY = -Infinity;

    // Flood fill (Stack-based)
    const stack = [[startX, startY]];
    const visited = new Set<number>(); // Avoid revisiting pixels

    while (stack.length) {
      const [cx, cy] = stack.pop()!;
      const pixelIndex = cy * width + cx;
      const pos = pixelIndex * 4;

      if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;
      if (visited.has(pixelIndex)) continue;
      visited.add(pixelIndex);

      // Check if matches target (use index buffer if available, otherwise RGBA)
      let matches = false;
      if (indexBuffer) {
        matches = indexBuffer[pixelIndex] === targetPaletteIndex;
      } else {
        matches = data[pos] === targetR && data[pos + 1] === targetG && data[pos + 2] === targetB && data[pos + 3] === targetA;
      }

      if (matches) {
        // Fill canvas
        data[pos] = r;
        data[pos + 1] = g;
        data[pos + 2] = b;
        data[pos + 3] = a;

        // Fill index buffer
        if (indexBuffer) {
          indexBuffer[pixelIndex] = fillPaletteIndex;
        }

        // Track bounds
        this.boundsMinX = Math.min(this.boundsMinX, cx);
        this.boundsMaxX = Math.max(this.boundsMaxX, cx);
        this.boundsMinY = Math.min(this.boundsMinY, cy);
        this.boundsMaxY = Math.max(this.boundsMaxY, cy);

        stack.push([cx + 1, cy]);
        stack.push([cx - 1, cy]);
        stack.push([cx, cy + 1]);
        stack.push([cx, cy - 1]);
      }
    }

    this.ctx.putImageData(imageData, 0, 0);

    // Mark dirty region once with accumulated bounds
    if (this.boundsMinX !== Infinity) {
      this.markDirty(
        this.boundsMinX,
        this.boundsMinY,
        this.boundsMaxX - this.boundsMinX + 1,
        this.boundsMaxY - this.boundsMinY + 1
      );
    }
  }

  onMove(_x: number, _y: number) {}
  onDrag(_x: number, _y: number) {}
  onUp(_x: number, _y: number) {}
}
