import type { ProjectContext } from '../stores/project-context';
import { rgbToHex, setIndexBufferPixel } from '../utils/indexed-color';

interface SnapshotPixel {
  r: number;
  g: number;
  b: number;
  a: number;
}

export class StrokeSession {
  private startSnapshot: ImageData | null = null;
  private buffer: Uint8Array | null = null;
  private projectContext: ProjectContext | null = null;

  begin(context: CanvasRenderingContext2D, projectContext: ProjectContext) {
    const canvas = context.canvas;
    this.startSnapshot = context.getImageData(0, 0, canvas.width, canvas.height);
    this.buffer = null;
    this.projectContext = projectContext;

    const layerId = projectContext.layers.activeLayerId.value;
    const frameId = projectContext.animation.currentFrameId.value;

    if (layerId) {
      this.buffer = projectContext.animation.ensureCelIndexBuffer(layerId, frameId);
    }
  }

  clear() {
    this.startSnapshot = null;
    this.buffer = null;
    this.projectContext = null;
  }

  get hasSnapshot(): boolean {
    return this.startSnapshot !== null;
  }

  get indexBuffer(): Uint8Array | null {
    return this.buffer;
  }

  restorePixel(context: CanvasRenderingContext2D, x: number, y: number): boolean {
    if (!this.startSnapshot || !this.projectContext) {
      return false;
    }

    const previousPixel = this.getPreviousPixel(context, x, y);
    if (!previousPixel) {
      return true;
    }

    if (previousPixel.a === 0) {
      context.clearRect(x, y, 1, 1);
      this.setIndexBufferPixel(context, x, y, 0);
      return true;
    }

    context.fillStyle = `rgba(${previousPixel.r}, ${previousPixel.g}, ${previousPixel.b}, ${previousPixel.a / 255})`;
    context.globalAlpha = 1;
    context.fillRect(x, y, 1, 1);

    const hex = rgbToHex(previousPixel.r, previousPixel.g, previousPixel.b);
    this.setIndexBufferPixel(
      context,
      x,
      y,
      this.projectContext.palette.getColorIndex(hex)
    );
    return true;
  }

  private getPreviousPixel(
    context: CanvasRenderingContext2D,
    x: number,
    y: number
  ): SnapshotPixel | null {
    if (!this.startSnapshot) {
      return null;
    }

    const canvas = context.canvas;
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) {
      return null;
    }

    const index = (y * this.startSnapshot.width + x) * 4;
    return {
      r: this.startSnapshot.data[index],
      g: this.startSnapshot.data[index + 1],
      b: this.startSnapshot.data[index + 2],
      a: this.startSnapshot.data[index + 3],
    };
  }

  private setIndexBufferPixel(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    paletteIndex: number
  ) {
    if (!this.buffer) {
      return;
    }

    setIndexBufferPixel(this.buffer, context.canvas.width, x, y, paletteIndex);
  }
}
