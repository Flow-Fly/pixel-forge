import { html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { projectStore } from '../../stores/project';
import { layerStore } from '../../stores/layers';
import { animationStore } from '../../stores/animation';
import { FileService } from '../../services/file-service';
import { exportSpritesheet } from '../../services/spritesheet-export';
import { exportAnimatedWebP } from '../../services/webp-animation';
import '../ui/pf-dialog';

export type ExportFormat = 'png' | 'webp' | 'webp-animated' | 'spritesheet';
export type FrameSelection = 'current' | 'all' | 'range';

@customElement('pf-export-dialog')
export class PFExportDialog extends BaseComponent {
  static styles = css`
    .form-group {
      margin-bottom: 16px;
    }

    label {
      display: block;
      margin-bottom: 6px;
      font-size: 12px;
      color: var(--pf-color-text-muted, #808080);
    }

    select, input[type="text"], input[type="number"] {
      width: 100%;
      padding: 8px;
      background: var(--pf-color-bg-surface, #1e1e1e);
      border: 1px solid var(--pf-color-border, #333);
      border-radius: 4px;
      color: var(--pf-color-text-main, #e0e0e0);
      font-size: 13px;
    }

    select:focus, input:focus {
      outline: none;
      border-color: var(--pf-color-accent, #4a9eff);
    }

    .row {
      display: flex;
      gap: 12px;
    }

    .row .form-group {
      flex: 1;
    }

    .checkbox-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .checkbox-group input[type="checkbox"] {
      width: auto;
      accent-color: var(--pf-color-accent, #4a9eff);
    }

    .checkbox-group label {
      margin: 0;
      color: var(--pf-color-text-main, #e0e0e0);
      cursor: pointer;
    }

    .color-input {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .color-input input[type="color"] {
      width: 40px;
      height: 32px;
      padding: 0;
      border: 1px solid var(--pf-color-border, #333);
      border-radius: 4px;
      cursor: pointer;
    }

    .color-input input[type="text"] {
      flex: 1;
    }

    .preview-info {
      background: var(--pf-color-bg-surface, #1e1e1e);
      border-radius: 4px;
      padding: 12px;
      margin-bottom: 16px;
      font-size: 12px;
      color: var(--pf-color-text-muted, #808080);
    }

    .preview-info strong {
      color: var(--pf-color-text-main, #e0e0e0);
    }

    button {
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .btn-cancel {
      background: transparent;
      border: 1px solid var(--pf-color-border, #333);
      color: var(--pf-color-text-main, #e0e0e0);
    }

    .btn-cancel:hover {
      background: var(--pf-color-bg-surface, #1e1e1e);
    }

    .btn-export {
      background: var(--pf-color-accent, #4a9eff);
      border: none;
      color: white;
    }

    .btn-export:hover {
      background: var(--pf-color-accent-hover, #3a8eef);
    }
  `;

  @property({ type: Boolean }) open = false;

  @state() private format: ExportFormat = 'png';
  @state() private scale: number = 1;
  @state() private frameSelection: FrameSelection = 'current';
  @state() private frameStart: number = 1;
  @state() private frameEnd: number = 1;
  @state() private useBackground: boolean = false;
  @state() private backgroundColor: string = '#ffffff';
  @state() private filename: string = 'export';
  @state() private includeJson: boolean = true;
  @state() private spritesheetDirection: 'horizontal' | 'vertical' | 'grid' = 'horizontal';
  @state() private spritesheetColumns: number = 4;

  connectedCallback() {
    super.connectedCallback();
    this.frameEnd = animationStore.frames.value.length;
  }

  private get outputSize() {
    const baseWidth = projectStore.width.value;
    const baseHeight = projectStore.height.value;
    const frameCount = this.getFrameCount();

    if (this.format === 'spritesheet') {
      let cols: number, rows: number;
      if (this.spritesheetDirection === 'horizontal') {
        cols = frameCount;
        rows = 1;
      } else if (this.spritesheetDirection === 'vertical') {
        cols = 1;
        rows = frameCount;
      } else {
        cols = Math.min(frameCount, this.spritesheetColumns);
        rows = Math.ceil(frameCount / cols);
      }
      return {
        width: cols * baseWidth * this.scale,
        height: rows * baseHeight * this.scale,
      };
    }

    return {
      width: baseWidth * this.scale,
      height: baseHeight * this.scale,
    };
  }

  private getFrameCount(): number {
    const totalFrames = animationStore.frames.value.length;
    if (this.frameSelection === 'current') return 1;
    if (this.frameSelection === 'all') return totalFrames;
    return Math.max(1, this.frameEnd - this.frameStart + 1);
  }

  private close() {
    this.open = false;
    this.dispatchEvent(new CustomEvent('close'));
  }

  private compositeFrame(frameId: string, scale: number): HTMLCanvasElement {
    const width = projectStore.width.value;
    const height = projectStore.height.value;
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d')!;

    // Disable smoothing for pixel art
    ctx.imageSmoothingEnabled = false;

    // Background
    if (this.useBackground) {
      ctx.fillStyle = this.backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Scale and draw layers
    ctx.scale(scale, scale);
    const layers = layerStore.layers.value;
    for (const layer of layers) {
      if (!layer.visible) continue;
      const celCanvas = animationStore.getCelCanvas(frameId, layer.id);
      if (celCanvas) {
        ctx.globalAlpha = layer.opacity / 255;
        ctx.drawImage(celCanvas, 0, 0);
      }
    }
    ctx.globalAlpha = 1;

    return canvas;
  }

  private getSelectedFrameIds(): string[] {
    const frames = animationStore.frames.value;
    if (this.frameSelection === 'current') {
      return [animationStore.currentFrameId.value];
    }
    if (this.frameSelection === 'all') {
      return frames.map(f => f.id);
    }
    // Range
    const start = Math.max(0, this.frameStart - 1);
    const end = Math.min(frames.length, this.frameEnd);
    return frames.slice(start, end).map(f => f.id);
  }

  private async doExport() {
    const frameIds = this.getSelectedFrameIds();

    switch (this.format) {
      case 'png':
        this.exportImages(frameIds, 'png');
        break;
      case 'webp':
        this.exportImages(frameIds, 'webp');
        break;
      case 'webp-animated':
        await this.exportAnimatedWebP(frameIds);
        break;
      case 'spritesheet':
        this.exportAsSpritesheet(frameIds);
        break;
    }

    this.close();
  }

  private exportImages(frameIds: string[], format: 'png' | 'webp') {
    frameIds.forEach((frameId, index) => {
      const canvas = this.compositeFrame(frameId, this.scale);
      const suffix = frameIds.length > 1 ? `_${String(index).padStart(3, '0')}` : '';
      const filename = `${this.filename}${suffix}`;

      if (format === 'png') {
        FileService.exportToPNG(canvas, filename);
      } else {
        FileService.exportToWebP(canvas, filename);
      }
    });
  }

  private async exportAnimatedWebP(frameIds: string[]) {
    const frames = animationStore.frames.value;
    const frameData = frameIds.map(id => {
      const frame = frames.find(f => f.id === id);
      return {
        canvas: this.compositeFrame(id, this.scale),
        duration: frame?.duration || 100,
      };
    });

    await exportAnimatedWebP(frameData, `${this.filename}.webp`);
  }

  private exportAsSpritesheet(frameIds: string[]) {
    // Build custom spritesheet with selected frames and scale
    const width = projectStore.width.value * this.scale;
    const height = projectStore.height.value * this.scale;
    const frameCount = frameIds.length;

    let cols: number, rows: number;
    if (this.spritesheetDirection === 'horizontal') {
      cols = frameCount;
      rows = 1;
    } else if (this.spritesheetDirection === 'vertical') {
      cols = 1;
      rows = frameCount;
    } else {
      cols = Math.min(frameCount, this.spritesheetColumns);
      rows = Math.ceil(frameCount / cols);
    }

    const sheetCanvas = document.createElement('canvas');
    sheetCanvas.width = cols * width;
    sheetCanvas.height = rows * height;
    const sheetCtx = sheetCanvas.getContext('2d')!;

    const metadata: any = {
      frames: {},
      meta: {
        app: 'PixelForge',
        version: '1.0',
        image: `${this.filename}.png`,
        size: { w: sheetCanvas.width, h: sheetCanvas.height },
        format: 'RGBA8888',
      },
    };

    const frames = animationStore.frames.value;
    frameIds.forEach((frameId, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = col * width;
      const y = row * height;

      const frameCanvas = this.compositeFrame(frameId, this.scale);
      sheetCtx.drawImage(frameCanvas, x, y);

      const frame = frames.find(f => f.id === frameId);
      metadata.frames[`sprite_${index}`] = {
        frame: { x, y, w: width, h: height },
        sourceSize: { w: width, h: height },
        duration: frame?.duration || 100,
      };
    });

    // Download PNG
    FileService.exportToPNG(sheetCanvas, this.filename);

    // Download JSON if requested
    if (this.includeJson) {
      const jsonStr = JSON.stringify(metadata, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      FileService.downloadBlob(blob, `${this.filename}.json`);
    }
  }

  render() {
    const totalFrames = animationStore.frames.value.length;
    const { width, height } = this.outputSize;
    const frameCount = this.getFrameCount();

    return html`
      <pf-dialog
        ?open=${this.open}
        width="450px"
        @pf-close=${this.close}
      >
        <span slot="title">Export Options</span>

        <div class="form-group">
          <label>Filename</label>
          <input
            type="text"
            .value=${this.filename}
            @input=${(e: Event) => this.filename = (e.target as HTMLInputElement).value}
          />
        </div>

        <div class="form-group">
          <label>Format</label>
          <select
            .value=${this.format}
            @change=${(e: Event) => this.format = (e.target as HTMLSelectElement).value as ExportFormat}
          >
            <option value="png">PNG Image</option>
            <option value="webp">WebP Image</option>
            <option value="webp-animated">Animated WebP</option>
            <option value="spritesheet">Sprite Sheet</option>
          </select>
        </div>

        <div class="row">
          <div class="form-group">
            <label>Scale</label>
            <select
              .value=${String(this.scale)}
              @change=${(e: Event) => this.scale = parseInt((e.target as HTMLSelectElement).value)}
            >
              <option value="1">1x</option>
              <option value="2">2x</option>
              <option value="4">4x</option>
              <option value="8">8x</option>
              <option value="16">16x</option>
            </select>
          </div>

          <div class="form-group">
            <label>Frames</label>
            <select
              .value=${this.frameSelection}
              @change=${(e: Event) => this.frameSelection = (e.target as HTMLSelectElement).value as FrameSelection}
            >
              <option value="current">Current Frame</option>
              <option value="all">All Frames (${totalFrames})</option>
              <option value="range">Frame Range</option>
            </select>
          </div>
        </div>

        ${this.frameSelection === 'range' ? html`
          <div class="row">
            <div class="form-group">
              <label>Start Frame</label>
              <input
                type="number"
                min="1"
                max=${totalFrames}
                .value=${String(this.frameStart)}
                @input=${(e: Event) => this.frameStart = parseInt((e.target as HTMLInputElement).value) || 1}
              />
            </div>
            <div class="form-group">
              <label>End Frame</label>
              <input
                type="number"
                min="1"
                max=${totalFrames}
                .value=${String(this.frameEnd)}
                @input=${(e: Event) => this.frameEnd = parseInt((e.target as HTMLInputElement).value) || 1}
              />
            </div>
          </div>
        ` : ''}

        ${this.format === 'spritesheet' ? html`
          <div class="row">
            <div class="form-group">
              <label>Layout</label>
              <select
                .value=${this.spritesheetDirection}
                @change=${(e: Event) => this.spritesheetDirection = (e.target as HTMLSelectElement).value as any}
              >
                <option value="horizontal">Horizontal Strip</option>
                <option value="vertical">Vertical Strip</option>
                <option value="grid">Grid</option>
              </select>
            </div>
            ${this.spritesheetDirection === 'grid' ? html`
              <div class="form-group">
                <label>Columns</label>
                <input
                  type="number"
                  min="1"
                  max=${frameCount}
                  .value=${String(this.spritesheetColumns)}
                  @input=${(e: Event) => this.spritesheetColumns = parseInt((e.target as HTMLInputElement).value) || 4}
                />
              </div>
            ` : ''}
          </div>

          <div class="form-group">
            <div class="checkbox-group">
              <input
                type="checkbox"
                id="include-json"
                .checked=${this.includeJson}
                @change=${(e: Event) => this.includeJson = (e.target as HTMLInputElement).checked}
              />
              <label for="include-json">Include JSON metadata (TexturePacker format)</label>
            </div>
          </div>
        ` : ''}

        <div class="form-group">
          <div class="checkbox-group">
            <input
              type="checkbox"
              id="use-bg"
              .checked=${this.useBackground}
              @change=${(e: Event) => this.useBackground = (e.target as HTMLInputElement).checked}
            />
            <label for="use-bg">Fill background color</label>
          </div>
        </div>

        ${this.useBackground ? html`
          <div class="form-group">
            <label>Background Color</label>
            <div class="color-input">
              <input
                type="color"
                .value=${this.backgroundColor}
                @input=${(e: Event) => this.backgroundColor = (e.target as HTMLInputElement).value}
              />
              <input
                type="text"
                .value=${this.backgroundColor}
                @input=${(e: Event) => this.backgroundColor = (e.target as HTMLInputElement).value}
              />
            </div>
          </div>
        ` : ''}

        <div class="preview-info">
          <strong>Output:</strong> ${width} x ${height} px
          ${frameCount > 1 && this.format !== 'spritesheet' && this.format !== 'webp-animated'
            ? html` (${frameCount} files)`
            : ''}
          ${this.format === 'webp-animated' ? html` (${frameCount} frames)` : ''}
        </div>

        <div slot="actions">
          <button class="btn-cancel" @click=${this.close}>Cancel</button>
          <button class="btn-export" @click=${this.doExport}>Export</button>
        </div>
      </pf-dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pf-export-dialog': PFExportDialog;
  }
}
