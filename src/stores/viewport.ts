import { signal } from '../core/signal';
import { projectStore } from './project';

// Power-of-2 zoom levels (100% = 1, 200% = 2, etc.)
export const ZOOM_LEVELS = [1, 2, 4, 8, 16, 32] as const;
export type ZoomLevel = (typeof ZOOM_LEVELS)[number];

class ViewportStore {
  // Core state
  zoom = signal<ZoomLevel>(8); // Default 800%
  panX = signal<number>(0); // Pan offset in screen pixels
  panY = signal<number>(0);

  // Spacebar pan state
  isSpacebarDown = signal<boolean>(false);
  isPanning = signal<boolean>(false);

  // Container dimensions (set by viewport component)
  containerWidth = signal<number>(0);
  containerHeight = signal<number>(0);

  // Last known cursor position in viewport (for keyboard zoom)
  cursorScreenX = signal<number | null>(null);
  cursorScreenY = signal<number | null>(null);

  // Minimum pixels of canvas that must remain visible
  private readonly MIN_VISIBLE_PIXELS = 32;

  /**
   * Get zoom as percentage (e.g., 800 for 800%)
   */
  get zoomPercent(): number {
    return this.zoom.value * 100;
  }

  /**
   * Set zoom to a specific level
   */
  setZoom(level: ZoomLevel): void {
    if (ZOOM_LEVELS.includes(level)) {
      this.zoom.value = level;
    }
  }

  /**
   * Zoom in one level
   */
  zoomIn(): void {
    const currentIndex = ZOOM_LEVELS.indexOf(this.zoom.value);
    if (currentIndex < ZOOM_LEVELS.length - 1) {
      this.zoom.value = ZOOM_LEVELS[currentIndex + 1];
    }
  }

  /**
   * Zoom out one level
   */
  zoomOut(): void {
    const currentIndex = ZOOM_LEVELS.indexOf(this.zoom.value);
    if (currentIndex > 0) {
      this.zoom.value = ZOOM_LEVELS[currentIndex - 1];
    }
  }

  /**
   * Zoom in at a specific screen position (keeps that point stable)
   */
  zoomInAt(screenX: number, screenY: number): void {
    const currentIndex = ZOOM_LEVELS.indexOf(this.zoom.value);
    if (currentIndex < ZOOM_LEVELS.length - 1) {
      this.zoomAt(ZOOM_LEVELS[currentIndex + 1], screenX, screenY);
    }
  }

  /**
   * Zoom out at a specific screen position (keeps that point stable)
   */
  zoomOutAt(screenX: number, screenY: number): void {
    const currentIndex = ZOOM_LEVELS.indexOf(this.zoom.value);
    if (currentIndex > 0) {
      this.zoomAt(ZOOM_LEVELS[currentIndex - 1], screenX, screenY);
    }
  }

  /**
   * Zoom to a specific level, keeping the point under cursor stable
   */
  zoomAt(newZoom: ZoomLevel, screenX: number, screenY: number): void {
    const oldZoom = this.zoom.value;

    // Point under cursor in canvas coords (before zoom)
    const canvasX = (screenX - this.panX.value) / oldZoom;
    const canvasY = (screenY - this.panY.value) / oldZoom;

    // After zoom, that canvas point should still be at screenX, screenY
    // screenX = canvasX * newZoom + newPanX
    // newPanX = screenX - canvasX * newZoom
    const newPanX = screenX - canvasX * newZoom;
    const newPanY = screenY - canvasY * newZoom;

    this.zoom.value = newZoom;
    this.panX.value = newPanX;
    this.panY.value = newPanY;

    // Clamp to bounds after zoom (bounds change with zoom level)
    this.clampPanToBounds();
  }

  /**
   * Zoom to level by index (1-6 for keys 1-6), at cursor or center
   */
  zoomToLevel(level: 1 | 2 | 3 | 4 | 5 | 6): void {
    const zoomLevel = ZOOM_LEVELS[level - 1];
    if (zoomLevel) {
      // If cursor is in viewport, zoom at cursor position
      const cursorX = this.cursorScreenX.value;
      const cursorY = this.cursorScreenY.value;

      if (cursorX !== null && cursorY !== null) {
        this.zoomAt(zoomLevel, cursorX, cursorY);
      } else {
        // Zoom at center of viewport
        const centerX = this.containerWidth.value / 2;
        const centerY = this.containerHeight.value / 2;
        this.zoomAt(zoomLevel, centerX, centerY);
      }
    }
  }

