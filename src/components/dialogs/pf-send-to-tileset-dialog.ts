import { html, css } from 'lit';
import type { PropertyValues } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { tilesetStore } from '../../stores/tileset';
import { tilemapStore } from '../../stores/tilemap';
import { modeStore } from '../../stores/mode';
import { selectionStore } from '../../stores/selection';
import { layerStore } from '../../stores/layers';
import { animationStore } from '../../stores/animation';
import type { Tileset } from '../../types/tilemap';
import { InvalidTilesetError, TileOutOfBoundsError } from '../../errors/tilemap-errors';

/**
 * PFSendToTilesetDialog - Dialog for sending pixel art to tileset
 *
 * Features:
 * - Captures canvas or selection region as tile
 * - Adds to existing tileset or creates new one
 * - Supports replacing existing tiles
 * - Option to switch to Map mode after sending
 * - Validates tile size compatibility
 */
@customElement('pf-send-to-tileset-dialog')
export class PFSendToTilesetDialog extends BaseComponent {
  static styles = css`
    :host {
      display: none;
    }

    :host([open]) {
      display: block;
    }

    .overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .dialog {
      background: var(--pf-color-bg-panel, #2a2a2a);
      border: 1px solid var(--pf-color-border, #444);
      border-radius: 8px;
      min-width: 400px;
      max-width: 500px;
      max-height: 90vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .header {
      padding: var(--pf-spacing-4, 16px);
      border-bottom: 1px solid var(--pf-color-border, #444);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .header h2 {
      margin: 0;
      font-size: var(--pf-font-size-lg, 18px);
      color: var(--pf-color-text-main, #fff);
    }

    .close-btn {
      background: none;
      border: none;
      color: var(--pf-color-text-muted, #888);
      cursor: pointer;
      font-size: 20px;
      padding: 4px;
      line-height: 1;
    }

    .close-btn:hover {
      color: var(--pf-color-text-main, #fff);
    }

    .content {
      padding: var(--pf-spacing-4, 16px);
      overflow-y: auto;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: var(--pf-spacing-3, 12px);
    }

    .footer {
      padding: var(--pf-spacing-3, 12px) var(--pf-spacing-4, 16px);
      border-top: 1px solid var(--pf-color-border, #444);
      display: flex;
      gap: var(--pf-spacing-2, 8px);
      justify-content: flex-end;
    }

    .preview-container {
      display: flex;
      justify-content: center;
      align-items: center;
      background: var(--pf-color-bg-dark, #1a1a1a);
      border: 1px solid var(--pf-color-border, #444);
      border-radius: 4px;
      padding: var(--pf-spacing-3, 12px);
      min-height: 100px;
    }

    .preview-canvas {
      image-rendering: pixelated;
      max-width: 100%;
      max-height: 128px;
      border: 1px solid var(--pf-color-border, #444);
    }

    .empty-preview {
      color: var(--pf-color-text-muted, #888);
      font-size: var(--pf-font-size-sm, 12px);
    }

    .section {
      display: flex;
      flex-direction: column;
      gap: var(--pf-spacing-2, 8px);
    }

    .section-label {
      font-size: var(--pf-font-size-sm, 12px);
      color: var(--pf-color-text-muted, #888);
    }

    .tileset-selector {
      width: 100%;
      padding: 8px;
      border-radius: 4px;
      border: 1px solid var(--pf-color-border, #444);
      background: var(--pf-color-bg-dark, #1a1a1a);
      color: var(--pf-color-text-main, #fff);
      font-size: 14px;
    }

    .tileset-selector:focus {
      outline: none;
      border-color: var(--pf-color-accent, #4a9eff);
    }

    .radio-group {
      display: flex;
      flex-direction: column;
      gap: var(--pf-spacing-2, 8px);
    }

    .radio-option {
      display: flex;
      align-items: center;
      gap: var(--pf-spacing-2, 8px);
      cursor: pointer;
      padding: 4px 0;
    }

    .radio-option input[type="radio"] {
      accent-color: var(--pf-color-accent, #4a9eff);
      width: 16px;
      height: 16px;
    }

    .radio-option label {
      font-size: 14px;
      color: var(--pf-color-text-main, #fff);
      cursor: pointer;
    }

    .tile-picker {
      max-height: 150px;
      overflow-y: auto;
      border: 1px solid var(--pf-color-border, #444);
      border-radius: 4px;
      background: var(--pf-color-bg-dark, #1a1a1a);
    }

    .tile-picker-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(32px, 1fr));
      gap: 1px;
      padding: 4px;
    }

    .tile-picker-cell {
      aspect-ratio: 1;
      cursor: pointer;
      position: relative;
      background: var(--pf-color-bg-panel, #2a2a2a);
      min-width: 32px;
      min-height: 32px;
    }

    .tile-picker-cell:hover {
      outline: 2px solid var(--pf-color-accent, #4a9eff);
      outline-offset: -2px;
    }

    .tile-picker-cell.selected {
      outline: 2px solid var(--pf-color-accent, #4a9eff);
      outline-offset: -2px;
    }

    .tile-picker-cell canvas {
      width: 100%;
      height: 100%;
      display: block;
      image-rendering: pixelated;
    }

    .checkbox-option {
      display: flex;
      align-items: center;
      gap: var(--pf-spacing-2, 8px);
      cursor: pointer;
      padding: 4px 0;
    }

    .checkbox-option input[type="checkbox"] {
      accent-color: var(--pf-color-accent, #4a9eff);
      width: 16px;
      height: 16px;
    }

    .checkbox-option label {
      font-size: 14px;
      color: var(--pf-color-text-main, #fff);
      cursor: pointer;
    }

    .size-info {
      background: var(--pf-color-bg-dark, #1a1a1a);
      padding: var(--pf-spacing-2, 8px) var(--pf-spacing-3, 12px);
      border-radius: 4px;
      font-size: 13px;
      color: var(--pf-color-text-muted, #888);
    }

    .warning-message {
      color: #ffd93d;
      background: rgba(255, 217, 61, 0.1);
      padding: var(--pf-spacing-2, 8px) var(--pf-spacing-3, 12px);
      border-radius: 4px;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: var(--pf-spacing-2, 8px);
    }

    .error-message {
      color: #ff6b6b;
      background: rgba(255, 107, 107, 0.1);
      padding: var(--pf-spacing-2, 8px) var(--pf-spacing-3, 12px);
      border-radius: 4px;
      font-size: 13px;
    }

    button {
      padding: 8px 16px;
      border-radius: 4px;
      border: 1px solid var(--pf-color-border, #444);
      background: var(--pf-color-bg-dark, #1a1a1a);
      color: var(--pf-color-text-main, #fff);
      cursor: pointer;
      font-size: 14px;
      transition: background 0.2s;
      min-width: 44px;
      min-height: 44px;
    }

    button:hover:not(:disabled) {
      background: var(--pf-color-bg-hover, #333);
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    button.primary {
      background: var(--pf-color-accent, #4a9eff);
      border-color: var(--pf-color-accent, #4a9eff);
    }

    button.primary:hover:not(:disabled) {
      filter: brightness(1.1);
    }
  `;

