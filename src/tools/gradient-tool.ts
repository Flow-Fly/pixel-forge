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
  readonly previewCanvas: HTMLCanvasElement;
}

export class GradientTool extends BaseTool {
  name = 'gradient';
  cursor = 'crosshair';
  readonly ownsProjectTransaction = true;

  private gesture: GradientGesture | null = null;
  private isDrawing = false;

  onDown(x: number, y: number, modifiers?: ModifierKeys) {
    if (!this.ctx) return;

    this.presentPreview(null);

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
    const previewCanvas = document.createElement('canvas');
    previewCanvas.width = this.ctx.canvas.width;
    previewCanvas.height = this.ctx.canvas.height;
    const previewContext = previewCanvas.getContext('2d');
    if (!previewContext) return;
    previewContext.putImageData(createRasterImageData(imageData.data, previewCanvas.width, previewCanvas.height), 0, 0);
    this.gesture = {
      request,
      beforePixels: new Uint8ClampedArray(imageData.data),
      beforeIndices: indexBuffer ? new Uint8Array(indexBuffer) : undefined,
      previewCanvas,
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
    const didRenderPreview = isZeroLength || this.drawPreview(request);
    this.presentPreview(null);
    this.isDrawing = false;
    this.gesture = null;

    // A failed preview cannot safely describe the transient canvas state. Do
    // not start a transaction from it, but keep the gesture failure local.
    if (!didRenderPreview) return;

    const projectContext = this.projectContext;
    void executeGradient(projectContext, request, {
      canvas: this.ctx.canvas,
      beforePixels: capturedGesture.beforePixels,
      beforeIndices: capturedGesture.beforeIndices,
    }).then((result) => {
      if (!result.ok) return;
      productTelemetry.record({
        name: 'first_drawing_action',
        dimensions: { tool: 'other' },
      });
    });
  }

  onCancel(): void {
    if (!this.isDrawing || !this.gesture) return;
    this.presentPreview(null);
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

  private drawPreview(request: GradientRequest): boolean {
    const gesture = this.gesture;
    if (!gesture) return false;
    const previewContext = gesture.previewCanvas.getContext('2d');
    if (!previewContext) return false;

    try {
      const render = renderGradientPreview(
        this.projectContext,
        request,
        gesture.previewCanvas.width,
        gesture.previewCanvas.height,
      );
      previewContext.putImageData(
        createRasterImageData(render.pixels, gesture.previewCanvas.width, gesture.previewCanvas.height),
        0,
        0,
      );
      this.presentPreview({
        projectId: request.target.projectId,
        expectedRevision: request.expectedRevision,
        layerId: request.layerId,
        frameId: request.frameId,
        ...(request.celId ? { celId: request.celId } : {}),
        canvas: gesture.previewCanvas,
      });
      this.markPreviewDirty(0, 0, gesture.previewCanvas.width, gesture.previewCanvas.height);
      return true;
    } catch {
      this.presentPreview(null);
      return false;
    }
  }

  private isZeroLength(request: GradientRequest): boolean {
    return request.startX === request.endX && request.startY === request.endY;
  }

  private markPreviewDirty(x: number, y: number, width: number, height: number): void {
    this.projectContext.dirtyRect.markDirty({ x, y, width, height });
  }
}