  /**
   * Fit canvas to container, centered
   */
  zoomToFit(containerWidth: number, containerHeight: number): void {
    const canvasWidth = projectStore.width.value;
    const canvasHeight = projectStore.height.value;

    // Find largest zoom level that fits
    let bestZoom: ZoomLevel = ZOOM_LEVELS[0];
    for (const zoom of ZOOM_LEVELS) {
      const scaledWidth = canvasWidth * zoom;
      const scaledHeight = canvasHeight * zoom;
      if (scaledWidth <= containerWidth && scaledHeight <= containerHeight) {
        bestZoom = zoom;
      } else {
        break;
      }
    }

    this.zoom.value = bestZoom;

    // Center the canvas
    const scaledWidth = canvasWidth * bestZoom;
    const scaledHeight = canvasHeight * bestZoom;
    this.panX.value = (containerWidth - scaledWidth) / 2;
    this.panY.value = (containerHeight - scaledHeight) / 2;
  }

  /**
   * Set pan position
   */
  setPan(x: number, y: number): void {
    this.panX.value = x;
    this.panY.value = y;
  }

  /**
   * Pan by a delta
   */
  panBy(dx: number, dy: number): void {
    this.panX.value += dx;
    this.panY.value += dy;
  }

  /**
   * Reset view to centered, default zoom
   */
  resetView(): void {
    const containerWidth = this.containerWidth.value;
    const containerHeight = this.containerHeight.value;

    if (containerWidth > 0 && containerHeight > 0) {
      this.zoomToFit(containerWidth, containerHeight);
    } else {
      // Fallback: just reset to defaults
      this.zoom.value = 8;
      this.panX.value = 0;
      this.panY.value = 0;
    }
  }

  /**
   * Convert screen coordinates to canvas coordinates
   */
  screenToCanvas(screenX: number, screenY: number): { x: number; y: number } {
    const x = (screenX - this.panX.value) / this.zoom.value;
    const y = (screenY - this.panY.value) / this.zoom.value;
    return { x, y };
  }

  /**
   * Convert canvas coordinates to screen coordinates
   */
  canvasToScreen(canvasX: number, canvasY: number): { x: number; y: number } {
    const x = canvasX * this.zoom.value + this.panX.value;
    const y = canvasY * this.zoom.value + this.panY.value;
    return { x, y };
  }

  /**
   * Get valid pan boundaries.
   * Returns the min/max pan values that keep at least MIN_VISIBLE_PIXELS of canvas visible.
   */
  getPanBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
    const containerW = this.containerWidth.value;
    const containerH = this.containerHeight.value;
    const canvasW = projectStore.width.value * this.zoom.value;
    const canvasH = projectStore.height.value * this.zoom.value;
    const minVisible = this.MIN_VISIBLE_PIXELS;

    // Canvas right edge must be at least minVisible pixels into viewport
    // panX + canvasW >= minVisible  =>  panX >= minVisible - canvasW
    const minX = minVisible - canvasW;

    // Canvas left edge must be at most (containerW - minVisible) from left
    // panX <= containerW - minVisible
    const maxX = containerW - minVisible;

    // Same for Y
    const minY = minVisible - canvasH;
    const maxY = containerH - minVisible;

    return { minX, maxX, minY, maxY };
  }

  /**
   * Check if current pan is within valid bounds
   */
  isPanInBounds(): boolean {
    const { minX, maxX, minY, maxY } = this.getPanBounds();
    const x = this.panX.value;
    const y = this.panY.value;
    return x >= minX && x <= maxX && y >= minY && y <= maxY;
  }

  /**
   * Clamp pan to valid bounds (rubber band snap-back)
   */
  clampPanToBounds(): void {
    const { minX, maxX, minY, maxY } = this.getPanBounds();

    let newX = this.panX.value;
    let newY = this.panY.value;

    if (newX < minX) newX = minX;
    if (newX > maxX) newX = maxX;
    if (newY < minY) newY = minY;
    if (newY > maxY) newY = maxY;

    this.panX.value = newX;
    this.panY.value = newY;
  }

  /**
   * Center the viewport on a specific canvas coordinate.
   * Used by minimap navigation.
   */
  centerOn(canvasX: number, canvasY: number): void {
    const containerW = this.containerWidth.value;
    const containerH = this.containerHeight.value;
    const zoom = this.zoom.value;

    // Calculate pan values that center the given canvas point
    // screenCenter = canvasPoint * zoom + pan
    // pan = screenCenter - canvasPoint * zoom
    const centerScreenX = containerW / 2;
    const centerScreenY = containerH / 2;

    this.panX.value = centerScreenX - canvasX * zoom;
    this.panY.value = centerScreenY - canvasY * zoom;

    // Clamp to valid bounds
    this.clampPanToBounds();
  }
}

export const viewportStore = new ViewportStore();
