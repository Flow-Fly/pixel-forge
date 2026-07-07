import { signal } from "../core/signal";
import { projectStore } from "./project";

// Preset zoom levels used by keyboard shortcuts, menus, and stepped zoom actions.
export const ZOOM_LEVELS = [1, 2, 4, 8, 16, 32] as const;
class ViewportStore {
  private readonly MIN_ZOOM = 0.125;
  private readonly MAX_ZOOM = 64;

  // Core state
  zoom = signal<number>(8); // 8 = 800%
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
   * Set zoom to a specific level.
   */
  setZoom(level: number): void {
    this.zoom.value = this.clampZoom(level);
    this.clampPanToBounds();
  }

  formattedZoom(): number {
    const zoomPercent = this.zoomPercent;
    if (zoomPercent >= 100) {
      return Math.round(zoomPercent);
    }
    return parseFloat(zoomPercent.toFixed(2));
  }

  /**
   * Zoom in one preset level.
   */
  zoomIn(): void {
    const next =
      ZOOM_LEVELS.find((level) => level > this.zoom.value) ?? this.MAX_ZOOM;
    this.setZoom(next);
  }

  /**
   * Zoom out one preset level.
   */
  zoomOut(): void {
    const previous =
      [...ZOOM_LEVELS].reverse().find((level) => level < this.zoom.value) ??
      this.MIN_ZOOM;
    this.setZoom(previous);
  }

  /**
   * Zoom in one preset level at a specific screen position.
   */
  zoomInAt(screenX: number, screenY: number): void {
    const next =
      ZOOM_LEVELS.find((level) => level > this.zoom.value) ?? this.MAX_ZOOM;
    this.zoomAt(next, screenX, screenY);
  }

  /**
   * Zoom out one preset level at a specific screen position.
   */
  zoomOutAt(screenX: number, screenY: number): void {
    const previous =
      [...ZOOM_LEVELS].reverse().find((level) => level < this.zoom.value) ??
      this.MIN_ZOOM;
    this.zoomAt(previous, screenX, screenY);
  }

  /**
   * Multiply zoom by a factor at a specific screen position.
   * Used for smooth wheel / trackpad pinch zooming.
   */
  zoomByFactorAt(factor: number, screenX: number, screenY: number): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.zoomAt(this.zoom.value * factor, screenX, screenY);
  }

  /**
   * Zoom to a specific level, keeping the point under cursor stable.
   */
  zoomAt(newZoom: number, screenX: number, screenY: number): void {
    const oldZoom = this.zoom.value;
    const clampedZoom = this.clampZoom(newZoom);

    if (oldZoom === clampedZoom) return;

    // Point under cursor in canvas coords (before zoom)
    const canvasX = (screenX - this.panX.value) / oldZoom;
    const canvasY = (screenY - this.panY.value) / oldZoom;

    // After zoom, that canvas point should still be at screenX, screenY
    const newPanX = screenX - canvasX * clampedZoom;
    const newPanY = screenY - canvasY * clampedZoom;

    this.zoom.value = clampedZoom;
    this.panX.value = newPanX;
    this.panY.value = newPanY;

    // Clamp to bounds after zoom (bounds change with zoom level)
    this.clampPanToBounds();
  }

  /**
   * Zoom to level by index (1-6 for keys 1-6), at cursor or center.
   */
  zoomToLevel(level: 1 | 2 | 3 | 4 | 5 | 6): void {
    const zoomLevel = ZOOM_LEVELS[level - 1];
    if (!zoomLevel) return;

    const cursorX = this.cursorScreenX.value;
    const cursorY = this.cursorScreenY.value;

    if (cursorX !== null && cursorY !== null) {
      this.zoomAt(zoomLevel, cursorX, cursorY);
    } else {
      const centerX = this.containerWidth.value / 2;
      const centerY = this.containerHeight.value / 2;
      this.zoomAt(zoomLevel, centerX, centerY);
    }
  }

  /**
   * Fit canvas to container, centered.
   */
  zoomToFit(containerWidth: number, containerHeight: number): void {
    const canvasWidth = projectStore.width.value;
    const canvasHeight = projectStore.height.value;

    if (
      canvasWidth <= 0 ||
      canvasHeight <= 0 ||
      containerWidth <= 0 ||
      containerHeight <= 0
    ) {
      return;
    }

    const fitZoom = Math.min(
      containerWidth / canvasWidth,
      containerHeight / canvasHeight,
    );
    const bestZoom = this.clampZoom(fitZoom);

    this.zoom.value = bestZoom;

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
   * Reset view to centered fit.
   */
  resetView(): void {
    const containerWidth = this.containerWidth.value;
    const containerHeight = this.containerHeight.value;

    if (containerWidth > 0 && containerHeight > 0) {
      this.zoomToFit(containerWidth, containerHeight);
      return;
    }

    this.zoom.value = 8;
    this.panX.value = 0;
    this.panY.value = 0;
  }

  /**
   * Convert screen coordinates to canvas coordinates.
   */
  screenToCanvas(screenX: number, screenY: number): { x: number; y: number } {
    const x = (screenX - this.panX.value) / this.zoom.value;
    const y = (screenY - this.panY.value) / this.zoom.value;
    return { x, y };
  }

  /**
   * Convert canvas coordinates to screen coordinates.
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
   * Check if current pan is within valid bounds.
   */
  isPanInBounds(): boolean {
    const { minX, maxX, minY, maxY } = this.getPanBounds();
    const x = this.panX.value;
    const y = this.panY.value;
    return x >= minX && x <= maxX && y >= minY && y <= maxY;
  }

  /**
   * Clamp pan to valid bounds (rubber band snap-back).
   ** I discovered that this does not work when panning with two fingers on a trackpad.
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

  private clampZoom(zoom: number): number {
    if (!Number.isFinite(zoom)) return this.zoom.value;
    return Math.min(this.MAX_ZOOM, Math.max(this.MIN_ZOOM, zoom));
  }
}

export const viewportStore = new ViewportStore();
