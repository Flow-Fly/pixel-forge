import { html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { type Layer } from '../../types/layer';
import { layerStore } from '../../stores/layers';
import { historyStore } from '../../stores/history';
import { UpdateLayerCommand } from '../../commands/layer-commands';

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

    .opacity-control {
      display: flex;
      align-items: center;
      margin-left: 8px;
      font-size: 10px;
      color: var(--pf-color-text-muted);
    }

    .opacity-value {
      cursor: ew-resize;
      padding: 2px 4px;
      border-radius: 2px;
      min-width: 32px;
      text-align: right;
      user-select: none;
    }

    .opacity-value:hover {
      background: var(--pf-color-bg-hover);
    }

    .opacity-value.scrubbing {
      background: var(--pf-color-primary-muted);
    }

    .opacity-input {
      width: 40px;
      padding: 2px 4px;
      background: var(--pf-color-bg-dark);
      border: 1px solid var(--pf-color-border);
      border-radius: 2px;
      color: var(--pf-color-text-main);
      font-size: 10px;
      text-align: right;
    }

    .opacity-input:focus {
      outline: none;
      border-color: var(--pf-color-accent);
    }
  `;

  @property({ type: Object }) layer!: Layer;
  @property({ type: Boolean, reflect: true }) active = false;

  @state() private isScrubbing = false;
  @state() private isEditingOpacity = false;
  private scrubStartX = 0;
  private scrubStartOpacity = 0;
  private originalOpacity = 0; // For undo support

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('mousemove', this.handleScrubMove);
    window.removeEventListener('mouseup', this.handleScrubEnd);
  }

  toggleVisibility(e: Event) {
    e.stopPropagation();
    layerStore.toggleVisibility(this.layer.id);
  }

  toggleLock(e: Event) {
    e.stopPropagation();
    layerStore.toggleLock(this.layer.id);
  }

  // Opacity scrubbing
  private handleOpacityScrubStart = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    this.isScrubbing = true;
    this.scrubStartX = e.clientX;
    // Layer opacity is 0-255, display as percentage
    this.scrubStartOpacity = Math.round((this.layer.opacity / 255) * 100);
    this.originalOpacity = this.layer.opacity;

    window.addEventListener('mousemove', this.handleScrubMove);
    window.addEventListener('mouseup', this.handleScrubEnd);
  };

  private handleScrubMove = (e: MouseEvent) => {
    if (!this.isScrubbing) return;

    const deltaX = e.clientX - this.scrubStartX;
    // 2px = 1% change
    const deltaPercent = Math.round(deltaX / 2);
    const newPercent = Math.max(0, Math.min(100, this.scrubStartOpacity + deltaPercent));
    const newOpacity = Math.round((newPercent / 100) * 255);

    // Live update without history
    layerStore.updateLayer(this.layer.id, { opacity: newOpacity });
  };

  private handleScrubEnd = () => {
    if (this.isScrubbing) {
      const currentOpacity = this.layer.opacity;
      if (currentOpacity !== this.originalOpacity) {
        // Add to history for undo
        historyStore.execute(new UpdateLayerCommand(this.layer.id, { opacity: currentOpacity }, { opacity: this.originalOpacity }));
      }
    }
    this.isScrubbing = false;
    window.removeEventListener('mousemove', this.handleScrubMove);
    window.removeEventListener('mouseup', this.handleScrubEnd);
  };

  private handleOpacityDoubleClick = (e: MouseEvent) => {
    e.stopPropagation();
    this.isEditingOpacity = true;
    this.originalOpacity = this.layer.opacity;
  };

  private handleOpacityInputKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      this.commitOpacityInput(e.target as HTMLInputElement);
    } else if (e.key === 'Escape') {
      this.isEditingOpacity = false;
    }
    e.stopPropagation();
  };

  private handleOpacityInputBlur = (e: FocusEvent) => {
    this.commitOpacityInput(e.target as HTMLInputElement);
  };

  private commitOpacityInput(input: HTMLInputElement) {
    const value = parseInt(input.value, 10);
    if (!isNaN(value)) {
      const clampedPercent = Math.max(0, Math.min(100, value));
      const newOpacity = Math.round((clampedPercent / 100) * 255);
      if (newOpacity !== this.originalOpacity) {
        historyStore.execute(new UpdateLayerCommand(this.layer.id, { opacity: newOpacity }, { opacity: this.originalOpacity }));
      }
    }
    this.isEditingOpacity = false;
  }

  render() {
    const opacityPercent = Math.round((this.layer.opacity / 255) * 100);

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
      <div class="opacity-control" @click=${(e: Event) => e.stopPropagation()}>
        ${this.isEditingOpacity ? html`
          <input
            type="number"
            class="opacity-input"
            min="0"
            max="100"
            .value=${String(opacityPercent)}
            @keydown=${this.handleOpacityInputKeyDown}
            @blur=${this.handleOpacityInputBlur}
            @click=${(e: Event) => e.stopPropagation()}
          />
        ` : html`
          <span
            class="opacity-value ${this.isScrubbing ? 'scrubbing' : ''}"
            @mousedown=${this.handleOpacityScrubStart}
            @dblclick=${this.handleOpacityDoubleClick}
            title="Drag to adjust, double-click to edit"
          >
            ${opacityPercent}%
          </span>
        `}
      </div>
    `;
  }
}
