import { html, css, type PropertyValues } from "lit";
import { customElement, property } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";

/**
 * Reusable tooltip component that follows a position and displays text.
 * Automatically flips to stay within viewport bounds.
 */
@customElement("pf-tooltip")
export class PFTooltip extends BaseComponent {
  static styles = css`
    :host {
      position: fixed;
      pointer-events: none;
      z-index: 10000;
      opacity: 0;
      transition: opacity 100ms ease-out;
    }

    :host([visible]) {
      opacity: 1;
    }

    .tooltip {
      background: var(--pf-color-bg-tertiary, #2a2a2a);
      color: var(--pf-color-text-primary, #ffffff);
      font-family: monospace;
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 4px;
      white-space: nowrap;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      border: 1px solid var(--pf-color-border, #444);
    }
  `;

  /** Screen X position to anchor tooltip */
  @property({ type: Number }) x = 0;

  /** Screen Y position to anchor tooltip */
  @property({ type: Number }) y = 0;

  /** Text content to display */
  @property({ type: String }) text = "";

  /** Whether tooltip is visible */
  @property({ type: Boolean, reflect: true }) visible = false;

  /** Offset from cursor position */
  private readonly OFFSET = 12;

  protected updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties);

    if (
      changedProperties.has("x") ||
      changedProperties.has("y") ||
      changedProperties.has("visible")
    ) {
      this.updatePosition();
    }
  }

  private updatePosition(): void {
    if (!this.visible) return;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Get tooltip dimensions (estimate if not yet rendered)
    const tooltipEl = this.shadowRoot?.querySelector(".tooltip");
    const tooltipWidth = tooltipEl?.clientWidth ?? 60;
    const tooltipHeight = tooltipEl?.clientHeight ?? 24;

    // Default: position to the right and below cursor
    let posX = this.x + this.OFFSET;
    let posY = this.y + this.OFFSET;

    // Flip horizontally if too close to right edge
    if (posX + tooltipWidth > viewportWidth - 8) {
      posX = this.x - tooltipWidth - this.OFFSET;
    }

    // Flip vertically if too close to bottom edge
    if (posY + tooltipHeight > viewportHeight - 8) {
      posY = this.y - tooltipHeight - this.OFFSET;
    }

    // Ensure minimum bounds
    posX = Math.max(8, posX);
    posY = Math.max(8, posY);

    this.style.left = `${posX}px`;
    this.style.top = `${posY}px`;
  }

  render() {
    return html`<div class="tooltip">${this.text}</div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pf-tooltip": PFTooltip;
  }
}
