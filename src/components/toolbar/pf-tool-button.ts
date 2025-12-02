import { html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { type ToolType } from '../../stores/tools';
import './pf-tool-options-popover';

@customElement('pf-tool-button')
export class PFToolButton extends BaseComponent {
  static styles = css`
    :host {
      display: block;
      width: 32px;
      height: 32px;
      margin: 4px auto;
      position: relative;
    }

    .button-container {
      position: relative;
      width: 100%;
      height: 100%;
    }

    button {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: transparent;
      border: 1px solid transparent;
      border-radius: 2px;
      color: var(--pf-color-text-muted);
      transition: all 0.1s;
      cursor: pointer;
    }

    button:hover {
      background-color: var(--pf-color-bg-surface);
      color: var(--pf-color-text-main);
    }

    :host([active]) button {
      background-color: var(--pf-color-bg-surface);
      border-color: var(--pf-color-accent-cyan);
      color: var(--pf-color-accent-cyan);
      box-shadow: var(--pf-shadow-glow-cyan);
    }

    .gear-icon {
      position: absolute;
      bottom: 0;
      right: 0;
      width: 12px;
      height: 12px;
      font-size: 8px;
      background: var(--pf-color-bg-panel, #141414);
      border: 1px solid var(--pf-color-border, #333);
      border-radius: 2px;
      color: var(--pf-color-text-muted, #808080);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.15s ease;
    }

    .button-container:hover .gear-icon {
      opacity: 1;
    }

    .gear-icon:hover {
      background: var(--pf-color-bg-surface, #1e1e1e);
      color: var(--pf-color-text-main, #e0e0e0);
    }
  `;

  @property({ type: String }) tool: ToolType = 'pencil';
  @property({ type: String }) icon = '';
  @property({ type: String }) shortcut = '';
  @property({ type: Boolean, reflect: true }) active = false;

  @state() private showOptions = false;
  @state() private anchorRect?: DOMRect;

  render() {
    return html`
      <div class="button-container">
        <button
          title="${this.tool} (${this.shortcut}) - Right-click for options"
          @contextmenu=${this.handleContextMenu}
        >
          ${this.icon ? html`<span class="icon">${this.icon}</span>` : html`<span>${this.tool[0].toUpperCase()}</span>`}
        </button>
        <div class="gear-icon" @click=${this.handleGearClick} title="Tool options">
          ⚙
        </div>
      </div>

      <pf-tool-options-popover
        .tool=${this.tool}
        ?open=${this.showOptions}
        .anchorRect=${this.anchorRect}
        @close=${() => this.showOptions = false}
      ></pf-tool-options-popover>
    `;
  }

  private handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    this.openOptionsPopover(e.currentTarget as HTMLElement);
  }

  private handleGearClick(e: MouseEvent) {
    e.stopPropagation();
    this.openOptionsPopover(e.currentTarget as HTMLElement);
  }

  private openOptionsPopover(anchor: HTMLElement) {
    const rect = anchor.getBoundingClientRect();
    this.anchorRect = rect;
    this.showOptions = !this.showOptions;
  }
}
