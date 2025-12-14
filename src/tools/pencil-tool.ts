import { BaseTool, type Point, type ModifierKeys } from './base-tool';
import { colorStore } from '../stores/colors';
import { brushStore } from '../stores/brush';
import { toolSizes } from '../stores/tool-settings';
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

  // Snapshot of canvas before current stroke (for pixel-perfect restore)
  private strokeStartSnapshot: ImageData | null = null;

  // Cached index buffer and palette index for current stroke
  private currentIndexBuffer: Uint8Array | null = null;
  private currentPaletteIndex: number = 0;

  constructor(context: CanvasRenderingContext2D) {
    super();
    this.setContext(context);
  }

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
      // Ensure cel has an index buffer (creates if needed, migrates from canvas if has content)
      this.currentIndexBuffer = animationStore.ensureCelIndexBuffer(layerId, frameId);
      // Get or add color to palette, get the palette index
      // Use ephemeral color system for shade-generated colors to avoid polluting main palette
      const color = colorStore.primaryColor.value;
      if (colorStore.isEphemeralColor.value) {
        this.currentPaletteIndex = paletteStore.getOrAddEphemeralColor(color);
      } else {
        this.currentPaletteIndex = paletteStore.getOrAddColor(color);
      }
    }

    // Shift+Click: draw line from last stroke end to current position
    // Ctrl+Shift+Click: angle-snapped line (45 degree increments)
    if (modifiers?.shift && PencilTool.lastStrokeEnd) {
      const start = PencilTool.lastStrokeEnd;
      let endX = currentX;
      let endY = currentY;

      // If Ctrl is also held, snap to 15-degree angles with sticky zones
      if (modifiers?.ctrl) {
        const snapped = constrainWithStickyAngles(start.x, start.y, currentX, currentY);
        endX = snapped.x;
        endY = snapped.y;
      }

      this.drawnPoints = [{ x: start.x, y: start.y }];
      this.drawLineBetweenPoints(start.x, start.y, endX, endY);
      this.lastX = endX;
      this.lastY = endY;
      // Update last stroke end immediately for chained shift-clicks
      PencilTool.lastStrokeEnd = { x: endX, y: endY };
      return;
    }

    this.lastX = currentX;
    this.lastY = currentY;
    this.dragStartX = currentX;
    this.dragStartY = currentY;
    this.lockedAxis = null; // Reset axis lock for new stroke
    this.drawnPoints = [{ x: this.lastX, y: this.lastY }];
    this.stampPositions = []; // Reset stamp tracking for pixel-perfect at stamp level

    // Initialize grid-based spacing: first click defines grid origin
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
    this.strokeStartSnapshot = null; // Free memory
    this.currentIndexBuffer = null;
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
    if (!this.context || !this.strokeStartSnapshot) return;

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
    if (!this.context || !this.strokeStartSnapshot) return;

    const size = toolSizes.pencil.value;
    // x/y is the center of the stamp
    const halfSize = Math.floor(size / 2);
    const startX = x - halfSize;
    const startY = y - halfSize;
    const canvas = this.context.canvas;

    // Restore each pixel in the stamp region
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const pixelX = startX + px;
        const pixelY = startY + py;

        if (pixelX < 0 || pixelY < 0 || pixelX >= canvas.width || pixelY >= canvas.height) continue;

        // Get original pixel from snapshot
        const index = (pixelY * this.strokeStartSnapshot.width + pixelX) * 4;
        const r = this.strokeStartSnapshot.data[index];
        const g = this.strokeStartSnapshot.data[index + 1];
        const b = this.strokeStartSnapshot.data[index + 2];
        const a = this.strokeStartSnapshot.data[index + 3];

        if (a === 0) {
          this.context.clearRect(pixelX, pixelY, 1, 1);
          // Also clear index buffer
          if (this.currentIndexBuffer) {
            setIndexBufferPixel(this.currentIndexBuffer, canvas.width, pixelX, pixelY, 0);
          }
        } else {
          this.context.fillStyle = `rgba(${r}, ${g}, ${b}, ${a / 255})`;
          this.context.globalAlpha = 1;
          this.context.fillRect(pixelX, pixelY, 1, 1);
          // Restore index buffer
          if (this.currentIndexBuffer) {
            const hex = '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
            const originalIndex = paletteStore.getColorIndex(hex);
            setIndexBufferPixel(this.currentIndexBuffer, canvas.width, pixelX, pixelY, originalIndex);
          }
        }
      }
    }
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
    const size = toolSizes.pencil.value;
    const canvasWidth = this.context.canvas.width;

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
    const canvasHeight = projectStore.height.value;
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
    if (!this.strokeStartSnapshot) {
      this.context.clearRect(x, y, 1, 1);
      // Also clear index buffer
      if (this.currentIndexBuffer) {
        setIndexBufferPixel(this.currentIndexBuffer, this.context.canvas.width, x, y, 0);
      }
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
      // Also clear index buffer
      if (this.currentIndexBuffer) {
        setIndexBufferPixel(this.currentIndexBuffer, canvas.width, x, y, 0);
      }
    } else {
      // Restore original color
      this.context.fillStyle = `rgba(${r}, ${g}, ${b}, ${a / 255})`;
      this.context.globalAlpha = 1;
      this.context.fillRect(x, y, 1, 1);
      // Restore index buffer - get the original color's palette index
      if (this.currentIndexBuffer) {
        const hex = '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
        const originalIndex = paletteStore.getColorIndex(hex);
        setIndexBufferPixel(this.currentIndexBuffer, canvas.width, x, y, originalIndex);
      }
    }
  }

  /**
   * Get the last stroke end position (for Shift+Click feature)
   */
  static getLastStrokeEnd(): Point | null {
    return PencilTool.lastStrokeEnd;
  }
}
