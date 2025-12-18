import { html, css, nothing } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';

/**
 * Dialog for saving a palette with a name.
 * Dispatches 'save' event with the name when saved, 'cancel' when cancelled.
 */
@customElement('pf-save-palette-dialog')
export class PfSavePaletteDialog extends BaseComponent {
  static styles = css`
    :host {
      display: block;
    }

    .overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .dialog {
      background: var(--pf-color-bg-panel, #141414);
      border: 1px solid var(--pf-color-border, #333);
      border-radius: 6px;
      padding: 16px;
      min-width: 280px;
      max-width: 360px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    }

    .dialog-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--pf-color-text-main, #e0e0e0);
      margin: 0 0 16px 0;
    }

    .form-group {
      margin-bottom: 16px;
    }

    .form-label {
      display: block;
      font-size: 11px;
      color: var(--pf-color-text-muted, #808080);
      margin-bottom: 6px;
    }

    .form-input {
      width: 100%;
      padding: 8px 10px;
      background: var(--pf-color-bg-surface, #1e1e1e);
      border: 1px solid var(--pf-color-border, #333);
      border-radius: 4px;
      color: var(--pf-color-text-main, #e0e0e0);
      font-size: 13px;
      box-sizing: border-box;
      outline: none;
      transition: border-color 0.15s ease;
    }

    .form-input:focus {
      border-color: var(--pf-color-accent, #4a9eff);
    }

    .form-input.error {
      border-color: #c53030;
    }

    .error-message {
      font-size: 10px;
      color: #c53030;
      margin-top: 4px;
    }

    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    .btn {
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s ease;
      border: 1px solid var(--pf-color-border, #333);
    }

    .btn-cancel {
      background: var(--pf-color-bg-surface, #1e1e1e);
      color: var(--pf-color-text-main, #e0e0e0);
    }

    .btn-cancel:hover {
      background: var(--pf-color-bg-panel, #141414);
    }

    .btn-save {
      background: var(--pf-color-accent, #4a9eff);
      border-color: var(--pf-color-accent, #4a9eff);
      color: white;
    }

    .btn-save:hover {
      opacity: 0.9;
    }

    .btn-save:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `;

  @property({ type: Boolean }) open = false;
  @property({ type: String }) defaultName = '';
  @property({ type: String }) title = 'Save Palette';

  @state() private name = '';
  @state() private error = '';

  @query('.form-input') private inputElement!: HTMLInputElement;

  updated(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('open') && this.open) {
      this.name = this.defaultName || '';
      this.error = '';
      // Focus input after render
      requestAnimationFrame(() => {
        this.inputElement?.focus();
        this.inputElement?.select();
      });
    }
  }

  private handleNameInput(e: Event) {
    this.name = (e.target as HTMLInputElement).value;
    this.error = '';
  }

  private handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      this.handleSave();
    } else if (e.key === 'Escape') {
      this.handleCancel();
    }
  }

  private handleSave() {
    const trimmedName = this.name.trim();
    if (!trimmedName) {
      this.error = 'Please enter a name';
      return;
    }

    this.dispatchEvent(new CustomEvent('save', {
      detail: { name: trimmedName },
      bubbles: true,
      composed: true
    }));
  }

  private handleCancel() {
    this.dispatchEvent(new CustomEvent('cancel', {
      bubbles: true,
      composed: true
    }));
  }

  private handleOverlayClick(e: Event) {
    if (e.target === e.currentTarget) {
      this.handleCancel();
    }
  }

  render() {
    if (!this.open) return nothing;

    return html`
      <div class="overlay" @click=${this.handleOverlayClick}>
        <div class="dialog" @click=${(e: Event) => e.stopPropagation()}>
          <h3 class="dialog-title">${this.title}</h3>

          <div class="form-group">
            <label class="form-label">Palette Name</label>
            <input
              type="text"
              class="form-input ${this.error ? 'error' : ''}"
              .value=${this.name}
              @input=${this.handleNameInput}
              @keydown=${this.handleKeydown}
              placeholder="My Palette"
            />
            ${this.error ? html`
              <div class="error-message">${this.error}</div>
            ` : nothing}
          </div>

          <div class="dialog-actions">
            <button class="btn btn-cancel" @click=${this.handleCancel}>Cancel</button>
            <button
              class="btn btn-save"
              @click=${this.handleSave}
              ?disabled=${!this.name.trim()}
            >Save</button>
          </div>
        </div>
      </div>
    `;
  }
}
