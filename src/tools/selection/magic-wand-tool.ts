import { BaseTool, type ModifierKeys } from '../base-tool';
import { selectionStore } from '../../stores/selection';
import { layerStore } from '../../stores/layers';

export class MagicWandTool extends BaseTool {
  name = 'magic-wand';
  cursor = 'crosshair';

  constructor(context: CanvasRenderingContext2D) {
    super();
    this.setContext(context);
  }

  onDown(x: number, y: number, modifiers?: ModifierKeys) {
    // Determine selection mode based on modifiers
    if (modifiers?.shift) {
      // Shift = add to selection
      selectionStore.setMode('add');
    } else if (modifiers?.alt) {
      // Alt = subtract from selection
      selectionStore.setMode('subtract');
    } else {
      // No modifiers = replace selection
      selectionStore.setMode('replace');
    }

    this.selectRegion(x, y);
  }

  onDrag(_x: number, _y: number, _modifiers?: ModifierKeys) {}

  onUp(_x: number, _y: number, _modifiers?: ModifierKeys) {
    // Reset mode to 'replace' after selection is finalized
    selectionStore.resetMode();
  }

  private selectRegion(x: number, y: number) {
    // Need access to active layer data
    const activeLayerId = layerStore.activeLayerId.value;
    const activeLayer = layerStore.layers.value.find((l) => l.id === activeLayerId);

    if (!activeLayer || !activeLayer.canvas) return;

    const ctx = activeLayer.canvas.getContext('2d');
    if (!ctx) return;

    const startX = Math.floor(x);
    const startY = Math.floor(y);
    const width = activeLayer.canvas.width;
    const height = activeLayer.canvas.height;

    // Get image data
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Get target color
    const targetIndex = (startY * width + startX) * 4;
    const targetR = data[targetIndex];
    const targetG = data[targetIndex + 1];
    const targetB = data[targetIndex + 2];
    const targetA = data[targetIndex + 3];

    // Flood fill to find connected pixels
    // This is a simplified version, real one would generate a mask
    // For now, let's just select the clicked pixel as a placeholder

    // TODO: Implement proper flood fill and mask generation
    // For this prototype, we'll just select a single pixel region
    selectionStore.state.value = {
      type: 'selected',
      shape: 'rectangle',
      bounds: { x: startX, y: startY, width: 1, height: 1 },
    };

    console.log(
      `Magic Wand: Selected color rgba(${targetR},${targetG},${targetB},${targetA}) at ${startX},${startY}`
    );
  }
}
