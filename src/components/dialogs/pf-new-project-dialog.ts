import { html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { projectStore } from '../../stores/project';

const PRESETS = [
  { label: '16x16', width: 16, height: 16 },
  { label: '32x32', width: 32, height: 32 },
  { label: '64x64', width: 64, height: 64 },
  { label: '128x128', width: 128, height: 128 },
  { label: '256x256', width: 256, height: 256 },
];

@customElement('pf-new-project-dialog')
export class PFNewProjectDialog extends BaseComponent {
  static styles = css`
    :host {
      display: none;
    }

    :host([open]) {
      display: flex;
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background-color: rgba(0, 0, 0, 0.5);
      z-index: 1000;
      align-items: center;
      justify-content: center;
    }

    .dialog {
      background-color: var(--pf-color-bg-panel);
      border: 1px solid var(--pf-color-border);
      border-radius: 4px;
      padding: 16px;
      width: 320px;
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

    .presets {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .preset-btn {
      padding: 4px 8px;
      border-radius: 4px;
      background-color: var(--pf-color-bg-dark);
      border: 1px solid var(--pf-color-border);
      color: var(--pf-color-text-main);
      cursor: pointer;
      font-size: 11px;
    }

    .preset-btn:hover {
      background-color: var(--pf-color-bg-hover);
    }

    .preset-btn.selected {
      background-color: var(--pf-color-primary);
      border-color: var(--pf-color-primary);
    }

    .dimensions {
      display: flex;
      gap: 12px;
    }

    .input-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1;
    }

    label {
      font-size: 12px;
      color: var(--pf-color-text-muted);
    }

    input {
      background-color: var(--pf-color-bg-dark);
      border: 1px solid var(--pf-color-border);
      color: var(--pf-color-text-main);
      padding: 6px 8px;
      border-radius: 4px;
      width: 100%;
      box-sizing: border-box;
    }

    .warning {
      font-size: 11px;
      color: var(--pf-color-text-muted);
      background-color: var(--pf-color-bg-dark);
      padding: 8px;
      border-radius: 4px;
      border-left: 3px solid var(--pf-color-warning, #f0ad4e);
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

    button.primary:hover {
      background-color: var(--pf-color-primary-hover, var(--pf-color-primary));
    }

    button.secondary {
      background-color: transparent;
      border: 1px solid var(--pf-color-border);
      color: var(--pf-color-text-main);
    }

    button.secondary:hover {
      background-color: var(--pf-color-bg-hover);
    }
  `;

  @property({ type: Boolean, reflect: true }) open = false;
  @state() width = 64;
  @state() height = 64;
  @state() selectedPreset: string | null = '64x64';

  render() {
    if (!this.open) return null;

    return html`
      <div class="dialog" @click=${(e: Event) => e.stopPropagation()}>
        <div class="header">
          <span>New Project</span>
          <button class="secondary" @click=${this.close} style="padding: 2px 6px;">X</button>
        </div>
        <div class="content">
          <div>
            <label>Presets</label>
            <div class="presets">
              ${PRESETS.map(preset => html`
                <button
                  class="preset-btn ${this.selectedPreset === preset.label ? 'selected' : ''}"
                  @click=${() => this.selectPreset(preset)}
                >
                  ${preset.label}
                </button>
              `)}
            </div>
          </div>

          <div class="dimensions">
            <div class="input-group">
              <label>Width (px)</label>
              <input
                type="number"
                min="1"
                max="4096"
                .value=${String(this.width)}
                @input=${this.handleWidthInput}
              >
            </div>
            <div class="input-group">
              <label>Height (px)</label>
              <input
                type="number"
                min="1"
                max="4096"
                .value=${String(this.height)}
                @input=${this.handleHeightInput}
              >
            </div>
          </div>

          <div class="warning">
            Current work will be replaced. It's saved automatically.
          </div>
        </div>
        <div class="actions">
          <button class="secondary" @click=${this.close}>Cancel</button>
          <button class="primary" @click=${this.create}>Create</button>
        </div>
      </div>
    `;
  }

  private selectPreset(preset: { label: string; width: number; height: number }) {
    this.width = preset.width;
    this.height = preset.height;
    this.selectedPreset = preset.label;
  }

  private handleWidthInput(e: Event) {
    this.width = parseInt((e.target as HTMLInputElement).value) || 64;
    this.selectedPreset = null;
  }

  private handleHeightInput(e: Event) {
    this.height = parseInt((e.target as HTMLInputElement).value) || 64;
    this.selectedPreset = null;
  }

  close() {
    this.open = false;
    this.dispatchEvent(new CustomEvent('close'));
  }

  async create() {
    const width = Math.max(1, Math.min(4096, this.width));
    const height = Math.max(1, Math.min(4096, this.height));

    await projectStore.newProject(width, height);
    this.close();

    this.dispatchEvent(new CustomEvent('project-created', {
      detail: { width, height }
    }));
  }
}
