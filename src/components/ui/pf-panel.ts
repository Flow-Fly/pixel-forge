import { html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { panelStore, type PanelId } from "../../stores/panels";

/**
 * Reusable panel component with optional collapsible behavior.
 * Wraps content components and provides a consistent header.
 *
 * Slots:
 * - `header-actions`: Actions displayed in the header (right side)
 * - `default`: Main content area (the wrapped component)
 *
 * @example
 * ```html
 * <pf-panel header="Brushes" collapsible panel-id="brush">
 *   <pf-brush-panel></pf-brush-panel>
 * </pf-panel>
 * ```
 */
@customElement("pf-panel")
export class PFPanel extends BaseComponent {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
    }

    :host([bordered]) {
      border-bottom: 1px solid var(--pf-color-border, #333);
    }

    /* Header */
    .header {
      padding: 8px 12px;
      border-bottom: 1px solid var(--pf-color-border, #333);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--pf-color-text-muted, #808080);
      background-color: var(--pf-color-bg-surface, #1e1e1e);
      user-select: none;
    }

    :host([collapsible]) .header {
      cursor: pointer;
      transition: background-color 0.15s ease;
    }

    :host([collapsible]) .header:hover {
      background-color: var(--pf-color-bg-hover, #2a2a2a);
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .header-title {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .chevron {
      font-size: 10px;
      transition: transform 0.2s ease;
      color: var(--pf-color-text-muted, #808080);
    }

    :host([collapsed]) .chevron {
      transform: rotate(-90deg);
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    /* Content */
    .content {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
    }

    .content-inner {
      padding: var(--pf-panel-content-padding, 8px);
    }

    :host([no-padding]) .content-inner {
      padding: 0;
    }

    /* Collapse animation */
    :host([collapsible]) .content {
      transition: max-height 0.25s ease-out, opacity 0.2s ease;
      max-height: 1000px;
      opacity: 1;
    }

    :host([collapsed]) .content {
      max-height: 0;
      opacity: 0;
      overflow: hidden;
    }

    /* Hide chevron when not collapsible */
    :host(:not([collapsible])) .chevron {
      display: none;
    }
  `;

  /** Panel header title */
  @property({ type: String }) header = "";

  /** Enable collapse/expand behavior */
  @property({ type: Boolean, reflect: true }) collapsible = false;

  /** Current collapsed state (reflects to attribute for CSS) */
  @property({ type: Boolean, reflect: true }) collapsed = false;

  /** Panel ID for persisting collapse state */
  @property({ type: String, attribute: "panel-id" }) panelId?: PanelId;

  /** Add bottom border to host */
  @property({ type: Boolean, reflect: true }) bordered = false;

  /** Remove content padding */
  @property({ type: Boolean, reflect: true, attribute: "no-padding" })
  noPadding = false;

  connectedCallback() {
    super.connectedCallback();
    // Sync with panel store if panelId is provided
    if (this.panelId && this.collapsible) {
      this.collapsed = panelStore.isCollapsed(this.panelId);
    }
  }

  render() {
    // Keep reactivity with panel store
    if (this.panelId && this.collapsible) {
      void panelStore.panelStates.value;
      this.collapsed = panelStore.isCollapsed(this.panelId);
    }

    return html`
      <div
        class="header"
        @click=${this.collapsible ? this.handleHeaderClick : nothing}
      >
        <div class="header-left">
          <span class="chevron">▼</span>
          <span class="header-title">${this.header}</span>
        </div>
        <div class="header-actions" @click=${this.stopPropagation}>
          <slot name="header-actions"></slot>
        </div>
      </div>

      <div class="content">
        <div class="content-inner">
          <slot></slot>
        </div>
      </div>
    `;
  }

  private handleHeaderClick() {
    if (!this.collapsible) return;

    if (this.panelId) {
      panelStore.togglePanel(this.panelId);
    } else {
      this.collapsed = !this.collapsed;
      this.dispatchEvent(
        new CustomEvent("pf-collapse-toggle", {
          detail: { collapsed: this.collapsed },
          bubbles: true,
        })
      );
    }
  }

  private stopPropagation(e: Event) {
    // Prevent header click when clicking on actions
    e.stopPropagation();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pf-panel": PFPanel;
  }
}
