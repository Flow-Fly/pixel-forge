import { html, css } from 'lit';
import type { TemplateResult } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { tilesetStore } from '../../stores/tileset';
import type { Tileset } from '../../types/tilemap';

/**
 * PFTilesetGrid - Displays tileset tiles in a grid for selection
 *
 * Features:
 * - Renders all tiles from the active tileset
 * - Hover highlight effect on tiles
 * - Click-to-select with visual highlight
 * - Keyboard navigation (arrow keys, Enter/Space)
 * - Accessible grid with ARIA roles
 * - Responsive layout using CSS grid auto-fill
 */
@customElement('pf-tileset-grid')
export class PFTilesetGrid extends BaseComponent {
  static styles = css`
    :host {
      display: block;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(32px, 1fr));
      gap: 1px;
      background-color: var(--pf-color-border, #333);
      border: 1px solid var(--pf-color-border, #333);
    }

    .tile-cell {
      aspect-ratio: 1;
      cursor: pointer;
      position: relative;
      background-color: var(--pf-color-bg-panel, #141414);
      transition: transform 0.1s ease;
      min-width: 32px;
      min-height: 32px;
    }

    .tile-cell:hover {
      transform: scale(1.05);
      z-index: 1;
      box-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
    }

    .tile-cell.selected {
      outline: 2px solid var(--pf-color-accent, #f59e0b);
      outline-offset: -2px;
      z-index: 2;
    }

    .tile-cell:focus {
      outline: 2px solid var(--pf-color-accent, #f59e0b);
      outline-offset: -2px;
      z-index: 2;
    }

    .tile-cell:focus:not(:focus-visible) {
      outline: none;
    }

    .tile-cell:focus-visible {
      outline: 2px solid var(--pf-color-accent, #f59e0b);
      outline-offset: -2px;
    }

    .tile-cell canvas {
      width: 100%;
      height: 100%;
      display: block;
      image-rendering: pixelated;
    }

    .empty-grid {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--pf-spacing-4, 16px);
      color: var(--pf-color-text-muted, #808080);
      font-size: var(--pf-font-size-sm, 12px);
    }
  `;

  @state() private focusedIndex = 0;

  private get activeTileset(): Tileset | null {
    return tilesetStore.getActiveTileset();
  }

  private get selectedTileIndex(): number | null {
    return tilesetStore.selectedTileIndex.value;
  }

  private handleTileClick(tileIndex: number): void {
    try {
      tilesetStore.setSelectedTile(tileIndex);

      this.dispatchEvent(new CustomEvent('tile-selected', {
        detail: { tileIndex },
        bubbles: true,
        composed: true
      }));
    } catch (error) {
      // Store throws InvalidTilesetError if out of bounds
      console.error('Failed to select tile:', error);
    }
  }

  private handleKeyDown(e: KeyboardEvent, currentIndex: number): void {
    const tileset = this.activeTileset;
    if (!tileset) return;

    const columns = this.getGridColumns();
    const totalTiles = tileset.tileCount;
    let newIndex = currentIndex;

    switch (e.key) {
      case 'ArrowRight':
        newIndex = Math.min(currentIndex + 1, totalTiles - 1);
        break;
      case 'ArrowLeft':
        newIndex = Math.max(currentIndex - 1, 0);
        break;
      case 'ArrowDown':
        newIndex = Math.min(currentIndex + columns, totalTiles - 1);
        break;
      case 'ArrowUp':
        newIndex = Math.max(currentIndex - columns, 0);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        this.handleTileClick(currentIndex);
        return;
      case 'Home':
        newIndex = 0;
        break;
      case 'End':
        newIndex = totalTiles - 1;
        break;
      default:
        return;
    }

    if (newIndex !== currentIndex) {
      e.preventDefault();
      this.focusedIndex = newIndex;
      this.focusTile(newIndex);
    }
  }

  private getGridColumns(): number {
    // Try to calculate actual columns from grid layout
    const grid = this.shadowRoot?.querySelector('.grid') as HTMLElement;
    if (!grid) {
      // Fallback to tileset columns
      return this.activeTileset?.columns ?? 8;
    }

    const gridStyle = getComputedStyle(grid);
    const columnCount = gridStyle.gridTemplateColumns.split(' ').length;
    return columnCount || this.activeTileset?.columns || 8;
  }

  private focusTile(index: number): void {
    requestAnimationFrame(() => {
      const grid = this.shadowRoot?.querySelector('.grid');
      const cells = grid?.querySelectorAll('.tile-cell');
      const cell = cells?.[index] as HTMLElement;
      cell?.focus();
    });
  }

  private handleGridFocus(): void {
    // Set initial focus on selected tile or first tile
    const initialIndex = this.selectedTileIndex ?? 0;
    this.focusedIndex = initialIndex;
    this.focusTile(initialIndex);
  }

  private drawTile(canvas: HTMLCanvasElement | null, tileset: Tileset, tileIndex: number): void {
    if (!canvas) return;

    const rect = tilesetStore.getTileRect(tileset.id, tileIndex);
    if (!rect) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to tile size
    canvas.width = rect.width;
    canvas.height = rect.height;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw tile from tileset ImageBitmap
    ctx.drawImage(
      tileset.image,
      rect.x, rect.y, rect.width, rect.height,  // Source rect
      0, 0, rect.width, rect.height              // Dest rect
    );
  }

  private renderTile(tileIndex: number): TemplateResult {
    const tileset = this.activeTileset;
    if (!tileset) return html``;

    const isSelected = this.selectedTileIndex === tileIndex;
    const isFocused = this.focusedIndex === tileIndex;
    const tileNumber = tileIndex + 1; // 1-based for display
    const totalTiles = tileset.tileCount;

    return html`
      <div
        class="tile-cell ${isSelected ? 'selected' : ''}"
        role="gridcell"
        tabindex="${isFocused || isSelected ? '0' : '-1'}"
        aria-selected="${isSelected}"
        aria-label="Tile ${tileNumber} of ${totalTiles}"
        @click=${() => this.handleTileClick(tileIndex)}
        @keydown=${(e: KeyboardEvent) => this.handleKeyDown(e, tileIndex)}
      >
        <canvas
          .width=${tileset.tileWidth}
          .height=${tileset.tileHeight}
        ></canvas>
      </div>
    `;
  }

  protected updated(changedProperties: Map<string, unknown>): void {
    super.updated(changedProperties);

    // Draw tiles after render
    const tileset = this.activeTileset;
    if (!tileset) return;

    const cells = this.shadowRoot?.querySelectorAll('.tile-cell');
    cells?.forEach((cell, index) => {
      const canvas = cell.querySelector('canvas') as HTMLCanvasElement;
      if (canvas) {
        this.drawTile(canvas, tileset, index);
      }
    });
  }

  render() {
    const tileset = this.activeTileset;

    if (!tileset) {
      return html`<div class="empty-grid">No tileset loaded</div>`;
    }

    const tileIndices = Array.from({ length: tileset.tileCount }, (_, i) => i);

    return html`
      <div
        class="grid"
        role="grid"
        aria-label="Tileset grid"
        @focus=${this.handleGridFocus}
      >
        ${tileIndices.map(index => this.renderTile(index))}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pf-tileset-grid': PFTilesetGrid;
  }
}
