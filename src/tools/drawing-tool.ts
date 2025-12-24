/**
 * DrawingTool - Abstract base class for pencil and eraser tools.
 *
 * Extracts shared functionality:
 * - Stroke tracking (isDrawing, lastX, lastY)
 * - Shift+Drag axis locking
 * - Shift+Click line drawing from last stroke
 * - Pixel-perfect L-shape detection and restoration
 * - Mirror position handling
 *
 * Subclasses implement:
 * - applyPoint() - how to draw/erase a single point
 * - getToolSize() - current brush size
 * - initializeStrokeState() - tool-specific setup on stroke start
 * - cleanupStrokeState() - tool-specific cleanup on stroke end
 */

import { BaseTool, type Point, type ModifierKeys } from './base-tool';
import { brushStore } from '../stores/brush';
import { guidesStore } from '../stores/guides';
import { projectStore } from '../stores/project';
import { paletteStore } from '../stores/palette';
import { animationStore } from '../stores/animation';
import { layerStore } from '../stores/layers';
import {
  bresenhamLine,
  constrainWithStickyAngles,
  isLShape,
} from '../services/drawing/algorithms';
import { setIndexBufferPixel } from '../utils/indexed-color';

// Distance threshold as percentage of spacing (0.3 = within 30% of spacing distance)
const DISTANCE_THRESHOLD = 0.3;

/**
 * Find the nearest grid point to a cursor position.
 */
function getNearestGridPoint(
  x: number,
  y: number,
  originX: number,
  originY: number,
  spacing: number
): { x: number; y: number } {
  const nearestX = Math.round((x - originX) / spacing) * spacing + originX;
  const nearestY = Math.round((y - originY) / spacing) * spacing + originY;
  return { x: nearestX, y: nearestY };
}

/**
 * Check if cursor is close enough to a grid point to trigger a stamp.
 */
function isWithinThreshold(
  cursorX: number,
  cursorY: number,
  gridX: number,
  gridY: number,
  spacing: number
): boolean {
  const dx = cursorX - gridX;
  const dy = cursorY - gridY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const threshold = spacing * DISTANCE_THRESHOLD;
  return distance <= threshold;
}

export abstract class DrawingTool extends BaseTool {
  // Stroke state
  protected isDrawing = false;
  protected lastX = 0;
  protected lastY = 0;

  // For pixel-perfect mode: track applied points for L-shape detection
  protected appliedPoints: Point[] = [];

  // Track drag start for constrained angle drawing
  protected dragStartX = 0;
  protected dragStartY = 0;

  // Locked axis for shift-drag (null = not yet determined, 'h' = horizontal, 'v' = vertical)
  protected lockedAxis: 'h' | 'v' | null = null;

  // Grid-based spacing: origin point defines grid anchor
  protected strokeOriginX = 0;
  protected strokeOriginY = 0;

  // Track last stamp position for grid-based spacing
  protected lastStampX = 0;
  protected lastStampY = 0;

  // Track stamp positions for pixel-perfect at stamp level
  protected stampPositions: Point[] = [];

  // Snapshot of canvas before current stroke (for pixel-perfect restore)
  protected strokeStartSnapshot: ImageData | null = null;

  // Cached index buffer for current stroke
  protected currentIndexBuffer: Uint8Array | null = null;

  constructor(context: CanvasRenderingContext2D) {
    super();
    this.setContext(context);
  }

  // ============= Abstract Methods (implement in subclasses) =============

  /**
   * Apply the tool effect at a single point (draw or erase).
   */
  protected abstract applyPoint(x: number, y: number): void;

  /**
   * Get the current tool size.
   */
  protected abstract getToolSize(): number;

  /**
   * Get the spacing between stamps.
   */
  protected abstract getSpacing(): number;

  /**
   * Initialize tool-specific state at stroke start.
   * Called after common initialization.
   */
  protected abstract initializeStrokeState(modifiers?: ModifierKeys): void;

  /**
   * Clean up tool-specific state at stroke end.
   */
  protected abstract cleanupStrokeState(): void;

  /**
   * Get the static lastStrokeEnd for this tool class.
   * Each tool class (pencil, eraser) maintains its own lastStrokeEnd.
   */
  protected abstract getLastStrokeEnd(): Point | null;

  /**
   * Set the static lastStrokeEnd for this tool class.
   */
  protected abstract setLastStrokeEnd(point: Point | null): void;

