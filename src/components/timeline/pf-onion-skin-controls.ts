import { html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { animationStore } from '../../stores/animation';
import { dirtyRectStore } from '../../stores/dirty-rect';

@customElement('pf-onion-skin-controls')
export class PFOnionSkinControls extends BaseComponent {
  static styles = css`
    :host {
      display: flex;
      align-items: center;
      gap: var(--pf-spacing-2);
      padding: 0 var(--pf-spacing-2);
      font-size: var(--pf-font-size-sm);
      color: var(--pf-color-text-secondary);
      border-left: 1px solid var(--pf-color-border);
      margin-left: var(--pf-spacing-2);
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

    input[type="checkbox"] {
      accent-color: var(--pf-color-primary);
    }

    input[type="number"] {
      width: 40px;
      background: var(--pf-color-bg-input);
      border: 1px solid var(--pf-color-border);
      color: var(--pf-color-text-primary);
      border-radius: var(--pf-radius-sm);
      padding: 2px 4px;
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
  `;

  private toggleEnabled(e: Event) {
    const enabled = (e.target as HTMLInputElement).checked;
    animationStore.onionSkin.value = {
      ...animationStore.onionSkin.value,
      enabled
    };
    // Trigger canvas redraw to show/hide onion skins
    dirtyRectStore.requestFullRedraw();
  }

  private updateSettings(updates: Partial<typeof animationStore.onionSkin.value>) {
    animationStore.onionSkin.value = {
      ...animationStore.onionSkin.value,
      ...updates
    };
    // Trigger canvas redraw to update onion skin display
    dirtyRectStore.requestFullRedraw();
  }

  render() {
    const { enabled, prevFrames, nextFrames, tint } = animationStore.onionSkin.value;

    return html`
      <div class="control-group">
        <label title="Enable Onion Skin">
          <input 
            type="checkbox" 
            .checked=${enabled}
            @change=${this.toggleEnabled}
          >
          <span>Onion Skin</span>
        </label>
      </div>

      ${enabled ? html`
        <div class="control-group" title="Previous Frames">
          <span>-</span>
          <input 
            type="number" 
            min="0" 
            max="5" 
            .value=${prevFrames}
            @change=${(e: Event) => this.updateSettings({ prevFrames: parseInt((e.target as HTMLInputElement).value) })}
          >
        </div>

        <div class="control-group" title="Next Frames">
          <span>+</span>
          <input 
            type="number" 
            min="0" 
            max="5" 
            .value=${nextFrames}
            @change=${(e: Event) => this.updateSettings({ nextFrames: parseInt((e.target as HTMLInputElement).value) })}
          >
        </div>

        <button 
          class="icon-btn ${tint ? 'active' : ''}" 
          title="Toggle Tint (Red/Blue)"
          @click=${() => this.updateSettings({ tint: !tint })}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M12 12L12 12.01"></path>
          </svg>
        </button>
      ` : ''}
    `;
  }
}
