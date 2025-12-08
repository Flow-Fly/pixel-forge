import { BaseTool, ModifierKeys } from './base-tool';
import { colorStore } from '../stores/colors';

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
    const pixel = this.context.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
    const hex = '#' +
      pixel[0].toString(16).padStart(2, '0') +
      pixel[1].toString(16).padStart(2, '0') +
      pixel[2].toString(16).padStart(2, '0');

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
