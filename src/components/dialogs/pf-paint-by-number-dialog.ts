import { css, html } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { checkboxStyles } from '../../styles/editor-control-styles';
import {
  generateNumberedGuide,
  type NumberedGuide,
} from '../../services/paint-by-number/guide-generator';
import { createGuidedProject } from '../../services/paint-by-number/guided-project';
import { decodeImageFile } from '../../services/paint-by-number/image-file';
import { sampleImageToGrid } from '../../services/paint-by-number/image-sampling';
import { getActiveProjectContext } from '../../stores/project-context';
import type {
  GuidedColorMapping,
  GuidedDrawingSettings,
  GuidedPaletteSource,
} from '../../types/guided-drawing';
import '../ui/pf-dialog';

const PREVIEW_DEBOUNCE_MS = 180;

const GUIDE_PRESETS = [
  { label: 'Compact', longSide: 16, maxColors: 6 },
  { label: 'Balanced', longSide: 24, maxColors: 8 },
  { label: 'Detailed', longSide: 32, maxColors: 12 },
  { label: 'Complex', longSide: 48, maxColors: 16 },
] as const;

@customElement('pf-paint-by-number-dialog')
export class PFPaintByNumberDialog extends BaseComponent {
  static styles = [css`
    :host {
      color: var(--pf-color-text-main);
    }

    form {
      display: grid;
      gap: 16px;
    }

    fieldset {
      display: grid;
      gap: 8px;
      margin: 0;
      padding: 0;
      border: 0;
    }

    legend,
    .field-label {
      margin-bottom: 6px;
      color: var(--pf-color-text-muted);
      font-size: var(--pf-font-size-xs);
      font-weight: 700;
      text-transform: uppercase;
    }

    .file-field,
    .field {
      display: grid;
      gap: 6px;
    }

    input,
    select {
      box-sizing: border-box;
      width: 100%;
      min-height: 34px;
      border: 1px solid var(--pf-color-border);
      border-radius: var(--pf-radius-sm);
      background: var(--pf-color-bg-input);
      color: var(--pf-color-text-main);
      font: inherit;
      padding: 7px 9px;
    }

    input:focus-visible,
    select:focus-visible,
    button:focus-visible,
    summary:focus-visible {
      outline: 2px solid var(--pf-color-accent);
      outline-offset: 2px;
    }

    .local-note,
    .hint,
    .status {
      margin: 0;
      color: var(--pf-color-text-muted);
      font-size: var(--pf-font-size-xs);
      line-height: 1.45;
    }

    .presets {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
    }

    .preset {
      display: grid;
      gap: 3px;
      min-height: 56px;
      padding: 8px;
      border: 1px solid var(--pf-color-border);
      border-radius: var(--pf-radius-sm);
      background: var(--pf-color-bg-dark);
      color: var(--pf-color-text-main);
      cursor: pointer;
      text-align: start;
    }

    .preset:hover {
      background: var(--pf-color-bg-hover);
    }

    .preset[aria-pressed='true'] {
      border-color: var(--pf-color-accent);
      background: var(--pf-color-primary-transparent);
    }

    .preset-name {
      font-size: var(--pf-font-size-sm);
      font-weight: 700;
    }

    .preset-meta {
      color: var(--pf-color-text-muted);
      font-size: var(--pf-font-size-xs);
    }

    details {
      border: 1px solid var(--pf-color-border);
      border-radius: var(--pf-radius-sm);
      background: var(--pf-color-bg-dark);
    }

    summary {
      cursor: pointer;
      padding: 10px;
      color: var(--pf-color-text-main);
      font-size: var(--pf-font-size-sm);
      font-weight: 700;
    }

    .advanced-fields {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      padding: 4px 10px 12px;
    }

    .checkbox-field {
      display: flex;
      align-items: center;
      gap: 8px;
      grid-column: 1 / -1;
      color: var(--pf-color-text-main);
      font-size: var(--pf-font-size-sm);
    }

    .checkbox-field input {
      width: auto;
      min-height: auto;
      margin: 0;
    }

    .previews {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    figure {
      display: grid;
      gap: 6px;
      margin: 0;
    }

    figcaption {
      color: var(--pf-color-text-muted);
      font-size: var(--pf-font-size-xs);
      font-weight: 700;
      text-transform: uppercase;
    }

    .preview-frame {
      display: grid;
      place-items: center;
      min-height: 180px;
      overflow: hidden;
      border: 1px solid var(--pf-color-border);
      border-radius: var(--pf-radius-sm);
      background:
        linear-gradient(45deg, rgba(255, 255, 255, 0.06) 25%, transparent 25% 75%, rgba(255, 255, 255, 0.06) 75%) 0 0 / 16px 16px,
        linear-gradient(45deg, transparent 25%, rgba(255, 255, 255, 0.035) 25% 75%, transparent 75%) 8px 8px / 16px 16px,
        var(--pf-color-bg-dark);
    }

    canvas {
      display: block;
      max-width: 100%;
      max-height: 240px;
      image-rendering: pixelated;
    }

    .placeholder {
      max-width: 24ch;
      padding: 20px;
      color: var(--pf-color-text-muted);
      font-size: var(--pf-font-size-xs);
      line-height: 1.5;
      text-align: center;
    }

    .status[data-error='true'] {
      color: var(--pf-color-danger, #f0aaa2);
    }

    button {
      padding: 7px 12px;
      border-radius: var(--pf-radius-sm);
      cursor: pointer;
      font: inherit;
    }

    button.primary {
      border: 1px solid var(--pf-color-accent);
      background: var(--pf-color-primary-transparent);
      color: var(--pf-color-accent-hover);
    }

    button.secondary {
      border: 1px solid var(--pf-color-border);
      background: transparent;
      color: var(--pf-color-text-main);
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }

    @media (max-width: 720px) {
      .presets,
      .previews,
      .advanced-fields {
        grid-template-columns: 1fr 1fr;
      }
    }
  `, checkboxStyles];

