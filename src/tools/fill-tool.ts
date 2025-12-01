import { BaseTool } from './base-tool';
import { colorStore } from '../stores/colors';

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

    const imageData = this.ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    // Get target color
    const targetPos = (startY * width + startX) * 4;
    const targetR = data[targetPos];
    const targetG = data[targetPos + 1];
    const targetB = data[targetPos + 2];
    const targetA = data[targetPos + 3];

    // Get fill color
    const hex = colorStore.primaryColor.value;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const a = 255; // Assuming full opacity for now

    if (targetR === r && targetG === g && targetB === b && targetA === a) return;

    // Flood fill (Stack-based)
    const stack = [[startX, startY]];
    
    while (stack.length) {
      const [cx, cy] = stack.pop()!;
      const pos = (cy * width + cx) * 4;

      if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;
      
      // Check if matches target
      if (data[pos] === targetR && data[pos + 1] === targetG && data[pos + 2] === targetB && data[pos + 3] === targetA) {
        // Fill
        data[pos] = r;
        data[pos + 1] = g;
        data[pos + 2] = b;
        data[pos + 3] = a;

        stack.push([cx + 1, cy]);
        stack.push([cx - 1, cy]);
        stack.push([cx, cy + 1]);
        stack.push([cx, cy - 1]);
      }
    }

    this.ctx.putImageData(imageData, 0, 0);
  }

  onMove(x: number, y: number) {}
  onDrag(x: number, y: number) {}
  onUp(x: number, y: number) {}
}
