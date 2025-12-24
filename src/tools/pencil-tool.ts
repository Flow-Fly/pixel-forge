/**
 * PencilTool - Drawing tool for applying color to the canvas.
 *
 * Extends DrawingTool base class which provides:
 * - Stroke tracking and axis locking
 * - Shift+Click line drawing
 * - Pixel-perfect L-shape detection
 * - Grid-based spacing for brush stamps
 * - Mirror position support
 */

import { DrawingTool } from './drawing-tool';
import { type Point, type ModifierKeys } from './base-tool';
import { colorStore } from '../stores/colors';
import { brushStore } from '../stores/brush';
import { toolSizes } from '../stores/tool-settings';
import { guidesStore } from '../stores/guides';
import { projectStore } from '../stores/project';
import { paletteStore } from '../stores/palette';
import { setIndexBufferPixel } from '../utils/indexed-color';

export class PencilTool extends DrawingTool {
  name = 'pencil';
  cursor = 'crosshair';

  // Track last stroke end for Shift+Click line feature (per-tool static)
  private static lastStrokeEnd: Point | null = null;

  // Cached palette index for current stroke
  private currentPaletteIndex: number = 0;

  // ============= Abstract Method Implementations =============

  protected applyPoint(x: number, y: number): void {
    this.drawPoint(x, y);
  }

  protected getToolSize(): number {
    return toolSizes.pencil.value;
  }

  protected getSpacing(): number {
    return brushStore.getEffectiveSpacing();
  }

  protected initializeStrokeState(_modifiers?: ModifierKeys): void {
    // Get palette index for drawing - adds to ephemeral if not in main palette
    const color = colorStore.primaryColor.value;
    this.currentPaletteIndex = paletteStore.getOrAddColorForDrawing(color);
  }

  protected cleanupStrokeState(): void {
    this.currentPaletteIndex = 0;
  }

  protected getLastStrokeEnd(): Point | null {
    return PencilTool.lastStrokeEnd;
  }

  protected setLastStrokeEnd(point: Point | null): void {
    PencilTool.lastStrokeEnd = point;
  }

  protected supportsAngleSnapping(): boolean {
    return true;
  }

  // ============= Pencil-Specific Methods =============

  /**
   * Draw a single point/brush stamp centered at (x, y)
   */
  private drawPoint(x: number, y: number) {
    if (!this.context) return;

    const brush = brushStore.activeBrush.value;
    const canvasWidth = this.context.canvas.width;
    const canvasHeight = projectStore.height.value;

    // Use custom brush stamping for custom brushes with image data
    if (brush.type === "custom" && brush.imageData) {
      this.stampCustomBrush(x, y, brush.imageData);

      // Mirror drawing for custom brushes
      const mirrorPositions = guidesStore.getMirrorPositions(x, y, canvasWidth, canvasHeight);
      for (const pos of mirrorPositions) {
        this.stampCustomBrush(pos.x, pos.y, brush.imageData);
      }
      return;
    }

    // Standard builtin brush drawing
    const size = toolSizes.pencil.value;

    this.context.globalAlpha = brush.opacity;
    this.context.fillStyle = colorStore.primaryColor.value;

    // Always draw centered on x/y
    const halfSize = Math.floor(size / 2);
    this.context.fillRect(x - halfSize, y - halfSize, size, size);

    // Update index buffer for indexed color mode
    if (this.currentIndexBuffer && this.currentPaletteIndex > 0) {
      // Write to all pixels in the brush stamp
      for (let py = 0; py < size; py++) {
        for (let px = 0; px < size; px++) {
          setIndexBufferPixel(
            this.currentIndexBuffer,
            canvasWidth,
            x - halfSize + px,
            y - halfSize + py,
            this.currentPaletteIndex
          );
        }
      }
    }

    // Mark dirty region for partial redraw (convert center to top-left)
    const dirtyX = x - halfSize;
    const dirtyY = y - halfSize;
    this.markDirty(dirtyX, dirtyY, size);

    // Mirror drawing: draw at mirrored positions if guides are active
    const mirrorPositions = guidesStore.getMirrorPositions(x, y, canvasWidth, canvasHeight);

    for (const pos of mirrorPositions) {
      this.context.fillRect(pos.x - halfSize, pos.y - halfSize, size, size);
      this.markDirty(pos.x - halfSize, pos.y - halfSize, size);

      // Update index buffer for mirrored positions too
      if (this.currentIndexBuffer && this.currentPaletteIndex > 0) {
        for (let py = 0; py < size; py++) {
          for (let px = 0; px < size; px++) {
            setIndexBufferPixel(
              this.currentIndexBuffer,
              canvasWidth,
              pos.x - halfSize + px,
              pos.y - halfSize + py,
              this.currentPaletteIndex
            );
          }
        }
      }
    }

    this.context.globalAlpha = 1;
  }

  /**
   * Stamp a custom brush at the given position.
   * Uses the brush's alpha channel as a mask.
   * If useOriginalColors is true, uses the brush's stored RGB values.
   * Otherwise, applies the current foreground color.
   */
  private stampCustomBrush(
    x: number,
    y: number,
    imageData: { width: number; height: number; data: number[] }
  ) {
    if (!this.context) return;

    const { width, height, data } = imageData;
    const halfW = Math.floor(width / 2);
    const halfH = Math.floor(height / 2);

    const brush = brushStore.activeBrush.value;
    const fgColor = colorStore.primaryColor.value;
    const useOriginalColors = brush.useOriginalColors ?? false;

    const canvasWidth = this.context.canvas.width;
    const canvasHeight = this.context.canvas.height;

    // Draw each pixel of the brush
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const i = (py * width + px) * 4;
        const alpha = data[i + 3];

        if (alpha === 0) continue; // Skip transparent pixels

        const destX = x - halfW + px;
        const destY = y - halfH + py;

        // Bounds check
        if (destX < 0 || destY < 0 || destX >= canvasWidth || destY >= canvasHeight) continue;

        // Apply color based on mode
        const finalAlpha = (alpha / 255) * brush.opacity;
        this.context.globalAlpha = finalAlpha;

        if (useOriginalColors) {
          // Use the brush's stored RGB values
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          this.context.fillStyle = `rgb(${r}, ${g}, ${b})`;
        } else {
          // Use foreground color
          this.context.fillStyle = fgColor;
        }

        this.context.fillRect(destX, destY, 1, 1);

        // Update index buffer (only for foreground color mode with valid palette index)
        if (this.currentIndexBuffer && this.currentPaletteIndex > 0 && finalAlpha > 0.5 && !useOriginalColors) {
          setIndexBufferPixel(
            this.currentIndexBuffer,
            canvasWidth,
            destX,
            destY,
            this.currentPaletteIndex
          );
        }
      }
    }

    this.context.globalAlpha = 1;

    // Mark dirty region
    const dirtyX = x - halfW;
    const dirtyY = y - halfH;
    this.markDirty(dirtyX, dirtyY, Math.max(width, height));
  }

  /**
   * Get the last stroke end position (for Shift+Click feature)
   */
  static getLastStrokeEnd(): Point | null {
    return PencilTool.lastStrokeEnd;
  }
}
