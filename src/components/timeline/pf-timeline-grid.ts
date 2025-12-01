import { html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { animationStore } from '../../stores/animation';
import { layerStore } from '../../stores/layers';

@customElement('pf-timeline-grid')
export class PFTimelineGrid extends BaseComponent {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
    }

    .grid-row {
      display: flex;
      height: 32px;
      border-bottom: 1px solid var(--pf-color-border);
    }

    .cel {
      width: 32px;
      height: 100%;
      border-right: 1px solid var(--pf-color-border);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }

    .cel:hover {
      background-color: var(--pf-color-bg-hover);
    }

    .cel.active {
      background-color: var(--pf-color-primary-muted);
      box-shadow: inset 0 0 0 2px var(--pf-color-primary);
    }

    .cel-content {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background-color: var(--pf-color-text-muted);
    }
    
    .cel.has-content .cel-content {
      background-color: var(--pf-color-text-main);
    }
  `;

  selectCel(layerId: string, frameId: string) {
    layerStore.setActiveLayer(layerId);
    animationStore.goToFrame(frameId);
  }

  render() {
    const layers = [...layerStore.layers.value].reverse();
    const frames = animationStore.frames.value;
    const currentFrameId = animationStore.currentFrameId.value;
    const activeLayerId = layerStore.activeLayerId.value;
    const cels = animationStore.cels.value;

    return html`
      ${layers.map(layer => html`
        <div class="grid-row">
          ${frames.map(frame => {
            const key = animationStore.getCelKey(layer.id, frame.id);
            const cel = cels.get(key);
            const isActive = layer.id === activeLayerId && frame.id === currentFrameId;
            // TODO: Check if cel has content (non-empty canvas)
            const hasContent = !!cel; 

            return html`
              <div 
                class="cel ${isActive ? 'active' : ''} ${hasContent ? 'has-content' : ''}"
                @click=${() => this.selectCel(layer.id, frame.id)}
              >
                <div class="cel-content"></div>
              </div>
            `;
          })}
        </div>
      `)}
    `;
  }
}
