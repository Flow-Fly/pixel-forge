import { BaseTool, type Point, type ModifierKeys } from './base-tool';
import { colorStore } from '../stores/colors';
import { brushStore } from '../stores/brush';
import { toolSizes } from '../stores/tool-settings';
import { guidesStore } from '../stores/guides';
import { projectStore } from '../stores/project';
import { paletteStore } from '../stores/palette';
import {
  bresenhamLine,
  constrainWithStickyAngles,
  isLShape,
} from '../services/drawing/algorithms';
import { setIndexBufferPixel } from '../utils/indexed-color';
import { StrokeSession } from './stroke-session';

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
 * Uses Euclidean distance, not independent axis checks.
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

export class PencilTool extends BaseTool {
  name = 'pencil';
  cursor = 'crosshair';

  private isDrawing = false;
  private lastX = 0;
  private lastY = 0;

  // For pixel-perfect mode: track drawn points for L-shape detection
  private drawnPoints: Point[] = [];

  // Track last stroke end for Shift+Click line feature
  private static lastStrokeEnd: Point | null = null;

  // Track drag start for constrained angle drawing
  private dragStartX = 0;
  private dragStartY = 0;

  // Locked axis for shift-drag (null = not yet determined, 'h' = horizontal, 'v' = vertical)
  private lockedAxis: 'h' | 'v' | null = null;

  // Grid-based spacing: origin point defines grid anchor
  private strokeOriginX = 0;
  private strokeOriginY = 0;

  // Track last stamp position for grid-based spacing
  private lastStampX = 0;
  private lastStampY = 0;

  // Track stamp positions for pixel-perfect at stamp level
  private stampPositions: Point[] = [];

  private strokeSession = new StrokeSession();

  // Cached palette index for current stroke
  private currentPaletteIndex: number = 0;

  private get currentIndexBuffer(): Uint8Array | null {
    return this.strokeSession.indexBuffer;
  }

  constructor(context: CanvasRenderingContext2D) {
    super();
    this.setContext(context);
  }

  onDown(x: number, y: number, modifiers?: ModifierKeys) {
    if (!this.context) return;

    this.isDrawing = true;
    const currentX = Math.floor(x);
    const currentY = Math.floor(y);

    this.beginStrokeSession();

    // Shift+Click: draw line from last stroke end to current position
    // Ctrl+Shift+Click: angle-snapped line (45 degree increments)
    if (modifiers?.shift && PencilTool.lastStrokeEnd) {
      this.drawShiftClickStroke(currentX, currentY, modifiers.ctrl);
      return;
    }

    this.startFreehandStroke(currentX, currentY);
  }

  private beginStrokeSession() {
    if (!this.context) return;

    this.strokeSession.begin(this.context);

    if (!this.currentIndexBuffer) {
      return;
    }

    // Adds generated shades to the ephemeral palette when needed.
    const color = colorStore.primaryColor.value;
    this.currentPaletteIndex = paletteStore.getOrAddColorForDrawing(color);
  }

  private drawShiftClickStroke(currentX: number, currentY: number, snapToAngles?: boolean) {
    const start = PencilTool.lastStrokeEnd;
    if (!start) return;

    const end = snapToAngles
      ? constrainWithStickyAngles(start.x, start.y, currentX, currentY)
      : { x: currentX, y: currentY };

    this.drawnPoints = [{ x: start.x, y: start.y }];
    this.drawLineBetweenPoints(start.x, start.y, end.x, end.y);
    this.lastX = end.x;
    this.lastY = end.y;
    PencilTool.lastStrokeEnd = { x: end.x, y: end.y };
  }

  private startFreehandStroke(currentX: number, currentY: number) {
    this.lastX = currentX;
    this.lastY = currentY;
    this.dragStartX = currentX;
    this.dragStartY = currentY;
    this.lockedAxis = null;
    this.drawnPoints = [{ x: this.lastX, y: this.lastY }];
    this.stampPositions = [];

    this.strokeOriginX = currentX;
    this.strokeOriginY = currentY;
    this.lastStampX = currentX;
    this.lastStampY = currentY;

    this.drawPoint(this.lastX, this.lastY);
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

    this.drawLineBetweenPoints(this.lastX, this.lastY, currentX, currentY);

    this.lastX = currentX;
    this.lastY = currentY;
  }

  onUp(_x: number, _y: number, _modifiers?: ModifierKeys) {
    // Store last stroke end for Shift+Click feature
    if (this.isDrawing) {
      PencilTool.lastStrokeEnd = { x: this.lastX, y: this.lastY };
    }
    this.isDrawing = false;
    this.drawnPoints = [];
    this.stampPositions = [];
    this.strokeSession.clear();
    this.currentPaletteIndex = 0;
  }

