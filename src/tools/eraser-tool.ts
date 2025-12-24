/**
 * EraserTool - Tool for erasing pixels from the canvas.
 *
 * Extends DrawingTool base class which provides:
 * - Stroke tracking and axis locking
 * - Shift+Click line erasing
 * - Pixel-perfect L-shape detection
 * - Grid-based spacing for brush stamps
 * - Mirror position support
 *
 * Supports two modes:
 * - transparent: Clears pixels to transparent
 * - background: Fills pixels with secondary (background) color
 */

import { DrawingTool } from './drawing-tool';
import { type Point, type ModifierKeys } from './base-tool';
import { colorStore } from '../stores/colors';
import { brushStore } from '../stores/brush';
import { eraserSettings, toolSizes, type EraserMode } from '../stores/tool-settings';
import { guidesStore } from '../stores/guides';
import { projectStore } from '../stores/project';
import { paletteStore } from '../stores/palette';
import { setIndexBufferPixel } from '../utils/indexed-color';

// Default spacing multiplier (0.25 = stamp every size/4 pixels)
const SPACING_MULTIPLIER = 0.25;

// Re-export for backward compatibility
export type { EraserMode };

export class EraserTool extends DrawingTool {
  name = 'eraser';
  cursor = 'crosshair';

  // Track last stroke end for Shift+Click line feature (per-tool static)
  private static lastStrokeEnd: Point | null = null;

  // Cached background palette index for current stroke
  private backgroundPaletteIndex: number = 0;

  static setMode(mode: EraserMode) {
    eraserSettings.mode.value = mode;
  }

  static getMode(): EraserMode {
    return eraserSettings.mode.value;
  }

  // ============= Abstract Method Implementations =============

  protected applyPoint(x: number, y: number): void {
    this.erasePoint(x, y);
  }

  protected getToolSize(): number {
    return toolSizes.eraser.value;
  }

  protected getSpacing(): number {
    const size = toolSizes.eraser.value;
    // For size 1, always use spacing of 1 (pixel-by-pixel)
    // For larger brushes, use spacing based on size
    return Math.max(1, Math.floor(size * SPACING_MULTIPLIER));
  }

  protected initializeStrokeState(modifiers?: ModifierKeys): void {
    // Set eraser mode based on mouse button: left = transparent, right = background
    if (modifiers?.button === 2) {
      EraserTool.setMode('background');
    } else {
      EraserTool.setMode('transparent');
    }

    // For background mode, get the palette index of the secondary color
    if (eraserSettings.mode.value === 'background') {
      const bgColor = colorStore.secondaryColor.value;
      this.backgroundPaletteIndex = paletteStore.getOrAddColorForDrawing(bgColor);
    }
  }

  protected cleanupStrokeState(): void {
    this.backgroundPaletteIndex = 0;
  }

  protected getLastStrokeEnd(): Point | null {
    return EraserTool.lastStrokeEnd;
  }

  protected setLastStrokeEnd(point: Point | null): void {
    EraserTool.lastStrokeEnd = point;
  }

  // ============= Eraser-Specific Methods =============

  /**
   * Erase a single point/brush stamp
   */
  private erasePoint(x: number, y: number) {
    if (!this.context) return;

    const brush = brushStore.activeBrush.value;
    const size = toolSizes.eraser.value;
    const halfSize = Math.floor(size / 2);

    // Erase original point
    this.eraseSinglePoint(x, y, size, halfSize, brush.opacity);

    // Mirror erasing: erase at mirrored positions if guides are active
    const canvasWidth = projectStore.width.value;
    const canvasHeight = projectStore.height.value;
    const mirrorPositions = guidesStore.getMirrorPositions(x, y, canvasWidth, canvasHeight);

    for (const pos of mirrorPositions) {
      this.eraseSinglePoint(pos.x, pos.y, size, halfSize, brush.opacity);
    }
  }

  /**
   * Erase a single point at the given position (helper for erasePoint)
   */
  private eraseSinglePoint(x: number, y: number, size: number, halfSize: number, opacity: number) {
    if (!this.context) return;

    const canvas = this.context.canvas;
    const canvasWidth = canvas.width;

    if (eraserSettings.mode.value === 'background') {
      // Fill with secondary (background) color
      this.context.fillStyle = colorStore.secondaryColor.value;
      this.context.globalAlpha = opacity;
      this.context.fillRect(x - halfSize, y - halfSize, size, size);
      this.context.globalAlpha = 1;

      // Update index buffer with background color
      if (this.currentIndexBuffer && this.backgroundPaletteIndex > 0) {
        for (let py = 0; py < size; py++) {
          for (let px = 0; px < size; px++) {
            setIndexBufferPixel(
              this.currentIndexBuffer,
              canvasWidth,
              x - halfSize + px,
              y - halfSize + py,
              this.backgroundPaletteIndex
            );
          }
        }
      }
    } else {
      // Transparent mode - clear pixels
      this.context.clearRect(x - halfSize, y - halfSize, size, size);

      // Update index buffer to transparent (0)
      if (this.currentIndexBuffer) {
        for (let py = 0; py < size; py++) {
          for (let px = 0; px < size; px++) {
            setIndexBufferPixel(
              this.currentIndexBuffer,
              canvasWidth,
              x - halfSize + px,
              y - halfSize + py,
              0 // 0 = transparent
            );
          }
        }
      }
    }

    // Mark dirty region for partial redraw (convert center to top-left)
    const dirtyX = x - halfSize;
    const dirtyY = y - halfSize;
    this.markDirty(dirtyX, dirtyY, size);
  }

  /**
   * Get the last stroke end position (for Shift+Click feature)
   */
  static getLastStrokeEnd(): Point | null {
    return EraserTool.lastStrokeEnd;
  }
}
