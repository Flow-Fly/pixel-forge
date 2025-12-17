import { html, css } from "lit";
import { customElement, state, query } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { animationStore } from "../../stores/animation";
import { layerStore } from "../../stores/layers";
import { viewportStore } from "../../stores/viewport";
import { projectStore } from "../../stores/project";

type BackgroundType = "white" | "black" | "checker";

const STORAGE_KEY_POSITION = "pf-preview-position";
const STORAGE_KEY_COLLAPSED = "pf-preview-collapsed";
const STORAGE_KEY_BG = "pf-preview-bg";
const STORAGE_KEY_SIZE = "pf-preview-size";

@customElement("pf-preview-overlay")
export class PFPreviewOverlay extends BaseComponent {
  static styles = css`
    :host {
      position: absolute;
      z-index: 100;
      user-select: none;
      pointer-events: none;
    }

    .container {
      position: relative;
      background: var(--pf-color-bg-panel);
      border: 1px solid var(--pf-color-border);
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      display: flex;
      flex-direction: column;
      min-width: 120px;
      pointer-events: auto;
    }

    .header {
      display: flex;
      align-items: center;
      padding: 4px 8px;
      background: var(--pf-color-bg-surface);
      border-bottom: 1px solid var(--pf-color-border);
      border-radius: 4px 4px 0 0;
      cursor: grab;
      gap: 8px;
    }

    .header:active {
      cursor: grabbing;
    }

    .header-title {
      flex: 1;
      font-size: 11px;
      color: var(--pf-color-text-muted);
    }

    .chevron {
      cursor: pointer;
      color: var(--pf-color-text-muted);
      font-size: 10px;
      transition: transform 0.15s ease;
      padding: 2px;
    }

    .chevron:hover {
      color: var(--pf-color-text-main);
    }

    .chevron.collapsed {
      transform: rotate(-90deg);
    }

    .content {
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transition: max-height 0.15s ease, opacity 0.15s ease;
    }

    .content.collapsed {
      max-height: 0;
      opacity: 0;
      pointer-events: none;
    }

    .preview-area {
      padding: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--pf-color-bg-dark);
      position: relative;
      cursor: crosshair;
    }

    .preview-canvas-wrapper {
      position: relative;
      box-shadow: 0 0 8px rgba(0, 0, 0, 0.4);
    }

    canvas {
      display: block;
      image-rendering: pixelated;
    }

    .bg-white canvas {
      background-color: white;
    }

    .bg-black canvas {
      background-color: black;
    }

    .bg-checker canvas {
      background-image: linear-gradient(45deg, #808080 25%, transparent 25%),
        linear-gradient(-45deg, #808080 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #808080 75%),
        linear-gradient(-45deg, transparent 75%, #808080 75%);
      background-size: 8px 8px;
      background-position: 0 0, 0 4px, 4px -4px, -4px 0px;
      background-color: #c0c0c0;
    }

    .viewport-indicator {
      position: absolute;
      border: 2px solid var(--pf-color-accent);
      pointer-events: none;
      box-sizing: border-box;
    }

    .controls {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 8px;
      border-top: 1px solid var(--pf-color-border);
      background: var(--pf-color-bg-surface);
      gap: 4px;
    }

    .bg-selector {
      display: flex;
      gap: 2px;
    }

    .bg-btn {
      width: 18px;
      height: 18px;
      border: 1px solid var(--pf-color-border);
      border-radius: 2px;
      cursor: pointer;
      padding: 0;
    }

    .bg-btn:hover {
      border-color: var(--pf-color-text-muted);
    }

    .bg-btn.active {
      border-color: var(--pf-color-accent);
      box-shadow: 0 0 0 1px var(--pf-color-accent);
    }

    .bg-btn.white {
      background: white;
    }

    .bg-btn.black {
      background: black;
    }

    .bg-btn.checker {
      background-image: linear-gradient(45deg, #808080 25%, transparent 25%),
        linear-gradient(-45deg, #808080 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #808080 75%),
        linear-gradient(-45deg, transparent 75%, #808080 75%);
      background-size: 6px 6px;
      background-position: 0 0, 0 3px, 3px -3px, -3px 0px;
      background-color: #c0c0c0;
    }

    .play-btn {
      background: var(--pf-color-bg-panel);
      border: 1px solid var(--pf-color-border);
      border-radius: 3px;
      color: var(--pf-color-text-muted);
      cursor: pointer;
      font-size: 10px;
      padding: 2px 8px;
    }

    .play-btn:hover {
      background: var(--pf-color-bg-hover);
      color: var(--pf-color-text-main);
    }

    .resize-handle {
      position: absolute;
      bottom: 0;
      right: 0;
      width: 12px;
      height: 12px;
      cursor: nwse-resize;
      opacity: 0.5;
      transition: opacity 0.15s ease;
    }

    .resize-handle:hover {
      opacity: 1;
    }

    .resize-handle::before,
    .resize-handle::after {
      content: "";
      position: absolute;
      background: var(--pf-color-text-muted);
    }

    .resize-handle::before {
      bottom: 3px;
      right: 3px;
      width: 6px;
      height: 1px;
      transform: rotate(-45deg);
      transform-origin: right bottom;
    }

    .resize-handle::after {
      bottom: 5px;
      right: 5px;
      width: 4px;
      height: 1px;
      transform: rotate(-45deg);
      transform-origin: right bottom;
    }
  `;

