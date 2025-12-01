import { html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { projectStore } from '../../stores/project';

@customElement('pf-resize-dialog')
export class PFResizeDialog extends BaseComponent {
  static styles = css`
    :host {
      display: block;
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background-color: rgba(0, 0, 0, 0.5);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .dialog {
      background-color: var(--pf-color-bg-panel);
      border: 1px solid var(--pf-color-border);
      border-radius: 4px;
      padding: 16px;
      width: 300px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    }

    .header {
      font-weight: bold;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .content {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .input-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    label {
      font-size: 12px;
      color: var(--pf-color-text-muted);
    }

    input {
      background-color: var(--pf-color-bg-dark);
      border: 1px solid var(--pf-color-border);
      color: var(--pf-color-text-main);
      padding: 4px 8px;
      border-radius: 4px;
    }

    .actions {
      margin-top: 16px;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    button {
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }

    button.primary {
      background-color: var(--pf-color-primary);
      color: white;
      border: none;
    }

    button.secondary {
      background-color: transparent;
      border: 1px solid var(--pf-color-border);
      color: var(--pf-color-text-main);
    }
  `;

  @property({ type: Boolean }) open = false;
  @state() width = 64;
  @state() height = 64;

  firstUpdated() {
    this.width = projectStore.width.value;
    this.height = projectStore.height.value;
  }

  render() {
    if (!this.open) return null;

    return html`
      <div class="dialog">
        <div class="header">
          <span>Resize Canvas</span>
          <button class="secondary" @click=${this.close} style="padding: 2px 6px;">X</button>
        </div>
        <div class="content">
          <div class="input-group">
            <label>Width (px)</label>
            <input 
              type="number" 
              .value=${this.width} 
              @input=${(e: Event) => this.width = parseInt((e.target as HTMLInputElement).value)}
            >
          </div>
          <div class="input-group">
            <label>Height (px)</label>
            <input 
              type="number" 
              .value=${this.height} 
              @input=${(e: Event) => this.height = parseInt((e.target as HTMLInputElement).value)}
            >
          </div>
        </div>
        <div class="actions">
          <button class="secondary" @click=${this.close}>Cancel</button>
          <button class="primary" @click=${this.apply}>Resize</button>
        </div>
      </div>
    `;
  }

  close() {
    this.open = false;
    this.dispatchEvent(new CustomEvent('close'));
  }

  apply() {
    projectStore.resizeCanvas(this.width, this.height);
    this.close();
  }
}
