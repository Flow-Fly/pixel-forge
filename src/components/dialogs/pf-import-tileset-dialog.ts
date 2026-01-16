import { html, css, PropertyValues } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { tilesetStore } from '../../stores/tileset';
import type { Tileset } from '../../types/tilemap';

/**
 * PFImportTilesetDialog - Dialog for importing tileset images with grid configuration
 *
 * Features:
 * - File selection via click or drag-and-drop
 * - Auto-detection of tile sizes (8, 16, 32, 64)
 * - Real-time grid preview overlay
 * - Configurable tile size, spacing, and margin
 * - Integration with TilesetStore
 */
@customElement('pf-import-tileset-dialog')
export class PFImportTilesetDialog extends BaseComponent {
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
      min-width: 480px;
      max-width: 600px;
      max-height: 90vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .header {
      padding: var(--pf-spacing-4, 16px);
      border-bottom: 1px solid var(--pf-color-border, #444);
    }

    .header h2 {
      margin: 0;
      font-size: var(--pf-font-size-lg, 18px);
      color: var(--pf-color-text-main, #fff);
    }

    .content {
      padding: var(--pf-spacing-4, 16px);
      overflow-y: auto;
      flex: 1;
    }

    .footer {
      padding: var(--pf-spacing-3, 12px) var(--pf-spacing-4, 16px);
      border-top: 1px solid var(--pf-color-border, #444);
      display: flex;
      gap: var(--pf-spacing-2, 8px);
      justify-content: flex-end;
    }

    .preview-container {
      background: var(--pf-color-bg-dark, #1a1a1a);
      border: 2px dashed var(--pf-color-border, #444);
      border-radius: 4px;
      min-height: 200px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      margin-bottom: var(--pf-spacing-4, 16px);
      cursor: pointer;
      transition: border-color 0.2s;
    }

    .preview-container:hover,
    .preview-container.drag-over {
      border-color: var(--pf-color-accent, #4a9eff);
    }

    .preview-container.has-image {
      border-style: solid;
      cursor: default;
    }

    .drop-zone {
      text-align: center;
      color: var(--pf-color-text-muted, #888);
      padding: var(--pf-spacing-4, 16px);
    }

    .drop-zone p {
      margin: var(--pf-spacing-2, 8px) 0;
    }

    .canvas-wrapper {
      position: relative;
      max-width: 100%;
      max-height: 300px;
      overflow: auto;
    }

    canvas.preview-canvas {
      display: block;
      image-rendering: pixelated;
    }

    .parameters {
      display: flex;
      flex-direction: column;
      gap: var(--pf-spacing-3, 12px);
    }

    .presets {
      display: flex;
      gap: var(--pf-spacing-2, 8px);
      margin-bottom: var(--pf-spacing-2, 8px);
    }

    .preset-btn {
      padding: 6px 12px;
      border-radius: 4px;
      border: 1px solid var(--pf-color-border, #444);
      background: var(--pf-color-bg-dark, #1a1a1a);
      color: var(--pf-color-text-main, #fff);
      cursor: pointer;
      font-size: 12px;
      transition: background 0.2s, border-color 0.2s;
    }

    .preset-btn:hover {
      background: var(--pf-color-bg-hover, #333);
    }

    .preset-btn.selected {
      border-color: var(--pf-color-accent, #4a9eff);
      background: var(--pf-color-accent, #4a9eff);
    }

    .inputs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--pf-spacing-3, 12px);
    }

    .input-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .input-group label {
      font-size: 12px;
      color: var(--pf-color-text-muted, #888);
    }

    .input-group input {
      padding: 8px;
      border-radius: 4px;
      border: 1px solid var(--pf-color-border, #444);
      background: var(--pf-color-bg-dark, #1a1a1a);
      color: var(--pf-color-text-main, #fff);
      font-size: 14px;
      width: 100%;
      box-sizing: border-box;
    }

    .input-group input:focus {
      outline: none;
      border-color: var(--pf-color-accent, #4a9eff);
    }

    .info {
      background: var(--pf-color-bg-dark, #1a1a1a);
      padding: var(--pf-spacing-2, 8px) var(--pf-spacing-3, 12px);
      border-radius: 4px;
      font-size: 13px;
      color: var(--pf-color-text-muted, #888);
    }

    .info.tile-count {
      text-align: center;
    }

    .error-message {
      color: #ff6b6b;
      background: rgba(255, 107, 107, 0.1);
      padding: var(--pf-spacing-2, 8px) var(--pf-spacing-3, 12px);
      border-radius: 4px;
      font-size: 13px;
      margin-top: var(--pf-spacing-2, 8px);
    }

    .warning-message {
      color: #ffd93d;
      background: rgba(255, 217, 61, 0.1);
      padding: var(--pf-spacing-2, 8px) var(--pf-spacing-3, 12px);
      border-radius: 4px;
      font-size: 13px;
      margin-top: var(--pf-spacing-2, 8px);
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

    input[type="file"] {
      display: none;
    }
  `;

  @property({ type: Boolean, reflect: true }) open = false;

  @state() private imageFile: File | null = null;
  @state() private imageBitmap: ImageBitmap | null = null;
  @state() tileWidth = 16;
  @state() tileHeight = 16;
  @state() spacing = 0;
  @state() margin = 0;
  @state() errorMessage = '';
  @state() private isLoading = false;
  @state() private isDragOver = false;

  @query('input[type="file"]') private fileInput!: HTMLInputElement;
  @query('canvas.preview-canvas') private previewCanvas!: HTMLCanvasElement;

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Opens file selection dialog
   */
  selectFile(): void {
    this.fileInput?.click();
  }

  /**
   * Handles file selection from input or drag-and-drop
   */
  async handleFileSelect(file: File): Promise<void> {
    const validTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      this.errorMessage = 'Invalid file type. Please select a PNG, JPG, or WebP image.';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    try {
      this.imageBitmap = await createImageBitmap(file);
      this.imageFile = file;

      const { tileWidth, tileHeight } = this.autoDetectTileSize(
        this.imageBitmap.width,
        this.imageBitmap.height
      );
      this.tileWidth = tileWidth;
      this.tileHeight = tileHeight;
      this.spacing = 0;
      this.margin = 0;

      this.dispatchEvent(new CustomEvent('file-selected', {
        detail: { file, imageBitmap: this.imageBitmap }
      }));

      await this.updateComplete;
      this.updatePreview();
    } catch (error) {
      this.errorMessage = 'Failed to load image. The file may be corrupted.';
      this.imageBitmap = null;
      this.imageFile = null;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Auto-detects optimal tile size based on image dimensions
   */
  autoDetectTileSize(width: number, height: number): { tileWidth: number; tileHeight: number } {
    // Common tile sizes in priority order (most common first)
    const commonSizes = [32, 16, 64, 8];

    for (const size of commonSizes) {
      if (width % size === 0 && height % size === 0) {
        return { tileWidth: size, tileHeight: size };
      }
    }

    // Check for non-square tiles (width-based)
    for (const size of commonSizes) {
      if (width % size === 0) {
        for (const heightSize of commonSizes) {
          if (height % heightSize === 0) {
            return { tileWidth: size, tileHeight: heightSize };
          }
        }
      }
    }

    // Default to 16x16 if no match
    return { tileWidth: 16, tileHeight: 16 };
  }

  /**
   * Calculates number of tile columns
   */
  getColumns(): number {
    if (!this.imageBitmap) return 0;
    return Math.floor(
      (this.imageBitmap.width - 2 * this.margin) / (this.tileWidth + this.spacing)
    );
  }

  /**
   * Calculates number of tile rows
   */
  getRows(): number {
    if (!this.imageBitmap) return 0;
    return Math.floor(
      (this.imageBitmap.height - 2 * this.margin) / (this.tileHeight + this.spacing)
    );
  }

  /**
   * Validates the current configuration
   */
  validateConfiguration(): boolean {
    if (!this.imageBitmap) {
      return false;
    }

    if (this.tileWidth < 1 || this.tileHeight < 1) {
      this.errorMessage = 'Tile dimensions must be at least 1 pixel.';
      return false;
    }

    if (this.tileWidth > 256 || this.tileHeight > 256) {
      this.errorMessage = 'Tile dimensions cannot exceed 256 pixels.';
      return false;
    }

    const columns = this.getColumns();
    const rows = this.getRows();

    if (columns < 1 || rows < 1) {
      this.errorMessage = 'Invalid configuration: no complete tiles can be extracted.';
      return false;
    }

    this.errorMessage = '';
    return true;
  }

  /**
   * Updates the preview canvas with the image and grid overlay
   */
  updatePreview(): void {
    if (!this.imageBitmap || !this.previewCanvas) return;

    const canvas = this.previewCanvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match image
    canvas.width = this.imageBitmap.width;
    canvas.height = this.imageBitmap.height;

    // Clear and draw image
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(this.imageBitmap, 0, 0);

    // Draw grid overlay
    const columns = this.getColumns();
    const rows = this.getRows();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();

    // Vertical lines
    for (let col = 0; col <= columns; col++) {
      const x = this.margin + col * (this.tileWidth + this.spacing);
      ctx.moveTo(x + 0.5, this.margin);
      ctx.lineTo(x + 0.5, this.margin + rows * (this.tileHeight + this.spacing));
    }

    // Horizontal lines
    for (let row = 0; row <= rows; row++) {
      const y = this.margin + row * (this.tileHeight + this.spacing);
      ctx.moveTo(this.margin, y + 0.5);
      ctx.lineTo(this.margin + columns * (this.tileWidth + this.spacing), y + 0.5);
    }

    ctx.stroke();

    // Draw spacing indicators if spacing > 0
    if (this.spacing > 0) {
      ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
      for (let col = 0; col < columns - 1; col++) {
        for (let row = 0; row < rows; row++) {
          const x = this.margin + (col + 1) * this.tileWidth + col * this.spacing;
          const y = this.margin + row * (this.tileHeight + this.spacing);
          ctx.fillRect(x, y, this.spacing, this.tileHeight);
        }
      }
      for (let row = 0; row < rows - 1; row++) {
        for (let col = 0; col < columns; col++) {
          const x = this.margin + col * (this.tileWidth + this.spacing);
          const y = this.margin + (row + 1) * this.tileHeight + row * this.spacing;
          ctx.fillRect(x, y, this.tileWidth, this.spacing);
        }
      }
    }
  }

  /**
   * Handles the import action
   */
  async handleImport(): Promise<void> {
    if (!this.validateConfiguration() || !this.imageBitmap || !this.imageFile) {
      return;
    }

    const columns = this.getColumns();
    const rows = this.getRows();

    const tileset: Tileset = {
      id: crypto.randomUUID(),
      name: this.imageFile.name.replace(/\.[^/.]+$/, ''),
      image: this.imageBitmap,
      imagePath: this.imageFile.name,
      tileWidth: this.tileWidth,
      tileHeight: this.tileHeight,
      columns,
      rows,
      tileCount: columns * rows,
      spacing: this.spacing,
      margin: this.margin
    };

    try {
      tilesetStore.addTileset(tileset);
      tilesetStore.setActiveTileset(tileset.id);

      this.dispatchEvent(new CustomEvent('tileset-imported', {
        detail: { tileset }
      }));

      this.close();
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Failed to import tileset';
    }
  }

  /**
   * Closes the dialog and resets state
   */
  close(): void {
    this.open = false;
    this.imageFile = null;
    // Release GPU/memory resources before nulling reference (NFR6)
    this.imageBitmap?.close();
    this.imageBitmap = null;
    this.errorMessage = '';
    this.tileWidth = 16;
    this.tileHeight = 16;
    this.spacing = 0;
    this.margin = 0;
  }

  private handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this.close();
    } else if (e.key === 'Enter' && this.validateConfiguration()) {
      // Only trigger import from buttons, not from input fields
      const target = e.target as HTMLElement;
      if (target.tagName !== 'INPUT') {
        this.handleImport();
      }
    }
  }

  private handleOverlayClick(e: MouseEvent): void {
    // Only close if clicking on the overlay itself, not the dialog
    if ((e.target as HTMLElement).classList.contains('overlay')) {
      this.close();
    }
  }

  private handleFileInputChange(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.handleFileSelect(file);
    }
    // Reset input so same file can be selected again
    input.value = '';
  }

  private handleDragOver(e: DragEvent): void {
    e.preventDefault();
    this.isDragOver = true;
  }

  private handleDragLeave(e: DragEvent): void {
    e.preventDefault();
    this.isDragOver = false;
  }

  private handleDrop(e: DragEvent): void {
    e.preventDefault();
    this.isDragOver = false;

    const file = e.dataTransfer?.files[0];
    if (file) {
      this.handleFileSelect(file);
    }
  }

  private handlePresetClick(size: number): void {
    this.tileWidth = size;
    this.tileHeight = size;
    this.debouncedUpdatePreview();
  }

  private handleInputChange(field: 'tileWidth' | 'tileHeight' | 'spacing' | 'margin', e: Event): void {
    const input = e.target as HTMLInputElement;
    const value = parseInt(input.value, 10);
    if (!isNaN(value)) {
      this[field] = value;
      this.debouncedUpdatePreview();
    }
  }

  private debouncedUpdatePreview(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.updatePreview();
    }, 100);
  }

  private getSelectedPreset(): number | null {
    const sizes = [8, 16, 32, 64];
    if (this.tileWidth === this.tileHeight && sizes.includes(this.tileWidth)) {
      return this.tileWidth;
    }
    return null;
  }

  protected updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties);

    // Set initial focus when dialog opens (Task 9.4)
    if (changedProperties.has('open') && this.open) {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        const tileWidthInput = this.shadowRoot?.querySelector<HTMLInputElement>('#tile-width');
        tileWidthInput?.focus();
      });
    }

    if (changedProperties.has('tileWidth') ||
        changedProperties.has('tileHeight') ||
        changedProperties.has('spacing') ||
        changedProperties.has('margin')) {
      if (this.imageBitmap) {
        this.debouncedUpdatePreview();
      }
    }
  }

  render() {
    if (!this.open) return html``;

    const columns = this.getColumns();
    const rows = this.getRows();
    const tileCount = columns * rows;
    const hasImage = !!this.imageBitmap;
    const isValid = this.validateConfiguration();
    const selectedPreset = this.getSelectedPreset();

    // Check for incomplete tiles at edges
    let warningMessage = '';
    if (hasImage && this.imageBitmap) {
      const usedWidth = this.margin + columns * (this.tileWidth + this.spacing) - this.spacing;
      const usedHeight = this.margin + rows * (this.tileHeight + this.spacing) - this.spacing;
      if (usedWidth < this.imageBitmap.width || usedHeight < this.imageBitmap.height) {
        warningMessage = 'Some pixels at the edges will be excluded due to incomplete tiles.';
      }
    }

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
            <h2 id="dialog-title">Import Tileset</h2>
          </header>

          <div class="content">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              @change=${this.handleFileInputChange}
            />

            <div
              class="preview-container ${hasImage ? 'has-image' : ''} ${this.isDragOver ? 'drag-over' : ''}"
              @click=${hasImage ? null : this.selectFile}
              @dragover=${this.handleDragOver}
              @dragleave=${this.handleDragLeave}
              @drop=${this.handleDrop}
            >
              ${hasImage ? html`
                <div class="canvas-wrapper">
                  <canvas class="preview-canvas"></canvas>
                </div>
              ` : html`
                <div class="drop-zone">
                  <p>Drag and drop an image here</p>
                  <p>or click to browse</p>
                  <p style="font-size: 11px">Supports PNG, JPG, WebP</p>
                </div>
              `}
            </div>

            <div class="parameters">
              <div class="presets">
                <button
                  class="preset-btn ${selectedPreset === 8 ? 'selected' : ''}"
                  data-preset="8"
                  @click=${() => this.handlePresetClick(8)}
                >8x8</button>
                <button
                  class="preset-btn ${selectedPreset === 16 ? 'selected' : ''}"
                  data-preset="16"
                  @click=${() => this.handlePresetClick(16)}
                >16x16</button>
                <button
                  class="preset-btn ${selectedPreset === 32 ? 'selected' : ''}"
                  data-preset="32"
                  @click=${() => this.handlePresetClick(32)}
                >32x32</button>
                <button
                  class="preset-btn ${selectedPreset === 64 ? 'selected' : ''}"
                  data-preset="64"
                  @click=${() => this.handlePresetClick(64)}
                >64x64</button>
              </div>

              <div class="inputs">
                <div class="input-group">
                  <label for="tile-width">Tile Width</label>
                  <input
                    type="number"
                    id="tile-width"
                    name="tileWidth"
                    .value=${String(this.tileWidth)}
                    min="1"
                    max="256"
                    @input=${(e: Event) => this.handleInputChange('tileWidth', e)}
                  />
                </div>
                <div class="input-group">
                  <label for="tile-height">Tile Height</label>
                  <input
                    type="number"
                    id="tile-height"
                    name="tileHeight"
                    .value=${String(this.tileHeight)}
                    min="1"
                    max="256"
                    @input=${(e: Event) => this.handleInputChange('tileHeight', e)}
                  />
                </div>
                <div class="input-group">
                  <label for="spacing">Spacing</label>
                  <input
                    type="number"
                    id="spacing"
                    name="spacing"
                    .value=${String(this.spacing)}
                    min="0"
                    max="64"
                    @input=${(e: Event) => this.handleInputChange('spacing', e)}
                  />
                </div>
                <div class="input-group">
                  <label for="margin">Margin</label>
                  <input
                    type="number"
                    id="margin"
                    name="margin"
                    .value=${String(this.margin)}
                    min="0"
                    max="64"
                    @input=${(e: Event) => this.handleInputChange('margin', e)}
                  />
                </div>
              </div>

              ${hasImage ? html`
                <div class="info tile-count">
                  ${columns} × ${rows} = <strong>${tileCount}</strong> tiles
                </div>
              ` : ''}

              ${warningMessage ? html`
                <div class="warning-message">${warningMessage}</div>
              ` : ''}

              ${this.errorMessage ? html`
                <div class="error-message">${this.errorMessage}</div>
              ` : ''}
            </div>
          </div>

          <footer class="footer">
            <button @click=${this.close}>Cancel</button>
            <button
              class="primary"
              data-action="import"
              ?disabled=${!isValid || this.isLoading}
              @click=${this.handleImport}
            >
              ${this.isLoading ? 'Loading...' : 'Import'}
            </button>
          </footer>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pf-import-tileset-dialog': PFImportTilesetDialog;
  }
}
