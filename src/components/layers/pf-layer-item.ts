import { html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { type Layer } from '../../types/layer';
import { layerStore } from '../../stores/layers';

@customElement('pf-layer-item')
export class PFLayerItem extends BaseComponent {
  static styles = css`
    :host {
      display: flex;
      align-items: center;
      padding: 4px 8px;
      background-color: var(--pf-color-bg-panel);
      border-bottom: 1px solid var(--pf-color-border);
      cursor: pointer;
      user-select: none;
    }

    :host([active]) {
      background-color: var(--pf-color-bg-surface);
      border-left: 2px solid var(--pf-color-accent-cyan);
    }

    .visibility-toggle, .lock-toggle {
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--pf-color-text-muted);
      cursor: pointer;
    }

    .visibility-toggle:hover, .lock-toggle:hover {
      color: var(--pf-color-text-main);
    }

    .visibility-toggle.active {
      color: var(--pf-color-accent-yellow);
    }

    .name {
      flex: 1;
      margin-left: 8px;
      font-size: var(--pf-font-size-sm);
    }
  `;

  @property({ type: Object }) layer!: Layer;
  @property({ type: Boolean, reflect: true }) active = false;

  toggleVisibility(e: Event) {
    e.stopPropagation();
    layerStore.toggleVisibility(this.layer.id);
  }

  toggleLock(e: Event) {
    e.stopPropagation();
    layerStore.toggleLock(this.layer.id);
  }

  render() {
    return html`
      <div 
        class="visibility-toggle ${this.layer.visible ? 'active' : ''}"
        @click=${this.toggleVisibility}
      >
        ${this.layer.visible ? '👁' : '○'}
      </div>
      <div class="lock-toggle" @click=${this.toggleLock}>
        ${this.layer.locked ? '🔒' : ''}
      </div>
      <span class="name">${this.layer.name}</span>
    `;
  }
}