  onMove(x: number, y: number, modifiers?: ModifierKeys) {
    // Emit preview line when shift held + lastStrokeEnd exists (for shift-click preview)
    if (modifiers?.shift && PencilTool.lastStrokeEnd) {
      window.dispatchEvent(new CustomEvent('line-preview', {
        detail: {
          start: PencilTool.lastStrokeEnd,
          end: { x: Math.floor(x), y: Math.floor(y) }
        }
      }));
    } else {
      window.dispatchEvent(new CustomEvent('line-preview-clear'));
    }
  }

  /**
   * Calculate brush spacing based on brush settings
   */
  private getSpacing(): number {
    return brushStore.getEffectiveSpacing();
  }

  /**
   * Draw a line between two points, respecting brush settings and spacing
   */
  private drawLineBetweenPoints(x1: number, y1: number, x2: number, y2: number) {
    const brush = brushStore.activeBrush.value;
    const size = toolSizes.pencil.value;
    const spacing = this.getSpacing();

    // For 1px brush with 1px spacing, use pixel-by-pixel drawing (supports pixel-perfect mode)
    if (size === 1 && spacing === 1) {
      this.drawLinePixelByPixel(x1, y1, x2, y2);
      return;
    }

    // For larger brushes or spacing > 1, use grid-aligned stamping
    // Grid is anchored to stroke origin, stamps placed at grid intersections
    const pixelPerfectStamps = brush.pixelPerfect && brush.spacing === 'match';

    // Find the nearest grid point to current cursor position
    const { x: gridX, y: gridY } = getNearestGridPoint(
      x2, y2,
      this.strokeOriginX, this.strokeOriginY,
      spacing
    );

    // Only draw if:
    // 1. It's a new grid position (not already stamped)
    // 2. Cursor is close enough to that grid point (within distance threshold)
    if (gridX === this.lastStampX && gridY === this.lastStampY) {
      return;
    }

    if (!isWithinThreshold(x2, y2, gridX, gridY, spacing)) {
      return;
    }

    // For fast movements, we may need to fill in intermediate grid points
    // Calculate how many grid steps we've moved
    const gridDx = (gridX - this.lastStampX) / spacing;
    const gridDy = (gridY - this.lastStampY) / spacing;
    // Cap gridSteps to prevent freeze when cursor goes out of bounds
    const gridSteps = Math.min(
      Math.max(Math.abs(gridDx), Math.abs(gridDy)),
      100 // Safety cap - prevents runaway loops
    );

    if (gridSteps <= 1) {
      // Single step - just draw at the new grid position
      this.placeStamp(gridX, gridY, pixelPerfectStamps, spacing);
    } else {
      // Multiple steps - interpolate to fill gaps
      // Use movement direction to determine order
      const stepX = gridDx / gridSteps;
      const stepY = gridDy / gridSteps;

      // Track the starting position for interpolation
      const startX = this.lastStampX;
      const startY = this.lastStampY;

      for (let i = 1; i <= gridSteps; i++) {
        // Calculate intermediate grid position
        const interpX = startX + Math.round(stepX * i) * spacing;
        const interpY = startY + Math.round(stepY * i) * spacing;

        this.placeStamp(interpX, interpY, pixelPerfectStamps, spacing);
      }
    }
  }

  /**
   * Place a stamp at the given grid position
   */
  private placeStamp(x: number, y: number, pixelPerfect: boolean, spacing: number) {
    // Skip if same as last stamp
    if (x === this.lastStampX && y === this.lastStampY) {
      return;
    }

    // Pixel-perfect at stamp level: detect L-shapes in stamp positions
    if (pixelPerfect && this.stampPositions.length >= 2) {
      const p1 = this.stampPositions[this.stampPositions.length - 2];
      const p2 = this.stampPositions[this.stampPositions.length - 1];
      const p3 = { x, y };

      if (this.isStampLShape(p1, p2, p3, spacing)) {
        // Restore the stamp at p2
        this.restoreStamp(p2.x, p2.y);
        this.stampPositions.pop();
        // Update lastStamp to p1 since p2 was removed
        if (this.stampPositions.length > 0) {
          const prev = this.stampPositions[this.stampPositions.length - 1];
          this.lastStampX = prev.x;
          this.lastStampY = prev.y;
        }
      }
    }

    this.drawPoint(x, y);
    this.lastStampX = x;
    this.lastStampY = y;

    if (pixelPerfect) {
      this.stampPositions.push({ x, y });
    }
  }