  /**
   * Whether to use Ctrl+Shift angle snapping on shift-click lines.
   */
  protected supportsAngleSnapping(): boolean {
    return false;
  }

  // ============= Common Implementation =============

  onDown(x: number, y: number, modifiers?: ModifierKeys) {
    if (!this.context) return;

    this.isDrawing = true;
    const currentX = Math.floor(x);
    const currentY = Math.floor(y);

    // Capture canvas state before stroke for pixel-perfect restore
    const canvas = this.context.canvas;
    this.strokeStartSnapshot = this.context.getImageData(0, 0, canvas.width, canvas.height);

    // Initialize indexed color support for this stroke
    const layerId = layerStore.activeLayerId.value;
    const frameId = animationStore.currentFrameId.value;
    if (layerId) {
      this.currentIndexBuffer = animationStore.ensureCelIndexBuffer(layerId, frameId);
    }

    // Tool-specific initialization
    this.initializeStrokeState(modifiers);

    // Shift+Click: draw line from last stroke end to current position
    const lastEnd = this.getLastStrokeEnd();
    if (modifiers?.shift && lastEnd) {
      let endX = currentX;
      let endY = currentY;

      // If Ctrl is also held and tool supports it, snap to angles
      if (modifiers?.ctrl && this.supportsAngleSnapping()) {
        const snapped = constrainWithStickyAngles(lastEnd.x, lastEnd.y, currentX, currentY);
        endX = snapped.x;
        endY = snapped.y;
      }

      this.appliedPoints = [{ x: lastEnd.x, y: lastEnd.y }];
      this.drawLineBetweenPoints(lastEnd.x, lastEnd.y, endX, endY);
      this.lastX = endX;
      this.lastY = endY;
      this.setLastStrokeEnd({ x: endX, y: endY });
      return;
    }

    this.lastX = currentX;
    this.lastY = currentY;
    this.dragStartX = currentX;
    this.dragStartY = currentY;
    this.lockedAxis = null;
    this.appliedPoints = [{ x: this.lastX, y: this.lastY }];
    this.stampPositions = [];

    // Initialize grid-based spacing
    this.strokeOriginX = currentX;
    this.strokeOriginY = currentY;
    this.lastStampX = currentX;
    this.lastStampY = currentY;

    this.applyPoint(this.lastX, this.lastY);
  }

  onDrag(x: number, y: number, modifiers?: ModifierKeys) {
    if (!this.isDrawing || !this.context) return;

    let currentX = Math.floor(x);
    let currentY = Math.floor(y);

    // Shift+Drag: constrain to locked axis
    if (modifiers?.shift) {
      const dx = Math.abs(currentX - this.dragStartX);
      const dy = Math.abs(currentY - this.dragStartY);

      // Lock axis on first significant movement
      if (this.lockedAxis === null && (dx >= 1 || dy >= 1)) {
        this.lockedAxis = dx >= dy ? 'h' : 'v';
      }

      if (this.lockedAxis === 'h') {
        currentY = this.dragStartY;
      } else if (this.lockedAxis === 'v') {
        currentX = this.dragStartX;
      }
    }

    if (this.lastX === currentX && this.lastY === currentY) return;

    this.drawLineBetweenPoints(this.lastX, this.lastY, currentX, currentY);

    this.lastX = currentX;
    this.lastY = currentY;
  }

  onUp(_x: number, _y: number, _modifiers?: ModifierKeys) {
    if (this.isDrawing) {
      this.setLastStrokeEnd({ x: this.lastX, y: this.lastY });
    }
    this.isDrawing = false;
    this.appliedPoints = [];
    this.stampPositions = [];
    this.strokeStartSnapshot = null;
    this.currentIndexBuffer = null;
    this.cleanupStrokeState();
  }

  onMove(x: number, y: number, modifiers?: ModifierKeys) {
    const lastEnd = this.getLastStrokeEnd();
    if (modifiers?.shift && lastEnd) {
      window.dispatchEvent(new CustomEvent('line-preview', {
        detail: {
          start: lastEnd,
          end: { x: Math.floor(x), y: Math.floor(y) }
        }
      }));
    } else {
      window.dispatchEvent(new CustomEvent('line-preview-clear'));
    }
  }

