import { html, css } from 'lit';
import { customElement, query } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { selectionStore } from '../../stores/selection';
import { viewportStore } from '../../stores/viewport';
import { traceMaskOutline, connectSegments, type Point } from '../../utils/mask-utils';
import { type SelectionState } from '../../types/selection';

/**
 * Transparent canvas overlay that renders:
 * - Marching ants for active selections
 * - Floating selection pixels during move
 */
@customElement('pf-selection-overlay')
export class PFSelectionOverlay extends BaseComponent {
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

  @query('canvas') canvas!: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrameId = 0;
  private dashOffset = 0;
  private lastTimestamp = 0;

  // Cache for freeform outline paths
  private cachedOutlinePaths: Point[][] | null = null;
  private cachedStateId: string | null = null;
  private resizeObserver: ResizeObserver | null = null;

  connectedCallback() {
    super.connectedCallback();
    // Use ResizeObserver to detect size changes from flex layout (e.g., timeline resize)
    this.resizeObserver = new ResizeObserver(() => {
      this.handleResize();
    });
    this.resizeObserver.observe(this);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    // Clean up ResizeObserver
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = 0;
    }
  }

  firstUpdated() {
    this.initCanvas();
    this.startAnimationLoop();
  }

  private initCanvas() {
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.resizeCanvas();
  }

  private handleResize = () => {
    this.resizeCanvas();
  };

  private resizeCanvas() {
    if (!this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.clientWidth * dpr;
    this.canvas.height = this.clientHeight * dpr;
  }

  private startAnimationLoop() {
    const animate = (timestamp: number) => {
      const delta = timestamp - this.lastTimestamp;
      this.lastTimestamp = timestamp;

      // Update dash offset for marching ants animation
      this.dashOffset = (this.dashOffset + delta * 0.06) % 16;

      this.draw();
      this.animationFrameId = requestAnimationFrame(animate);
    };

    this.animationFrameId = requestAnimationFrame(animate);
  }

  private draw() {
    if (!this.ctx || !this.canvas) return;

    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;

    // Clear
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.scale(dpr, dpr);

    const state = selectionStore.state.value;
    if (state.type === 'none') {
      this.cachedOutlinePaths = null;
      this.cachedStateId = null;
      return;
    }

    const zoom = viewportStore.zoom.value;
    const panX = viewportStore.panX.value;
    const panY = viewportStore.panY.value;

    if (state.type === 'selecting') {
      // Draw preview path if available (lasso tools), otherwise fall back to bounding box
      if (state.previewPath && state.previewPath.length >= 2) {
        this.drawPathPreview(ctx, state.previewPath, zoom, panX, panY);
      } else {
        this.drawRectMarchingAnts(ctx, state.currentBounds, zoom, panX, panY);
      }
    } else if (state.type === 'selected') {
      this.drawSelectedState(ctx, state, zoom, panX, panY);
    } else if (state.type === 'floating') {
      // Draw floating pixels
      this.drawFloatingPixels(ctx, state, zoom, panX, panY);

      // Draw marching ants around floating selection
      this.drawFloatingState(ctx, state, zoom, panX, panY);
    } else if (state.type === 'transforming') {
      // Draw the preview pixels (rotated)
      this.drawTransformingPixels(ctx, state, zoom, panX, panY);

      // Draw rotated marching ants around the original bounds + offset
      this.drawRotatedMarchingAnts(ctx, state.originalBounds, state.currentOffset, state.rotation, zoom, panX, panY);
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

  private drawRectMarchingAnts(
    ctx: CanvasRenderingContext2D,
    bounds: { x: number; y: number; width: number; height: number },
    zoom: number,
    panX: number,
    panY: number
  ) {
    const screenX = bounds.x * zoom + panX;
    const screenY = bounds.y * zoom + panY;
    const screenWidth = bounds.width * zoom;
    const screenHeight = bounds.height * zoom;

    ctx.save();
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    // White dashes
    ctx.strokeStyle = 'white';
    ctx.lineDashOffset = -this.dashOffset;
    ctx.strokeRect(
      Math.round(screenX) + 0.5,
      Math.round(screenY) + 0.5,
      Math.round(screenWidth) - 1,
      Math.round(screenHeight) - 1
    );

    // Black dashes (offset to fill gaps)
    ctx.strokeStyle = 'black';
    ctx.lineDashOffset = -this.dashOffset + 4;
    ctx.strokeRect(
      Math.round(screenX) + 0.5,
      Math.round(screenY) + 0.5,
      Math.round(screenWidth) - 1,
      Math.round(screenHeight) - 1
    );

    ctx.restore();
  }

  private drawEllipseMarchingAnts(
    ctx: CanvasRenderingContext2D,
    bounds: { x: number; y: number; width: number; height: number },
    zoom: number,
    panX: number,
    panY: number
  ) {
    const screenX = bounds.x * zoom + panX;
    const screenY = bounds.y * zoom + panY;
    const screenWidth = bounds.width * zoom;
    const screenHeight = bounds.height * zoom;

    const cx = screenX + screenWidth / 2;
    const cy = screenY + screenHeight / 2;
    const rx = screenWidth / 2 - 0.5;
    const ry = screenHeight / 2 - 0.5;

    ctx.save();
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    // White dashes
    ctx.strokeStyle = 'white';
    ctx.lineDashOffset = -this.dashOffset;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Black dashes
    ctx.strokeStyle = 'black';
    ctx.lineDashOffset = -this.dashOffset + 4;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  private drawRotatedMarchingAnts(
    ctx: CanvasRenderingContext2D,
    bounds: { x: number; y: number; width: number; height: number },
    offset: { x: number; y: number },
    rotation: number,
    zoom: number,
    panX: number,
    panY: number
  ) {
    // Calculate center in screen coordinates (with offset applied)
    const centerX = (bounds.x + offset.x + bounds.width / 2) * zoom + panX;
    const centerY = (bounds.y + offset.y + bounds.height / 2) * zoom + panY;

    // Screen dimensions
    const screenWidth = bounds.width * zoom;
    const screenHeight = bounds.height * zoom;

    // Half dimensions for drawing from center
    const halfW = screenWidth / 2 - 0.5;
    const halfH = screenHeight / 2 - 0.5;

    ctx.save();
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    // Translate to center and rotate
    ctx.translate(centerX, centerY);
    ctx.rotate((rotation * Math.PI) / 180);

    // White dashes
    ctx.strokeStyle = 'white';
    ctx.lineDashOffset = -this.dashOffset;
    ctx.strokeRect(-halfW, -halfH, screenWidth - 1, screenHeight - 1);

    // Black dashes (offset to fill gaps)
    ctx.strokeStyle = 'black';
    ctx.lineDashOffset = -this.dashOffset + 4;
    ctx.strokeRect(-halfW, -halfH, screenWidth - 1, screenHeight - 1);

    ctx.restore();
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

    ctx.save();
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    // Draw each path
    for (const path of this.cachedOutlinePaths) {
      if (path.length < 2) continue;

      // White dashes
      ctx.strokeStyle = 'white';
      ctx.lineDashOffset = -this.dashOffset;
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

      // Black dashes
      ctx.strokeStyle = 'black';
      ctx.lineDashOffset = -this.dashOffset + 4;
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

    ctx.restore();
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

    ctx.save();
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    // White dashes
    ctx.strokeStyle = 'white';
    ctx.lineDashOffset = -this.dashOffset;
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

    // Black dashes (offset to fill gaps)
    ctx.strokeStyle = 'black';
    ctx.lineDashOffset = -this.dashOffset + 4;
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

    ctx.restore();
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
    void viewportStore.zoom.value;
    void viewportStore.panX.value;
    void viewportStore.panY.value;

    return html`<canvas></canvas>`;
  }
}
