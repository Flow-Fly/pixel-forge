import { BaseTool, type Point, type ModifierKeys } from './base-tool';
import { colorStore } from '../stores/colors';
import { brushStore } from '../stores/brush';
import {
  bresenhamLine,
  constrainTo45Degrees,
  isLShape,
} from '../services/drawing/algorithms';

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

  // Track distance since last stamp for brush spacing
  private distanceSinceLastStamp = 0;

  // Track stamp positions for pixel-perfect at stamp level
  private stampPositions: Point[] = [];

  // Snapshot of canvas before current stroke (for pixel-perfect restore)
  private strokeStartSnapshot: ImageData | null = null;

  constructor(context: CanvasRenderingContext2D) {
    super();
    this.setContext(context);
  }

  onDown(x: number, y: number, modifiers?: ModifierKeys) {
    if (!this.context) return;

    this.isDrawing = true;
    let currentX = Math.floor(x);
    let currentY = Math.floor(y);

    // Snap to spacing grid when spacing > 1 (align to grid cell top-left)
    const spacing = this.getSpacing();
    if (spacing > 1) {
      currentX = Math.floor(currentX / spacing) * spacing;
      currentY = Math.floor(currentY / spacing) * spacing;
    }

    // Capture canvas state before stroke for pixel-perfect restore
    const canvas = this.context.canvas;
    this.strokeStartSnapshot = this.context.getImageData(0, 0, canvas.width, canvas.height);

    // Shift+Click: draw line from last stroke end to current position
    // Ctrl+Shift+Click: angle-snapped line (45 degree increments)
    if (modifiers?.shift && PencilTool.lastStrokeEnd) {
      const start = PencilTool.lastStrokeEnd;
      let endX = currentX;
      let endY = currentY;

      // If Ctrl is also held, snap to 45-degree angles
      if (modifiers?.ctrl) {
        const snapped = constrainTo45Degrees(start.x, start.y, currentX, currentY);
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
    this.distanceSinceLastStamp = 0;
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
    const spacing = this.getSpacing();

    // For 1px brush with 1px spacing, use pixel-by-pixel drawing (supports pixel-perfect mode)
    if (brush.size === 1 && spacing === 1) {
      this.drawLinePixelByPixel(x1, y1, x2, y2);
      return;
    }

    // For larger brushes or spacing > 1, use spacing-based stamping
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0) return;

    // Normalize direction
    const dirX = dx / distance;
    const dirY = dy / distance;

    // Add to accumulated distance
    this.distanceSinceLastStamp += distance;

    // Check if we should apply pixel-perfect at stamp level (when spacing matches brush size)
    const pixelPerfectStamps = brush.pixelPerfect && brush.spacing === 'match';

    // Calculate starting position along the line
    let traveled = 0;

    // Place stamps at spacing intervals
    while (this.distanceSinceLastStamp >= spacing) {
      // Calculate how far along the line to place this stamp
      const stampDistance = spacing - (this.distanceSinceLastStamp - distance + traveled);

      if (stampDistance > 0 && stampDistance <= distance) {
        let stampX = Math.round(x1 + dirX * stampDistance);
        let stampY = Math.round(y1 + dirY * stampDistance);

        // Snap to spacing grid for consistent placement when spacing > 1 (align to grid cell top-left)
        if (spacing > 1) {
          stampX = Math.floor(stampX / spacing) * spacing;
          stampY = Math.floor(stampY / spacing) * spacing;
        }

        // Pixel-perfect at stamp level: detect L-shapes in stamp positions
        if (pixelPerfectStamps && this.stampPositions.length >= 2) {
          const p1 = this.stampPositions[this.stampPositions.length - 2];
          const p2 = this.stampPositions[this.stampPositions.length - 1];
          const p3 = { x: stampX, y: stampY };

          if (this.isStampLShape(p1, p2, p3, spacing)) {
            // Restore the stamp at p2
            this.restoreStamp(p2.x, p2.y);
            this.stampPositions.pop();
          }
        }

        this.drawPoint(stampX, stampY);
        if (pixelPerfectStamps) {
          this.stampPositions.push({ x: stampX, y: stampY });
        }
        traveled = stampDistance;
      }

      this.distanceSinceLastStamp -= spacing;
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

    const brush = brushStore.activeBrush.value;
    const size = brush.size;
    // When spacing > 1, x/y is already the top-left corner
    const startX = x;
    const startY = y;
    const canvas = this.context.canvas;

    // Restore each pixel in the stamp region
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const pixelX = startX + px;
        const pixelY = startY + py;

        if (pixelX < 0 || pixelY < 0 || pixelX >= canvas.width || pixelY >= canvas.height) continue;

        // Check if this pixel is within the brush shape (for circle brushes)
        if (brush.shape === 'circle') {
          const dx = px - size / 2 + 0.5;
          const dy = py - size / 2 + 0.5;
          if (dx * dx + dy * dy > (size / 2) * (size / 2)) continue;
        }

        // Get original pixel from snapshot
        const index = (pixelY * this.strokeStartSnapshot.width + pixelX) * 4;
        const r = this.strokeStartSnapshot.data[index];
        const g = this.strokeStartSnapshot.data[index + 1];
        const b = this.strokeStartSnapshot.data[index + 2];
        const a = this.strokeStartSnapshot.data[index + 3];

        if (a === 0) {
          this.context.clearRect(pixelX, pixelY, 1, 1);
        } else {
          this.context.fillStyle = `rgba(${r}, ${g}, ${b}, ${a / 255})`;
          this.context.globalAlpha = 1;
          this.context.fillRect(pixelX, pixelY, 1, 1);
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
   * Draw a single point/brush stamp
   */
  private drawPoint(x: number, y: number) {
    if (!this.context) return;

    const brush = brushStore.activeBrush.value;
    const size = brush.size;
    const spacing = this.getSpacing();

    this.context.globalAlpha = brush.opacity;
    this.context.fillStyle = colorStore.primaryColor.value;

    // When spacing > 1, x/y is the top-left corner of the grid cell
    // Otherwise, x/y is the center of the brush
    if (spacing > 1) {
      // Grid-aligned mode: draw from top-left
      if (brush.shape === 'square') {
        this.context.fillRect(x, y, size, size);
      } else {
        // Circle
        this.context.beginPath();
        this.context.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
        this.context.fill();
      }
    } else {
      // Normal mode: draw centered on x/y
      const halfSize = Math.floor(size / 2);
      if (brush.shape === 'square') {
        this.context.fillRect(x - halfSize, y - halfSize, size, size);
      } else {
        // Circle
        this.context.beginPath();
        this.context.arc(x, y, size / 2, 0, Math.PI * 2);
        this.context.fill();
      }
    }

    this.context.globalAlpha = 1;

    // Mark dirty region for partial redraw
    this.markDirty(x, y);
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

    // If this point was drawn earlier in the current stroke (path crosses itself),
    // don't restore it - just leave it as is
    if (this.wasDrawnEarlierInStroke(x, y)) {
      return;
    }

    // If no snapshot, fall back to clearing
    if (!this.strokeStartSnapshot) {
      this.context.clearRect(x, y, 1, 1);
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
    return PencilTool.lastStrokeEnd;
  }
}