  @query("canvas") previewCanvas!: HTMLCanvasElement;

  @state() private collapsed = false;
  @state() private bgType: BackgroundType = "checker";
  @state() private posX = 0;
  @state() private posY = 0;
  @state() private isDragging = false;
  @state() private dragOffsetX = 0;
  @state() private dragOffsetY = 0;
  @state() private previewSize = 128; // User-configurable preview size
  @state() private isResizing = false;
  private resizeStartX = 0;
  private resizeStartY = 0;
  private resizeStartSize = 0;

  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrameId: number = 0;

  // Preview sizing constraints
  private readonly MAX_PREVIEW_SIZE = 300; // Max user-resizable size
  private readonly MIN_PREVIEW_SIZE = 64; // Min user-resizable size

  connectedCallback() {
    super.connectedCallback();
    this.loadState();
    this.startAnimationLoop();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    cancelAnimationFrame(this.animationFrameId);
    window.removeEventListener("mousemove", this.handleMouseMove);
    window.removeEventListener("mouseup", this.handleMouseUp);
    window.removeEventListener("mousemove", this.handleResizeMouseMove);
    window.removeEventListener("mouseup", this.handleResizeMouseUp);
  }

  firstUpdated() {
    if (this.previewCanvas) {
      this.ctx = this.previewCanvas.getContext("2d");
    }
    // Set default position if not loaded
    if (this.posX === 0 && this.posY === 0) {
      this.posX = 8;
      this.posY = 8;
    }
  }

  private loadState() {
    const savedPos = localStorage.getItem(STORAGE_KEY_POSITION);
    if (savedPos) {
      try {
        const { x, y } = JSON.parse(savedPos);
        this.posX = x;
        this.posY = y;
      } catch {}
    }

    const savedCollapsed = localStorage.getItem(STORAGE_KEY_COLLAPSED);
    if (savedCollapsed !== null) {
      this.collapsed = savedCollapsed === "true";
    }

    const savedBg = localStorage.getItem(STORAGE_KEY_BG) as BackgroundType;
    if (savedBg && ["white", "black", "checker"].includes(savedBg)) {
      this.bgType = savedBg;
    }

    const savedSize = localStorage.getItem(STORAGE_KEY_SIZE);
    if (savedSize) {
      const size = parseInt(savedSize, 10);
      if (size >= this.MIN_PREVIEW_SIZE && size <= this.MAX_PREVIEW_SIZE) {
        this.previewSize = size;
      }
    }
  }

  private savePosition() {
    localStorage.setItem(
      STORAGE_KEY_POSITION,
      JSON.stringify({ x: this.posX, y: this.posY })
    );
  }

  private saveCollapsed() {
    localStorage.setItem(STORAGE_KEY_COLLAPSED, String(this.collapsed));
  }

  private saveBgType() {
    localStorage.setItem(STORAGE_KEY_BG, this.bgType);
  }

  private saveSize() {
    localStorage.setItem(STORAGE_KEY_SIZE, String(this.previewSize));
  }

  private toggleCollapse() {
    this.collapsed = !this.collapsed;
    this.saveCollapsed();
  }

  private setBgType(type: BackgroundType) {
    this.bgType = type;
    this.saveBgType();
  }

