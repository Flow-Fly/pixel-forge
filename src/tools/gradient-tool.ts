import { BaseTool, type ModifierKeys } from './base-tool';
import {
  captureRasterTarget,
  createRasterImageData,
  executeGradient,
  renderGradientPreview,
  type GradientRequest,
} from '../editor/raster-tools';
import { gradientSettings } from '../stores/tool-settings';
import { productTelemetry } from '../services/telemetry';

interface GradientGesture {
  readonly request: GradientRequest;
  readonly beforePixels: Uint8ClampedArray;
  readonly beforeIndices?: Uint8Array;
  readonly previewPixels: Uint8ClampedArray | null;
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
      previewPixels: null,
    };
    this.isDrawing = true;
  }

  onMove(_x: number, _y: number) {}

  onDrag(x: number, y: number) {
    if (!this.isDrawing || !this.ctx || !this.gesture) return;

    const request = this.withEndPoint(this.gesture.request, x, y);
    if (this.isZeroLength(request)) return;
    this.drawPreview(request);
  }

  onUp(x: number, y: number) {
    if (!this.isDrawing || !this.ctx || !this.gesture) return;

    const capturedGesture = this.gesture;
    const request = this.withEndPoint(capturedGesture.request, x, y);
    const isZeroLength = this.isZeroLength(request);
    const previewPixels = isZeroLength ? null : this.drawPreview(request);
    const gesture = previewPixels
      ? { ...capturedGesture, previewPixels }
      : capturedGesture;
    this.isDrawing = false;
    this.gesture = null;

    // A failed preview cannot safely describe the transient canvas state. Do
    // not start a transaction from it, but keep the gesture failure local.
    if (!isZeroLength && !previewPixels) {
      this.restoreCapturedPixelsIfCurrent(gesture);
      return;
    }

    const projectContext = this.projectContext;
    void executeGradient(projectContext, request, {
      canvas: this.ctx.canvas,
      beforePixels: gesture.beforePixels,
      beforeIndices: gesture.beforeIndices,
      ...(previewPixels ? { expectedPixels: previewPixels } : {}),
    }).then((result) => {
      if (!result.ok) this.restoreCapturedPixelsIfCurrent(gesture);
      else {
        productTelemetry.record({
          name: 'first_drawing_action',
          dimensions: { tool: 'other' },
        });
      }
    });
  }

  onCancel(): void {
    if (!this.isDrawing || !this.gesture) return;
    this.restoreCapturedPixelsIfCurrent(this.gesture);
    this.isDrawing = false;
    this.gesture = null;
  }

  private withEndPoint(request: GradientRequest, x: number, y: number): GradientRequest {
    return {
      ...request,
      endX: Math.floor(x),
      endY: Math.floor(y),
    };
  }

  private drawPreview(request: GradientRequest): Uint8ClampedArray | null {
    if (!this.ctx) return null;

    try {
      const render = renderGradientPreview(
        this.projectContext,
        request,
        this.ctx.canvas.width,
        this.ctx.canvas.height,
      );
      this.ctx.putImageData(createRasterImageData(render.pixels, this.ctx.canvas.width, this.ctx.canvas.height), 0, 0);
      this.markPreviewDirty(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
      if (this.gesture) {
        this.gesture = { ...this.gesture, previewPixels: new Uint8ClampedArray(render.pixels) };
      }
      return render.pixels;
    } catch {
      return null;
    }
  }

  private isZeroLength(request: GradientRequest): boolean {
    return request.startX === request.endX && request.startY === request.endY;
  }

  private restorePixels(pixels: Uint8ClampedArray): void {
    if (!this.ctx) return;
    this.ctx.putImageData(createRasterImageData(pixels, this.ctx.canvas.width, this.ctx.canvas.height), 0, 0);
  }

  private restoreCapturedPixelsIfCurrent(gesture: GradientGesture): void {
    const previewPixels = gesture.previewPixels;
    if (!this.ctx || !previewPixels || !this.isCurrentGestureTarget(gesture.request)) return;

    const currentPixels = this.ctx.getImageData(0, 0, this.ctx.canvas.width, this.ctx.canvas.height).data;
    const matchesPreview = currentPixels.length === previewPixels.length &&
      currentPixels.every((pixel, index) => pixel === previewPixels[index]);
    if (!matchesPreview) return;
    this.restorePixels(gesture.beforePixels);
  }

  private isCurrentGestureTarget(request: GradientRequest): boolean {
    if (this.projectContext.project.id.value !== request.target.projectId ||
        this.projectContext.project.revision.value !== request.expectedRevision) {
      return false;
    }

    const key = this.projectContext.animation.getCelKey(request.layerId, request.frameId);
    const cel = this.projectContext.animation.cels.value.get(key);
    return !!cel && cel.canvas === this.ctx?.canvas && (!request.celId || cel.id === request.celId);
  }

  private markPreviewDirty(x: number, y: number, width: number, height: number): void {
    this.projectContext.dirtyRect.markDirty({ x, y, width, height });
  }
}
