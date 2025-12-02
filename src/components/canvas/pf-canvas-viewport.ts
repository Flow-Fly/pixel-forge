import { html, css } from 'lit';
import { customElement, state, query } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { viewportStore } from '../../stores/viewport';
import { gridStore } from '../../stores/grid';
import { projectStore } from '../../stores/project';

@customElement('pf-canvas-viewport')
export class PFCanvasViewport extends BaseComponent {
  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background-color: #1a1a1a;
      position: relative;
    }

    .viewport-content {
      position: absolute;
      transform-origin: 0 0;
      will-change: transform;
    }

    /* Checkerboard pattern to indicate transparency */
    ::slotted(pf-drawing-canvas) {
      background-image: linear-gradient(45deg, #404040 25%, transparent 25%),
        linear-gradient(-45deg, #404040 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #404040 75%),
        linear-gradient(-45deg, transparent 75%, #404040 75%);
      background-size: 16px 16px;
      background-position: 0 0, 0 8px, 8px -8px, -8px 0px;
      background-color: #2a2a2a;
    }

    /* Show grab cursor when spacebar is down */
    :host([space-down]) {
      cursor: grab;
    }

    /* Show grabbing cursor when panning */
    :host([panning]) {
      cursor: grabbing;
    }

    /* Grid overlay canvas - renders at screen resolution, not scaled */
    #grid-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }
  `;

  @query('#grid-overlay') gridCanvas!: HTMLCanvasElement;
  private gridCtx: CanvasRenderingContext2D | null = null;

  // Local state for drag tracking
  @state() private isDragging = false;
  @state() private lastMouseX = 0;
  @state() private lastMouseY = 0;

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);

    // Update container dimensions for zoomToFit
    this.updateContainerDimensions();
    window.addEventListener('resize', this.handleResize);

    // Center canvas on launch (like pressing "0")
    requestAnimationFrame(() => {
      viewportStore.zoomToFit(this.clientWidth, this.clientHeight);
      this.initGridCanvas();
      this.requestUpdate();
    });
  }

  private initGridCanvas() {
    if (!this.gridCanvas) return;
    this.gridCtx = this.gridCanvas.getContext('2d');
    this.resizeGridCanvas();
  }

  private handleResize = () => {
    this.updateContainerDimensions();
    this.resizeGridCanvas();
  };

  private resizeGridCanvas() {
    if (!this.gridCanvas) return;
    // Match canvas resolution to actual pixel size for crisp lines
    const dpr = window.devicePixelRatio || 1;
    this.gridCanvas.width = this.clientWidth * dpr;
    this.gridCanvas.height = this.clientHeight * dpr;
    if (this.gridCtx) {
      this.gridCtx.scale(dpr, dpr);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('resize', this.handleResize);

    // Clean up any active drag listeners
    window.removeEventListener('mousemove', this.handleGlobalMouseMove);
    window.removeEventListener('mouseup', this.handleGlobalMouseUp);
  }

  private updateContainerDimensions = () => {
    viewportStore.containerWidth.value = this.clientWidth;
    viewportStore.containerHeight.value = this.clientHeight;
  };

  render() {
    const panX = viewportStore.panX.value;
    const panY = viewportStore.panY.value;
    const zoom = viewportStore.zoom.value;
    const isSpaceDown = viewportStore.isSpacebarDown.value;
    const isPanning = viewportStore.isPanning.value;

    // Access grid signals for reactive updates
    void gridStore.pixelGridEnabled.value;
    void gridStore.tileGridEnabled.value;
    void gridStore.tileGridSize.value;
    void gridStore.pixelGridColor.value;
    void gridStore.pixelGridOpacity.value;
    void gridStore.tileGridColor.value;
    void gridStore.tileGridOpacity.value;

    // Update host attributes for cursor styling
    this.toggleAttribute('space-down', isSpaceDown && !isPanning);
    this.toggleAttribute('panning', isPanning);

    // Draw grids after render
    requestAnimationFrame(() => this.drawGrids());

    return html`
      <div
        class="viewport-content"
        style="transform: translate(${panX}px, ${panY}px) scale(${zoom})"
        @mousedown=${this.handleMouseDown}
        @mousemove=${this.handleMouseMove}
        @mouseleave=${this.handleMouseLeave}
        @wheel=${this.handleWheel}
      >
        <slot></slot>
      </div>
      <canvas id="grid-overlay"></canvas>
    `;
  }

  /**
   * Draw grids at screen resolution (not affected by viewport transform)
   */
  private drawGrids() {
    if (!this.gridCtx) {
      this.initGridCanvas();
      if (!this.gridCtx) return;
    }

    const ctx = this.gridCtx;
    const dpr = window.devicePixelRatio || 1;
    const viewWidth = this.clientWidth;
    const viewHeight = this.clientHeight;

    // Clear the grid canvas
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
    ctx.clearRect(0, 0, this.gridCanvas.width, this.gridCanvas.height);
    ctx.scale(dpr, dpr); // Re-apply DPR scaling

    const zoom = viewportStore.zoom.value;
    const panX = viewportStore.panX.value;
    const panY = viewportStore.panY.value;
    const canvasWidth = projectStore.width.value;
    const canvasHeight = projectStore.height.value;

    // Pixel grid: only show at or above threshold
    if (gridStore.pixelGridEnabled.value && zoom >= gridStore.autoShowThreshold.value) {
      this.drawPixelGrid(ctx, viewWidth, viewHeight, zoom, panX, panY, canvasWidth, canvasHeight);
    }

    // Tile grid: always show if enabled
    if (gridStore.tileGridEnabled.value) {
      this.drawTileGrid(ctx, viewWidth, viewHeight, zoom, panX, panY, canvasWidth, canvasHeight);
    }
  }

  /**
   * Draw pixel grid (1px spacing between each pixel)
   */
  private drawPixelGrid(
    ctx: CanvasRenderingContext2D,
    viewWidth: number,
    viewHeight: number,
    zoom: number,
    panX: number,
    panY: number,
    canvasWidth: number,
    canvasHeight: number
  ) {
    ctx.save();
    ctx.strokeStyle = gridStore.pixelGridColor.value;
    ctx.globalAlpha = gridStore.pixelGridOpacity.value;
    ctx.lineWidth = 1;

    ctx.beginPath();

    // Calculate visible range in canvas coordinates
    const startX = Math.max(0, Math.floor(-panX / zoom));
    const endX = Math.min(canvasWidth, Math.ceil((viewWidth - panX) / zoom));
    const startY = Math.max(0, Math.floor(-panY / zoom));
    const endY = Math.min(canvasHeight, Math.ceil((viewHeight - panY) / zoom));

    // Vertical lines at each pixel boundary
    for (let x = startX; x <= endX; x++) {
      const screenX = Math.round(panX + x * zoom) + 0.5;
      if (screenX >= 0 && screenX <= viewWidth) {
        ctx.moveTo(screenX, Math.max(0, panY));
        ctx.lineTo(screenX, Math.min(viewHeight, panY + canvasHeight * zoom));
      }
    }

    // Horizontal lines at each pixel boundary
    for (let y = startY; y <= endY; y++) {
      const screenY = Math.round(panY + y * zoom) + 0.5;
      if (screenY >= 0 && screenY <= viewHeight) {
        ctx.moveTo(Math.max(0, panX), screenY);
        ctx.lineTo(Math.min(viewWidth, panX + canvasWidth * zoom), screenY);
      }
    }

    ctx.stroke();
    ctx.restore();
  }

  /**
   * Draw tile grid (larger spacing for sprite sheets)
   */
  private drawTileGrid(
    ctx: CanvasRenderingContext2D,
    viewWidth: number,
    viewHeight: number,
    zoom: number,
    panX: number,
    panY: number,
    canvasWidth: number,
    canvasHeight: number
  ) {
    const tileSize = gridStore.tileGridSize.value;

    ctx.save();
    ctx.strokeStyle = gridStore.tileGridColor.value;
    ctx.globalAlpha = gridStore.tileGridOpacity.value;
    ctx.lineWidth = 1;

    ctx.beginPath();

    // Calculate visible range
    const startX = Math.max(0, Math.floor(-panX / zoom / tileSize) * tileSize);
    const endX = Math.min(canvasWidth, Math.ceil((viewWidth - panX) / zoom));
    const startY = Math.max(0, Math.floor(-panY / zoom / tileSize) * tileSize);
    const endY = Math.min(canvasHeight, Math.ceil((viewHeight - panY) / zoom));

    // Vertical lines at tile intervals
    for (let x = startX; x <= endX; x += tileSize) {
      const screenX = Math.round(panX + x * zoom) + 0.5;
      if (screenX >= 0 && screenX <= viewWidth) {
        ctx.moveTo(screenX, Math.max(0, panY));
        ctx.lineTo(screenX, Math.min(viewHeight, panY + canvasHeight * zoom));
      }
    }

    // Horizontal lines at tile intervals
    for (let y = startY; y <= endY; y += tileSize) {
      const screenY = Math.round(panY + y * zoom) + 0.5;
      if (screenY >= 0 && screenY <= viewHeight) {
        ctx.moveTo(Math.max(0, panX), screenY);
        ctx.lineTo(Math.min(viewWidth, panX + canvasWidth * zoom), screenY);
      }
    }

    ctx.stroke();
    ctx.restore();
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    // Skip if typing in an input
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    // Spacebar for pan mode
    if (e.code === 'Space' && !e.repeat) {
      e.preventDefault();
      viewportStore.isSpacebarDown.value = true;
      this.requestUpdate();
      return;
    }

    // Zoom keys 1-6
    if (e.key >= '1' && e.key <= '6') {
      viewportStore.zoomToLevel(parseInt(e.key) as 1 | 2 | 3 | 4 | 5 | 6);
      this.requestUpdate();
      return;
    }

    // +/- for zoom in/out
    if (e.key === '+' || e.key === '=') {
      viewportStore.zoomIn();
      this.requestUpdate();
    } else if (e.key === '-') {
      viewportStore.zoomOut();
      this.requestUpdate();
    } else if (e.key === '0') {
      viewportStore.zoomToFit(this.clientWidth, this.clientHeight);
      this.requestUpdate();
    } else if (e.key === 'Home') {
      viewportStore.resetView();
      this.requestUpdate();
    }

    // Ctrl+G for pixel grid toggle
    if (e.key === 'g' && !e.shiftKey && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      gridStore.togglePixelGrid();
      return;
    }

    // Ctrl+Shift+G for tile grid toggle
    if (e.key === 'G' && e.shiftKey && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      gridStore.toggleTileGrid();
      return;
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      viewportStore.isSpacebarDown.value = false;

      // If we were panning with spacebar, clamp to bounds
      if (viewportStore.isPanning.value || this.isDragging) {
        viewportStore.clampPanToBounds();
      }

      viewportStore.isPanning.value = false;
      this.isDragging = false;
      this.requestUpdate();
    }
  };

  private handleMouseDown(e: MouseEvent) {
    // Spacebar pan mode
    if (viewportStore.isSpacebarDown.value) {
      this.startDragging(e);
      return;
    }

    // Middle click or Alt+Click to pan
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      this.startDragging(e);
    }
  }

  private startDragging(e: MouseEvent) {
    this.isDragging = true;
    viewportStore.isPanning.value = true;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
    e.preventDefault();

    // Attach global listeners to track mouse even outside viewport
    window.addEventListener('mousemove', this.handleGlobalMouseMove);
    window.addEventListener('mouseup', this.handleGlobalMouseUp);

    this.requestUpdate();
  }

  private handleGlobalMouseMove = (e: MouseEvent) => {
    if (!this.isDragging) return;

    const dx = e.clientX - this.lastMouseX;
    const dy = e.clientY - this.lastMouseY;

    viewportStore.panBy(dx, dy);

    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
    this.requestUpdate();
  };

  private handleGlobalMouseUp = () => {
    if (!this.isDragging) return;

    this.isDragging = false;
    viewportStore.isPanning.value = false;

    // Rubber band: snap back to valid bounds
    viewportStore.clampPanToBounds();

    // Remove global listeners
    window.removeEventListener('mousemove', this.handleGlobalMouseMove);
    window.removeEventListener('mouseup', this.handleGlobalMouseUp);

    this.requestUpdate();
  };

  private handleMouseMove(e: MouseEvent) {
    // Track cursor position for keyboard zoom (only when not dragging globally)
    if (!this.isDragging) {
      const rect = this.getBoundingClientRect();
      viewportStore.cursorScreenX.value = e.clientX - rect.left;
      viewportStore.cursorScreenY.value = e.clientY - rect.top;
    }
  }

  private handleMouseLeave() {
    // Clear cursor position when leaving viewport (but not during drag)
    if (!this.isDragging) {
      viewportStore.cursorScreenX.value = null;
      viewportStore.cursorScreenY.value = null;
    }
  }

  private handleWheel(e: WheelEvent) {
    e.preventDefault();

    // Shift+scroll for horizontal pan
    if (e.shiftKey) {
      viewportStore.panBy(-e.deltaY, 0);
      viewportStore.clampPanToBounds();
      this.requestUpdate();
      return;
    }

    // Zoom at cursor position
    const rect = this.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    if (e.deltaY < 0) {
      viewportStore.zoomInAt(screenX, screenY);
    } else {
      viewportStore.zoomOutAt(screenX, screenY);
    }
    this.requestUpdate();
  }
}
