import { html, css, nothing } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import type { Command } from '../../stores/history';
import { isDrawableCommand } from '../../commands/index';
import { layerStore } from '../../stores/layers';

/**
 * Tooltip component that shows before/after diff for a history command.
 * For drawable commands, shows two small canvases with the affected region.
 * For non-drawable commands, shows a text description.
 */
@customElement('pf-history-diff-tooltip')
export class PFHistoryDiffTooltip extends BaseComponent {
  @property({ type: Object }) command: Command | null = null;
  @property({ type: Object }) anchorRect: DOMRect | null = null;
  @property({ type: Boolean, reflect: true }) open = false;
  @property({ type: Boolean }) expanded = false; // Larger view for expanded state

  @query('.before-canvas') beforeCanvas!: HTMLCanvasElement;
  @query('.after-canvas') afterCanvas!: HTMLCanvasElement;

  @state() private computedTop = 0;
  @state() private computedLeft = 0;

  static styles = css`
    :host {
      display: none;
      position: fixed;
      z-index: 1000;
    }

    :host([open]) {
      display: block;
    }

    .tooltip {
      background-color: var(--pf-color-bg-panel, #141414);
      border: 1px solid var(--pf-color-border, #333);
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      padding: 8px;
      max-width: 300px;
    }

    .diff-container {
      display: flex;
      gap: 8px;
      align-items: flex-start;
    }

    .diff-panel {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }

    .diff-label {
      font-size: 10px;
      color: var(--pf-color-text-muted, #808080);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .canvas-wrapper {
      border: 1px solid var(--pf-color-border, #333);
      background-image: linear-gradient(45deg, #404040 25%, transparent 25%),
        linear-gradient(-45deg, #404040 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #404040 75%),
        linear-gradient(-45deg, transparent 75%, #404040 75%);
      background-size: 8px 8px;
      background-position: 0 0, 0 4px, 4px -4px, -4px 0px;
      background-color: #2a2a2a;
    }

    canvas {
      display: block;
      image-rendering: pixelated;
    }

    /* Hover tooltip size */
    :host(:not([expanded])) canvas {
      width: 64px;
      height: 64px;
    }

    /* Expanded view size */
    :host([expanded]) canvas {
      width: 96px;
      height: 96px;
    }

    .text-description {
      font-size: 12px;
      color: var(--pf-color-text-main, #e0e0e0);
      padding: 4px 0;
    }

    .arrow {
      position: absolute;
      width: 8px;
      height: 8px;
      background-color: var(--pf-color-bg-panel, #141414);
      border: 1px solid var(--pf-color-border, #333);
      transform: rotate(45deg);
      left: -5px;
      top: 12px;
      border-right: none;
      border-top: none;
    }

    .layer-deleted {
      color: var(--pf-color-text-muted, #808080);
      font-style: italic;
      font-size: 11px;
    }
  `;

  updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties);

    if (changedProperties.has('open') || changedProperties.has('anchorRect')) {
      if (this.open && this.anchorRect) {
        this.updatePosition();
      }
    }

    if (changedProperties.has('command') || changedProperties.has('open')) {
      if (this.open && this.command) {
        // Defer rendering to next frame to ensure canvases are in DOM
        requestAnimationFrame(() => this.renderDiff());
      }
    }
  }

  private updatePosition() {
    if (!this.anchorRect) return;

    const rect = this.anchorRect;
    const gap = 8;

    // Position to the left of the anchor (history panel is on the right)
    this.computedTop = rect.top;
    this.computedLeft = rect.left - gap - (this.expanded ? 220 : 180);

    // Keep within viewport
    const maxLeft = window.innerWidth - 220;
    const maxTop = window.innerHeight - 200;
    this.computedLeft = Math.max(8, Math.min(this.computedLeft, maxLeft));
    this.computedTop = Math.max(8, Math.min(this.computedTop, maxTop));

    this.style.top = `${this.computedTop}px`;
    this.style.left = `${this.computedLeft}px`;
  }

  private renderDiff() {
    if (!this.command || !isDrawableCommand(this.command)) return;

    const cmd = this.command;
    const bounds = cmd.drawBounds;
    const prevData = cmd.drawPreviousData;
    const newData = cmd.drawNewData;

    // Render before canvas
    if (this.beforeCanvas) {
      const ctx = this.beforeCanvas.getContext('2d');
      if (ctx) {
        this.beforeCanvas.width = bounds.width;
        this.beforeCanvas.height = bounds.height;
        const imageData = new ImageData(
          new Uint8ClampedArray(prevData),
          bounds.width,
          bounds.height
        );
        ctx.putImageData(imageData, 0, 0);
      }
    }

    // Render after canvas
    if (this.afterCanvas) {
      const ctx = this.afterCanvas.getContext('2d');
      if (ctx) {
        this.afterCanvas.width = bounds.width;
        this.afterCanvas.height = bounds.height;
        const imageData = new ImageData(
          new Uint8ClampedArray(newData),
          bounds.width,
          bounds.height
        );
        ctx.putImageData(imageData, 0, 0);
      }
    }
  }

  private getCommandDescription(): string {
    if (!this.command) return '';

    // For non-drawable commands, provide descriptive text
    const name = this.command.name;

    // Try to extract more context based on command type
    if (name.includes('Layer')) {
      return name;
    }
    if (name.includes('Frame')) {
      return name;
    }
    if (name.includes('Flip')) {
      return name;
    }
    if (name.includes('Rotate')) {
      return name;
    }

    return name;
  }

  private isLayerDeleted(): boolean {
    if (!this.command || !isDrawableCommand(this.command)) return false;

    const layerId = this.command.drawLayerId;
    const layer = layerStore.layers.value.find(l => l.id === layerId);
    return !layer;
  }

  render() {
    if (!this.command) return nothing;

    // Check if this is a drawable command
    const isDrawable = isDrawableCommand(this.command);
    const layerDeleted = isDrawable && this.isLayerDeleted();

    // Update expanded attribute for CSS
    this.toggleAttribute('expanded', this.expanded);

    return html`
      <div class="tooltip">
        <div class="arrow"></div>
        ${isDrawable
          ? layerDeleted
            ? html`<div class="layer-deleted">Layer deleted</div>`
            : html`
                <div class="diff-container">
                  <div class="diff-panel">
                    <span class="diff-label">Before</span>
                    <div class="canvas-wrapper">
                      <canvas class="before-canvas"></canvas>
                    </div>
                  </div>
                  <div class="diff-panel">
                    <span class="diff-label">After</span>
                    <div class="canvas-wrapper">
                      <canvas class="after-canvas"></canvas>
                    </div>
                  </div>
                </div>
              `
          : html`
              <div class="text-description">
                ${this.getCommandDescription()}
              </div>
            `}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pf-history-diff-tooltip': PFHistoryDiffTooltip;
  }
}
