import { html, css, render } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { animationStore } from "../../stores/animation";
import { layerStore } from "../../stores/layers";
import { projectStore } from "../../stores/project";
import {
  renderFrameToCanvas,
  getFrameIdsForTag,
} from "../../utils/preview-renderer";

const PREVIEW_SCALE = 2;
const HOVER_DELAY = 300;

/**
 * Tag preview component that uses a portal pattern to escape
 * any parent transforms that would break fixed positioning.
 */
@customElement("pf-tag-preview")
export class PFTagPreview extends BaseComponent {
  // No styles needed - we render to a portal outside shadow DOM
  static styles = css`
    :host {
      display: none;
    }
  `;

  @property({ type: String, reflect: true }) tagId: string = "";
  @property({ type: Boolean, reflect: true }) visible: boolean = false;
  @property({ type: Number }) posX: number = 0;
  @property({ type: Number }) posY: number = 0;

  @state() private displayTagName: string = "";
  @state() private computedX: number = 0;
  @state() private computedY: number = 0;

  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrameId: number | null = null;
  private frameIds: string[] = [];
  private currentFrameIndex: number = 0;
  private lastFrameTime: number = 0;
  private hoverTimeout: number | null = null;

  // Portal container on document.body
  private portalContainer: HTMLDivElement | null = null;

  connectedCallback() {
    super.connectedCallback();
    // Create portal container on document.body
    this.portalContainer = document.createElement("div");
    this.portalContainer.id = `tag-preview-portal-${this.tagId || "default"}`;
    this.portalContainer.style.cssText = `
      position: fixed;
      z-index: 10000;
      pointer-events: none;
      display: none;
    `;
    document.body.appendChild(this.portalContainer);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stopAnimation();
    this.clearHoverTimeout();
    // Remove portal from body
    if (this.portalContainer && this.portalContainer.parentNode) {
      this.portalContainer.parentNode.removeChild(this.portalContainer);
      this.portalContainer = null;
    }
  }

  updated(changedProps: Map<string, unknown>) {
    if (changedProps.has("visible")) {
      if (this.visible) {
        // Calculate position before showing
        this.updatePosition();
        // Show portal
        if (this.portalContainer) {
          this.portalContainer.style.display = "block";
        }
        // Render to portal and start animation
        this.renderToPortal();
        requestAnimationFrame(() => {
          this.initCanvasContext();
          this.startAnimation();
        });
      } else {
        this.stopAnimation();
        // Hide portal
        if (this.portalContainer) {
          this.portalContainer.style.display = "none";
        }
      }
    }

    if (changedProps.has("tagId") && this.tagId) {
      this.loadTagInfo();
    }

    // Recalculate position when posX or posY change
    if (
      (changedProps.has("posX") || changedProps.has("posY")) &&
      this.visible
    ) {
      this.updatePosition();
      this.renderToPortal();
    }
  }

  private initCanvasContext() {
    // Query from portal container
    if (!this.ctx && this.portalContainer) {
      const canvas = this.portalContainer.querySelector(
        ".preview-canvas"
      ) as HTMLCanvasElement | null;
      if (canvas) {
        this.ctx = canvas.getContext("2d");
      }
    }
  }

  private loadTagInfo() {
    const tag = animationStore.tags.value.find((t) => t.id === this.tagId);
    if (tag) {
      this.displayTagName = tag.name;
      this.frameIds = getFrameIdsForTag(this.tagId);
      this.currentFrameIndex = 0;
    }
  }

  /**
   * Calculate position with viewport bounds checking.
   * Positions above the anchor by default, falls back to below if off-screen.
   */
  private updatePosition() {
    const canvasW = projectStore.width.value;
    const canvasH = projectStore.height.value;
    const displayH = canvasH * PREVIEW_SCALE;
    const displayW = canvasW * PREVIEW_SCALE;
    const padding = 16; // 8px padding on each side
    const labelHeight = 24; // label + gap
    const tooltipHeight = displayH + padding + labelHeight;
    const tooltipWidth = displayW + padding;

    // Center horizontally on posX
    let x = this.posX - tooltipWidth / 2;
    // Position above the anchor with 8px gap
    let y = this.posY - tooltipHeight - 8;

    // If would go off top, position below the anchor instead
    if (y < 8) {
      y = this.posY + 24; // 24px below anchor (approximate tag height + gap)
    }

    // Keep within horizontal bounds
    x = Math.max(8, Math.min(x, window.innerWidth - tooltipWidth - 8));

    this.computedX = x;
    this.computedY = y;
  }

