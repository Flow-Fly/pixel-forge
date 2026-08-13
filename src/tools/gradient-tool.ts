import { BaseTool, type ModifierKeys } from './base-tool';
import {
  captureRasterTarget,
  createRasterImageData,
  executeGradient,
  renderGradientPreview,
  type GradientRequest,
} from '../editor/raster-tools';
import { constrainWithStickyAngles } from '../services/drawing/algorithms';
import { gradientSettings } from '../stores/tool-settings';

interface GradientGesture {
  readonly request: GradientRequest;
  readonly beforePixels: Uint8ClampedArray;
  readonly beforeIndices?: Uint8Array;
}

export class GradientTool extends BaseTool {
  name = 'gradient';
  cursor = 'crosshair';
  readonly ownsProjectTransaction = true;

  private gesture: GradientGesture | null = null;
  private isDrawing = false;

  onDown(x: number, y: number, modifiers?: ModifierKeys) {
    if (!this.ctx) return;

    const layerId = this.projectContext.layers.activeLayerId.value;
    if (!layerId) return;
    const frameId = this.projectContext.animation.currentFrameId.value;
    const imageData = this.ctx.getImageData(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    const request: GradientRequest = {
      ...captureRasterTarget(this.projectContext, layerId, frameId),
      startX: Math.floor(x),
      startY: Math.floor(y),
      endX: Math.floor(x),
      endY: Math.floor(y),
      primaryHex: this.projectContext.colors.primaryColor.value,
      secondaryHex: this.projectContext.colors.secondaryColor.value,
      type: gradientSettings.type.value,
      shift: Boolean(modifiers?.shift),
    };

    const indexBuffer = this.projectContext.animation.getCelIndexBuffer(layerId, frameId);
    this.gesture = {
      request,
      beforePixels: new Uint8ClampedArray(imageData.data),
      beforeIndices: indexBuffer ? new Uint8Array(indexBuffer) : undefined,
    };
    this.isDrawing = true;
  }

  onMove(_x: number, _y: number) {}

  onDrag(x: number, y: number) {
    if (!this.isDrawing || !this.ctx || !this.gesture) return;

    const request = this.withEndPoint(this.gesture.request, x, y);
    this.drawPreview(request);
  }

  onUp(x: number, y: number) {
    if (!this.isDrawing || !this.ctx || !this.gesture) return;

    const gesture = this.gesture;
    const request = this.withEndPoint(gesture.request, x, y);
    this.drawPreview(request);

    // Preview pixels live in the cel canvas only to make the drag visible.
    // Restore the captured bytes before the transaction validates its revision
    // and applies the final indexed result.
    this.restorePixels(gesture.beforePixels);
    this.isDrawing = false;
    this.gesture = null;

    void executeGradient(this.projectContext, request, {
      canvas: this.ctx.canvas,
      beforePixels: gesture.beforePixels,
      beforeIndices: gesture.beforeIndices,
    }).then((result) => {
      if (!result.ok) this.restorePixels(gesture.beforePixels);
    });
  }

  private withEndPoint(request: GradientRequest, x: number, y: number): GradientRequest {
    return {
      ...request,
      endX: Math.floor(x),
      endY: Math.floor(y),
    };
  }

  private drawPreview(request: GradientRequest): void {
    if (!this.ctx) return;

    this.drawCanvasGradientPreview(request);
    const render = renderGradientPreview(
      this.projectContext,
      request,
      this.ctx.canvas.width,
      this.ctx.canvas.height,
    );
    this.ctx.putImageData(createRasterImageData(render.pixels, this.ctx.canvas.width, this.ctx.canvas.height), 0, 0);
    this.markPreviewDirty(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
  }

  /**
   * Keep the browser-native Canvas gradient in the preview path. The final
   * transaction writes deterministic existing-palette samples over it.
   */
  private drawCanvasGradientPreview(request: GradientRequest): void {
    if (!this.ctx) return;

    const effectiveEnd = request.shift
      ? constrainWithStickyAngles(request.startX, request.startY, request.endX, request.endY)
      : { x: request.endX, y: request.endY };

    const gradient = request.type === 'radial' && 'createRadialGradient' in this.ctx
      ? this.ctx.createRadialGradient(
        request.startX,
        request.startY,
        0,
        request.startX,
        request.startY,
        Math.hypot(effectiveEnd.x - request.startX, effectiveEnd.y - request.startY),
      )
      : this.ctx.createLinearGradient(
        request.startX,
        request.startY,
        effectiveEnd.x,
        effectiveEnd.y,
      );
    gradient.addColorStop(0, request.primaryHex);
    gradient.addColorStop(1, request.secondaryHex);
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
  }

  private restorePixels(pixels: Uint8ClampedArray): void {
    if (!this.ctx) return;
    this.ctx.putImageData(createRasterImageData(pixels, this.ctx.canvas.width, this.ctx.canvas.height), 0, 0);
  }

  private markPreviewDirty(x: number, y: number, width: number, height: number): void {
    this.projectContext.dirtyRect.markDirty({ x, y, width, height });
  }
}
