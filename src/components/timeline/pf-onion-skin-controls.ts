import { html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { checkboxStyles } from '../../styles/editor-control-styles';
import { defaultProjectContext } from '../../stores/project-context';
import type { OnionSkinSettings } from '../../types/animation';

@customElement('pf-onion-skin-controls')
export class PFOnionSkinControls extends BaseComponent {
  static styles = [css`
    :host {
      display: flex;
      align-items: center;
      gap: var(--pf-spacing-2);
      padding: 0 var(--pf-spacing-2);
      font-size: var(--pf-font-size-sm);
      color: var(--pf-color-text-secondary);
      border-left: 1px solid var(--pf-color-border);
      margin-left: var(--pf-spacing-2);
      text-transform: uppercase;
      letter-spacing: 0;
    }

    .control-group {
      display: flex;
      align-items: center;
      gap: var(--pf-spacing-1);
    }

    label {
      display: flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
      user-select: none;
    }

    input[type='number'] {
      width: 40px;
      background: var(--pf-color-bg-input);
      border: 1px solid var(--pf-color-border);
      color: var(--pf-color-text-primary);
      border-radius: var(--pf-radius-sm);
      padding: 2px 4px;
      font-family: inherit;
    }

    .icon-btn {
      background: none;
      border: none;
      color: currentColor;
      cursor: pointer;
      padding: 2px;
      border-radius: var(--pf-radius-sm);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .icon-btn:hover {
      background-color: var(--pf-color-bg-hover);
      color: var(--pf-color-text-primary);
    }

    .icon-btn.active {
      color: var(--pf-color-primary);
      background-color: var(--pf-color-primary-transparent);
    }
  `, checkboxStyles];

  private context = defaultProjectContext;

  connectedCallback() {
    super.connectedCallback();
    this.subscribeToActiveProjectContext((context) => {
      this.context = context;
      this.requestUpdate();
    });
  }

  private toggleEnabled(e: Event) {
    const enabled = (e.target as HTMLInputElement).checked;
    this.context.animation.onionSkin.value = {
      ...this.context.animation.onionSkin.value,
      enabled,
    };
    // Trigger canvas redraw to show/hide onion skins
    this.context.dirtyRect.requestFullRedraw();
  }

  private updateSettings(updates: Partial<OnionSkinSettings>) {
    this.context.animation.onionSkin.value = {
      ...this.context.animation.onionSkin.value,
      ...updates,
    };
    // Trigger canvas redraw to update onion skin display
    this.context.dirtyRect.requestFullRedraw();
  }

  render() {
    const { enabled, prevFrames, nextFrames, tint } = this.context.animation.onionSkin.value;

    return html`
      <div class="control-group">
        <label title="Enable Onion Skin">
          <input type="checkbox" .checked=${enabled} @change=${this.toggleEnabled} />
          <span>Onion Skin</span>
        </label>
      </div>

      ${
        enabled
          ? html`
              <div class="control-group" title="Previous Frames">
                <span>-</span>
                <input
                  type="number"
                  min="0"
                  max="5"
                  .value=${prevFrames}
                  @change=${(e: Event) => this.updateSettings({ prevFrames: parseInt((e.target as HTMLInputElement).value) })}
                />
              </div>

              <div class="control-group" title="Next Frames">
                <span>+</span>
                <input
                  type="number"
                  min="0"
                  max="5"
                  .value=${nextFrames}
                  @change=${(e: Event) => this.updateSettings({ nextFrames: parseInt((e.target as HTMLInputElement).value) })}
                />
              </div>

              <button
                class="icon-btn ${tint ? 'active' : ''}"
                title="Toggle Tint (Red/Blue)"
                @click=${() => this.updateSettings({ tint: !tint })}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M12 12L12 12.01"></path>
                </svg>
              </button>
            `
          : ''
      }
    `;
  }
}
