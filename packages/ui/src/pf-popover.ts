import { html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { BaseComponent } from "./base-component";

export type PopoverPosition = "right" | "bottom" | "left" | "top";

@customElement("pf-popover")
export class PFPopover extends BaseComponent {
  @property({ type: Boolean, reflect: true }) open = false;
  @property({ type: String }) position: PopoverPosition = "right";
  @property({ type: Object }) anchorRect?: DOMRect;

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

    .popover {
      background-color: var(--pf-color-bg-panel, #141414);
      border: 1px solid var(--pf-color-border, #333);
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      min-width: 150px;
      max-width: 280px;
      overflow: hidden;
    }

    .popover-content {
      padding: 8px;
    }

    .arrow {
      position: absolute;
      width: 8px;
      height: 8px;
      background-color: var(--pf-color-bg-panel, #141414);
      border: 1px solid var(--pf-color-border, #333);
      transform: rotate(45deg);
    }

    :host([position="right"]) .arrow {
      left: -5px;
      top: 12px;
      border-right: none;
      border-top: none;
    }

    :host([position="left"]) .arrow {
      right: -5px;
      top: 12px;
      border-left: none;
      border-bottom: none;
    }

    :host([position="bottom"]) .arrow {
      top: -5px;
      left: 12px;
      border-bottom: none;
      border-right: none;
    }

    :host([position="top"]) .arrow {
      bottom: -5px;
      left: 12px;
      border-top: none;
      border-left: none;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener("click", this.handleSelfClick);
    document.addEventListener("click", this.handleOutsideClick);
    document.addEventListener("keydown", this.handleKeyDown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener("click", this.handleSelfClick);
    document.removeEventListener("click", this.handleOutsideClick);
    document.removeEventListener("keydown", this.handleKeyDown);
  }

  updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties);
    if (changedProperties.has("open") || changedProperties.has("anchorRect")) {
      if (this.open && this.anchorRect) {
        // Initial position update
        this.updatePosition();
        // Recalculate after content renders (for accurate dimensions)
        requestAnimationFrame(() => this.updatePosition());
      }
    }
  }

  private updatePosition() {
    if (!this.anchorRect) return;

    const rect = this.anchorRect;
    const gap = 8;

    // Get actual popover dimensions after render
    const popover = this.shadowRoot?.querySelector(".popover") as HTMLElement;
    const popoverWidth = popover?.offsetWidth || 280;
    const popoverHeight = popover?.offsetHeight || 400;

    switch (this.position) {
      case "right":
        this.computedTop = rect.top;
        this.computedLeft = rect.right + gap;
        break;
      case "left":
        this.computedTop = rect.top;
        this.computedLeft = rect.left - gap - popoverWidth;
        break;
      case "bottom":
        this.computedTop = rect.bottom + gap;
        this.computedLeft = rect.left;
        break;
      case "top":
        this.computedTop = rect.top - gap - popoverHeight;
        this.computedLeft = rect.left;
        break;
    }

    // Keep within viewport with proper margins
    const margin = 8;
    const maxLeft = window.innerWidth - popoverWidth - margin;
    const maxTop = window.innerHeight - popoverHeight - margin;
    this.computedLeft = Math.max(margin, Math.min(this.computedLeft, maxLeft));
    this.computedTop = Math.max(margin, Math.min(this.computedTop, maxTop));

    this.style.top = `${this.computedTop}px`;
    this.style.left = `${this.computedLeft}px`;
  }

  private handleSelfClick = (e: Event) => {
    e.stopPropagation();
  };

  private handleOutsideClick = (e: Event) => {
    if (this.open && !this.contains(e.target as Node)) {
      this.close();
    }
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    if (this.open && e.key === "Escape") {
      this.close();
    }
  };

  close() {
    this.open = false;
    this.dispatchEvent(new CustomEvent("close"));
  }

  render() {
    return html`
      <div class="popover">
        <div class="arrow"></div>
        <div class="popover-content">
          <slot></slot>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pf-popover": PFPopover;
  }
}
