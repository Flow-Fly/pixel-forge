import { html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { paletteStore, PRESET_PALETTES, type PresetPalette } from '../../stores/palette';
import '../ui/pf-popover';

@customElement('pf-palette-selector')
export class PfPaletteSelector extends BaseComponent {
  static styles = css`
    :host {
      display: block;
    }

    .selector-trigger {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      background: var(--pf-color-bg-surface, #1e1e1e);
      border: 1px solid var(--pf-color-border, #333);
      border-radius: 3px;
      color: var(--pf-color-text-main, #e0e0e0);
      font-size: 11px;
      cursor: pointer;
      transition: all 0.15s ease;
      min-width: 80px;
    }

    .selector-trigger:hover {
      background: var(--pf-color-bg-panel, #141414);
      border-color: var(--pf-color-accent, #4a9eff);
    }

    .trigger-label {
      flex: 1;
      text-align: left;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .trigger-chevron {
      font-size: 8px;
      opacity: 0.6;
    }

    .selector-content {
      width: 220px;
      max-height: 320px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .search-input {
      width: 100%;
      padding: 8px 10px;
      background: var(--pf-color-bg-surface, #1e1e1e);
      border: none;
      border-bottom: 1px solid var(--pf-color-border, #333);
      color: var(--pf-color-text-main, #e0e0e0);
      font-size: 12px;
      outline: none;
      box-sizing: border-box;
    }

    .search-input::placeholder {
      color: var(--pf-color-text-muted, #808080);
    }

    .search-input:focus {
      background: var(--pf-color-bg-panel, #141414);
    }

    .palette-list {
      flex: 1;
      overflow-y: auto;
      padding: 4px 0;
    }

    .palette-item {
      padding: 6px 10px;
      cursor: pointer;
      transition: background 0.1s ease;
    }

    .palette-item:hover {
      background: var(--pf-color-bg-surface, #1e1e1e);
    }

    .palette-item.selected {
      background: var(--pf-color-accent, #4a9eff);
      background: rgba(74, 158, 255, 0.15);
    }

    .palette-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 3px;
    }

    .palette-name {
      font-size: 11px;
      color: var(--pf-color-text-main, #e0e0e0);
      font-weight: 500;
    }

    .palette-count {
      font-size: 10px;
      color: var(--pf-color-text-muted, #808080);
    }

    .palette-preview {
      display: flex;
      height: 6px;
      border-radius: 2px;
      overflow: hidden;
    }

    .preview-color {
      flex: 1;
      min-width: 0;
    }

    .divider {
      height: 1px;
      background: var(--pf-color-border, #333);
      margin: 4px 0;
    }

    .action-item {
      padding: 8px 10px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: var(--pf-color-text-muted, #808080);
      transition: all 0.1s ease;
    }

    .action-item:hover {
      background: var(--pf-color-bg-surface, #1e1e1e);
      color: var(--pf-color-text-main, #e0e0e0);
    }

    .action-icon {
      font-size: 12px;
    }

    .no-results {
      padding: 16px;
      text-align: center;
      font-size: 11px;
      color: var(--pf-color-text-muted, #808080);
    }
  `;

  @state() private isOpen = false;
  @state() private searchQuery = '';
  @state() private triggerRect: DOMRect | null = null;

  private get filteredPalettes(): PresetPalette[] {
    if (!this.searchQuery.trim()) {
      return PRESET_PALETTES;
    }
    const query = this.searchQuery.toLowerCase();
    return PRESET_PALETTES.filter(p =>
      p.name.toLowerCase().includes(query) ||
      p.author.toLowerCase().includes(query)
    );
  }

  private get currentPaletteName(): string {
    const id = paletteStore.currentPaletteId.value;
    if (id === 'custom') return 'Custom';
    const preset = PRESET_PALETTES.find(p => p.id === id);
    return preset?.name ?? 'Custom';
  }

  private handleTriggerClick(e: Event) {
    e.stopPropagation(); // Prevent popover's outside-click handler from immediately closing
    const target = e.currentTarget as HTMLElement;
    this.triggerRect = target.getBoundingClientRect();
    this.isOpen = !this.isOpen;
  }

  private handleClose() {
    this.isOpen = false;
    this.searchQuery = '';
  }

  private handleSearchInput(e: Event) {
    this.searchQuery = (e.target as HTMLInputElement).value;
  }

  private handlePaletteSelect(palette: PresetPalette) {
    paletteStore.loadPreset(palette.id);
    this.handleClose();
  }

  private handleNewEmpty() {
    paletteStore.createEmpty();
    this.handleClose();
  }

  private renderPalettePreview(colors: string[]) {
    return html`
      <div class="palette-preview">
        ${colors.map(color => html`
          <div class="preview-color" style="background-color: ${color}"></div>
        `)}
      </div>
    `;
  }

  render() {
    const currentId = paletteStore.currentPaletteId.value;
    const filtered = this.filteredPalettes;

    return html`
      <button
        class="selector-trigger"
        @click=${this.handleTriggerClick}
        title="Select palette"
      >
        <span class="trigger-label">${this.currentPaletteName}</span>
        <span class="trigger-chevron">▼</span>
      </button>

      <pf-popover
        ?open=${this.isOpen}
        position="bottom"
        .anchorRect=${this.triggerRect}
        @close=${this.handleClose}
      >
        <div class="selector-content">
          <input
            type="text"
            class="search-input"
            placeholder="Search palettes..."
            .value=${this.searchQuery}
            @input=${this.handleSearchInput}
          />

          <div class="palette-list">
            ${filtered.length > 0 ? filtered.map(palette => html`
              <div
                class="palette-item ${currentId === palette.id ? 'selected' : ''}"
                @click=${() => this.handlePaletteSelect(palette)}
              >
                <div class="palette-header">
                  <span class="palette-name">${palette.name}</span>
                  <span class="palette-count">${palette.colors.length}</span>
                </div>
                ${this.renderPalettePreview(palette.colors)}
              </div>
            `) : html`
              <div class="no-results">No palettes found</div>
            `}
          </div>

          <div class="divider"></div>

          <div class="action-item" @click=${this.handleNewEmpty}>
            <span class="action-icon">+</span>
            <span>New Empty Palette</span>
          </div>
        </div>
      </pf-popover>
    `;
  }
}
