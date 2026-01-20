import { html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { tilemapStore } from '../../stores/tilemap';
import type { TileLayer } from '../../types/tilemap';

/**
 * PFTileLayersPanel - Panel for managing tile layers in Map mode
 *
 * Features:
 * - Display list of tile layers (bottom-to-top visual order)
 * - Add new layers with auto-naming
 * - Select active layer for painting
 * - Inline rename on double-click
 * - Visibility and lock icons (display only for now)
 *
 * Story 4-1: Tile Layers Panel
 */
@customElement('pf-tile-layers-panel')
export class PFTileLayersPanel extends BaseComponent {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: var(--pf-spacing-2, 8px);
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--pf-spacing-2, 8px);
    }

    .header-title {
      font-size: var(--pf-font-size-sm, 12px);
      color: var(--pf-color-text-main, #e0e0e0);
      font-weight: 500;
    }

    .add-layer-btn {
      width: 24px;
      height: 24px;
      border: none;
      background: transparent;
      color: var(--pf-color-text-main, #e0e0e0);
      cursor: pointer;
      border-radius: var(--pf-radius-sm, 4px);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      transition: background 0.2s;
    }

    .add-layer-btn:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    .add-layer-btn:focus {
      outline: 2px solid var(--pf-color-accent, #f59e0b);
      outline-offset: 1px;
    }

    .layer-list {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: var(--pf-spacing-1, 4px);
    }

    .layer-item {
      display: flex;
      align-items: center;
      gap: var(--pf-spacing-2, 8px);
      padding: var(--pf-spacing-2, 8px);
      background: var(--pf-color-bg-dark, #1a1a1a);
      border-radius: var(--pf-radius-sm, 4px);
      cursor: pointer;
      transition: background 0.15s;
    }

    .layer-item:hover {
      background: rgba(255, 255, 255, 0.05);
    }

    .layer-item.selected {
      background: var(--pf-color-selection, rgba(245, 158, 11, 0.2));
      outline: 1px solid var(--pf-color-accent, #f59e0b);
    }

    .layer-item:focus {
      outline: 2px solid var(--pf-color-accent, #f59e0b);
      outline-offset: -2px;
    }

    .layer-icons {
      display: flex;
      align-items: center;
      gap: var(--pf-spacing-1, 4px);
    }

    .visibility-icon,
    .lock-icon {
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      color: var(--pf-color-text-muted, #808080);
      cursor: pointer;
      border-radius: 2px;
    }

    .visibility-icon:hover,
    .lock-icon:hover {
      color: var(--pf-color-text-main, #e0e0e0);
      background: rgba(255, 255, 255, 0.1);
    }

    .visibility-icon.hidden {
      opacity: 0.4;
    }

    .lock-icon.locked {
      color: var(--pf-color-accent, #f59e0b);
    }

    .layer-name {
      flex: 1;
      font-size: var(--pf-font-size-sm, 12px);
      color: var(--pf-color-text-main, #e0e0e0);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .layer-name-input {
      flex: 1;
      font-size: var(--pf-font-size-sm, 12px);
      color: var(--pf-color-text-main, #e0e0e0);
      background: var(--pf-color-bg-panel, #252525);
      border: 1px solid var(--pf-color-accent, #f59e0b);
      border-radius: var(--pf-radius-sm, 4px);
      padding: 2px 4px;
      outline: none;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--pf-color-text-muted, #808080);
      font-size: var(--pf-font-size-sm, 12px);
      text-align: center;
      padding: var(--pf-spacing-4, 16px);
    }
  `;

  @state() private editingLayerId: string | null = null;
  @state() private editingName: string = '';

  private get layers(): TileLayer[] {
    return tilemapStore.layers.value;
  }

  private get activeLayerId(): string | null {
    return tilemapStore.activeLayerId.value;
  }

  private handleAddLayer(): void {
    tilemapStore.addLayer();
  }

  private handleLayerClick(layerId: string): void {
    // Don't change selection while editing
    if (this.editingLayerId) {
      return;
    }
    tilemapStore.setActiveLayer(layerId);
  }

  private handleLayerKeyDown(e: KeyboardEvent, layerId: string): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.handleLayerClick(layerId);
    }
  }

  private handleNameDoubleClick(e: MouseEvent, layerId: string): void {
    e.stopPropagation();
    const layer = tilemapStore.getLayerById(layerId);
    if (layer) {
      this.editingLayerId = layerId;
      this.editingName = layer.name;
    }
  }

  private handleNameKeyDown(e: KeyboardEvent, layerId: string): void {
    if (e.key === 'Enter') {
      this.confirmRename(layerId);
    } else if (e.key === 'Escape') {
      this.cancelRename();
    }
  }

  private handleNameBlur(layerId: string): void {
    if (this.editingLayerId === layerId) {
      this.confirmRename(layerId);
    }
  }

  private handleNameInput(e: Event): void {
    const input = e.target as HTMLInputElement;
    this.editingName = input.value;
  }

  private confirmRename(layerId: string): void {
    tilemapStore.renameLayer(layerId, this.editingName);
    this.editingLayerId = null;
    this.editingName = '';
  }

  private cancelRename(): void {
    this.editingLayerId = null;
    this.editingName = '';
  }

  private renderLayerItem(layer: TileLayer) {
    const isSelected = layer.id === this.activeLayerId;
    const isEditing = this.editingLayerId === layer.id;

    return html`
      <div
        class="layer-item ${isSelected ? 'selected' : ''}"
        tabindex="0"
        role="option"
        aria-selected="${isSelected}"
        @click=${() => this.handleLayerClick(layer.id)}
        @keydown=${(e: KeyboardEvent) => this.handleLayerKeyDown(e, layer.id)}
      >
        <div class="layer-icons">
          <span
            class="visibility-icon ${!layer.visible ? 'hidden' : ''}"
            title="${layer.visible ? 'Visible' : 'Hidden'}"
          >
            👁
          </span>
          <span
            class="lock-icon ${layer.locked ? 'locked' : ''}"
            title="${layer.locked ? 'Locked' : 'Unlocked'}"
          >
            ${layer.locked ? '🔒' : '🔓'}
          </span>
        </div>
        ${isEditing
          ? html`
              <input
                type="text"
                class="layer-name-input"
                .value=${this.editingName}
                @input=${this.handleNameInput}
                @keydown=${(e: KeyboardEvent) => this.handleNameKeyDown(e, layer.id)}
                @blur=${() => this.handleNameBlur(layer.id)}
                @click=${(e: Event) => e.stopPropagation()}
              />
            `
          : html`
              <span
                class="layer-name"
                @dblclick=${(e: MouseEvent) => this.handleNameDoubleClick(e, layer.id)}
              >
                ${layer.name}
              </span>
            `}
      </div>
    `;
  }

  protected updated(changedProperties: Map<string, unknown>): void {
    super.updated(changedProperties);

    // Auto-focus input when entering edit mode
    if (changedProperties.has('editingLayerId') && this.editingLayerId) {
      const input = this.shadowRoot?.querySelector('.layer-name-input') as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    }
  }

  render() {
    const layers = this.layers;

    // Render layers in reverse order (top layer first in UI)
    const reversedLayers = [...layers].reverse();

    return html`
      <div class="header">
        <span class="header-title">Tile Layers</span>
        <button
          class="add-layer-btn"
          title="Add Layer"
          @click=${this.handleAddLayer}
        >
          +
        </button>
      </div>

      <div class="layer-list" role="listbox" aria-label="Tile Layers">
        ${layers.length === 0
          ? html`<div class="empty-state">No layers</div>`
          : reversedLayers.map(layer => this.renderLayerItem(layer))}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pf-tile-layers-panel': PFTileLayersPanel;
  }
}