  @property({ type: Boolean, reflect: true }) open = false;
  @state() private sourceFile: File | null = null;
  @state() private sourceImage: ImageData | null = null;
  @state() private guide: NumberedGuide | null = null;
  @state() private longSide = 24;
  @state() private maxColors = 8;
  @state() private paletteSource: GuidedPaletteSource = 'generated';
  @state() private mapping: GuidedColorMapping = 'color';
  @state() private simplifyIsolatedPixels = true;
  @state() private isGenerating = false;
  @state() private isCreating = false;
  @state() private statusMessage = 'Choose an image to begin.';
  @state() private errorMessage = '';
  @query('#source-preview') private sourceCanvas?: HTMLCanvasElement;
  @query('#guide-preview') private guideCanvas?: HTMLCanvasElement;

  private previewTimer: number | null = null;
  private requestVersion = 0;

  disconnectedCallback() {
    super.disconnectedCallback();
    this.cancelPendingPreview();
  }

  protected updated(): void {
    this.drawPreviews();
  }

  render() {
    return html`
      <pf-dialog
        ?open=${this.open}
        width="min(760px, calc(100vw - 32px))"
        @pf-close=${this.close}
      >
        <span slot="title">Guided drawing</span>

        <form id="guided-project-form" @submit=${this.createProject}>
          <label class="file-field" for="guided-source-file">
            <span class="field-label">Source image</span>
            <input
              id="guided-source-file"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              @change=${this.handleFileChange}
            >
            <span class="local-note">Processed locally. The source image is not uploaded.</span>
          </label>

          <fieldset>
            <legend>Guide preset</legend>
            <div class="presets">
              ${GUIDE_PRESETS.map((preset) => html`
                <button
                  class="preset"
                  type="button"
                  aria-pressed=${String(
                    this.longSide === preset.longSide
                      && this.maxColors === preset.maxColors,
                  )}
                  @click=${() => this.selectPreset(preset)}
                >
                  <span class="preset-name">${preset.label}</span>
                  <span class="preset-meta">
                    ${preset.longSide}px · ${preset.maxColors} colors
                  </span>
                </button>
              `)}
            </div>
          </fieldset>

          <details>
            <summary>Advanced settings</summary>
            <div class="advanced-fields">
              <label class="field" for="guided-long-side">
                <span class="field-label">Long side (pixels)</span>
                <input
                  id="guided-long-side"
                  type="number"
                  min="8"
                  max="64"
                  .value=${String(this.longSide)}
                  @change=${this.handleLongSideChange}
                >
              </label>

              <label class="field" for="guided-max-colors">
                <span class="field-label">Maximum colors</span>
                <input
                  id="guided-max-colors"
                  type="number"
                  min="2"
                  max="32"
                  .value=${String(this.maxColors)}
                  ?disabled=${this.paletteSource === 'restricted'}
                  @change=${this.handleMaxColorsChange}
                >
              </label>

              <label class="field" for="guided-palette-source">
                <span class="field-label">Palette</span>
                <select
                  id="guided-palette-source"
                  .value=${this.paletteSource}
                  @change=${this.handlePaletteSourceChange}
                >
                  <option value="generated">Generate from image</option>
                  <option value="restricted">Use current project palette</option>
                </select>
              </label>

              <label class="field" for="guided-mapping">
                <span class="field-label">Color matching</span>
                <select
                  id="guided-mapping"
                  .value=${this.mapping}
                  @change=${this.handleMappingChange}
                >
                  <option value="color">Perceptual color</option>
                  <option value="luminance">Luminance only</option>
                </select>
              </label>

              <label class="checkbox-field" for="guided-simplify">
                <input
                  id="guided-simplify"
                  type="checkbox"
                  .checked=${this.simplifyIsolatedPixels}
                  @change=${this.handleSimplifyChange}
                >
                Simplify isolated single pixels
              </label>
            </div>
          </details>

          <div class="previews">
            ${this.renderPreviewFigure('Source', 'source-preview', Boolean(this.sourceImage))}
            ${this.renderPreviewFigure('Guide', 'guide-preview', Boolean(this.guide))}
          </div>

          <p
            class="status"
            role=${this.errorMessage ? 'alert' : 'status'}
            aria-live="polite"
            data-error=${String(Boolean(this.errorMessage))}
          >
            ${this.errorMessage || this.statusMessage}
          </p>

        </form>

        <div slot="actions">
          <button class="secondary" type="button" @click=${this.close}>Cancel</button>
          <button
            class="primary"
            type="submit"
            form="guided-project-form"
            ?disabled=${!this.guide || this.isGenerating || this.isCreating}
            @click=${this.createProject}
          >
            ${this.isCreating ? 'Creating…' : 'Create guided project'}
          </button>
        </div>
      </pf-dialog>
    `;
  }

