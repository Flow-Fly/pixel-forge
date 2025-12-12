import { signal } from "../core/signal";

/**
 * Store for ruler guides and mirror drawing state.
 * Supports one horizontal (Y-axis) and one vertical (X-axis) guide.
 */
class GuidesStore {
  /** Y position of horizontal guide in canvas pixels (null = no guide) */
  horizontalGuide = signal<number | null>(null);

  /** X position of vertical guide in canvas pixels (null = no guide) */
  verticalGuide = signal<number | null>(null);

  /** Whether guides are visible (toggle with Shift+G) */
  visible = signal<boolean>(true);

  /** Drag preview for horizontal guide (Y position, null = not dragging) */
  dragPreviewHorizontal = signal<number | null>(null);

  /** Drag preview for vertical guide (X position, null = not dragging) */
  dragPreviewVertical = signal<number | null>(null);

  /**
   * Set horizontal guide position (Y axis).
   * @param y - Pixel position or null to remove
   */
  setHorizontalGuide(y: number | null): void {
    this.horizontalGuide.value = y;
  }

  /**
   * Set vertical guide position (X axis).
   * @param x - Pixel position or null to remove
   */
  setVerticalGuide(x: number | null): void {
    this.verticalGuide.value = x;
  }

  /**
   * Clear a specific guide.
   */
  clearGuide(type: "horizontal" | "vertical"): void {
    if (type === "horizontal") {
      this.horizontalGuide.value = null;
    } else {
      this.verticalGuide.value = null;
    }
  }

  /**
   * Clear all guides.
   */
  clearAllGuides(): void {
    this.horizontalGuide.value = null;
    this.verticalGuide.value = null;
  }

  /**
   * Toggle guide visibility.
   */
  toggleVisibility(): void {
    this.visible.value = !this.visible.value;
  }

  /**
   * Set drag preview for a guide type.
   */
  setDragPreview(type: "horizontal" | "vertical", position: number | null): void {
    if (type === "horizontal") {
      this.dragPreviewHorizontal.value = position;
    } else {
      this.dragPreviewVertical.value = position;
    }
  }

  /**
   * Clear all drag previews.
   */
  clearDragPreview(): void {
    this.dragPreviewHorizontal.value = null;
    this.dragPreviewVertical.value = null;
  }

  /**
   * Check if any guides are active and visible.
   */
  hasActiveGuides(): boolean {
    return (
      this.visible.value &&
      (this.horizontalGuide.value !== null || this.verticalGuide.value !== null)
    );
  }

  /**
   * Calculate mirrored X position for a given X coordinate.
   * Returns null if no vertical guide or guide not visible.
   */
  getMirroredX(x: number, canvasWidth: number): number | null {
    const guideX = this.verticalGuide.value;
    if (guideX === null || !this.visible.value) return null;

    const mirroredX = guideX * 2 - x - 1;
    if (mirroredX < 0 || mirroredX >= canvasWidth) return null;

    return mirroredX;
  }

  /**
   * Calculate mirrored Y position for a given Y coordinate.
   * Returns null if no horizontal guide or guide not visible.
   */
  getMirroredY(y: number, canvasHeight: number): number | null {
    const guideY = this.horizontalGuide.value;
    if (guideY === null || !this.visible.value) return null;

    const mirroredY = guideY * 2 - y - 1;
    if (mirroredY < 0 || mirroredY >= canvasHeight) return null;

    return mirroredY;
  }

  /**
   * Get all mirror positions for a given coordinate.
   * Returns array of {x, y} positions to draw (excluding original).
   */
  getMirrorPositions(
    x: number,
    y: number,
    canvasWidth: number,
    canvasHeight: number
  ): Array<{ x: number; y: number }> {
    if (!this.visible.value) return [];

    const positions: Array<{ x: number; y: number }> = [];
    const mirroredX = this.getMirroredX(x, canvasWidth);
    const mirroredY = this.getMirroredY(y, canvasHeight);

    // Vertical mirror (across vertical guide)
    if (mirroredX !== null) {
      positions.push({ x: mirroredX, y });
    }

    // Horizontal mirror (across horizontal guide)
    if (mirroredY !== null) {
      positions.push({ x, y: mirroredY });
    }

    // Diagonal mirror (both guides active = 4-way symmetry)
    if (mirroredX !== null && mirroredY !== null) {
      positions.push({ x: mirroredX, y: mirroredY });
    }

    return positions;
  }
}

export const guidesStore = new GuidesStore();
