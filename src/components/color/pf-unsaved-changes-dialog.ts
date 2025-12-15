import { html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';

/**
 * Dialog shown when switching palettes with unsaved changes.
 * Dispatches: 'save' (save then switch), 'discard' (switch without saving), 'cancel' (stay)
 */
@customElement('pf-unsaved-changes-dialog')
export class PfUnsavedChangesDialog extends BaseComponent {
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
      padding: 16px 20px;
      min-width: 300px;
      max-width: 380px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    }

    .dialog-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--pf-color-text-main, #e0e0e0);
      margin: 0 0 8px 0;
    }

    .dialog-message {
      font-size: 12px;
      color: var(--pf-color-text-muted, #808080);
      margin: 0 0 16px 0;
      line-height: 1.5;
    }

    .palette-name {
      color: var(--pf-color-accent, #4a9eff);
      font-weight: 500;
    }

    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    .btn {
      padding: 8px 14px;
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
      transition: all 0.15s ease;
      border: 1px solid var(--pf-color-border, #333);
    }

    .btn-cancel {
      background: transparent;
      border-color: transparent;
      color: var(--pf-color-text-muted, #808080);
    }

    .btn-cancel:hover {
      color: var(--pf-color-text-main, #e0e0e0);
    }

    .btn-discard {
      background: var(--pf-color-bg-surface, #1e1e1e);
      color: var(--pf-color-text-main, #e0e0e0);
    }

    .btn-discard:hover {
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
  `;

  @property({ type: Boolean }) open = false;
  @property({ type: String }) paletteName = 'Untitled Palette';

  private handleSave() {
    this.dispatchEvent(new CustomEvent('save', { bubbles: true, composed: true }));
  }

  private handleDiscard() {
    this.dispatchEvent(new CustomEvent('discard', { bubbles: true, composed: true }));
  }

  private handleCancel() {
    this.dispatchEvent(new CustomEvent('cancel', { bubbles: true, composed: true }));
  }

  private handleOverlayClick(e: Event) {
    if (e.target === e.currentTarget) {
      this.handleCancel();
    }
  }

  private handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      this.handleCancel();
    }
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this.handleKeydown.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.handleKeydown.bind(this));
  }

  render() {
    if (!this.open) return nothing;

    return html`
      <div class="overlay" @click=${this.handleOverlayClick}>
        <div class="dialog" @click=${(e: Event) => e.stopPropagation()}>
          <h3 class="dialog-title">Unsaved Changes</h3>
          <p class="dialog-message">
            You have unsaved changes to <span class="palette-name">${this.paletteName}</span>.
            Would you like to save before switching?
          </p>

          <div class="dialog-actions">
            <button class="btn btn-cancel" @click=${this.handleCancel}>Cancel</button>
            <button class="btn btn-discard" @click=${this.handleDiscard}>Discard</button>
            <button class="btn btn-save" @click=${this.handleSave}>Save</button>
          </div>
        </div>
      </div>
    `;
  }
}