  @property({ type: Boolean, reflect: true }) open = false;

  @state() private capturedImageData: ImageData | null = null;
  @state() private selectedAction: 'add' | 'replace' = 'add';
  @state() private selectedTilesetId: string | null = null;
  @state() private replaceTileIndex: number | null = null;
  @state() private switchToMapMode = false;
  @state() private sizeWarning: string | null = null;
  @state() private errorMessage = '';
  @state() private isProcessing = false;

  @query('canvas.preview-canvas') private previewCanvas!: HTMLCanvasElement;

  /**
   * Opens the dialog and captures current artwork
   * Note: Actual initialization happens in updated() when open becomes true
   */
  openDialog(): void {
    this.open = true;
  }

  /**
   * Captures the current canvas or selection as ImageData
   */
  private captureArtwork(): ImageData | null {
    const activeLayerId = layerStore.activeLayerId.value;
    if (!activeLayerId) return null;

    const currentFrameId = animationStore.currentFrameId.value;
    if (!currentFrameId) return null;

    const celCanvas = animationStore.getCelCanvas(currentFrameId, activeLayerId);
    if (!celCanvas) return null;

    const ctx = celCanvas.getContext('2d');
    if (!ctx) return null;

    // Check if selection is active
    const selectionState = selectionStore.state.value;
    if (selectionState.type === 'selected' && selectionState.shape === 'rectangle') {
      // Capture only the selection region
      const { x, y, width, height } = selectionState.bounds;
      return ctx.getImageData(x, y, width, height);
    }

    // Capture entire canvas
    return ctx.getImageData(0, 0, celCanvas.width, celCanvas.height);
  }

