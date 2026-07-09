import { BaseTool, type Point, type ModifierKeys } from './base-tool';
import { brushStore } from '../stores/brush';
import { eraserSettings, toolSizes, type EraserMode } from '../stores/tool-settings';
import {
  bresenhamLine,
  isLShape,
} from '../services/drawing/algorithms';
import { setIndexBufferPixel } from '../utils/indexed-color';
import { StrokeSession } from './stroke-session';

// Default spacing multiplier (0.25 = stamp every size/4 pixels)
const SPACING_MULTIPLIER = 0.25;

// Re-export for backward compatibility
export type { EraserMode };

export class EraserTool extends BaseTool {
  name = 'eraser';
  cursor = 'crosshair';

  private isDrawing = false;
  private lastX = 0;
  private lastY = 0;

  // For pixel-perfect mode: track erased points for L-shape detection
  private erasedPoints: Point[] = [];

  // Track last stroke end for Shift+Click line feature
  private static lastStrokeEnd: Point | null = null;

  // Track drag start for constrained angle drawing
  private dragStartX = 0;
  private dragStartY = 0;

  // Locked axis for shift-drag (null = not yet determined, 'h' = horizontal, 'v' = vertical)
  private lockedAxis: 'h' | 'v' | null = null;

  // Track distance since last stamp for brush spacing
  private distanceSinceLastStamp = 0;

  private strokeSession = new StrokeSession();

  // Cached background palette index for current stroke
  private backgroundPaletteIndex: number = 0;

  private get currentIndexBuffer(): Uint8Array | null {
    return this.strokeSession.indexBuffer;
  }

  constructor(context: CanvasRenderingContext2D) {
    super();
    this.setContext(context);
  }

  static setMode(mode: EraserMode) {
    eraserSettings.mode.value = mode;
  }

  static getMode(): EraserMode {
    return eraserSettings.mode.value;
  }

  onDown(x: number, y: number, modifiers?: ModifierKeys) {
    if (!this.context) return;

    this.setModeFromPointer(modifiers);

    this.isDrawing = true;
    const currentX = Math.floor(x);
    const currentY = Math.floor(y);

    this.beginStrokeSession();

    // Shift+Click: erase line from last stroke end to current position
    if (modifiers?.shift && EraserTool.lastStrokeEnd) {
      this.eraseShiftClickStroke(currentX, currentY);
      return;
    }

    this.startFreehandStroke(currentX, currentY);
  }

  private setModeFromPointer(modifiers?: ModifierKeys) {
    EraserTool.setMode(modifiers?.button === 2 ? 'background' : 'transparent');
  }

  private beginStrokeSession() {
    if (!this.context) return;

    this.strokeSession.begin(this.context, this.projectContext);

    if (!this.currentIndexBuffer || eraserSettings.mode.value !== 'background') {
      return;
    }

    const bgColor = this.projectContext.colors.secondaryColor.value;
    this.backgroundPaletteIndex = this.projectContext.palette.getOrAddColorForDrawing(bgColor);
  }

  private eraseShiftClickStroke(currentX: number, currentY: number) {
    const start = EraserTool.lastStrokeEnd;
    if (!start) return;

    this.erasedPoints = [{ x: start.x, y: start.y }];
    this.eraseLineBetweenPoints(start.x, start.y, currentX, currentY);
    this.lastX = currentX;
    this.lastY = currentY;
    EraserTool.lastStrokeEnd = { x: currentX, y: currentY };
  }

  private startFreehandStroke(currentX: number, currentY: number) {
    this.lastX = currentX;
    this.lastY = currentY;
    this.dragStartX = currentX;
    this.dragStartY = currentY;
    this.lockedAxis = null;
    this.erasedPoints = [{ x: this.lastX, y: this.lastY }];
    this.distanceSinceLastStamp = 0;
    this.erasePoint(this.lastX, this.lastY);
  }

  onDrag(x: number, y: number, modifiers?: ModifierKeys) {
    if (!this.isDrawing || !this.context) return;

    let currentX = Math.floor(x);
    let currentY = Math.floor(y);

    // Shift+Drag: constrain to locked axis (determined on first significant movement)
    if (modifiers?.shift) {
      const dx = Math.abs(currentX - this.dragStartX);
      const dy = Math.abs(currentY - this.dragStartY);

      // Lock axis on first significant movement (>= 1 pixel)
      if (this.lockedAxis === null && (dx >= 1 || dy >= 1)) {
        this.lockedAxis = dx >= dy ? 'h' : 'v';
      }

      // Apply constraint based on locked axis
      if (this.lockedAxis === 'h') {
        currentY = this.dragStartY;
      } else if (this.lockedAxis === 'v') {
        currentX = this.dragStartX;
      }
    }

    if (this.lastX === currentX && this.lastY === currentY) return;

    this.eraseLineBetweenPoints(this.lastX, this.lastY, currentX, currentY);

    this.lastX = currentX;
    this.lastY = currentY;
  }

  onUp(_x: number, _y: number, _modifiers?: ModifierKeys) {
    // Store last stroke end for Shift+Click feature
    if (this.isDrawing) {
      EraserTool.lastStrokeEnd = { x: this.lastX, y: this.lastY };
    }
    this.isDrawing = false;
    this.erasedPoints = [];
    this.strokeSession.clear();
    this.backgroundPaletteIndex = 0;
  }