  private renderPreviewFigure(label: string, id: string, ready: boolean) {
    return html`
      <figure>
        <figcaption>${label}</figcaption>
        <div class="preview-frame">
          ${ready
            ? html`<canvas id=${id} aria-label="${label} preview"></canvas>`
            : html`<p class="placeholder">
                ${id === 'source-preview'
                  ? 'Your selected image appears here.'
                  : 'The reduced numbered guide appears here.'}
              </p>`}
        </div>
      </figure>
    `;
  }

  private handleFileChange = async (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    const version = ++this.requestVersion;
    this.cancelPreviewTimer();
    this.sourceFile = file;
    this.sourceImage = null;
    this.guide = null;
    this.errorMessage = '';

    if (!file) {
      this.statusMessage = 'Choose an image to begin.';
      return;
    }

    this.statusMessage = 'Reading image…';
    try {
      const image = await decodeImageFile(file);
      if (version !== this.requestVersion) return;
      this.sourceImage = image;
      this.schedulePreview(0);
    } catch {
      if (version !== this.requestVersion) return;
      this.errorMessage = 'This image could not be read. Try a PNG, JPEG, or WebP file.';
    }
  };

  private selectPreset(preset: (typeof GUIDE_PRESETS)[number]) {
    this.longSide = preset.longSide;
    this.maxColors = preset.maxColors;
    this.schedulePreview();
  }

  private handleLongSideChange = (event: Event) => {
    this.longSide = clampNumber((event.currentTarget as HTMLInputElement).valueAsNumber, 8, 64, 24);
    this.schedulePreview();
  };

  private handleMaxColorsChange = (event: Event) => {
    this.maxColors = clampNumber((event.currentTarget as HTMLInputElement).valueAsNumber, 2, 32, 8);
    this.schedulePreview();
  };

  private handlePaletteSourceChange = (event: Event) => {
    this.paletteSource = (event.currentTarget as HTMLSelectElement).value as GuidedPaletteSource;
    this.schedulePreview();
  };

  private handleMappingChange = (event: Event) => {
    this.mapping = (event.currentTarget as HTMLSelectElement).value as GuidedColorMapping;
    this.schedulePreview();
  };

  private handleSimplifyChange = (event: Event) => {
    this.simplifyIsolatedPixels = (event.currentTarget as HTMLInputElement).checked;
    this.schedulePreview();
  };

  private schedulePreview(delay = PREVIEW_DEBOUNCE_MS) {
    this.cancelPreviewTimer();
    if (!this.sourceImage) return;

    const version = ++this.requestVersion;
    this.isGenerating = true;
    this.errorMessage = '';
    this.statusMessage = 'Updating guide preview…';
    this.previewTimer = window.setTimeout(() => {
      this.previewTimer = null;
      this.generatePreview(version);
    }, delay);
  }

