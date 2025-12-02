import { html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { panelStore, type PanelId } from '../../stores/panels';
import { toolStore, type ToolType } from '../../stores/tools';

@customElement('pf-collapsible-panel')
export class PFCollapsiblePanel extends BaseComponent {
  @property({ type: String }) panelId: PanelId = 'layers';
  @property({ type: String }) title = 'Panel';
  @property({ type: Array }) visibleForTools?: ToolType[];

  static styles = css`
    :host {
      display: block;
      border-bottom: 1px solid var(--pf-color-border, #333);
    }

    :host([hidden]) {
      display: none !important;
    }

    .header {
      padding: 8px 12px;
      font-size: 11px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--pf-color-text-muted, #808080);
      background-color: var(--pf-color-bg-surface, #1e1e1e);
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      user-select: none;
      transition: background-color 0.15s ease;
    }

    .header:hover {
      background-color: var(--pf-color-bg-hover, #2a2a2a);
    }

    .chevron {
      font-size: 10px;
      transition: transform 0.2s ease;
      color: var(--pf-color-text-muted, #808080);
    }

    .chevron.collapsed {
      transform: rotate(-90deg);
    }

    .content {
      overflow: hidden;
      transition: max-height 0.25s ease-out, opacity 0.2s ease;
      max-height: 500px;
      opacity: 1;
    }

    .content.collapsed {
      max-height: 0;
      opacity: 0;
    }

    .content-inner {
      padding: 8px;
    }
  `;

  render() {
    // Check tool visibility - if visibleForTools is set, only show for those tools
    if (this.visibleForTools && this.visibleForTools.length > 0) {
      const currentTool = toolStore.activeTool.value;
      if (!this.visibleForTools.includes(currentTool)) {
        return nothing;
      }
    }

    // Watch panel state for reactivity
    const collapsed = panelStore.isCollapsed(this.panelId);
    // Access the signal to register with SignalWatcher
    void panelStore.panelStates.value;

    return html`
      <div class="header" @click=${this.handleHeaderClick}>
        <span class="title">${this.title}</span>
        <span class="chevron ${collapsed ? 'collapsed' : ''}">▼</span>
      </div>
      <div class="content ${collapsed ? 'collapsed' : ''}">
        <div class="content-inner">
          <slot></slot>
        </div>
      </div>
    `;
  }

  private handleHeaderClick() {
    panelStore.togglePanel(this.panelId);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pf-collapsible-panel': PFCollapsiblePanel;
  }
}
