import { BaseTool } from './base-tool';
import { captureRasterTarget, executeFill, type FillRequest } from '../editor/raster-tools';
import { fillSettings } from '../stores/tool-settings';
import { isPaintableLayer } from '../utils/layer-capabilities';
import { productTelemetry } from '../services/telemetry';

export class FillTool extends BaseTool {
  name = 'fill';
  cursor = 'crosshair';
  readonly ownsProjectTransaction = true;

  onDown(x: number, y: number) {
    if (!this.ctx) return;

    const layerId = this.projectContext.layers.activeLayerId.value;
    const layer = this.projectContext.layers.layers.value.find((candidate) => candidate.id === layerId);
    if (!layer || !isPaintableLayer(layer)) return;

    const frameId = this.projectContext.animation.currentFrameId.value;
    const request: FillRequest = {
      ...captureRasterTarget(this.projectContext, layer.id, frameId),
      startX: Math.floor(x),
      startY: Math.floor(y),
      hex: this.projectContext.colors.primaryColor.value,
      contiguous: fillSettings.contiguous.value,
    };

    // HistoryStore executes the command synchronously before its promise
    // settles, so the canvas reflects the completed click immediately while
    // the host keeps the transaction's asynchronous boundary.
    void executeFill(this.projectContext, request, { canvas: this.ctx.canvas }).then((result) => {
      if (!result.ok) return;
      productTelemetry.record({
        name: 'first_drawing_action',
        dimensions: { tool: 'fill' },
      });
    });
  }

  onMove(_x: number, _y: number) {}
  onDrag(_x: number, _y: number) {}
  onUp(_x: number, _y: number) {}
}