  /**
   * Draw a line between two points using grid-based spacing.
   */
  protected drawLineBetweenPoints(x1: number, y1: number, x2: number, y2: number) {
    const size = this.getToolSize();
    const spacing = this.getSpacing();
    const brush = brushStore.activeBrush.value;

    // For 1px brush with 1px spacing, use pixel-by-pixel drawing
    if (size === 1 && spacing === 1) {
      this.drawLinePixelByPixel(x1, y1, x2, y2);
      return;
    }

    // Grid-aligned stamping
    const pixelPerfectStamps = brush.pixelPerfect && brush.spacing === 'match';

    const { x: gridX, y: gridY } = getNearestGridPoint(
      x2, y2,
      this.strokeOriginX, this.strokeOriginY,
      spacing
    );

    if (gridX === this.lastStampX && gridY === this.lastStampY) {
      return;
    }

    if (!isWithinThreshold(x2, y2, gridX, gridY, spacing)) {
      return;
    }

    // Fill intermediate grid points for fast movements
    const gridDx = (gridX - this.lastStampX) / spacing;
    const gridDy = (gridY - this.lastStampY) / spacing;
    const gridSteps = Math.min(
      Math.max(Math.abs(gridDx), Math.abs(gridDy)),
      100
    );

    if (gridSteps <= 1) {
      this.placeStamp(gridX, gridY, pixelPerfectStamps, spacing);
    } else {
      const stepX = gridDx / gridSteps;
      const stepY = gridDy / gridSteps;
      const startX = this.lastStampX;
      const startY = this.lastStampY;

      for (let i = 1; i <= gridSteps; i++) {
        const interpX = startX + Math.round(stepX * i) * spacing;
        const interpY = startY + Math.round(stepY * i) * spacing;
        this.placeStamp(interpX, interpY, pixelPerfectStamps, spacing);
      }
    }
  }

  /**
   * Place a stamp at the given grid position.
   */
  protected placeStamp(x: number, y: number, pixelPerfect: boolean, spacing: number) {
    if (x === this.lastStampX && y === this.lastStampY) {
      return;
    }

    if (pixelPerfect && this.stampPositions.length >= 2) {
      const p1 = this.stampPositions[this.stampPositions.length - 2];
      const p2 = this.stampPositions[this.stampPositions.length - 1];
      const p3 = { x, y };

      if (this.isStampLShape(p1, p2, p3, spacing)) {
        this.restoreStamp(p2.x, p2.y);
        this.stampPositions.pop();
        if (this.stampPositions.length > 0) {
          const prev = this.stampPositions[this.stampPositions.length - 1];
          this.lastStampX = prev.x;
          this.lastStampY = prev.y;
        }
      }
    }

    this.applyPoint(x, y);
    this.lastStampX = x;
    this.lastStampY = y;

    if (pixelPerfect) {
      this.stampPositions.push({ x, y });
    }
  }

  /**
   * Check if three stamp positions form an L-shape.
   */
  protected isStampLShape(p1: Point, p2: Point, p3: Point, spacing: number): boolean {
    const g1 = { x: Math.round(p1.x / spacing), y: Math.round(p1.y / spacing) };
    const g2 = { x: Math.round(p2.x / spacing), y: Math.round(p2.y / spacing) };
    const g3 = { x: Math.round(p3.x / spacing), y: Math.round(p3.y / spacing) };
    return isLShape(g1, g2, g3);
  }

  /**
   * Draw line pixel-by-pixel (for 1px brushes).
   */
  protected drawLinePixelByPixel(x1: number, y1: number, x2: number, y2: number) {
    const brush = brushStore.activeBrush.value;
    const points = bresenhamLine(x1, y1, x2, y2);

    const startIndex = this.appliedPoints.length > 0 ? 1 : 0;

    for (let i = startIndex; i < points.length; i++) {
      const point = points[i];

      // Pixel-perfect mode: remove L-shaped corners
      if (brush.pixelPerfect && this.appliedPoints.length >= 2) {
        const p1 = this.appliedPoints[this.appliedPoints.length - 2];
        const p2 = this.appliedPoints[this.appliedPoints.length - 1];

        if (isLShape(p1, p2, point)) {
          this.restorePoint(p2.x, p2.y);
          this.appliedPoints.pop();
        }
      }

      this.applyPoint(point.x, point.y);
      this.appliedPoints.push(point);
    }
  }

  /**
   * Check if a point was applied earlier in the current stroke.
   */
  protected wasAppliedEarlierInStroke(x: number, y: number): boolean {
    for (let i = 0; i < this.appliedPoints.length - 1; i++) {
      if (this.appliedPoints[i].x === x && this.appliedPoints[i].y === y) {
        return true;
      }
    }
    return false;
  }

