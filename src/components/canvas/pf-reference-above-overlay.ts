import { html, css } from "lit";
import { customElement, query } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { referenceImageStore } from "../../stores/reference-image";
import { viewportStore } from "../../stores/viewport";
import type { ReferenceImage } from "../../types/reference";

@customElement("pf-reference-above-overlay")
export class PFReferenceAboveOverlay extends BaseComponent {
  static styles = css`
    :host {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 44;
    }

    canvas {
      width: 100%;
      height: 100%;
    }
  `;

  @query("canvas") canvas!: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrameId = 0;
  private resizeObserver: ResizeObserver | null = null;

  connectedCallback() {
    super.connectedCallback();
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
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
    if (this.canvas) {
      this.ctx = this.canvas.getContext("2d");
      this.resizeCanvas();
    }
  }

  updated() {
    this.scheduleDraw();
  }

  private handleResize = () => {
    this.resizeCanvas();
    this.scheduleDraw();
  };

  private resizeCanvas() {
    if (!this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.clientWidth * dpr;
    this.canvas.height = this.clientHeight * dpr;
  }

  private scheduleDraw() {
    if (!this.animationFrameId) {
      this.animationFrameId = requestAnimationFrame(() => {
        this.draw();
        this.animationFrameId = 0;
      });
    }
  }

  private draw() {
    if (!this.ctx || !this.canvas) return;

    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.scale(dpr, dpr);

    if (!referenceImageStore.enabled.value) return;

    const zoom = viewportStore.zoom.value;
    const panX = viewportStore.panX.value;
    const panY = viewportStore.panY.value;

    // Draw images that are above layers (aboveLayers: true)
    const aboveImages = referenceImageStore.images.value.filter(
      (img) => img.visible && img.aboveLayers
    );

    for (const img of aboveImages) {
      this.drawImage(ctx, img, zoom, panX, panY);
    }

    // Draw selection handles for active image
    const activeImage = referenceImageStore.getActiveImage();
    if (activeImage && activeImage.visible) {
      this.drawSelectionHandles(ctx, activeImage, zoom, panX, panY);
    }
  }

  private drawImage(
    ctx: CanvasRenderingContext2D,
    img: ReferenceImage,
    zoom: number,
    panX: number,
    panY: number
  ) {
    const scaledWidth = img.canvas.width * img.scale * zoom;
    const scaledHeight = img.canvas.height * img.scale * zoom;
    const screenX = img.x * zoom + panX;
    const screenY = img.y * zoom + panY;

    ctx.save();
    ctx.globalAlpha = img.opacity;
    ctx.translate(screenX + scaledWidth / 2, screenY + scaledHeight / 2);
    ctx.rotate((img.rotation * Math.PI) / 180);
    ctx.drawImage(
      img.canvas,
      -scaledWidth / 2,
      -scaledHeight / 2,
      scaledWidth,
      scaledHeight
    );
    ctx.restore();
  }

  private drawSelectionHandles(
    ctx: CanvasRenderingContext2D,
    img: ReferenceImage,
    zoom: number,
    panX: number,
    panY: number
  ) {
    const scaledWidth = img.canvas.width * img.scale * zoom;
    const scaledHeight = img.canvas.height * img.scale * zoom;
    const screenX = img.x * zoom + panX;
    const screenY = img.y * zoom + panY;

    ctx.save();
    ctx.translate(screenX + scaledWidth / 2, screenY + scaledHeight / 2);
    ctx.rotate((img.rotation * Math.PI) / 180);

    // Draw dashed bounding box
    ctx.strokeStyle = "#00aaff";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(-scaledWidth / 2, -scaledHeight / 2, scaledWidth, scaledHeight);
    ctx.setLineDash([]);

    // Draw corner handles (8px squares)
    const handleSize = 8;
    const handles = [
      { x: -scaledWidth / 2, y: -scaledHeight / 2 }, // top-left
      { x: scaledWidth / 2, y: -scaledHeight / 2 },  // top-right
      { x: -scaledWidth / 2, y: scaledHeight / 2 },  // bottom-left
      { x: scaledWidth / 2, y: scaledHeight / 2 },   // bottom-right
      { x: 0, y: -scaledHeight / 2 },                 // top-center
      { x: 0, y: scaledHeight / 2 },                  // bottom-center
      { x: -scaledWidth / 2, y: 0 },                  // left-center
      { x: scaledWidth / 2, y: 0 },                   // right-center
    ];

    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#00aaff";
    ctx.lineWidth = 1;

    for (const handle of handles) {
      ctx.fillRect(
        handle.x - handleSize / 2,
        handle.y - handleSize / 2,
        handleSize,
        handleSize
      );
      ctx.strokeRect(
        handle.x - handleSize / 2,
        handle.y - handleSize / 2,
        handleSize,
        handleSize
      );
    }

    // Draw rotation handle (circle above top center)
    const rotationHandleY = -scaledHeight / 2 - 20;
    ctx.beginPath();
    ctx.arc(0, rotationHandleY, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#00aaff";
    ctx.stroke();

    // Draw line from top center to rotation handle
    ctx.beginPath();
    ctx.moveTo(0, -scaledHeight / 2);
    ctx.lineTo(0, rotationHandleY + 6);
    ctx.strokeStyle = "#00aaff";
    ctx.stroke();

    ctx.restore();
  }

  render() {
    // Access signals to trigger re-render
    void referenceImageStore.images.value;
    void referenceImageStore.activeImageId.value;
    void referenceImageStore.enabled.value;
    void viewportStore.zoom.value;
    void viewportStore.panX.value;
    void viewportStore.panY.value;

    return html`<canvas></canvas>`;
  }
}