  /**
   * Render the preview content to the portal container.
   */
  private renderToPortal() {
    if (!this.portalContainer) return;

    const canvasW = projectStore.width.value;
    const canvasH = projectStore.height.value;
    const displayW = canvasW * PREVIEW_SCALE;
    const displayH = canvasH * PREVIEW_SCALE;
    const frameCount = this.frameIds.length;

    const template = html`
      <div
        class="preview-container"
        style="
          position: fixed;
          left: ${this.computedX}px;
          top: ${this.computedY}px;
          z-index: 10000;
          pointer-events: none;
          background: var(--pf-color-bg-panel, #1e1e1e);
          border: 1px solid var(--pf-color-border, #3e3e3e);
          border-radius: 4px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
          padding: 8px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        "
      >
        <canvas
          class="preview-canvas"
          width="${canvasW}"
          height="${canvasH}"
          style="
            display: block;
            image-rendering: pixelated;
            width: ${displayW}px;
            height: ${displayH}px;
            background-image: linear-gradient(45deg, #404040 25%, transparent 25%),
              linear-gradient(-45deg, #404040 25%, transparent 25%),
              linear-gradient(45deg, transparent 75%, #404040 75%),
              linear-gradient(-45deg, transparent 75%, #404040 75%);
            background-size: 8px 8px;
            background-position: 0 0, 0 4px, 4px -4px, -4px 0px;
            background-color: #606060;
          "
        ></canvas>
        <span
          style="
            font-size: 10px;
            color: var(--pf-color-text-muted, #888);
            white-space: nowrap;
          "
          >${this.displayTagName} (${frameCount} frames)</span
        >
      </div>
    `;

    // Reset context since we're re-rendering
    this.ctx = null;
    render(template, this.portalContainer);
  }

  /**
   * Show the preview after a delay.
   * Call this when hovering over a tag.
   */
  showWithDelay(tagId: string, x: number, y: number) {
    this.clearHoverTimeout();

    this.hoverTimeout = window.setTimeout(() => {
      this.tagId = tagId;
      this.posX = x;
      this.posY = y;
      this.loadTagInfo();
      // Reset canvas context so it gets re-initialized when visible
      this.ctx = null;
      this.visible = true;
    }, HOVER_DELAY);
  }

  /**
   * Hide the preview and cancel any pending show.
   */
  hide() {
    this.clearHoverTimeout();
    this.visible = false;
    this.stopAnimation();
  }

  private clearHoverTimeout() {
    if (this.hoverTimeout !== null) {
      window.clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }
  }

  private startAnimation() {
    if (this.animationFrameId !== null) return;

    this.lastFrameTime = performance.now();

    const loop = (timestamp: number) => {
      if (!this.visible) {
        this.animationFrameId = null;
        return;
      }

      // Get frame duration from current frame or use default
      const frames = animationStore.frames.value;
      const currentFrameId = this.frameIds[this.currentFrameIndex];
      const currentFrame = frames.find((f) => f.id === currentFrameId);
      const frameDuration = currentFrame?.duration ?? 100;

      const elapsed = timestamp - this.lastFrameTime;

      if (elapsed >= frameDuration) {
        // Advance to next frame
        this.currentFrameIndex =
          (this.currentFrameIndex + 1) % this.frameIds.length;
        this.lastFrameTime = timestamp;
      }

      this.renderFrame();
      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  private stopAnimation() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private renderFrame() {
    if (!this.ctx || this.frameIds.length === 0) return;

    const frameId = this.frameIds[this.currentFrameIndex];
    const layers = layerStore.layers.value;
    const cels = animationStore.cels.value;

    renderFrameToCanvas(this.ctx, frameId, layers, cels);
  }

  // No content rendered in shadow DOM - everything goes to portal
  render() {
    return html``;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pf-tag-preview": PFTagPreview;
  }
}
