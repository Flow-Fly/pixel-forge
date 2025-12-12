import { html, css } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
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

    /* Grab-to-pan cursor states */
    .scroll-container.can-pan {
      cursor: grab;
    }

    .scroll-container.panning {
      cursor: grabbing;
      user-select: none;
    }
  `;

  @query('.scroll-container') scrollContainer!: HTMLElement;
  @query('.header-frames') headerFrames!: HTMLElement;
  @query('pf-timeline-header') timelineHeader!: PFTimelineHeader;

  // Pan state
  @state() private isPanning = false;
  private isPotentialPan = false; // Mousedown occurred, waiting to see if it's a pan or click
  private panStartX = 0;
  private panStartY = 0;
  private scrollStartX = 0;
  private scrollStartY = 0;
  private static readonly PAN_THRESHOLD = 3; // Pixels of movement before pan starts

  connectedCallback() {
    super.connectedCallback();
    // Add global listeners for pan end (in case mouse leaves component)
    window.addEventListener('mouseup', this.handlePanEnd);
    window.addEventListener('mousemove', this.handlePanMove);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('mouseup', this.handlePanEnd);
    window.removeEventListener('mousemove', this.handlePanMove);
  }

  private handlePanStart = (e: MouseEvent) => {
    // Only pan with left mouse button
    if (e.button !== 0) return;

    // Mark potential pan start - actual panning starts when threshold is exceeded
    this.isPotentialPan = true;
    this.panStartX = e.clientX;
    this.panStartY = e.clientY;
    this.scrollStartX = this.scrollContainer?.scrollLeft ?? 0;
    this.scrollStartY = this.scrollContainer?.scrollTop ?? 0;
  };

  private handlePanMove = (e: MouseEvent) => {
    if (!this.isPotentialPan || !this.scrollContainer) return;

    const deltaX = e.clientX - this.panStartX;
    const deltaY = e.clientY - this.panStartY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // Start panning if threshold exceeded
    if (!this.isPanning && distance >= PFTimeline.PAN_THRESHOLD) {
      this.isPanning = true;
    }

    if (this.isPanning) {
      // Scroll in opposite direction of mouse movement (like grabbing and dragging)
      this.scrollContainer.scrollLeft = this.scrollStartX - deltaX;
      this.scrollContainer.scrollTop = this.scrollStartY - deltaY;
    }
  };

  private handlePanEnd = () => {
    this.isPotentialPan = false;
    this.isPanning = false;
  };

  private handleWheel = (e: WheelEvent) => {
    if (!this.scrollContainer) return;

    // Prevent the wheel event from bubbling to the canvas viewport
    e.stopPropagation();

    // Determine scroll direction
    // deltaX: horizontal scroll (from trackpad or horizontal wheel)
    // deltaY: vertical scroll (from regular wheel)
    // Shift+wheel: treat vertical as horizontal

    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      // Horizontal scroll
      const delta = e.shiftKey ? e.deltaY : e.deltaX;
      this.scrollContainer.scrollLeft += delta;
    } else {
      // Vertical scroll (scroll through layers)
      this.scrollContainer.scrollTop += e.deltaY;
    }

    e.preventDefault();
  };

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
      <div
        class="scroll-container can-pan ${this.isPanning ? 'panning' : ''}"
        @scroll=${this.handleScroll}
        @mousedown=${this.handlePanStart}
        @wheel=${this.handleWheel}
      >
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
