import { BaseTool } from './base-tool';
import { colorStore } from '../stores/colors';

export class EyedropperTool extends BaseTool {
  name = 'eyedropper';
  cursor = 'crosshair';
  
  constructor(context: CanvasRenderingContext2D) {
    super();
    this.setContext(context);
  }

  onDown(x: number, y: number) {
    this.pickColor(x, y);
  }

  onDrag(x: number, y: number) {
    this.pickColor(x, y);
  }

  onUp(_x: number, _y: number) {}

  private pickColor(x: number, y: number) {
    if (!this.context) return;
    const pixel = this.context.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
    const hex = '#' + 
      pixel[0].toString(16).padStart(2, '0') + 
      pixel[1].toString(16).padStart(2, '0') + 
      pixel[2].toString(16).padStart(2, '0');
    
    colorStore.setPrimaryColor(hex);
  }
}