  /**
   * Validates tile size against selected tileset and sets warning
   */
  private validateAndWarn(): void {
    if (!this.capturedImageData) {
      this.sizeWarning = null;
      return;
    }

    // If creating new tileset, any size is valid
    if (!this.selectedTilesetId) {
      this.sizeWarning = null;
      return;
    }

    const tileset = tilesetStore.getTileset(this.selectedTilesetId);
    if (!tileset) {
      this.sizeWarning = null;
      return;
    }

    const { width, height } = this.capturedImageData;

    if (width !== tileset.tileWidth || height !== tileset.tileHeight) {
      this.sizeWarning =
        `Art size (${width}×${height}) doesn't match tileset (${tileset.tileWidth}×${tileset.tileHeight}). ` +
        `The art will be resized to fit.`;
    } else {
      this.sizeWarning = null;
    }
  }

  /**
   * Closes the dialog and resets state
   */
  close(): void {
    this.open = false;
    this.capturedImageData = null;
    this.errorMessage = '';
    this.sizeWarning = null;
    this.selectedAction = 'add';
    this.selectedTilesetId = null;
    this.replaceTileIndex = null;
    this.switchToMapMode = false;
    this.isProcessing = false;

    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  /**
   * Handles the send action - adds or replaces tile
   */
  private async handleSend(): Promise<void> {
    if (!this.capturedImageData || this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    this.errorMessage = '';

    try {
      let tilesetName: string;
      let tileIndex: number;

      if (!this.selectedTilesetId) {
        // Create new tileset with this tile
        const result = await tilesetStore.createTilesetFromImageData(
          this.capturedImageData,
          'Tileset from Art'
        );
        tilesetName = 'Tileset from Art';
        tileIndex = 0;

        // Make the new tileset active
        tilesetStore.setActiveTileset(result);
        // Sync tilemap store so canvas knows which tileset to use for rendering
        tilemapStore.setActiveTileset(result);
      } else if (this.selectedAction === 'add') {
        // Add to existing tileset
        const tileset = tilesetStore.getTileset(this.selectedTilesetId);
        if (!tileset) {
          throw new InvalidTilesetError('Selected tileset not found');
        }

        // Resize if needed
        const imageData = this.resizeIfNeeded(
          this.capturedImageData,
          tileset.tileWidth,
          tileset.tileHeight
        );

        tileIndex = await tilesetStore.addTileToTileset(this.selectedTilesetId, imageData);
        tilesetName = tileset.name;
      } else {
        // Replace existing tile
        if (this.replaceTileIndex === null) {
          throw new InvalidTilesetError('No tile selected for replacement');
        }

        const tileset = tilesetStore.getTileset(this.selectedTilesetId);
        if (!tileset) {
          throw new InvalidTilesetError('Selected tileset not found');
        }

        // Resize if needed
        const imageData = this.resizeIfNeeded(
          this.capturedImageData,
          tileset.tileWidth,
          tileset.tileHeight
        );

        await tilesetStore.replaceTile(this.selectedTilesetId, this.replaceTileIndex, imageData);
        tileIndex = this.replaceTileIndex;
        tilesetName = tileset.name;
      }

      // Show success toast
      const message = this.selectedAction === 'replace'
        ? `Tile #${tileIndex + 1} replaced in ${tilesetName}`
        : `Tile added to ${tilesetName}`;

      window.dispatchEvent(new CustomEvent('show-success-toast', {
        detail: { message }
      }));

      // Dispatch tile-added event
      this.dispatchEvent(new CustomEvent('tile-added', {
        detail: {
          tilesetId: this.selectedTilesetId,
          tileIndex,
          action: this.selectedAction
        },
        bubbles: true,
        composed: true
      }));

      // Switch to map mode if requested
      if (this.switchToMapMode) {
        modeStore.setMode('map');
        // Select the newly added tile
        if (this.selectedTilesetId) {
          try {
            tilesetStore.setSelectedTile(tileIndex);
          } catch {
            // Ignore if tile selection fails
          }
        }
      }

      this.close();
    } catch (error) {
      if (error instanceof InvalidTilesetError || error instanceof TileOutOfBoundsError) {
        this.errorMessage = error.message;
      } else {
        this.errorMessage = 'Failed to send to tileset. Please try again.';
        console.error('Send to tileset error:', error);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Resizes image data to match tileset dimensions
   */
  private resizeIfNeeded(imageData: ImageData, targetWidth: number, targetHeight: number): ImageData {
    if (imageData.width === targetWidth && imageData.height === targetHeight) {
      return imageData;
    }

    // Create source canvas
    const srcCanvas = new OffscreenCanvas(imageData.width, imageData.height);
    const srcCtx = srcCanvas.getContext('2d');
    if (!srcCtx) throw new Error('Failed to create canvas context');
    srcCtx.putImageData(imageData, 0, 0);

    // Create destination canvas at target size
    const dstCanvas = new OffscreenCanvas(targetWidth, targetHeight);
    const dstCtx = dstCanvas.getContext('2d');
    if (!dstCtx) throw new Error('Failed to create canvas context');

    // Use nearest-neighbor scaling for pixel art
    dstCtx.imageSmoothingEnabled = false;
    dstCtx.drawImage(srcCanvas, 0, 0, targetWidth, targetHeight);

    return dstCtx.getImageData(0, 0, targetWidth, targetHeight);
  }

  private handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this.close();
    } else if (e.key === 'Enter' && this.capturedImageData && !this.isProcessing) {
      // Don't trigger from inputs
      const target = e.target as HTMLElement;
      if (target.tagName !== 'INPUT' && target.tagName !== 'SELECT') {
        this.handleSend();
      }
    }
  }

  private handleOverlayClick(e: MouseEvent): void {
    if ((e.target as HTMLElement).classList.contains('overlay')) {
      this.close();
    }
  }

  private handleTilesetChange(e: Event): void {
    const select = e.target as HTMLSelectElement;
    this.selectedTilesetId = select.value || null;
    this.replaceTileIndex = null;
    this.validateAndWarn();
  }

  private handleActionChange(action: 'add' | 'replace'): void {
    this.selectedAction = action;
    if (action === 'add') {
      this.replaceTileIndex = null;
    }
  }

  private handleTileSelect(tileIndex: number): void {
    this.replaceTileIndex = tileIndex;
  }

  private handleSwitchModeChange(e: Event): void {
    this.switchToMapMode = (e.target as HTMLInputElement).checked;
  }

  private updatePreview(): void {
    if (!this.previewCanvas || !this.capturedImageData) return;

    const canvas = this.previewCanvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = this.capturedImageData.width;
    canvas.height = this.capturedImageData.height;
    ctx.putImageData(this.capturedImageData, 0, 0);
  }

  private drawTilePickerCell(canvas: HTMLCanvasElement, tileset: Tileset, tileIndex: number): void {
    const rect = tilesetStore.getTileRect(tileset.id, tileIndex);
    if (!rect) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = rect.width;
    canvas.height = rect.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      tileset.image,
      rect.x, rect.y, rect.width, rect.height,
      0, 0, rect.width, rect.height
    );
  }

  /**
   * Called before update - initialize state here to avoid cascading updates
   */
  protected willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties);

    if (changedProperties.has('open') && this.open) {
      // Capture artwork when dialog opens
      this.capturedImageData = this.captureArtwork();
      this.errorMessage = '';
      this.sizeWarning = null;
      this.selectedAction = 'add';
      this.replaceTileIndex = null;
      this.switchToMapMode = false;

      // Auto-select active tileset or first available
      const tilesets = tilesetStore.tilesets.value;
      if (tilesetStore.activeTilesetId.value) {
        this.selectedTilesetId = tilesetStore.activeTilesetId.value;
      } else if (tilesets.length > 0) {
        this.selectedTilesetId = tilesets[0].id;
      } else {
        this.selectedTilesetId = null; // Will create new
      }

      this.validateAndWarn();
    }
  }

