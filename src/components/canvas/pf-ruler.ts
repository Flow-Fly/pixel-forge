import { html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { viewportStore } from "../../stores/viewport";
import { projectStore } from "../../stores/project";
import { guidesStore } from "../../stores/guides";
import "../common/pf-tooltip";

type RulerOrientation = "horizontal" | "vertical";

/**
 * Ruler component for displaying tick marks and creating guides.
 * Can be placed at the top (horizontal) or left (vertical) of the viewport.
 */
@customElement("pf-ruler")
export class PFRuler extends BaseComponent {
  static styles = css`
    :host {
      display: block;
      position: absolute;
      background: var(--color-bg-secondary, #252525);
      overflow: visible;
      z-index: 100;
      user-select: none;
    }

    :host([orientation="horizontal"]) {
      top: 0;
      left: 0;
      right: 0;
      height: 8px;
      cursor: ew-resize;
      transition: height 150ms ease-out;
    }

    :host([orientation="horizontal"][expanded]) {
      height: 24px;
    }

    :host([orientation="vertical"]) {
      top: 0;
      left: 0;
      bottom: 0;
      width: 8px;
      cursor: ns-resize;
      transition: width 150ms ease-out;
    }

    :host([orientation="vertical"][expanded]) {
      width: 24px;
    }

    .canvas-container {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      overflow: hidden;
    }

    .ruler-canvas {
      position: absolute;
      width: 100%;
      height: 100%;
    }

    /* Guide indicator on ruler */
    .guide-marker {
      position: absolute;
      background: var(--pf-color-ember-rest, #00ffff);
      pointer-events: none;
    }

    :host([orientation="horizontal"]) .guide-marker {
      width: 2px;
      height: 100%;
      top: 0;
    }

    :host([orientation="vertical"]) .guide-marker {
      height: 2px;
      width: 100%;
      left: 0;
    }

    /* Delete button on guide marker */
    .guide-delete {
      position: absolute;
      width: 14px;
      height: 14px;
      background: var(--color-bg-tertiary, #333);
      border: 1px solid var(--pf-color-ember-rest, #00ffff);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      opacity: 0;
      transition: opacity 150ms ease-out;
      pointer-events: auto;
    }

    :host(:hover) .guide-delete,
    .guide-delete:hover {
      opacity: 1;
    }

    .guide-delete::before,
    .guide-delete::after {
      content: "";
      position: absolute;
      width: 8px;
      height: 1.5px;
      background: var(--pf-color-ember-rest, #00ffff);
    }

    .guide-delete::before {
      transform: rotate(45deg);
    }

    .guide-delete::after {
      transform: rotate(-45deg);
    }

    :host([orientation="horizontal"]) .guide-delete {
      top: 100%;
      left: 50%;
      transform: translate(-50%, 2px);
    }

    :host([orientation="vertical"]) .guide-delete {
      left: 100%;
      top: 50%;
      transform: translate(2px, -50%);
    }
  `;

  @property({ type: String, reflect: true }) orientation: RulerOrientation =
    "horizontal";

  @state() private expanded = false;
  @state() private isDragging = false;
  @state() private dragPosition: number | null = null;
  @state() private tooltipX = 0;
  @state() private tooltipY = 0;
  @state() private tooltipText = "";

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private hoverTimeout: number | null = null;
  private isMouseDownElsewhere = false; // Track if user is drawing/interacting elsewhere

  private readonly EXPANDED_SIZE = 24;
  private readonly TRIGGER_ZONE = 24; // 1.5rem
  private readonly MAJOR_TICK_INTERVAL = 8;

  connectedCallback() {
    super.connectedCallback();
    // Listen for mouse proximity to expand ruler
    window.addEventListener("mousemove", this.handleWindowMouseMove);
    // Track if user is drawing/interacting elsewhere (don't expand while drawing)
    window.addEventListener("mousedown", this.handleGlobalMouseDown, true);
    window.addEventListener("mouseup", this.handleGlobalMouseUp, true);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("mousemove", this.handleWindowMouseMove);
    window.removeEventListener("mousemove", this.handleDragMove);
    window.removeEventListener("mouseup", this.handleDragEnd);
    window.removeEventListener("mousedown", this.handleGlobalMouseDown, true);
    window.removeEventListener("mouseup", this.handleGlobalMouseUp, true);
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
    }
  }

  protected firstUpdated(): void {
    this.canvas = this.shadowRoot?.querySelector(
      ".ruler-canvas"
    ) as HTMLCanvasElement;
    if (this.canvas) {
      this.ctx = this.canvas.getContext("2d");
      this.resizeCanvas();
      this.drawRuler();
    }

    // Set up resize observer
    const resizeObserver = new ResizeObserver(() => {
      this.resizeCanvas();
      this.drawRuler();
    });
    resizeObserver.observe(this);
  }

  private resizeCanvas(): void {
    if (!this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = this.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    if (this.ctx) {
      this.ctx.scale(dpr, dpr);
    }
  }

  render() {
    // Access reactive signals
    void viewportStore.zoom.value;
    void viewportStore.panX.value;
    void viewportStore.panY.value;
    void projectStore.width.value;
    void projectStore.height.value;
    void guidesStore.horizontalGuide.value;
    void guidesStore.verticalGuide.value;
    void guidesStore.visible.value;

    // Update expanded attribute for CSS
    this.toggleAttribute("expanded", this.expanded);

    // Schedule ruler redraw
    requestAnimationFrame(() => this.drawRuler());

    // Calculate guide marker position
    const guideMarkerStyle = this.getGuideMarkerStyle();

    return html`
      <div class="canvas-container">
        <canvas
          class="ruler-canvas"
          @mousedown=${this.handleMouseDown}
        ></canvas>
      </div>
      ${guideMarkerStyle
        ? html`<div class="guide-marker" style=${guideMarkerStyle}>
            <div class="guide-delete" @click=${this.handleDeleteGuide}></div>
          </div>`
        : nothing}
      <pf-tooltip
        .x=${this.tooltipX}
        .y=${this.tooltipY}
        .text=${this.tooltipText}
        ?visible=${this.isDragging}
      ></pf-tooltip>
    `;
  }

  private getGuideMarkerStyle(): string | null {
    if (!guidesStore.visible.value) return null;

    const zoom = viewportStore.zoom.value;
    const panX = viewportStore.panX.value;
    const panY = viewportStore.panY.value;
    const rulerOffset = this.EXPANDED_SIZE; // 24px

    if (this.orientation === "horizontal") {
      // Top ruler shows marker for vertical guide (X position)
      const guideX = guidesStore.verticalGuide.value;
      if (guideX === null) return null;
      // Adjust for ruler offset (ruler CSS left: 24px, viewport-content at (0,0))
      const screenX = panX - rulerOffset + guideX * zoom;
      return `left: ${screenX}px`;
    } else {
      // Left ruler shows marker for horizontal guide (Y position)
      const guideY = guidesStore.horizontalGuide.value;
      if (guideY === null) return null;
      // Adjust for ruler offset (ruler CSS top: 24px, viewport-content at (0,0))
      const screenY = panY - rulerOffset + guideY * zoom;
      return `top: ${screenY}px`;
    }
  }

  private handleWindowMouseMove = (e: MouseEvent) => {
    if (this.isDragging) return;

    const rect = this.getBoundingClientRect();
    let distance: number;

    if (this.orientation === "horizontal") {
      // Distance from bottom edge of ruler
      distance = e.clientY - rect.bottom;
    } else {
      // Distance from right edge of ruler
      distance = e.clientX - rect.right;
    }

    // Don't expand if user is drawing/interacting elsewhere (mouse down outside ruler)
    // But allow expansion if currently dragging a guide (isDragging is true, handled above)
    const shouldExpand =
      !this.isMouseDownElsewhere &&
      distance >= -rect.height &&
      distance <= this.TRIGGER_ZONE;

    if (shouldExpand !== this.expanded) {
      this.expanded = shouldExpand;
      this.requestUpdate();
      // Redraw after transition
      setTimeout(() => {
        this.resizeCanvas();
        this.drawRuler();
      }, 160);
    }
  };

  private handleGlobalMouseDown = (e: MouseEvent) => {
    // Check if mousedown originated from this ruler
    const path = e.composedPath();
    const isFromThisRuler = path.includes(this);

    if (!isFromThisRuler) {
      this.isMouseDownElsewhere = true;
    }
  };

  private handleGlobalMouseUp = () => {
    this.isMouseDownElsewhere = false;
  };

  private handleMouseDown = (e: MouseEvent) => {
    e.preventDefault();
    this.isDragging = true;
    this.updateDragPosition(e);

    window.addEventListener("mousemove", this.handleDragMove);
    window.addEventListener("mouseup", this.handleDragEnd);
  };

  private handleDragMove = (e: MouseEvent) => {
    if (!this.isDragging) return;
    this.updateDragPosition(e);
  };

  private handleDragEnd = () => {
    if (!this.isDragging) return;

    // Always place guide on release (better UX - no "nothing happened" confusion)
    if (this.dragPosition !== null) {
      // Top ruler (horizontal) controls vertical guide, left ruler (vertical) controls horizontal guide
      if (this.orientation === "horizontal") {
        guidesStore.setVerticalGuide(this.dragPosition);
      } else {
        guidesStore.setHorizontalGuide(this.dragPosition);
      }
    }

    this.isDragging = false;
    this.dragPosition = null;
    guidesStore.clearDragPreview();
    window.removeEventListener("mousemove", this.handleDragMove);
    window.removeEventListener("mouseup", this.handleDragEnd);
    this.requestUpdate();
  };

  private handleDeleteGuide = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Top ruler (horizontal) controls vertical guide, left ruler (vertical) controls horizontal guide
    if (this.orientation === "horizontal") {
      guidesStore.clearGuide("vertical");
    } else {
      guidesStore.clearGuide("horizontal");
    }
    this.requestUpdate();
  };

  private updateDragPosition(e: MouseEvent): void {
    const zoom = viewportStore.zoom.value;
    const panX = viewportStore.panX.value;
    const panY = viewportStore.panY.value;
    const canvasWidth = projectStore.width.value;
    const canvasHeight = projectStore.height.value;
    const rulerOffset = this.EXPANDED_SIZE; // 24px

    this.tooltipX = e.clientX;
    this.tooltipY = e.clientY;

    // Get the ruler's own bounding rect
    const rulerRect = this.getBoundingClientRect();

    let pixelPos: number;

    if (this.orientation === "horizontal") {
      // Top ruler creates vertical guides (X position)
      // Position within ruler canvas
      const posInRuler = e.clientX - rulerRect.left;
      // Adjust for ruler offset: ruler starts at 24px from viewport, canvas at panX
      const adjustedPanX = panX - rulerOffset;
      // Convert to pixel position
      pixelPos = Math.round((posInRuler - adjustedPanX) / zoom);
      pixelPos = Math.max(0, Math.min(canvasWidth, pixelPos));
      this.tooltipText = `X: ${pixelPos}`;
    } else {
      // Left ruler creates horizontal guides (Y position)
      // Position within ruler canvas
      const posInRuler = e.clientY - rulerRect.top;
      // Adjust for ruler offset: ruler starts at 24px from viewport, canvas at panY
      const adjustedPanY = panY - rulerOffset;
      // Convert to pixel position
      pixelPos = Math.round((posInRuler - adjustedPanY) / zoom);
      pixelPos = Math.max(0, Math.min(canvasHeight, pixelPos));
      this.tooltipText = `Y: ${pixelPos}`;
    }

    this.dragPosition = pixelPos;

    // Update drag preview in store
    // Top ruler (horizontal) controls vertical guide, left ruler (vertical) controls horizontal guide
    if (this.orientation === "horizontal") {
      guidesStore.setDragPreview("vertical", pixelPos);
    } else {
      guidesStore.setDragPreview("horizontal", pixelPos);
    }

    this.requestUpdate();
  }

  private drawRuler(): void {
    if (!this.ctx || !this.canvas) return;

    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const width = this.canvas.width / dpr;
    const height = this.canvas.height / dpr;

    // Clear
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.scale(dpr, dpr);

    const zoom = viewportStore.zoom.value;
    const panX = viewportStore.panX.value;
    const panY = viewportStore.panY.value;
    const canvasWidth = projectStore.width.value;
    const canvasHeight = projectStore.height.value;

    // Colors
    const tickColor = "rgba(255, 255, 255, 0.5)";
    const majorTickColor = "rgba(255, 255, 255, 0.8)";
    const textColor = "rgba(255, 255, 255, 0.9)";

    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    if (this.orientation === "horizontal") {
      this.drawHorizontalRuler(
        ctx,
        width,
        height,
        zoom,
        panX,
        canvasWidth,
        tickColor,
        majorTickColor,
        textColor
      );
    } else {
      this.drawVerticalRuler(
        ctx,
        width,
        height,
        zoom,
        panY,
        canvasHeight,
        tickColor,
        majorTickColor,
        textColor
      );
    }
  }

  private drawHorizontalRuler(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    zoom: number,
    panX: number,
    canvasWidth: number,
    tickColor: string,
    majorTickColor: string,
    textColor: string
  ): void {
    // The ruler is CSS-positioned at left: 24px, but viewport-content starts at (0,0)
    // So we need to offset by -24 to align ticks with the canvas
    const rulerOffset = this.EXPANDED_SIZE; // 24px

    // Calculate visible range accounting for the offset
    const adjustedPanX = panX - rulerOffset;
    const startPixel = Math.max(0, Math.floor(-adjustedPanX / zoom));
    const endPixel = Math.min(
      canvasWidth,
      Math.ceil((width - adjustedPanX) / zoom)
    );

    // Determine tick density based on zoom
    const minTickSpacing = 4; // Minimum screen pixels between ticks
    const tickStep =
      zoom >= minTickSpacing ? 1 : Math.ceil(minTickSpacing / zoom);

    // Determine label skip for major ticks
    const minLabelSpacing = 30;
    const labelSkip = Math.ceil(
      minLabelSpacing / (this.MAJOR_TICK_INTERVAL * zoom)
    );

    for (let pixel = startPixel; pixel <= endPixel; pixel += tickStep) {
      const screenX = adjustedPanX + pixel * zoom;
      if (screenX < 0 || screenX > width) continue;

      const isMajor = pixel % this.MAJOR_TICK_INTERVAL === 0;
      // Major ticks take full height, minor ticks are shorter
      const tickHeight = isMajor ? height : Math.max(height * 0.4, 3);

      ctx.strokeStyle = isMajor ? majorTickColor : tickColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      // Draw ticks from top (y=0) going down - same pattern as vertical ruler
      // Major ticks span full height, minor ticks are partial
      const y1 = height; // top of canvas
      const y2 = isMajor ? height : tickHeight; // full height for major, partial for minor
      ctx.moveTo(Math.round(screenX) + 0.5, y1);
      ctx.lineTo(Math.round(screenX) + 0.5, y1 - y2);
      ctx.stroke();

      // Draw numbers for major ticks when expanded
      if (
        this.expanded &&
        isMajor &&
        pixel % (this.MAJOR_TICK_INTERVAL * labelSkip) === 0
      ) {
        ctx.fillStyle = textColor;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(String(pixel), screenX + 3, height / 2);
      }
    }
  }

  private drawVerticalRuler(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    zoom: number,
    panY: number,
    canvasHeight: number,
    tickColor: string,
    majorTickColor: string,
    textColor: string
  ): void {
    // The ruler is CSS-positioned at top: 24px, but viewport-content starts at (0,0)
    // So we need to offset by -24 to align ticks with the canvas
    const rulerOffset = this.EXPANDED_SIZE; // 24px

    // Calculate visible range accounting for the offset
    const adjustedPanY = panY - rulerOffset;
    const startPixel = Math.max(0, Math.floor(-adjustedPanY / zoom));
    const endPixel = Math.min(
      canvasHeight,
      Math.ceil((height - adjustedPanY) / zoom)
    );

    // Determine tick density based on zoom
    const minTickSpacing = 4;
    const tickStep =
      zoom >= minTickSpacing ? 1 : Math.ceil(minTickSpacing / zoom);

    // Determine label skip for major ticks
    const minLabelSpacing = 30;
    const labelSkip = Math.ceil(
      minLabelSpacing / (this.MAJOR_TICK_INTERVAL * zoom)
    );

    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    for (let pixel = startPixel; pixel <= endPixel; pixel += tickStep) {
      const screenY = adjustedPanY + pixel * zoom;
      if (screenY < 0 || screenY > height) continue;

      const isMajor = pixel % this.MAJOR_TICK_INTERVAL === 0;
      // Major ticks take full width, minor ticks are shorter
      const tickWidth = isMajor ? width : Math.max(width * 0.4, 3);

      ctx.strokeStyle = isMajor ? majorTickColor : tickColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      // Draw ticks from right edge going left (toward canvas)
      ctx.moveTo(width - tickWidth, Math.round(screenY) + 0.5);
      ctx.lineTo(width, Math.round(screenY) + 0.5);
      ctx.stroke();

      // Draw numbers for major ticks when expanded (below the tick)
      if (
        this.expanded &&
        isMajor &&
        pixel % (this.MAJOR_TICK_INTERVAL * labelSkip) === 0
      ) {
        ctx.fillStyle = textColor;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(String(pixel), width / 2, screenY + 2);
      }
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pf-ruler": PFRuler;
  }
}
