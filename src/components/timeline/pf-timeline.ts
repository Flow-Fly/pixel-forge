import { html, css } from 'lit';
import { customElement, query } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { layerStore } from '../../stores/layers';
import { historyStore } from '../../stores/history';
import { AddLayerCommand, RemoveLayerCommand } from '../../commands/layer-commands';
import './pf-playback-controls';
import './pf-onion-skin-controls';
import './pf-timeline-header';
import './pf-timeline-layers';
import './pf-timeline-grid';
import type { PFTimelineHeader } from './pf-timeline-header';

@customElement('pf-timeline')
export class PFTimeline extends BaseComponent {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      background-color: var(--pf-color-bg-panel);
      border-top: 1px solid var(--pf-color-border);
      overflow: hidden;
    }

    .controls-area {
      display: flex;
      align-items: center;
      padding: var(--pf-spacing-1);
      border-bottom: 1px solid var(--pf-color-border);
      background-color: var(--pf-color-bg-surface);
      flex-shrink: 0;
    }

    /* Header row: layer toolbar + frame numbers */
    .header-row {
      display: flex;
      flex-shrink: 0;
      border-bottom: 1px solid var(--pf-color-border);
      background-color: var(--pf-color-bg-surface);
    }

    .layers-toolbar {
      width: 200px;
      display: flex;
      gap: 2px;
      padding: 4px;
      border-right: 1px solid var(--pf-color-border);
      box-sizing: border-box;
    }

    .layers-toolbar button {
      background: var(--pf-color-bg-panel);
      border: 1px solid var(--pf-color-border);
      border-radius: 3px;
      color: var(--pf-color-text-muted);
      font-size: 12px;
      width: 24px;
      height: 24px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
    }

    .layers-toolbar button:hover {
      background: var(--pf-color-bg-hover);
      color: var(--pf-color-text-main);
    }

    .layers-toolbar button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .header-frames {
      flex: 1;
      overflow: hidden;
    }

    /* Scroll container for synchronized scrolling */
    .scroll-container {
      flex: 1;
      min-height: 0; /* Allow shrinking below content size for proper overflow */
      display: flex;
      overflow: auto;
      background-color: var(--pf-color-bg-dark);

      /* Firefox scrollbar styling */
      scrollbar-width: thin;
      scrollbar-color: var(--pf-color-scrollbar-thumb, #555) var(--pf-color-scrollbar-track, #2a2a2a);
    }

    /* Webkit (Chrome, Safari, Edge) scrollbar styling */
    .scroll-container::-webkit-scrollbar {
      width: 10px;
      height: 10px;
    }

    .scroll-container::-webkit-scrollbar-track {
      background: var(--pf-color-scrollbar-track, #2a2a2a);
      border-radius: 4px;
    }

    .scroll-container::-webkit-scrollbar-thumb {
      background: var(--pf-color-scrollbar-thumb, #555);
      border-radius: 4px;
      border: 2px solid var(--pf-color-scrollbar-track, #2a2a2a);
    }

    .scroll-container::-webkit-scrollbar-thumb:hover {
      background: var(--pf-color-scrollbar-thumb-hover, #777);
    }

    .scroll-container::-webkit-scrollbar-corner {
      background: var(--pf-color-scrollbar-track, #2a2a2a);
    }

    .layers-column {
      width: 200px;
      flex-shrink: 0;
      border-right: 1px solid var(--pf-color-border);
      background-color: var(--pf-color-bg-panel);
    }

    .grid-column {
      flex: 1;
      min-width: 0;
    }
  `;

  @query('.scroll-container') scrollContainer!: HTMLElement;
  @query('.header-frames') headerFrames!: HTMLElement;
  @query('pf-timeline-header') timelineHeader!: PFTimelineHeader;

  private handleUnitChange = (e: CustomEvent<{ unit: 'ms' | 'fps' }>) => {
    if (this.timelineHeader) {
      this.timelineHeader.setDurationUnit(e.detail.unit);
    }
  };

  private addLayer() {
    historyStore.execute(new AddLayerCommand());
  }

  private deleteLayer() {
    const activeId = layerStore.activeLayerId.value;
    if (activeId && layerStore.layers.value.length > 1) {
      historyStore.execute(new RemoveLayerCommand(activeId));
    }
  }

  private moveLayer(direction: 'up' | 'down') {
    const activeId = layerStore.activeLayerId.value;
    if (activeId) {
      layerStore.reorderLayer(activeId, direction);
    }
  }

  private handleScroll = () => {
    // Sync horizontal scroll to timeline header
    if (this.scrollContainer && this.headerFrames) {
      const header = this.headerFrames.querySelector('pf-timeline-header');
      if (header) {
        (header as HTMLElement).scrollLeft = this.scrollContainer.scrollLeft;
      }
    }
  };

  render() {
    // Access signals for reactivity
    const layers = layerStore.layers.value;
    const activeLayerId = layerStore.activeLayerId.value;
    const canDelete = layers.length > 1;

    // Check if we can move up/down
    const activeIndex = layers.findIndex(l => l.id === activeLayerId);
    const canMoveUp = activeIndex < layers.length - 1;
    const canMoveDown = activeIndex > 0;

    return html`
      <div class="controls-area">
        <pf-playback-controls @unit-change=${this.handleUnitChange}></pf-playback-controls>
        <pf-onion-skin-controls></pf-onion-skin-controls>
      </div>
      <div class="header-row">
        <div class="layers-toolbar">
          <button @click=${this.addLayer} title="Add Layer">+</button>
          <button @click=${this.deleteLayer} title="Delete Layer" ?disabled=${!canDelete}>-</button>
          <button @click=${() => this.moveLayer('up')} title="Move Up" ?disabled=${!canMoveUp}>↑</button>
          <button @click=${() => this.moveLayer('down')} title="Move Down" ?disabled=${!canMoveDown}>↓</button>
        </div>
        <div class="header-frames">
          <pf-timeline-header></pf-timeline-header>
        </div>
      </div>
      <div class="scroll-container" @scroll=${this.handleScroll}>
        <div class="layers-column">
          <pf-timeline-layers no-toolbar></pf-timeline-layers>
        </div>
        <div class="grid-column">
          <pf-timeline-grid></pf-timeline-grid>
        </div>
      </div>
    `;
  }
}
