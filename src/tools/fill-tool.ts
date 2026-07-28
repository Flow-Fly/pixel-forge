import { BaseTool } from './base-tool';
import { floodFill, type FloodFillColor } from '../services/drawing/algorithms';
import {
  collectGuidedFillRegion,
  paintGuidedFillRegion,
} from '../services/paint-by-number/guided-fill';
import { isPaintableLayer } from '../utils/layer-capabilities';
import type { Rect } from '../types/geometry';

interface FillRequest {
  frameId: string;
  height: number;
  hex: string;
  imageData: ImageData;
  layerId: string;
  startX: number;
  startY: number;
  width: number;
}

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

    const { animation, colors, layers } = this.projectContext;
    const layerId = layers.activeLayerId.value;
    const layer = layers.layers.value.find((candidate) => candidate.id === layerId);
    if (!isPaintableLayer(layer)) return;

    const imageData = this.ctx.getImageData(0, 0, width, height);

    const guidedSession = this.projectContext.guidedDrawing.session.value;
    const request: FillRequest = {
      frameId: animation.currentFrameId.value,
      height,
      hex: colors.primaryColor.value,
      imageData,
      layerId: layer.id,
      startX,
      startY,
      width,
    };
    const bounds = guidedSession
      ? this.fillGuidedRegion(request, guidedSession.target)
      : this.fillPixelRegion(request);
    if (!bounds) return;

    this.ctx.putImageData(imageData, 0, 0);
    this.markDirty(bounds.x, bounds.y, bounds.width, bounds.height);
  }

  onMove(_x: number, _y: number) {}
  onDrag(_x: number, _y: number) {}
  onUp(_x: number, _y: number) {}

  private fillGuidedRegion(request: FillRequest, target: Uint8Array): Rect | null {
    const session = this.projectContext.guidedDrawing.session.value;
    if (!session || session.width !== request.width || session.height !== request.height) {
      return null;
    }

    const region = collectGuidedFillRegion(
      target,
      request.imageData.data,
      request.width,
      request.height,
      request.startX,
      request.startY,
    );
    if (!region) return null;

    const { animation, palette } = this.projectContext;
    const indexBuffer = animation.ensureCelIndexBuffer(request.layerId, request.frameId);
    const paletteIndex = palette.getOrAddColorForDrawing(request.hex);
    paintGuidedFillRegion(
      request.imageData.data,
      indexBuffer,
      region,
      this.fillColor(request.hex, paletteIndex),
    );
    return region.bounds;
  }

  private fillPixelRegion(request: FillRequest): Rect | null {
    const { animation, palette } = this.projectContext;
    const indexBuffer = animation.ensureCelIndexBuffer(request.layerId, request.frameId);
    const paletteIndex = palette.getOrAddColorForDrawing(request.hex);

    return floodFill(
      request.imageData.data,
      request.width,
      request.height,
      request.startX,
      request.startY,
      this.fillColor(request.hex, paletteIndex),
      indexBuffer,
    );
  }

  private fillColor(hex: string, paletteIndex: number): FloodFillColor {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
      a: 255,
      paletteIndex,
    };
  }
}