  private generatePreview(version: number) {
    if (!this.sourceImage || version !== this.requestVersion) return;

    try {
      const sampled = sampleImageToGrid(this.sourceImage, { longSide: this.longSide });
      const restrictedPalette = this.getRestrictedPalette();
      const guide = generateNumberedGuide(sampled, {
        maxColors: this.maxColors,
        palette: restrictedPalette,
        mapping: this.mapping,
        simplifyIsolatedPixels: this.simplifyIsolatedPixels,
      });
      if (guide.palette.length === 0) {
        throw new Error('The image has no visible paintable pixels.');
      }
      if (version !== this.requestVersion) return;

      this.guide = guide;
      this.statusMessage = this.describeGuide(guide);
    } catch (error) {
      if (version !== this.requestVersion) return;
      this.guide = null;
      this.errorMessage = error instanceof Error
        ? error.message
        : 'The guide preview could not be generated.';
    } finally {
      if (version === this.requestVersion) this.isGenerating = false;
    }
  }

  private getRestrictedPalette(): string[] | undefined {
    if (this.paletteSource !== 'restricted') return undefined;
    return [...getActiveProjectContext().palette.mainColors.value];
  }

  private describeGuide(guide: NumberedGuide): string {
    const { complexity } = guide;
    const simplified = complexity.simplifiedCells > 0
      ? ` ${complexity.simplifiedCells} isolated cells simplified.`
      : '';
    return `${guide.width} × ${guide.height}, ${guide.palette.length} colors, ${complexity.paintableCells} cells.${simplified}`;
  }

  private createProject = async (event: Event) => {
    event.preventDefault();
    if (!this.guide || !this.sourceFile || this.isCreating) return;

    this.isCreating = true;
    this.errorMessage = '';
    try {
      const settings = this.currentSettings();
      const result = await createGuidedProject({
        guide: this.guide,
        settings,
        sourceName: this.sourceFile.name,
      });
      if (!result.ok) {
        this.errorMessage = result.message;
        return;
      }

      const projectId = result.projectId;
      this.close();
      this.dispatchEvent(new CustomEvent('project-created', {
        bubbles: true,
        composed: true,
        detail: { id: projectId, guided: true },
      }));
    } catch (error) {
      this.errorMessage = error instanceof Error
        ? error.message
        : 'The guided project could not be created.';
    } finally {
      this.isCreating = false;
    }
  };

  private currentSettings(): GuidedDrawingSettings {
    return {
      longSide: this.longSide,
      paletteSource: this.paletteSource,
      maxColors: this.paletteSource === 'generated' ? this.maxColors : undefined,
      restrictedPalette: this.getRestrictedPalette(),
      mapping: this.mapping,
      simplifyIsolatedPixels: this.simplifyIsolatedPixels,
    };
  }

  private drawPreviews() {
    if (this.sourceImage && this.sourceCanvas) {
      drawImageData(this.sourceCanvas, this.sourceImage);
    }
    if (this.guide && this.guideCanvas) {
      drawGuide(this.guideCanvas, this.guide);
    }
  }

  private cancelPreviewTimer() {
    if (this.previewTimer === null) return;
    clearTimeout(this.previewTimer);
    this.previewTimer = null;
  }

  private cancelPendingPreview() {
    this.requestVersion += 1;
    this.cancelPreviewTimer();
  }

  close = () => {
    this.cancelPendingPreview();
    this.open = false;
    this.dispatchEvent(new CustomEvent('close'));
  };
}

function clampNumber(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function drawImageData(canvas: HTMLCanvasElement, image: ImageData) {
  const context = canvas.getContext('2d');
  if (!context) return;
  canvas.width = image.width;
  canvas.height = image.height;
  context.putImageData(image, 0, 0);
}

function drawGuide(canvas: HTMLCanvasElement, guide: NumberedGuide) {
  const context = canvas.getContext('2d');
  if (!context) return;
  canvas.width = guide.width;
  canvas.height = guide.height;
  const image = context.createImageData(guide.width, guide.height);

  for (let index = 0; index < guide.target.length; index += 1) {
    const paletteIndex = guide.target[index];
    if (paletteIndex === 0) continue;
    const color = guide.palette[paletteIndex - 1];
    const rgb = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color);
    if (!rgb) continue;

    const dataIndex = index * 4;
    image.data[dataIndex] = parseInt(rgb[1], 16);
    image.data[dataIndex + 1] = parseInt(rgb[2], 16);
    image.data[dataIndex + 2] = parseInt(rgb[3], 16);
    image.data[dataIndex + 3] = 255;
  }

  context.putImageData(image, 0, 0);
}

declare global {
  interface HTMLElementTagNameMap {
    'pf-paint-by-number-dialog': PFPaintByNumberDialog;
  }
}
