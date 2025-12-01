import { html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { layerStore } from '../../stores/layers';

@customElement('pf-timeline-layers')
export class PFTimelineLayers extends BaseComponent {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
    }

    .layer-row {
      height: 32px;
      display: flex;
      align-items: center;
      padding: 0 var(--pf-spacing-2);
      border-bottom: 1px solid var(--pf-color-border);
      font-size: 12px;
      color: var(--pf-color-text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .layer-row.active {
      background-color: var(--pf-color-bg-hover);
      color: var(--pf-color-text-main);
    }
  `;

  render() {
    // Render layers in reverse order (top to bottom) to match canvas stacking visually?
    // Usually timeline shows top layer at top.
    // layerStore.layers is bottom-to-top (0 is background).
    // So we should reverse for display.
    const layers = [...layerStore.layers.value].reverse();
    const activeLayerId = layerStore.activeLayerId.value;

    return html`
      ${layers.map(layer => html`
        <div class="layer-row ${layer.id === activeLayerId ? 'active' : ''}">
          ${layer.name}
        </div>
      `)}
    `;
  }
}
