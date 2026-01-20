import { html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { tilesetStore } from '../../stores/tileset';
import type { Tileset } from '../../types/tilemap';
import '../dialogs/pf-import-tileset-dialog';
import type { PFImportTilesetDialog } from '../dialogs/pf-import-tileset-dialog';
import './pf-tileset-grid';

/** Maximum file size for tileset images (10MB) */
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * PFTilesetPanel - Container panel for tileset display and management
 *
 * Features:
 * - Header with tileset name
 * - Empty state with "Import Tileset" CTA
 * - Drag-and-drop zone for file upload
 * - Tileset grid display when tileset is loaded
 * - Dialog integration for importing tilesets
 */
@customElement('pf-tileset-panel')
export class PFTilesetPanel extends BaseComponent {
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

    .tileset-name {
      font-size: var(--pf-font-size-sm, 12px);
      color: var(--pf-color-text-main, #e0e0e0);
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .grid-container {
      flex: 1;
      overflow-y: auto;
      min-height: 0;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      gap: var(--pf-spacing-3, 12px);
      border: 2px dashed var(--pf-color-border, #333);
      border-radius: var(--pf-radius-md, 6px);
      padding: var(--pf-spacing-4, 16px);
      text-align: center;
      cursor: pointer;
      transition: border-color 0.2s, background-color 0.2s;
    }

    .empty-state:hover {
      border-color: var(--pf-color-accent, #f59e0b);
    }

    .empty-state.drag-active {
      border-color: var(--pf-color-accent, #f59e0b);
      background: rgba(245, 158, 11, 0.1);
    }

    .empty-text {
      color: var(--pf-color-text-muted, #808080);
      font-size: var(--pf-font-size-sm, 12px);
    }

    .import-btn {
      padding: var(--pf-spacing-2, 8px) var(--pf-spacing-3, 12px);
      border-radius: var(--pf-radius-sm, 4px);
      border: 1px solid var(--pf-color-accent, #f59e0b);
      background: transparent;
      color: var(--pf-color-accent, #f59e0b);
      cursor: pointer;
      font-size: var(--pf-font-size-sm, 12px);
      transition: background 0.2s;
    }

    .import-btn:hover {
      background: rgba(245, 158, 11, 0.15);
    }

    .import-btn:focus {
      outline: 2px solid var(--pf-color-accent, #f59e0b);
      outline-offset: 2px;
    }

    .drop-hint {
      font-size: var(--pf-font-size-xs, 10px);
      color: var(--pf-color-text-muted, #808080);
    }

    /* Drag overlay for when tileset is already loaded */
    .panel-content {
      position: relative;
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    .drag-overlay {
      position: absolute;
      inset: 0;
      background: rgba(245, 158, 11, 0.1);
      border: 2px dashed var(--pf-color-accent, #f59e0b);
      border-radius: var(--pf-radius-md, 6px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10;
      pointer-events: none;
    }

    .drag-overlay-text {
      color: var(--pf-color-accent, #f59e0b);
      font-size: var(--pf-font-size-sm, 12px);
      font-weight: 500;
    }
  `;

  @state() private showImportDialog = false;
  @state() private preloadedFile: File | null = null;
  @state() private isDragOver = false;

  private get activeTileset(): Tileset | null {
    return tilesetStore.getActiveTileset();
  }

  private handleImportClick(): void {
    this.preloadedFile = null;
    this.showImportDialog = true;
  }

  private handleTilesetImported(): void {
    this.showImportDialog = false;
    this.preloadedFile = null;
  }

  private handleDialogClose(): void {
    this.showImportDialog = false;
    this.preloadedFile = null;
  }

  private handleDragOver(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();

    if (e.dataTransfer?.types.includes('Files')) {
      this.isDragOver = true;
      e.dataTransfer.dropEffect = 'copy';
    }
  }

  private handleDragLeave(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.isDragOver = false;
  }

  private handleDrop(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.isDragOver = false;

    const file = e.dataTransfer?.files[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      // Invalid file type - could show toast/error
      console.warn(`[pf-tileset-panel] Invalid file type: ${file.type}`);
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      console.warn(`[pf-tileset-panel] File too large: ${file.size} bytes (max ${MAX_FILE_SIZE_BYTES})`);
      return;
    }

    // Open import dialog with pre-loaded file
    this.preloadedFile = file;
    this.showImportDialog = true;

    this.dispatchEvent(new CustomEvent('file-dropped', {
      detail: { file },
      bubbles: true,
      composed: true
    }));
  }

  private renderEmptyState() {
    return html`
      <div
        class="empty-state ${this.isDragOver ? 'drag-active' : ''}"
        @click=${this.handleImportClick}
        @dragover=${this.handleDragOver}
        @dragleave=${this.handleDragLeave}
        @drop=${this.handleDrop}
      >
        <span class="empty-text">No tileset loaded</span>
        <button
          class="import-btn"
          @click=${(e: Event) => {
            e.stopPropagation();
            this.handleImportClick();
          }}
        >
          Import Tileset
        </button>
        <span class="drop-hint">or drag and drop an image</span>
      </div>
    `;
  }

  private renderTilesetContent() {
    const tileset = this.activeTileset;
    if (!tileset) return this.renderEmptyState();

    return html`
      <div class="header">
        <span class="tileset-name" title="${tileset.name}">${tileset.name}</span>
      </div>
      <div
        class="panel-content"
        @dragover=${this.handleDragOver}
        @dragleave=${this.handleDragLeave}
        @drop=${this.handleDrop}
      >
        ${this.isDragOver ? html`
          <div class="drag-overlay">
            <span class="drag-overlay-text">Drop to import tileset</span>
          </div>
        ` : ''}
        <div class="grid-container">
          <pf-tileset-grid></pf-tileset-grid>
        </div>
      </div>
    `;
  }

  render() {
    return html`
      ${this.activeTileset ? this.renderTilesetContent() : this.renderEmptyState()}

      <pf-import-tileset-dialog
        ?open=${this.showImportDialog}
        @tileset-imported=${this.handleTilesetImported}
        @close=${this.handleDialogClose}
      ></pf-import-tileset-dialog>
    `;
  }

  /**
   * Updated lifecycle - handle preloaded file when dialog opens
   */
  protected updated(changedProperties: Map<string, unknown>): void {
    super.updated(changedProperties);

    if (changedProperties.has('showImportDialog') && this.showImportDialog && this.preloadedFile) {
      // Pass pre-loaded file to dialog with proper typing
      const dialog = this.shadowRoot?.querySelector<PFImportTilesetDialog>('pf-import-tileset-dialog');
      if (dialog) {
        dialog.handleFileSelect(this.preloadedFile);
      }
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pf-tileset-panel': PFTilesetPanel;
  }
}
