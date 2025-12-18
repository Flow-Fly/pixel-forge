import { html, css, LitElement, nothing } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';

/**
 * Timeline tooltip component for showing frame/layer previews on hover.
 * Uses HTML popover with CSS anchor positioning for smart placement.
 */
@customElement('pf-timeline-tooltip')
export class PFTimelineTooltip extends LitElement {
  static styles = css`
    :host {
      display: contents;
    }

    .tooltip {
      position: fixed;
      margin: 0;
      padding: 0;
      border: none;
      background: transparent;
      overflow: visible;
    }

    .tooltip:popover-open {
      display: block;
    }

    .tooltip-content {
      background: var(--pf-color-bg-tooltip, #1a1a1a);
      border: 1px solid var(--pf-color-border, #444);
      border-radius: 6px;
      padding: 8px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      min-width: 80px;
    }

    .preview-canvas {
      display: block;
      image-rendering: pixelated;
      border-radius: 2px;
      background-image:
        linear-gradient(45deg, #333 25%, transparent 25%),
        linear-gradient(-45deg, #333 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #333 75%),
        linear-gradient(-45deg, transparent 75%, #333 75%);
      background-size: 8px 8px;
      background-position: 0 0, 0 4px, 4px -4px, -4px 0px;
      background-color: #222;
    }

    .tooltip-info {
      font-size: 11px;
      color: var(--pf-color-text-muted, #aaa);
      text-align: center;
      white-space: nowrap;
    }

    .tooltip-info .primary {
      color: var(--pf-color-text-main, #fff);
      font-weight: 500;
    }

    .tooltip-info .secondary {
      opacity: 0.7;
      font-size: 10px;
    }
  `;

  @property({ type: Number }) canvasWidth = 64;
  @property({ type: Number }) canvasHeight = 64;
  @property({ type: String }) primaryText = '';
  @property({ type: String }) secondaryText = '';

  // Max display size for preview (constrains large canvases)
  private readonly MAX_PREVIEW_SIZE = 128;
  // Min display size for preview (enhances visibility for tiny canvases)
  private readonly MIN_PREVIEW_SIZE = 64;

  @state() private posX = 0;
  @state() private posY = 0;

  @query('canvas') private canvas!: HTMLCanvasElement;
  @query('[popover]') private popoverEl!: HTMLElement;

  private ctx: CanvasRenderingContext2D | null = null;
  private anchorElement: HTMLElement | null = null;
  private hideTimeout: number | null = null;
  private longPressTimeout: number | null = null;

  connectedCallback() {
    super.connectedCallback();
  }

  firstUpdated() {
    if (this.canvas) {
      this.ctx = this.canvas.getContext('2d', { alpha: true });
      if (this.ctx) {
        this.ctx.imageSmoothingEnabled = false;
      }
    }
  }

  /**
   * Get the canvas context for external rendering.
   */
  getContext(): CanvasRenderingContext2D | null {
    return this.ctx;
  }

  /**
   * Show the tooltip anchored to an element.
   */
  show(anchor: HTMLElement) {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }

    this.anchorElement = anchor;
    this.updatePosition();

    // Use popover API if available
    if (this.popoverEl && 'showPopover' in this.popoverEl) {
      try {
        this.popoverEl.showPopover();
      } catch {
        // Popover might already be shown
      }
    }
  }

  /**
   * Hide the tooltip with optional delay.
   */
  hide(delay: number = 100) {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
    }

    this.hideTimeout = window.setTimeout(() => {
      if (this.popoverEl && 'hidePopover' in this.popoverEl) {
        try {
          this.popoverEl.hidePopover();
        } catch {
          // Popover might already be hidden
        }
      }
      this.hideTimeout = null;
    }, delay);
  }

  /**
   * Cancel a pending hide.
   */
  cancelHide() {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
  }

  /**
   * Start long-press detection for touch devices.
   */
  startLongPress(anchor: HTMLElement, callback: () => void) {
    this.cancelLongPress();
    this.longPressTimeout = window.setTimeout(() => {
      callback();
      this.show(anchor);
    }, 500);
  }

  /**
   * Cancel long-press detection.
   */
  cancelLongPress() {
    if (this.longPressTimeout) {
      clearTimeout(this.longPressTimeout);
      this.longPressTimeout = null;
    }
  }

  /**
   * Calculate the preview scale to fit within MIN/MAX_PREVIEW_SIZE bounds.
   * Ensures preview is at least MIN_PREVIEW_SIZE and at most MAX_PREVIEW_SIZE.
   */
  private getPreviewScale(): number {
    const maxDim = Math.max(this.canvasWidth, this.canvasHeight);

    // For large canvases, scale down to fit MAX_PREVIEW_SIZE
    if (maxDim > this.MAX_PREVIEW_SIZE) {
      return this.MAX_PREVIEW_SIZE / maxDim;
    }

    // For small canvases, scale up to reach MIN_PREVIEW_SIZE
    if (maxDim < this.MIN_PREVIEW_SIZE) {
      return this.MIN_PREVIEW_SIZE / maxDim;
    }

    return 1;
  }

  /**
   * Clear the preview canvas.
   */
  clear() {
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    }
  }

  /**
   * Draw a source canvas onto the preview.
   */
  drawImage(source: HTMLCanvasElement | HTMLImageElement, opacity: number = 1) {
    if (!this.ctx) return;
    this.ctx.globalAlpha = opacity;
    this.ctx.drawImage(source, 0, 0);
    this.ctx.globalAlpha = 1;
  }

  private updatePosition() {
    if (!this.anchorElement) return;

    const rect = this.anchorElement.getBoundingClientRect();
    const previewScale = this.getPreviewScale();
    const tooltipWidth = this.canvasWidth * previewScale + 16; // padding
    const tooltipHeight = this.canvasHeight * previewScale + 50; // padding + text

    // Position above the anchor by default
    let x = rect.left + rect.width / 2 - tooltipWidth / 2;
    let y = rect.top - tooltipHeight - 8;

    // If would go off top, position below
    if (y < 8) {
      y = rect.bottom + 8;
    }

    // Keep within horizontal bounds
    x = Math.max(8, Math.min(x, window.innerWidth - tooltipWidth - 8));

    this.posX = x;
    this.posY = y;
  }

  render() {
    const previewScale = this.getPreviewScale();
    const displayWidth = this.canvasWidth * previewScale;
    const displayHeight = this.canvasHeight * previewScale;

    return html`
      <div
        class="tooltip"
        popover="manual"
        style="left: ${this.posX}px; top: ${this.posY}px;"
      >
        <div class="tooltip-content">
          <canvas
            class="preview-canvas"
            width="${this.canvasWidth}"
            height="${this.canvasHeight}"
            style="width: ${displayWidth}px; height: ${displayHeight}px;"
          ></canvas>
          ${this.primaryText || this.secondaryText ? html`
            <div class="tooltip-info">
              ${this.primaryText ? html`<div class="primary">${this.primaryText}</div>` : nothing}
              ${this.secondaryText ? html`<div class="secondary">${this.secondaryText}</div>` : nothing}
            </div>
          ` : nothing}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pf-timeline-tooltip': PFTimelineTooltip;
  }
}
