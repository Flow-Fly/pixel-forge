import { BaseTool } from './base-tool';
import { colorStore } from '../stores/colors';

export class GradientTool extends BaseTool {
  name = 'gradient';
  cursor = 'crosshair';
  private startX = 0;
  private startY = 0;
  private isDrawing = false;
  private imageData: ImageData | null = null;

  onDown(x: number, y: number) {
    this.startX = Math.floor(x);
    this.startY = Math.floor(y);
    this.isDrawing = true;
    
    if (this.ctx) {
      this.imageData = this.ctx.getImageData(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    }
  }

  onMove(x: number, y: number) {}

  onDrag(x: number, y: number) {
    if (!this.isDrawing || !this.ctx || !this.imageData) return;

    // Restore original
    this.ctx.putImageData(this.imageData, 0, 0);

    const currentX = Math.floor(x);
    const currentY = Math.floor(y);

    this.drawGradient(this.startX, this.startY, currentX, currentY);
  }

  onUp(x: number, y: number) {
    if (!this.isDrawing || !this.ctx || !this.imageData) return;

    this.ctx.putImageData(this.imageData, 0, 0);
    
    const currentX = Math.floor(x);
    const currentY = Math.floor(y);
    
    this.drawGradient(this.startX, this.startY, currentX, currentY);

    this.isDrawing = false;
    this.imageData = null;
  }

  private drawGradient(x1: number, y1: number, x2: number, y2: number) {
    if (!this.ctx) return;

    const width = this.ctx.canvas.width;
    const height = this.ctx.canvas.height;
    
    // Create gradient
    const gradient = this.ctx.createLinearGradient(x1, y1, x2, y2);
    gradient.addColorStop(0, colorStore.primaryColor.value);
    gradient.addColorStop(1, colorStore.secondaryColor.value);

    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, width, height);
  }
}
