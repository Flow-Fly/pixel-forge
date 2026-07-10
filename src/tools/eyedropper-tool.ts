import { BaseTool, type ModifierKeys } from './base-tool';
import { isReferenceLayer } from '../utils/layer-capabilities';

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
    if (!this.canSampleActiveLayer()) return;

    const pixelX = Math.floor(x);
    const pixelY = Math.floor(y);
    const width = this.context.canvas.width;

    const hex =
      this.indexedColorAt(pixelX, pixelY, width) ??
      this.canvasColorAt(pixelX, pixelY);

    if (!hex) return;

    this.applyPickedColor(hex, modifiers);
  }

  private canSampleActiveLayer(): boolean {
    const layerId = this.projectContext.layers.activeLayerId.value;
    const layer = this.projectContext.layers.layers.value.find(
      (candidate) => candidate.id === layerId
    );
    return !isReferenceLayer(layer);
  }

  private indexedColorAt(pixelX: number, pixelY: number, width: number): string | null {
    const layerId = this.projectContext.layers.activeLayerId.value;
    if (!layerId) return null;

    const frameId = this.projectContext.animation.currentFrameId.value;
    const indexBuffer = this.projectContext.animation.getCelIndexBuffer(layerId, frameId);
    if (!indexBuffer) return null;

    const pixelIndex = pixelY * width + pixelX;
    const paletteIndex = indexBuffer[pixelIndex];
    return paletteIndex > 0
      ? this.projectContext.palette.getColorByIndex(paletteIndex)
      : null;
  }

  private canvasColorAt(pixelX: number, pixelY: number): string | null {
    if (!this.context) return null;

    const pixel = this.context.getImageData(pixelX, pixelY, 1, 1).data;
    if (pixel[3] < 128) return null;

    return '#' +
      pixel[0].toString(16).padStart(2, '0') +
      pixel[1].toString(16).padStart(2, '0') +
      pixel[2].toString(16).padStart(2, '0');
  }

  private applyPickedColor(hex: string, modifiers?: ModifierKeys) {
    if (modifiers?.button === 2) {
      this.projectContext.colors.setSecondaryColor(hex);
      return;
    }

    this.projectContext.colors.setPrimaryColor(hex);
    this.projectContext.colors.updateLightnessVariations(hex);
  }
}
