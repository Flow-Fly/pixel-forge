import { html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { AnimatedCanvasOverlay } from './animated-canvas-overlay';
import { selectionStore } from '../../stores/selection';
import { viewportStore } from '../../stores/viewport';
import { traceMaskOutline, connectSegments } from '../../utils/mask-utils';
import type { Point } from '../../types/geometry';
import { type SelectionState } from '../../types/selection';
import '../../components/common/pf-tooltip';

/**
 * Transparent canvas overlay that renders:
 * - Marching ants for active selections
 * - Floating selection pixels during move
 */
@customElement('pf-selection-overlay')
export class PFSelectionOverlay extends AnimatedCanvasOverlay {
  static styles = css`
    :host {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 45;
    }

    canvas {
      width: 100%;
      height: 100%;
    }
  `;


  // Tooltip state for dimension display
  @state() private widthTooltipX = 0;
  @state() private widthTooltipY = 0;
  @state() private heightTooltipX = 0;
  @state() private heightTooltipY = 0;
  @state() private selectionWidth = 0;
  @state() private selectionHeight = 0;
  @state() private showDimensionTooltips = false;

  // Cache for freeform outline paths
  private cachedOutlinePaths: Point[][] | null = null;
  private cachedStateId: string | null = null;

  protected draw() {
    const ctx = this.prepareFrame();
    if (!ctx) return;

    const state = selectionStore.state.value;
    if (state.type === 'none') {
      this.cachedOutlinePaths = null;
      this.cachedStateId = null;
      this.hideDimensionTooltips();
      return;
    }

    const zoom = viewportStore.zoom.value;
    const panX = viewportStore.panX.value;
    const panY = viewportStore.panY.value;

    if (state.type === 'selecting') {
      // Draw previous selection if in add/subtract mode
      const prevSelection = selectionStore.previousSelectionForVisual.value;
      if (prevSelection) {
        if (prevSelection.shape === 'freeform' && prevSelection.mask) {
          this.drawFreeformMarchingAnts(ctx, prevSelection.bounds, prevSelection.mask, zoom, panX, panY);
        } else if (prevSelection.shape === 'ellipse') {
          this.drawEllipseMarchingAnts(ctx, prevSelection.bounds, zoom, panX, panY);
        } else {
          this.drawRectMarchingAnts(ctx, prevSelection.bounds, zoom, panX, panY);
        }
      }

      // Draw preview path if available (lasso tools), otherwise fall back to bounding box
      if (state.previewPath && state.previewPath.length >= 2) {
        this.drawPathPreview(ctx, state.previewPath, zoom, panX, panY);
        this.hideDimensionTooltips(); // No tooltips for freeform/lasso
      } else {
        this.drawRectMarchingAnts(ctx, state.currentBounds, zoom, panX, panY);
        // Show dimension tooltips for rectangular selection during drag
        this.updateDimensionTooltips(state.currentBounds, zoom, panX, panY);
      }
    } else if (state.type === 'selected') {
      this.drawSelectedState(ctx, state, zoom, panX, panY);
      // Show dimension tooltips only for rectangle shape
      if (state.shape === 'rectangle') {
        this.updateDimensionTooltips(state.bounds, zoom, panX, panY);
      } else {
        this.hideDimensionTooltips();
      }
    } else if (state.type === 'floating') {
      // Draw floating pixels
      this.drawFloatingPixels(ctx, state, zoom, panX, panY);

      // Draw marching ants around floating selection
      this.drawFloatingState(ctx, state, zoom, panX, panY);
      this.hideDimensionTooltips(); // No tooltips when floating
    } else if (state.type === 'transforming') {
      // Draw the preview pixels (scaled + rotated)
      this.drawTransformingPixels(ctx, state, zoom, panX, panY);

      // Draw scaled and rotated marching ants
      this.drawScaledRotatedMarchingAnts(ctx, state, zoom, panX, panY);

      // Note: Rotation angle is shown as tooltip on the rotation handle
      // Scale info is shown in the context bar

      this.hideDimensionTooltips(); // No tooltips when transforming
    }
  }

  private drawTransformingPixels(
    ctx: CanvasRenderingContext2D,
    state: SelectionState & { type: 'transforming' },
    zoom: number,
    panX: number,
    panY: number
  ) {
    // Use previewData which is already rotated with CleanEdge
    const previewData = state.previewData ?? state.imageData;
    const originalBounds = state.originalBounds;
    const offset = state.currentOffset;

    // Calculate center of original bounds + offset (rotation pivot point)
    const centerX = (originalBounds.x + offset.x + originalBounds.width / 2) * zoom + panX;
    const centerY = (originalBounds.y + offset.y + originalBounds.height / 2) * zoom + panY;

    // Preview dimensions in screen space
    const screenWidth = previewData.width * zoom;
    const screenHeight = previewData.height * zoom;

    // Create temporary canvas to hold the pre-rotated pixels
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = previewData.width;
    tempCanvas.height = previewData.height;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.putImageData(previewData, 0, 0);

    // Draw centered on the original selection's center
    // No CSS rotation - the previewData is already rotated
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      tempCanvas,
      Math.round(centerX - screenWidth / 2),
      Math.round(centerY - screenHeight / 2),
      Math.round(screenWidth),
      Math.round(screenHeight)
    );
  }

  private drawSelectedState(
    ctx: CanvasRenderingContext2D,
    state: SelectionState & { type: 'selected' },
    zoom: number,
    panX: number,
    panY: number
  ) {
    if (state.shape === 'freeform' && 'mask' in state) {
      this.drawFreeformMarchingAnts(ctx, state.bounds, state.mask, zoom, panX, panY);
    } else if (state.shape === 'ellipse') {
      this.drawEllipseMarchingAnts(ctx, state.bounds, zoom, panX, panY);
    } else {
      this.drawRectMarchingAnts(ctx, state.bounds, zoom, panX, panY);
    }
  }

  private drawFloatingState(
    ctx: CanvasRenderingContext2D,
    state: SelectionState & { type: 'floating' },
    zoom: number,
    panX: number,
    panY: number
  ) {
    const floatBounds = {
      x: state.originalBounds.x + state.currentOffset.x,
      y: state.originalBounds.y + state.currentOffset.y,
      width: state.originalBounds.width,
      height: state.originalBounds.height,
    };

    if (state.shape === 'freeform' && state.mask) {
      this.drawFreeformMarchingAnts(ctx, floatBounds, state.mask, zoom, panX, panY);
    } else if (state.shape === 'ellipse') {
      this.drawEllipseMarchingAnts(ctx, floatBounds, zoom, panX, panY);
    } else {
      this.drawRectMarchingAnts(ctx, floatBounds, zoom, panX, panY);
    }
  }

  /**
   * Update tooltip positions for dimension display on rectangular selections.
   */
  private updateDimensionTooltips(
    bounds: { x: number; y: number; width: number; height: number },
    zoom: number,
    panX: number,
    panY: number
  ) {
    const screen = this.toScreenRect(bounds, zoom, panX, panY);

    // Width tooltip: centered on top edge, offset above
    this.widthTooltipX = screen.x + screen.width / 2;
    this.widthTooltipY = screen.y - 8;

    // Height tooltip: centered on left edge, offset to the left
    this.heightTooltipX = screen.x - 8;
    this.heightTooltipY = screen.y + screen.height / 2;

    this.selectionWidth = bounds.width;
    this.selectionHeight = bounds.height;
    this.showDimensionTooltips = true;
  }

  /**
   * Hide dimension tooltips when no rectangle selection is active.
   */
  private hideDimensionTooltips() {
    this.showDimensionTooltips = false;
  }

  private drawRectMarchingAnts(
    ctx: CanvasRenderingContext2D,
    bounds: { x: number; y: number; width: number; height: number },
    zoom: number,
    panX: number,
    panY: number
  ) {
    const screen = this.toScreenRect(bounds, zoom, panX, panY);
    this.strokeMarchingAntsRect(ctx, screen.x, screen.y, screen.width, screen.height);
  }

  private drawEllipseMarchingAnts(
    ctx: CanvasRenderingContext2D,
    bounds: { x: number; y: number; width: number; height: number },
    zoom: number,
    panX: number,
    panY: number
  ) {
    const screen = this.toScreenRect(bounds, zoom, panX, panY);
    const cx = screen.x + screen.width / 2;
    const cy = screen.y + screen.height / 2;
    const rx = screen.width / 2 - 0.5;
    const ry = screen.height / 2 - 0.5;

    this.strokeMarchingAnts(ctx, (c) => {
      c.beginPath();
      c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      c.stroke();
    });
  }

  /**
   * Draw marching ants for a transforming selection (with scale and rotation).
   */
  private drawScaledRotatedMarchingAnts(
    ctx: CanvasRenderingContext2D,
    state: SelectionState & { type: 'transforming' },
    zoom: number,
    panX: number,
    panY: number
  ) {
    const { originalBounds, currentOffset, rotation, scale } = state;

    // Calculate center in screen coordinates (with offset applied)
    const centerX = (originalBounds.x + currentOffset.x + originalBounds.width / 2) * zoom + panX;
    const centerY = (originalBounds.y + currentOffset.y + originalBounds.height / 2) * zoom + panY;

    // Apply scale to get the actual visual dimensions
    const scaledWidth = originalBounds.width * scale.x;
    const scaledHeight = originalBounds.height * scale.y;

    // Screen dimensions
    const screenWidth = scaledWidth * zoom;
    const screenHeight = scaledHeight * zoom;

    // Half dimensions for drawing from center
    const halfW = screenWidth / 2 - 0.5;
    const halfH = screenHeight / 2 - 0.5;

    this.strokeMarchingAnts(
      ctx,
      (c) => c.strokeRect(-halfW, -halfH, screenWidth - 1, screenHeight - 1),
      (c) => {
        // Translate to center and rotate
        c.translate(centerX, centerY);
        c.rotate((rotation * Math.PI) / 180);
      }
    );
  }

  private drawFreeformMarchingAnts(
    ctx: CanvasRenderingContext2D,
    bounds: { x: number; y: number; width: number; height: number },
    mask: Uint8Array,
    zoom: number,
    panX: number,
    panY: number
  ) {
    // Generate state ID for caching
    const stateId = `${bounds.x},${bounds.y},${bounds.width},${bounds.height},${mask.length}`;

    // Check if we need to regenerate outline paths
    if (this.cachedStateId !== stateId) {
      const segments = traceMaskOutline(mask, bounds);
      this.cachedOutlinePaths = connectSegments(segments);
      this.cachedStateId = stateId;
    }

    if (!this.cachedOutlinePaths || this.cachedOutlinePaths.length === 0) {
      // Fallback to rectangle if no paths
      this.drawRectMarchingAnts(ctx, bounds, zoom, panX, panY);
      return;
    }

    // Draw each path
    for (const path of this.cachedOutlinePaths) {
      if (path.length < 2) continue;
      this.strokeMarchingAnts(ctx, (c) =>
        this.strokePath(c, path, zoom, panX, panY)
      );
    }
  }

  /** Stroke a polyline in screen space with pixel-aligned coordinates. */
  private strokePath(
    ctx: CanvasRenderingContext2D,
    path: { x: number; y: number }[],
    zoom: number,
    panX: number,
    panY: number
  ) {
    ctx.beginPath();
    ctx.moveTo(
      Math.round(path[0].x * zoom + panX) + 0.5,
      Math.round(path[0].y * zoom + panY) + 0.5
    );
    for (let i = 1; i < path.length; i++) {
      ctx.lineTo(
        Math.round(path[i].x * zoom + panX) + 0.5,
        Math.round(path[i].y * zoom + panY) + 0.5
      );
    }
    ctx.stroke();
  }

  /**
   * Draw preview path during lasso selection (before finalization).
   * Shows the actual path being drawn, not just the bounding box.
   */
  private drawPathPreview(
    ctx: CanvasRenderingContext2D,
    path: { x: number; y: number }[],
    zoom: number,
    panX: number,
    panY: number
  ) {
    if (path.length < 2) return;

    this.strokeMarchingAnts(ctx, (c) =>
      this.strokePath(c, path, zoom, panX, panY)
    );
  }

  private drawFloatingPixels(
    ctx: CanvasRenderingContext2D,
    state: {
      imageData: ImageData;
      originalBounds: { x: number; y: number; width: number; height: number };
      currentOffset: { x: number; y: number };
    },
    zoom: number,
    panX: number,
    panY: number
  ) {
    const destX = state.originalBounds.x + state.currentOffset.x;
    const destY = state.originalBounds.y + state.currentOffset.y;

    const screenX = destX * zoom + panX;
    const screenY = destY * zoom + panY;
    const screenWidth = state.originalBounds.width * zoom;
    const screenHeight = state.originalBounds.height * zoom;

    // Create temporary canvas to hold the floating pixels
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = state.imageData.width;
    tempCanvas.height = state.imageData.height;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.putImageData(state.imageData, 0, 0);

    // Draw scaled to screen
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      tempCanvas,
      Math.round(screenX),
      Math.round(screenY),
      Math.round(screenWidth),
      Math.round(screenHeight)
    );
  }

  render() {
    // Access signals for reactivity
    void selectionStore.state.value;
    void selectionStore.previousSelectionForVisual.value;
    void viewportStore.zoom.value;
    void viewportStore.panX.value;
    void viewportStore.panY.value;

    return html`
      <canvas></canvas>
      <pf-tooltip
        .x=${this.widthTooltipX}
        .y=${this.widthTooltipY}
        .text=${`${this.selectionWidth}px`}
        ?visible=${this.showDimensionTooltips}
      ></pf-tooltip>
      <pf-tooltip
        .x=${this.heightTooltipX}
        .y=${this.heightTooltipY}
        .text=${`${this.selectionHeight}px`}
        ?visible=${this.showDimensionTooltips}
      ></pf-tooltip>
    `;
  }
}