  /**
   * Check if three stamp positions form an L-shape at stamp level.
   */
  private isStampLShape(p1: Point, p2: Point, p3: Point, spacing: number): boolean {
    // Normalize positions to "stamp grid" coordinates
    const g1 = { x: Math.round(p1.x / spacing), y: Math.round(p1.y / spacing) };
    const g2 = { x: Math.round(p2.x / spacing), y: Math.round(p2.y / spacing) };
    const g3 = { x: Math.round(p3.x / spacing), y: Math.round(p3.y / spacing) };

    return isLShape(g1, g2, g3);
  }

  /**
   * Restore a stamp area to its pre-stroke state (for pixel-perfect L-shape removal at stamp level)
   */
  private restoreStamp(x: number, y: number) {
    if (!this.context || !this.strokeSession.hasSnapshot) return;

    // Restore the original stamp
    this.restoreSingleStamp(x, y);

    // Also restore mirrored stamps
    const canvasWidth = projectStore.width.value;
    const canvasHeight = projectStore.height.value;
    const mirrorPositions = guidesStore.getMirrorPositions(x, y, canvasWidth, canvasHeight);

    for (const pos of mirrorPositions) {
      this.restoreSingleStamp(pos.x, pos.y);
    }
  }

  /**
   * Restore a single stamp area at the given position (helper for restoreStamp)
   */
  private restoreSingleStamp(x: number, y: number) {
    if (!this.context || !this.strokeSession.hasSnapshot) return;

    for (const pixel of this.getStampPixels(x, y)) {
      this.strokeSession.restorePixel(this.context, pixel.x, pixel.y);
    }
  }

  private getStampPixels(x: number, y: number): Point[] {
    const size = toolSizes.pencil.value;
    const halfSize = Math.floor(size / 2);
    const startX = x - halfSize;
    const startY = y - halfSize;
    const canvas = this.context?.canvas;
    const pixels: Point[] = [];

    if (!canvas) {
      return pixels;
    }

    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const pixelX = startX + px;
        const pixelY = startY + py;

        if (pixelX < 0 || pixelY < 0 || pixelX >= canvas.width || pixelY >= canvas.height) continue;

        pixels.push({ x: pixelX, y: pixelY });
      }
    }

    return pixels;
  }

  /**
   * Draw line pixel-by-pixel (for 1px brushes, supports pixel-perfect mode)
   */
  private drawLinePixelByPixel(x1: number, y1: number, x2: number, y2: number) {
    const brush = brushStore.activeBrush.value;
    const points = bresenhamLine(x1, y1, x2, y2);

    // Skip first point as it was already drawn in the previous call
    const startIndex = this.drawnPoints.length > 0 ? 1 : 0;

    for (let i = startIndex; i < points.length; i++) {
      const point = points[i];

      // Pixel-perfect mode: remove L-shaped corners
      if (brush.pixelPerfect && this.drawnPoints.length >= 2) {
        const p1 = this.drawnPoints[this.drawnPoints.length - 2];
        const p2 = this.drawnPoints[this.drawnPoints.length - 1];

        if (isLShape(p1, p2, point)) {
          // Restore the corner pixel (p2) to its pre-stroke state
          this.restorePoint(p2.x, p2.y);
          this.drawnPoints.pop();
        }
      }

      this.drawPoint(point.x, point.y);
      this.drawnPoints.push(point);
    }
  }

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
   * Check if a point was drawn earlier in the current stroke (path crosses itself)
   */
  private wasDrawnEarlierInStroke(x: number, y: number): boolean {
    // Check all points except the last one (which is the point we're about to remove)
    for (let i = 0; i < this.drawnPoints.length - 1; i++) {
      if (this.drawnPoints[i].x === x && this.drawnPoints[i].y === y) {
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
    const canvasWidth = projectStore.width.value;
    const canvasHeight = projectStore.height.value;
    const mirrorPositions = guidesStore.getMirrorPositions(x, y, canvasWidth, canvasHeight);

    for (const pos of mirrorPositions) {
      this.restoreSinglePixel(pos.x, pos.y);
    }
  }

  /**
   * Restore a single pixel at the given position (helper for restorePoint)
   */
  private restoreSinglePixel(x: number, y: number) {
    if (!this.context) return;

    // If this point was drawn earlier in the current stroke (path crosses itself),
    // don't restore it - just leave it as is
    if (this.wasDrawnEarlierInStroke(x, y)) {
      return;
    }

    // If no snapshot, fall back to clearing
    if (!this.strokeSession.restorePixel(this.context, x, y)) {
      this.context.clearRect(x, y, 1, 1);
      // Also clear index buffer
      if (this.currentIndexBuffer) {
        setIndexBufferPixel(this.currentIndexBuffer, this.context.canvas.width, x, y, 0);
      }
      return;
    }
  }

  /**
   * Get the last stroke end position (for Shift+Click feature)
   */
  static getLastStrokeEnd(): Point | null {
    return PencilTool.lastStrokeEnd;
  }
}
