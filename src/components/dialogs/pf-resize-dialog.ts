import { html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { projectStore } from '../../stores/project';
import '../ui/pf-dialog';

@customElement('pf-resize-dialog')
export class PFResizeDialog extends BaseComponent {
  static styles = css`
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
    return html`
      <pf-dialog
        ?open=${this.open}
        width="300px"
        @pf-close=${this.close}
      >
        <span slot="title">Resize Canvas</span>

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

        <div slot="actions">
          <button class="secondary" @click=${this.close}>Cancel</button>
          <button class="primary" @click=${this.apply}>Resize</button>
        </div>
      </pf-dialog>
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