  private handleHeaderMouseDown = (e: MouseEvent) => {
    // Don't start drag if clicking on chevron
    if ((e.target as HTMLElement).classList.contains("chevron")) return;

    this.isDragging = true;
    this.dragOffsetX = e.clientX - this.posX;
    this.dragOffsetY = e.clientY - this.posY;

    window.addEventListener("mousemove", this.handleMouseMove);
    window.addEventListener("mouseup", this.handleMouseUp);
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (!this.isDragging) return;

    this.posX = e.clientX - this.dragOffsetX;
    this.posY = e.clientY - this.dragOffsetY;

    // Keep within bounds
    const parent = this.parentElement;
    if (parent) {
      const maxX = parent.clientWidth - 140;
      const maxY = parent.clientHeight - 50;
      this.posX = Math.max(0, Math.min(this.posX, maxX));
      this.posY = Math.max(0, Math.min(this.posY, maxY));
    }
  };

  private handleMouseUp = () => {
    this.isDragging = false;
    this.savePosition();
    window.removeEventListener("mousemove", this.handleMouseMove);
    window.removeEventListener("mouseup", this.handleMouseUp);
  };

  private handleResizeMouseDown = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    this.isResizing = true;
    this.resizeStartX = e.clientX;
    this.resizeStartY = e.clientY;
    this.resizeStartSize = this.previewSize;

