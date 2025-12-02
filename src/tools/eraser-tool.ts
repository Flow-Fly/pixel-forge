import { BaseTool, type Point, type ModifierKeys } from './base-tool';
import { colorStore } from '../stores/colors';
import { brushStore } from '../stores/brush';
import {
  bresenhamLine,
  constrainTo45Degrees,
  isLShape,
} from '../services/drawing/algorithms';

// Default spacing multiplier (0.25 = stamp every size/4 pixels)
const SPACING_MULTIPLIER = 0.25;

export type EraserMode = 'transparent' | 'background';

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

  // Track distance since last stamp for brush spacing
  private distanceSinceLastStamp = 0;

  // Snapshot of canvas before current stroke (for pixel-perfect restore)
  private strokeStartSnapshot: ImageData | null = null;

  // Eraser mode: transparent (default) or background color
  private static eraserMode: EraserMode = 'transparent';

  constructor(context: CanvasRenderingContext2D) {
    super();
    this.setContext(context);
  }

  static setMode(mode: EraserMode) {
    EraserTool.eraserMode = mode;
  }

  static getMode(): EraserMode {
    return EraserTool.eraserMode;
  }

  onDown(x: number, y: number, modifiers?: ModifierKeys) {
    if (!this.context) return;

    this.isDrawing = true;
    const currentX = Math.floor(x);
    const currentY = Math.floor(y);

    // Capture canvas state before stroke for pixel-perfect restore
    const canvas = this.context.canvas;
    this.strokeStartSnapshot = this.context.getImageData(0, 0, canvas.width, canvas.height);

    // Shift+Click: erase line from last stroke end to current position
    if (modifiers?.shift && EraserTool.lastStrokeEnd) {
      const start = EraserTool.lastStrokeEnd;
      this.erasedPoints = [{ x: start.x, y: start.y }];
      this.eraseLineBetweenPoints(start.x, start.y, currentX, currentY);
      this.lastX = currentX;
      this.lastY = currentY;
      // Update last stroke end immediately for chained shift-clicks
      EraserTool.lastStrokeEnd = { x: currentX, y: currentY };
      return;
    }

    this.lastX = currentX;
    this.lastY = currentY;
    this.dragStartX = currentX;
    this.dragStartY = currentY;
    this.erasedPoints = [{ x: this.lastX, y: this.lastY }];
    this.distanceSinceLastStamp = 0;
    this.erasePoint(this.lastX, this.lastY);
  }

  onDrag(x: number, y: number, modifiers?: ModifierKeys) {
    if (!this.isDrawing || !this.context) return;

    let currentX = Math.floor(x);
    let currentY = Math.floor(y);

    // Shift+Drag: constrain to 45-degree angles from drag start
    if (modifiers?.shift) {
      const constrained = constrainTo45Degrees(
        this.dragStartX,
        this.dragStartY,
        currentX,
        currentY
      );
      currentX = constrained.x;
      currentY = constrained.y;
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
    this.strokeStartSnapshot = null; // Free memory
  }

  /**
   * Calculate brush spacing based on size
   */
  private getSpacing(): number {
    const brush = brushStore.activeBrush.value;
    // For size 1, always use spacing of 1 (pixel-by-pixel)
    // For larger brushes, use spacing based on size
    return Math.max(1, Math.floor(brush.size * SPACING_MULTIPLIER));
  }

  /**
   * Erase a line between two points, respecting brush settings and spacing
   */
  private eraseLineBetweenPoints(x1: number, y1: number, x2: number, y2: number) {
    const brush = brushStore.activeBrush.value;
    const spacing = this.getSpacing();

    // For 1px brush, use pixel-by-pixel erasing (supports pixel-perfect mode)
    if (brush.size === 1) {
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
    const size = brush.size;
    const halfSize = Math.floor(size / 2);

    if (EraserTool.eraserMode === 'background') {
      // Fill with secondary (background) color
      this.context.fillStyle = colorStore.secondaryColor.value;
      this.context.globalAlpha = brush.opacity;

      if (brush.shape === 'square') {
        this.context.fillRect(x - halfSize, y - halfSize, size, size);
      } else {
        // Circle
        this.context.beginPath();
        this.context.arc(x, y, size / 2, 0, Math.PI * 2);
        this.context.fill();
      }

      this.context.globalAlpha = 1;
    } else {
      // Transparent mode - clear pixels
      if (brush.shape === 'square') {
        this.context.clearRect(x - halfSize, y - halfSize, size, size);
      } else {
        // For circle eraser, we need to clear individual pixels in circle pattern
        // Use a clipping path approach
        this.context.save();
        this.context.beginPath();
        this.context.arc(x, y, size / 2, 0, Math.PI * 2);
        this.context.clip();
        this.context.clearRect(x - halfSize - 1, y - halfSize - 1, size + 2, size + 2);
        this.context.restore();
      }
    }

    // Mark dirty region for partial redraw
    this.markDirty(x, y);
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

    // If this point was erased earlier in the current stroke (path crosses itself),
    // don't restore it - just leave it as is
    if (this.wasErasedEarlierInStroke(x, y)) {
      return;
    }

    // If no snapshot, we can't restore (shouldn't happen)
    if (!this.strokeStartSnapshot) {
      return;
    }

    const canvas = this.context.canvas;
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;

    // Get the original pixel color from the snapshot
    const index = (y * this.strokeStartSnapshot.width + x) * 4;
    const r = this.strokeStartSnapshot.data[index];
    const g = this.strokeStartSnapshot.data[index + 1];
    const b = this.strokeStartSnapshot.data[index + 2];
    const a = this.strokeStartSnapshot.data[index + 3];

    // Restore the pixel
    if (a === 0) {
      // Original was transparent, clear it
      this.context.clearRect(x, y, 1, 1);
    } else {
      // Restore original color
      this.context.fillStyle = `rgba(${r}, ${g}, ${b}, ${a / 255})`;
      this.context.globalAlpha = 1;
      this.context.fillRect(x, y, 1, 1);
    }
  }

  /**
   * Get the last stroke end position (for Shift+Click feature)
   */
  static getLastStrokeEnd(): Point | null {
    return EraserTool.lastStrokeEnd;
  }
}
