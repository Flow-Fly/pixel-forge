import { css, html, nothing } from 'lit';
import { customElement } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { autoSaveService } from '../../services/auto-save';
import { pwaStore } from '../../stores/pwa';
import { workspaceStore } from '../../stores/workspace';

@customElement('pf-pwa-update-toast')
export class PFPwaUpdateToast extends BaseComponent {
  static styles = css`
    :host {
      position: fixed;
      right: 16px;
      bottom: 44px;
      z-index: calc(var(--pf-z-modal) + 1);
    }

    .notice {
      box-sizing: border-box;
      width: min(360px, calc(100vw - 32px));
      padding: 14px;
      background: var(--pf-color-bg-tooltip);
      border: 1px solid var(--pf-color-border-warm);
      border-radius: var(--pf-radius-md);
      box-shadow: var(--pf-shadow-lg);
      color: var(--pf-color-text-secondary);
    }

    .message {
      display: grid;
      gap: 5px;
    }

    strong {
      color: var(--pf-color-text-main);
      font-size: var(--pf-font-size-sm);
      font-weight: 400;
      text-transform: uppercase;
    }

    p {
      margin: 0;
      font-size: var(--pf-font-size-sm);
      line-height: 1.5;
    }

    .error {
      color: #f0aaa2;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 12px;
    }

    button {
      min-height: 32px;
      padding: 6px 12px;
      border: 1px solid var(--pf-color-border);
      border-radius: var(--pf-radius-sm);
      color: var(--pf-color-text-secondary);
      background: var(--pf-color-bg-input);
      font: inherit;
      font-size: var(--pf-font-size-sm);
    }

    button:hover:not(:disabled),
    button:focus-visible {
      border-color: var(--pf-color-border-warm);
      color: var(--pf-color-text-main);
      outline: none;
    }

    .restart {
      border-color: var(--pf-color-primary);
      color: var(--pf-color-bg-dark);
      background: var(--pf-color-primary);
    }

    .restart:hover:not(:disabled),
    .restart:focus-visible {
      border-color: var(--pf-color-primary-hover);
      color: var(--pf-color-bg-dark);
      background: var(--pf-color-primary-hover);
    }

    button:disabled {
      cursor: wait;
      opacity: 0.55;
    }

    @media (max-width: 520px) {
      :host {
        right: 8px;
        bottom: 36px;
      }

      .notice {
        width: calc(100vw - 16px);
      }
    }
  `;

  private dismiss = () => {
    pwaStore.dismissUpdate();
  };

  private restart = () => {
    const openContexts = workspaceStore.items.value.map((item) => item.context);
    void pwaStore.restartWithUpdate(async () => {
      await Promise.all(openContexts.map((context) => autoSaveService.saveNow(context)));
    });
  };

  render() {
    if (!pwaStore.updateAvailable.value) return nothing;

    const applyingUpdate = pwaStore.applyingUpdate.value;
    const error = pwaStore.updateError.value;

    return html`
      <section class="notice" aria-label="Pixel Forge update">
        <div class="message" role="status" aria-live="polite" aria-atomic="true">
          <strong>Update ready</strong>
          <p class=${error ? 'error' : ''}>
            ${error ?? 'A new Pixel Forge version is ready. Restart when you are ready.'}
          </p>
        </div>
        <div class="actions">
          <button type="button" ?disabled=${applyingUpdate} @click=${this.dismiss}>Later</button>
          <button class="restart" type="button" ?disabled=${applyingUpdate} @click=${this.restart}>
            ${applyingUpdate ? 'Saving...' : 'Restart'}
          </button>
        </div>
      </section>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pf-pwa-update-toast': PFPwaUpdateToast;
  }
}