    window.addEventListener("mousemove", this.handleResizeMouseMove);
    window.addEventListener("mouseup", this.handleResizeMouseUp);
  };

  private handleResizeMouseMove = (e: MouseEvent) => {
    if (!this.isResizing) return;

    // Use the larger of X or Y delta for uniform scaling
    const deltaX = e.clientX - this.resizeStartX;
    const deltaY = e.clientY - this.resizeStartY;
    const delta = Math.max(deltaX, deltaY);

    const newSize = Math.max(
      this.MIN_PREVIEW_SIZE,
      Math.min(this.MAX_PREVIEW_SIZE, this.resizeStartSize + delta)
    );

    this.previewSize = newSize;
  };

  private handleResizeMouseUp = () => {
    this.isResizing = false;
    this.saveSize();
    window.removeEventListener("mousemove", this.handleResizeMouseMove);
    window.removeEventListener("mouseup", this.handleResizeMouseUp);
  };

  private handlePreviewClick(e: MouseEvent) {
    if (!this.previewCanvas) return;

    const rect = this.previewCanvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Convert to canvas coordinates
    const previewScale = this.getPreviewScale();
    const canvasX = clickX / previewScale;
    const canvasY = clickY / previewScale;

    // Center viewport on this point
    viewportStore.centerOn(canvasX, canvasY);
  }

  private togglePlay() {
    // Delegate to store's playback engine
    animationStore.togglePlayback();
  }

  private startAnimationLoop() {
    // This loop only handles rendering - playback is managed by animationStore
    const loop = () => {
      this.renderPreview();
      this.animationFrameId = requestAnimationFrame(loop);
    };
    this.animationFrameId = requestAnimationFrame(loop);
  }

  private renderPreview() {
    if (!this.ctx || !this.previewCanvas) return;

    const currentFrameId = animationStore.currentFrameId.value;
    const layers = layerStore.layers.value;
    const cels = animationStore.cels.value;
    const canvas = this.previewCanvas;
    const previewScale = this.getPreviewScale();

    // Clear at actual canvas size
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Render each visible layer
    for (const layer of layers) {
      if (!layer.visible) continue;

      const key = `${layer.id}:${currentFrameId}`;
      const cel = cels.get(key);
      const canvasToUse = cel?.canvas ?? layer.canvas;

      if (canvasToUse) {
        // Calculate effective opacity: layer opacity * cel opacity
        const layerOpacity = layer.opacity / 255;
        const celOpacity = (cel?.opacity ?? 100) / 100;
        this.ctx.globalAlpha = layerOpacity * celOpacity;

        this.ctx.globalCompositeOperation =
          layer.blendMode === 'normal' ? 'source-over' : layer.blendMode as GlobalCompositeOperation;

        if (previewScale >= 1) {
          // Scaling UP: draw at native resolution, CSS handles pixelated scaling
          this.ctx.drawImage(canvasToUse, 0, 0);
        } else {
          // Scaling DOWN: draw scaled to reduce canvas size for performance
          this.ctx.drawImage(canvasToUse, 0, 0, canvas.width, canvas.height);
        }
      }
    }

    // Reset composite settings
    this.ctx.globalAlpha = 1;
    this.ctx.globalCompositeOperation = 'source-over';
  }

  /**
   * Calculate the preview scale to fit the canvas within the user-defined previewSize.
   */
  private getPreviewScale(): number {
    const canvasW = projectStore.width.value;
    const canvasH = projectStore.height.value;
    const maxDim = Math.max(canvasW, canvasH);

    // Scale to fit within user-defined preview size
    return this.previewSize / maxDim;
  }

  private getViewportIndicatorStyle() {
    const canvasW = projectStore.width.value;
    const canvasH = projectStore.height.value;
    const zoom = viewportStore.zoom.value;
    const panX = viewportStore.panX.value;
    const panY = viewportStore.panY.value;
    const containerW = viewportStore.containerWidth.value;
    const containerH = viewportStore.containerHeight.value;

    if (containerW === 0 || containerH === 0) return null;

    // Calculate what portion of the canvas is visible
    // Visible area in canvas coordinates
    const visibleLeft = Math.max(0, -panX / zoom);
    const visibleTop = Math.max(0, -panY / zoom);
    const visibleRight = Math.min(canvasW, (containerW - panX) / zoom);
    const visibleBottom = Math.min(canvasH, (containerH - panY) / zoom);

    // Convert to preview coordinates
    const scale = this.getPreviewScale();
    const left = visibleLeft * scale;
    const top = visibleTop * scale;
    const width = (visibleRight - visibleLeft) * scale;
    const height = (visibleBottom - visibleTop) * scale;

    // Don't show if viewport covers entire canvas
    if (
      visibleLeft <= 0 &&
      visibleTop <= 0 &&
      visibleRight >= canvasW &&
      visibleBottom >= canvasH
    ) {
      return null;
    }

    return {
      left: `${left}px`,
      top: `${top}px`,
      width: `${Math.max(4, width)}px`,
      height: `${Math.max(4, height)}px`,
    };
  }

  render() {
    const isPlaying = animationStore.isPlaying.value;
    const canvasW = projectStore.width.value;
    const canvasH = projectStore.height.value;
    const previewScale = this.getPreviewScale();
    const displayW = Math.round(canvasW * previewScale);
    const displayH = Math.round(canvasH * previewScale);

    // For small canvases (scaling UP): use native resolution, CSS handles pixelated scaling
    // For large canvases (scaling DOWN): use reduced resolution for performance
    const actualCanvasW = previewScale >= 1 ? canvasW : displayW;
    const actualCanvasH = previewScale >= 1 ? canvasH : displayH;

    const viewportStyle = this.getViewportIndicatorStyle();

    return html`
      <div
        class="container"
        style="transform: translate(${this.posX}px, ${this.posY}px)"
      >
        <div class="header" @mousedown=${this.handleHeaderMouseDown}>
          <span
            class="chevron ${this.collapsed ? "collapsed" : ""}"
            @click=${this.toggleCollapse}
            >▼</span
          >
          <span class="header-title">Preview</span>
        </div>

        <div
          class="content ${this.collapsed ? "collapsed" : ""}"
          style="${!this.collapsed
            ? `max-height: ${this.previewSize + 100}px`
            : ""}"
        >
          <div
            class="preview-area bg-${this.bgType}"
            @click=${this.handlePreviewClick}
          >
            <div class="preview-canvas-wrapper">
              <canvas
                width="${actualCanvasW}"
                height="${actualCanvasH}"
                style="width: ${displayW}px; height: ${displayH}px;"
              ></canvas>
              ${viewportStyle
                ? html`
                    <div
                      class="viewport-indicator"
                      style="left: ${viewportStyle.left}; top: ${viewportStyle.top}; width: ${viewportStyle.width}; height: ${viewportStyle.height};"
                    ></div>
                  `
                : ""}
            </div>
          </div>

          <div class="controls">
            <div class="bg-selector">
              <button
                class="bg-btn white ${this.bgType === "white" ? "active" : ""}"
                @click=${() => this.setBgType("white")}
                title="White background"
              ></button>
              <button
                class="bg-btn black ${this.bgType === "black" ? "active" : ""}"
                @click=${() => this.setBgType("black")}
                title="Black background"
              ></button>
              <button
                class="bg-btn checker ${this.bgType === "checker"
                  ? "active"
                  : ""}"
                @click=${() => this.setBgType("checker")}
                title="Transparent (checker)"
              ></button>
            </div>
            <button class="play-btn" @click=${this.togglePlay}>
              ${isPlaying ? "⏸" : "▶"}
            </button>
          </div>
        </div>
        <div
          class="resize-handle"
          @mousedown=${this.handleResizeMouseDown}
          title="Drag to resize"
        ></div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pf-preview-overlay": PFPreviewOverlay;
  }
}
