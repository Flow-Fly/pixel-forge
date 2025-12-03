import { html, css } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { brushStore } from '../../stores/brush';
import { colorStore } from '../../stores/colors';
import { toolStore } from '../../stores/tools';
import { viewportStore } from '../../stores/viewport';

@customElement('pf-brush-cursor-overlay')
export class PFBrushCursorOverlay extends BaseComponent {
  static styles = css`
    :host {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 51;
    }

    canvas {
      width: 100%;
      height: 100%;
    }
  `;

  @query('canvas') canvas!: HTMLCanvasElement;
  @state() private cursorPos: { x: number; y: number } | null = null;

  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrameId = 0;

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('resize', this.handleResize);

    // Listen for cursor position from drawing canvas
    window.addEventListener('canvas-cursor', this.handleCanvasCursor as EventListener);
    window.addEventListener('canvas-cursor-leave', this.handleCanvasCursorLeave);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('canvas-cursor', this.handleCanvasCursor as EventListener);
    window.removeEventListener('canvas-cursor-leave', this.handleCanvasCursorLeave);

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = 0;
    }
  }

  firstUpdated() {
    this.initCanvas();
  }

  updated() {
    // Redraw cursor when signals change (brush size, color, tool, zoom, etc.)
    if (this.cursorPos) {
      this.scheduleDraw();
    }
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

  private handleCanvasCursor = (e: CustomEvent<{ x: number; y: number }>) => {
    this.cursorPos = e.detail;
    this.scheduleDraw();
  };

  private handleCanvasCursorLeave = () => {
    this.cursorPos = null;
    this.clearCanvas();
  };

  private scheduleDraw() {
    // Single frame redraw - cursor moves and signal changes both trigger this
    if (!this.animationFrameId) {
      this.animationFrameId = requestAnimationFrame(() => {
        this.draw();
        this.animationFrameId = 0;
      });
    }
  }

  private clearCanvas() {
    if (!this.ctx || !this.canvas) return;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private draw() {
    if (!this.ctx || !this.canvas || !this.cursorPos) return;

    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;

    // Clear canvas
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.scale(dpr, dpr);

    // Check if we should show preview (only pencil/eraser)
    const tool = toolStore.activeTool.value;
    if (tool !== 'pencil' && tool !== 'eraser') return;

    // Check if in pan mode
    if (viewportStore.isSpacebarDown.value || viewportStore.isPanning.value) return;

    // Get brush settings
    const brush = brushStore.activeBrush.value;
    const size = brush.size;
    const shape = brush.shape;
    const spacing = brushStore.getEffectiveSpacing();

    // Get color based on tool
    const color = tool === 'eraser'
      ? colorStore.secondaryColor.value
      : colorStore.primaryColor.value;

    // Convert canvas coords to screen coords
    const zoom = viewportStore.zoom.value;
    const panX = viewportStore.panX.value;
    const panY = viewportStore.panY.value;

    // Calculate screen position
    let screenX: number;
    let screenY: number;

    if (spacing > 1) {
      // Snap to grid: brush top-left aligns with grid cell
      const gridX = Math.floor(this.cursorPos.x / spacing) * spacing;
      const gridY = Math.floor(this.cursorPos.y / spacing) * spacing;
      screenX = gridX * zoom + panX;
      screenY = gridY * zoom + panY;
    } else {
      // Normal mode: brush centered on cursor
      const halfSize = Math.floor(size / 2);
      screenX = (this.cursorPos.x - halfSize) * zoom + panX;
      screenY = (this.cursorPos.y - halfSize) * zoom + panY;
    }
    const screenSize = size * zoom;

    // Minimum visible size for outline
    const minOutlineSize = Math.max(screenSize, 3);

    // Draw the brush preview
    if (shape === 'square') {
      this.drawSquareBrush(ctx, screenX, screenY, screenSize, minOutlineSize, color);
    } else {
      this.drawCircleBrush(ctx, screenX, screenY, screenSize, minOutlineSize, color);
    }
  }

  private drawSquareBrush(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    outlineSize: number,
    color: string
  ) {
    const outlineOffset = (outlineSize - size) / 2;
    const outlineX = x - outlineOffset;
    const outlineY = y - outlineOffset;

    // Outer black stroke (2px)
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    ctx.strokeRect(outlineX - 1, outlineY - 1, outlineSize + 2, outlineSize + 2);

    // Inner white stroke (1px)
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 1;
    ctx.strokeRect(outlineX - 0.5, outlineY - 0.5, outlineSize + 1, outlineSize + 1);

    // Semi-transparent fill
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(x, y, size, size);
    ctx.globalAlpha = 1;
  }

  private drawCircleBrush(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    outlineSize: number,
    color: string
  ) {
    const centerX = x + size / 2;
    const centerY = y + size / 2;
    const radius = size / 2;
    const outlineRadius = outlineSize / 2;

    // Outer black stroke (2px)
    ctx.beginPath();
    ctx.arc(centerX, centerY, outlineRadius + 1.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Inner white stroke (1px)
    ctx.beginPath();
    ctx.arc(centerX, centerY, outlineRadius + 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Semi-transparent fill
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.5;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  render() {
    // Access signals to trigger re-render when they change
    void brushStore.activeBrush.value;
    void colorStore.primaryColor.value;
    void colorStore.secondaryColor.value;
    void toolStore.activeTool.value;
    void viewportStore.zoom.value;
    void viewportStore.panX.value;
    void viewportStore.panY.value;
    void viewportStore.isSpacebarDown.value;
    void viewportStore.isPanning.value;

    return html`<canvas></canvas>`;
  }
}