  onMove(x: number, y: number, modifiers?: ModifierKeys) {
    // Emit preview line when shift held + lastStrokeEnd exists (for shift-click preview)
    if (modifiers?.shift && EraserTool.lastStrokeEnd) {
      window.dispatchEvent(new CustomEvent('line-preview', {
        detail: {
          start: EraserTool.lastStrokeEnd,
          end: { x: Math.floor(x), y: Math.floor(y) }
        }
      }));
    } else {
      window.dispatchEvent(new CustomEvent('line-preview-clear'));
    }
  }

  /**
   * Calculate brush spacing based on size
   */
  private getSpacing(): number {
    const size = toolSizes.eraser.value;
    // For size 1, always use spacing of 1 (pixel-by-pixel)
    // For larger brushes, use spacing based on size
    return Math.max(1, Math.floor(size * SPACING_MULTIPLIER));
  }

  /**
   * Erase a line between two points, respecting brush settings and spacing
   */
  private eraseLineBetweenPoints(x1: number, y1: number, x2: number, y2: number) {
    const size = toolSizes.eraser.value;
    const spacing = this.getSpacing();

    // For 1px brush, use pixel-by-pixel erasing (supports pixel-perfect mode)
    if (size === 1) {
      this.eraseLinePixelByPixel(x1, y1, x2, y2);
      return;
    }

    // For larger brushes, use spacing-based stamping
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0) return;

    // Normalize direction
    const dirX = dx / distance;
    const dirY = dy / distance;

    // Add to accumulated distance
    this.distanceSinceLastStamp += distance;

    // Calculate starting position along the line
    let traveled = 0;

    // Place stamps at spacing intervals
    while (this.distanceSinceLastStamp >= spacing) {
      // Calculate how far along the line to place this stamp
      const stampDistance = spacing - (this.distanceSinceLastStamp - distance + traveled);

      if (stampDistance > 0 && stampDistance <= distance) {
        const stampX = Math.round(x1 + dirX * stampDistance);
        const stampY = Math.round(y1 + dirY * stampDistance);
        this.erasePoint(stampX, stampY);
        traveled = stampDistance;
      }

      this.distanceSinceLastStamp -= spacing;
    }
  }

  /**
   * Erase line pixel-by-pixel (for 1px brushes, supports pixel-perfect mode)
   */
  private eraseLinePixelByPixel(x1: number, y1: number, x2: number, y2: number) {
    const brush = brushStore.activeBrush.value;
    const points = bresenhamLine(x1, y1, x2, y2);

    // Skip first point as it was already erased in the previous call
    const startIndex = this.erasedPoints.length > 0 ? 1 : 0;

    for (let i = startIndex; i < points.length; i++) {
      const point = points[i];

      // Pixel-perfect mode: remove L-shaped corners
      if (brush.pixelPerfect && this.erasedPoints.length >= 2) {
        const p1 = this.erasedPoints[this.erasedPoints.length - 2];
        const p2 = this.erasedPoints[this.erasedPoints.length - 1];

        if (isLShape(p1, p2, point)) {
          // Restore the corner pixel (p2) to its pre-stroke state
          this.restorePoint(p2.x, p2.y);
          this.erasedPoints.pop();
        }
      }

      this.erasePoint(point.x, point.y);
      this.erasedPoints.push(point);
    }
  }

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
    const canvasWidth = this.projectContext.project.width.value;
    const canvasHeight = this.projectContext.project.height.value;
    const mirrorPositions = this.projectContext.guides.getMirrorPositions(
      x,
      y,
      canvasWidth,
      canvasHeight
    );

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
      this.context.fillStyle = this.projectContext.colors.secondaryColor.value;
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
   * Check if a point was erased earlier in the current stroke (path crosses itself)
   */
  private wasErasedEarlierInStroke(x: number, y: number): boolean {
    // Check all points except the last one (which is the point we're about to restore)
    for (let i = 0; i < this.erasedPoints.length - 1; i++) {
      if (this.erasedPoints[i].x === x && this.erasedPoints[i].y === y) {
        return true;
      }
    }
    return false;
  }

  /**
   * Restore a single pixel to its pre-stroke state (for pixel-perfect L-shape removal)
   */
  private restorePoint(x: number, y: number) {
    if (!this.context) return;

    // Restore the original point
    this.restoreSinglePixel(x, y);

    // Also restore mirrored positions
    const canvasWidth = this.projectContext.project.width.value;
    const canvasHeight = this.projectContext.project.height.value;
    const mirrorPositions = this.projectContext.guides.getMirrorPositions(
      x,
      y,
      canvasWidth,
      canvasHeight
    );

    for (const pos of mirrorPositions) {
      this.restoreSinglePixel(pos.x, pos.y);
    }
  }

  /**
   * Restore a single pixel at the given position (helper for restorePoint)
   */
  private restoreSinglePixel(x: number, y: number) {
    if (!this.context) return;

    // If this point was erased earlier in the current stroke (path crosses itself),
    // don't restore it - just leave it as is
    if (this.wasErasedEarlierInStroke(x, y)) {
      return;
    }

    this.strokeSession.restorePixel(this.context, x, y);
  }

  /**
   * Get the last stroke end position (for Shift+Click feature)
   */
  static getLastStrokeEnd(): Point | null {
    return EraserTool.lastStrokeEnd;
  }
}