  /**
   * Restore a point to its pre-stroke state (for pixel-perfect).
   */
  protected restorePoint(x: number, y: number) {
    if (!this.context) return;

    this.restoreSinglePixel(x, y);

    // Also restore mirrored positions
    const canvasWidth = projectStore.width.value;
    const canvasHeight = projectStore.height.value;
    const mirrorPositions = guidesStore.getMirrorPositions(x, y, canvasWidth, canvasHeight);

    for (const pos of mirrorPositions) {
      this.restoreSinglePixel(pos.x, pos.y);
    }
  }

  /**
   * Restore a single pixel at the given position.
   */
  protected restoreSinglePixel(x: number, y: number) {
    if (!this.context) return;

    // Don't restore if this point was applied earlier in stroke
    if (this.wasAppliedEarlierInStroke(x, y)) {
      return;
    }

    if (!this.strokeStartSnapshot) {
      this.context.clearRect(x, y, 1, 1);
      if (this.currentIndexBuffer) {
        setIndexBufferPixel(this.currentIndexBuffer, this.context.canvas.width, x, y, 0);
      }
      return;
    }

    const canvas = this.context.canvas;
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;

    const index = (y * this.strokeStartSnapshot.width + x) * 4;
    const r = this.strokeStartSnapshot.data[index];
    const g = this.strokeStartSnapshot.data[index + 1];
    const b = this.strokeStartSnapshot.data[index + 2];
    const a = this.strokeStartSnapshot.data[index + 3];

    if (a === 0) {
      this.context.clearRect(x, y, 1, 1);
      if (this.currentIndexBuffer) {
        setIndexBufferPixel(this.currentIndexBuffer, canvas.width, x, y, 0);
      }
    } else {
      this.context.fillStyle = `rgba(${r}, ${g}, ${b}, ${a / 255})`;
      this.context.globalAlpha = 1;
      this.context.fillRect(x, y, 1, 1);
      if (this.currentIndexBuffer) {
        const hex = '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
        const originalIndex = paletteStore.getColorIndex(hex);
        setIndexBufferPixel(this.currentIndexBuffer, canvas.width, x, y, originalIndex);
      }
    }
  }

  /**
   * Restore a stamp area to its pre-stroke state.
   */
  protected restoreStamp(x: number, y: number) {
    if (!this.context || !this.strokeStartSnapshot) return;

    this.restoreSingleStamp(x, y);

    const canvasWidth = projectStore.width.value;
    const canvasHeight = projectStore.height.value;
    const mirrorPositions = guidesStore.getMirrorPositions(x, y, canvasWidth, canvasHeight);

    for (const pos of mirrorPositions) {
      this.restoreSingleStamp(pos.x, pos.y);
    }
  }

  /**
   * Restore a single stamp area at the given position.
   */
  protected restoreSingleStamp(x: number, y: number) {
    if (!this.context || !this.strokeStartSnapshot) return;

    const size = this.getToolSize();
    const halfSize = Math.floor(size / 2);
    const startX = x - halfSize;
    const startY = y - halfSize;
    const canvas = this.context.canvas;

    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const pixelX = startX + px;
        const pixelY = startY + py;

        if (pixelX < 0 || pixelY < 0 || pixelX >= canvas.width || pixelY >= canvas.height) continue;

        const index = (pixelY * this.strokeStartSnapshot.width + pixelX) * 4;
        const r = this.strokeStartSnapshot.data[index];
        const g = this.strokeStartSnapshot.data[index + 1];
        const b = this.strokeStartSnapshot.data[index + 2];
        const a = this.strokeStartSnapshot.data[index + 3];

        if (a === 0) {
          this.context.clearRect(pixelX, pixelY, 1, 1);
          if (this.currentIndexBuffer) {
            setIndexBufferPixel(this.currentIndexBuffer, canvas.width, pixelX, pixelY, 0);
          }
        } else {
          this.context.fillStyle = `rgba(${r}, ${g}, ${b}, ${a / 255})`;
          this.context.globalAlpha = 1;
          this.context.fillRect(pixelX, pixelY, 1, 1);
          if (this.currentIndexBuffer) {
            const hex = '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
            const originalIndex = paletteStore.getColorIndex(hex);
            setIndexBufferPixel(this.currentIndexBuffer, canvas.width, pixelX, pixelY, originalIndex);
          }
        }
      }
    }
  }
}