  protected updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties);

    // Focus the tileset selector after dialog opens (requires DOM to be rendered)
    if (changedProperties.has('open') && this.open) {
      requestAnimationFrame(() => {
        const selector = this.shadowRoot?.querySelector('.tileset-selector') as HTMLSelectElement;
        selector?.focus();
      });
    }

    // Update preview canvas (requires DOM canvas element)
    if (this.open && this.capturedImageData) {
      this.updatePreview();
    }

    // Draw tile picker cells (requires DOM canvas elements)
    if (this.open && this.selectedAction === 'replace' && this.selectedTilesetId) {
      const tileset = tilesetStore.getTileset(this.selectedTilesetId);
      if (tileset) {
        const cells = this.shadowRoot?.querySelectorAll('.tile-picker-cell canvas');
        cells?.forEach((canvas, index) => {
          this.drawTilePickerCell(canvas as HTMLCanvasElement, tileset, index);
        });
      }
    }
  }

  private renderTilePicker(): unknown {
    if (!this.selectedTilesetId) return null;

    const tileset = tilesetStore.getTileset(this.selectedTilesetId);
    if (!tileset) return null;

    const tileIndices = Array.from({ length: tileset.tileCount }, (_, i) => i);

    return html`
      <div class="tile-picker">
        <div class="tile-picker-grid">
          ${tileIndices.map(index => html`
            <div
              class="tile-picker-cell ${this.replaceTileIndex === index ? 'selected' : ''}"
              @click=${() => this.handleTileSelect(index)}
              title="Tile ${index + 1}"
            >
              <canvas></canvas>
            </div>
          `)}
        </div>
      </div>
    `;
  }

  render() {
    if (!this.open) return html``;

    const tilesets = tilesetStore.tilesets.value;
    const hasArtwork = !!this.capturedImageData;
    const canSend = hasArtwork && !this.isProcessing &&
      (this.selectedAction === 'add' || this.replaceTileIndex !== null);

    const artSize = this.capturedImageData
      ? `${this.capturedImageData.width}×${this.capturedImageData.height}px`
      : '';

    return html`
      <div class="overlay" @click=${this.handleOverlayClick}>
        <div
          class="dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dialog-title"
          @click=${(e: Event) => e.stopPropagation()}
          @keydown=${this.handleKeydown}
          tabindex="-1"
        >
          <header class="header">
            <h2 id="dialog-title">Send to Tileset</h2>
            <button class="close-btn" @click=${this.close} aria-label="Close">×</button>
          </header>

          <div class="content">
            <!-- Preview -->
            <div class="section">
              <span class="section-label">Preview ${artSize ? `(${artSize})` : ''}</span>
              <div class="preview-container">
                ${hasArtwork
                  ? html`<canvas class="preview-canvas"></canvas>`
                  : html`<span class="empty-preview">No artwork to capture</span>`}
              </div>
            </div>

            ${hasArtwork ? html`
              <!-- Tileset Selection -->
              <div class="section">
                <span class="section-label">Target Tileset</span>
                <select
                  class="tileset-selector"
                  .value=${this.selectedTilesetId || ''}
                  @change=${this.handleTilesetChange}
                >
                  <option value="">Create New Tileset</option>
                  ${tilesets.map(ts => html`
                    <option value=${ts.id}>${ts.name} (${ts.tileWidth}×${ts.tileHeight})</option>
                  `)}
                </select>
              </div>

              <!-- Action Selection -->
              ${this.selectedTilesetId ? html`
                <div class="section">
                  <span class="section-label">Action</span>
                  <div class="radio-group">
                    <div class="radio-option">
                      <input
                        type="radio"
                        id="action-add"
                        name="action"
                        .checked=${this.selectedAction === 'add'}
                        @change=${() => this.handleActionChange('add')}
                      />
                      <label for="action-add">Add as new tile</label>
                    </div>
                    <div class="radio-option">
                      <input
                        type="radio"
                        id="action-replace"
                        name="action"
                        .checked=${this.selectedAction === 'replace'}
                        @change=${() => this.handleActionChange('replace')}
                      />
                      <label for="action-replace">Replace existing tile</label>
                    </div>
                  </div>
                </div>

                ${this.selectedAction === 'replace' ? html`
                  <div class="section">
                    <span class="section-label">Select tile to replace</span>
                    ${this.renderTilePicker()}
                  </div>
                ` : null}
              ` : null}

              <!-- Switch to Map Mode -->
              <div class="checkbox-option">
                <input
                  type="checkbox"
                  id="switch-mode"
                  .checked=${this.switchToMapMode}
                  @change=${this.handleSwitchModeChange}
                />
                <label for="switch-mode">Switch to Map mode after</label>
              </div>

              ${this.sizeWarning ? html`
                <div class="warning-message">
                  ⚠️ ${this.sizeWarning}
                </div>
              ` : null}

              ${this.errorMessage ? html`
                <div class="error-message">${this.errorMessage}</div>
              ` : null}
            ` : null}
          </div>

          <footer class="footer">
            <button @click=${this.close}>Cancel</button>
            <button
              class="primary"
              ?disabled=${!canSend}
              @click=${this.handleSend}
            >
              ${this.isProcessing ? 'Sending...' : 'Send to Tileset'}
            </button>
          </footer>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pf-send-to-tileset-dialog': PFSendToTilesetDialog;
  }
}
