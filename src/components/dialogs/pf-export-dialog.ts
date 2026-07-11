import { html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import {
  defaultProjectContext,
  getActiveProjectContext,
  type ProjectContext,
} from "../../stores/project-context";
import { settingsStore } from "../../stores/settings";
import { FileService } from "../../services/file-service";
import { composeExportFrame } from "../../services/export-composition";
import {
  MIN_VIEW_EFFECT_EXPORT_SCALE,
  ViewEffectPipeline,
  getViewEffectDefinition,
  getViewEffectExportBaseName,
  renderViewEffectToCanvas,
} from "../../services/view-effects";
import { log } from "../../utils/log";
// Dynamic imports for export services - loaded on demand to reduce initial bundle
// import { exportSpritesheet } from "../../services/spritesheet-export";
// import { exportAnimatedWebP } from "../../services/webp-animation";
// import { exportAseFile } from "../../services/aseprite-service";
import "../ui/pf-dialog";

type ExportFormat =
  | "png"
  | "webp"
  | "webp-animated"
  | "spritesheet"
  | "aseprite"
  | "pixelforge";
type FrameSelection = "current" | "all" | "range";
type SpritesheetDirection = "horizontal" | "vertical" | "grid";

interface SpritesheetFrameMetadata {
  frame: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
  duration: number;
}

interface SpritesheetMetadata {
  frames: Record<string, SpritesheetFrameMetadata>;
  meta: {
    app: string;
    version: string;
    image: string;
    size: { w: number; h: number };
    format: string;
  };
}

const VIEW_EFFECT_EXPORT_FORMATS = new Set<ExportFormat>([
  "png",
  "webp",
  "webp-animated",
  "spritesheet",
]);

@customElement("pf-export-dialog")
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

    select,
    input[type="text"],
    input[type="number"] {
      width: 100%;
      padding: 8px;
      background: var(--pf-color-bg-surface, #1e1e1e);
      border: 1px solid var(--pf-color-border, #333);
      border-radius: 4px;
      color: var(--pf-color-text-main, #e0e0e0);
      font-size: 13px;
    }

    select:focus-visible,
    input:focus-visible,
    button:focus-visible {
      outline: 2px solid var(--pf-color-accent, #4a9eff);
      outline-offset: 1px;
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

    .effect-export-hint,
    .export-error {
      margin: 6px 0 0 24px;
      color: var(--pf-color-text-muted, #808080);
      font-size: 11px;
      line-height: 1.4;
    }

    .export-error {
      margin: 0 0 16px;
      color: var(--pf-color-error, #f0aaa2);
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
  @property({ attribute: false }) context: ProjectContext | null = null;

  @state() private format: ExportFormat = "pixelforge";
  @state() private scale: number = 1;
  @state() private frameSelection: FrameSelection = "current";
  @state() private frameStart: number = 1;
  @state() private frameEnd: number = 1;
  @state() private useBackground: boolean = false;
  @state() private backgroundColor: string = "#ffffff";
  @state() private filename: string = "";
  @state() private includeJson: boolean = true;
  @state() private spritesheetDirection: SpritesheetDirection = "horizontal";
  @state() private spritesheetColumns: number = 4;
  @state() private applyViewEffect: boolean = false;
  @state() private exportError: string = "";
  private exportContext: ProjectContext = defaultProjectContext;

  connectedCallback() {
    super.connectedCallback();
    this.exportContext = this.context ?? getActiveProjectContext();
    this.frameEnd = this.exportContext.animation.frames.value.length;
  }

  willUpdate(changedProperties: Map<string, unknown>) {
    // Set filename to project name when dialog opens
    if (changedProperties.has("open") && this.open) {
      this.exportContext = this.context ?? getActiveProjectContext();
      this.filename = this.exportContext.project.name.value || "export";
      this.frameEnd = this.exportContext.animation.frames.value.length;
      this.applyViewEffect = false;
      this.exportError = "";
    }
  }

  private get activeViewEffectId(): string | null {
    return settingsStore.activeViewEffect.value;
  }

  private get canExportViewEffect(): boolean {
    return Boolean(
      this.activeViewEffectId && VIEW_EFFECT_EXPORT_FORMATS.has(this.format)
    );
  }

  private get shouldApplyViewEffect(): boolean {
    return this.applyViewEffect && this.canExportViewEffect;
  }

  private get activeViewEffectName(): string {
    const effectId = this.activeViewEffectId;
    if (!effectId) return "View effect";
    return getViewEffectDefinition(effectId)?.name ?? effectId;
  }

  private getExportBaseName(baseName: string = this.filename): string {
    return this.shouldApplyViewEffect && this.activeViewEffectId
      ? getViewEffectExportBaseName(baseName, this.activeViewEffectId)
      : baseName;
  }

  private get outputSize() {
    const baseWidth = this.exportContext.project.width.value;
    const baseHeight = this.exportContext.project.height.value;
    const frameCount = this.getFrameCount();

    if (this.format === "spritesheet") {
      const { cols, rows } = this.getSpritesheetGrid(frameCount);
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
    const totalFrames = this.exportContext.animation.frames.value.length;
    if (this.frameSelection === "current") return 1;
    if (this.frameSelection === "all") return totalFrames;
    return Math.max(1, this.frameEnd - this.frameStart + 1);
  }

  private getSpritesheetGrid(frameCount: number): { cols: number; rows: number } {
    if (this.spritesheetDirection === "horizontal") {
      return { cols: frameCount, rows: 1 };
    }

    if (this.spritesheetDirection === "vertical") {
      return { cols: 1, rows: frameCount };
    }

    const cols = Math.min(frameCount, this.spritesheetColumns);
    return { cols, rows: Math.ceil(frameCount / cols) };
  }

  private close() {
    this.open = false;
    this.dispatchEvent(new CustomEvent("close"));
  }

  private handleFormatChange(format: ExportFormat) {
    this.format = format;
    this.exportError = "";
    if (!VIEW_EFFECT_EXPORT_FORMATS.has(format)) {
      this.applyViewEffect = false;
    }
  }

  private handleViewEffectChange(checked: boolean) {
    this.applyViewEffect = checked;
    this.exportError = "";
    if (checked) {
      this.scale = Math.max(this.scale, MIN_VIEW_EFFECT_EXPORT_SCALE);
    }
  }

  private compositeFrame(frameId: string, scale: number): HTMLCanvasElement {
    return composeExportFrame({
      frameId,
      scale,
      width: this.exportContext.project.width.value,
      height: this.exportContext.project.height.value,
      layers: this.exportContext.layers.layers.value,
      getCelCanvas: (currentFrameId, layerId) =>
        this.exportContext.animation.getCelCanvas(currentFrameId, layerId),
      useBackground: this.useBackground,
      backgroundColor: this.backgroundColor,
    });
  }

  private getSelectedFrameIds(): string[] {
    const frames = this.exportContext.animation.frames.value;
    if (this.frameSelection === "current") {
      return [this.exportContext.animation.currentFrameId.value];
    }
    if (this.frameSelection === "all") {
      return frames.map((f) => f.id);
    }
    // Range
    const start = Math.max(0, this.frameStart - 1);
    const end = Math.min(frames.length, this.frameEnd);
    return frames.slice(start, end).map((f) => f.id);
  }

  private async doExport() {
    const frameIds = this.getSelectedFrameIds();
    let pipeline: ViewEffectPipeline | null = null;

    try {
      pipeline = this.createExportPipeline();
      await this.runExport(frameIds, pipeline);
      this.close();
    } catch (error) {
      log.error("Failed to export view-effect copy:", error);
      this.exportError = this.shouldApplyViewEffect
        ? `Could not export the ${this.activeViewEffectName} copy. Try a clean export instead.`
        : "Could not export this file.";
    } finally {
      pipeline?.dispose();
    }
  }

  private createExportPipeline(): ViewEffectPipeline | null {
    if (!this.shouldApplyViewEffect) return null;

    const pipeline = new ViewEffectPipeline();
    if (pipeline.isSupported) return pipeline;

    pipeline.dispose();
    throw new Error("WebGL2 is unavailable");
  }

  private async runExport(
    frameIds: string[],
    pipeline: ViewEffectPipeline | null
  ): Promise<void> {
    switch (this.format) {
      case "png":
        this.exportImages(frameIds, "png", pipeline);
        return;
      case "webp":
        this.exportImages(frameIds, "webp", pipeline);
        return;
      case "webp-animated":
        await this.exportAnimatedWebP(frameIds, pipeline);
        return;
      case "spritesheet":
        this.exportAsSpritesheet(frameIds, pipeline);
        return;
      case "aseprite":
        await this.exportAsAseprite();
        return;
      case "pixelforge":
        await this.exportAsPixelForge();
    }
  }

  private async exportAsAseprite() {
    const { exportAseFile } = await import("../../services/aseprite-service");
    exportAseFile(`${this.filename}.ase`, this.exportContext);
  }

  private async exportAsPixelForge() {
    const project = await this.exportContext.project.saveProject();
    FileService.saveCompressed(project, `${this.filename}.pf`);
  }

  private renderExportFrame(
    frameId: string,
    pipeline: ViewEffectPipeline | null
  ): HTMLCanvasElement {
    const cleanCanvas = this.compositeFrame(frameId, this.scale);
    if (!pipeline) return cleanCanvas;

    const effectId = this.activeViewEffectId;
    if (!effectId) return cleanCanvas;

    const styledCanvas = renderViewEffectToCanvas(cleanCanvas, {
      effectId,
      params: settingsStore.getViewEffectParams(effectId),
      pipeline,
      spritePixelScale: this.scale,
    });
    if (!styledCanvas) {
      throw new Error(`Failed to render view effect "${effectId}"`);
    }

    return styledCanvas;
  }

  private exportImages(
    frameIds: string[],
    format: "png" | "webp",
    pipeline: ViewEffectPipeline | null
  ) {
    frameIds.forEach((frameId, index) => {
      const canvas = this.renderExportFrame(frameId, pipeline);
      const suffix =
        frameIds.length > 1 ? `_${String(index).padStart(3, "0")}` : "";
      const filename = this.getExportBaseName(`${this.filename}${suffix}`);

      if (format === "png") {
        FileService.exportToPNG(canvas, filename);
      } else {
        FileService.exportToWebP(canvas, filename);
      }
    });
  }

  private async exportAnimatedWebP(
    frameIds: string[],
    pipeline: ViewEffectPipeline | null
  ) {
    const frames = this.exportContext.animation.frames.value;
    const frameData = frameIds.map((id) => {
      const frame = frames.find((f) => f.id === id);
      return {
        canvas: this.renderExportFrame(id, pipeline),
        duration: frame?.duration || 100,
      };
    });

    const { exportAnimatedWebP } = await import("../../services/webp-animation");
    const filename = `${this.getExportBaseName()}.webp`;
    await exportAnimatedWebP(frameData, filename);
  }

  private exportAsSpritesheet(
    frameIds: string[],
    pipeline: ViewEffectPipeline | null
  ) {
    // Build custom spritesheet with selected frames and scale
    const width = this.exportContext.project.width.value * this.scale;
    const height = this.exportContext.project.height.value * this.scale;
    const frameCount = frameIds.length;
    const { cols, rows } = this.getSpritesheetGrid(frameCount);

    const sheetCanvas = document.createElement("canvas");
    sheetCanvas.width = cols * width;
    sheetCanvas.height = rows * height;
    const sheetCtx = sheetCanvas.getContext("2d")!;
    const exportBaseName = this.getExportBaseName();

    const metadata: SpritesheetMetadata = {
      frames: {},
      meta: {
        app: "PixelForge",
        version: "1.0",
        image: `${exportBaseName}.png`,
        size: { w: sheetCanvas.width, h: sheetCanvas.height },
        format: "RGBA8888",
      },
    };

    const frames = this.exportContext.animation.frames.value;
    frameIds.forEach((frameId, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = col * width;
      const y = row * height;

      const frameCanvas = this.renderExportFrame(frameId, pipeline);
      sheetCtx.drawImage(frameCanvas, x, y);

      const frame = frames.find((f) => f.id === frameId);
      metadata.frames[`sprite_${index}`] = {
        frame: { x, y, w: width, h: height },
        sourceSize: { w: width, h: height },
        duration: frame?.duration || 100,
      };
    });

    // Download PNG
    FileService.exportToPNG(sheetCanvas, exportBaseName);

    // Download JSON if requested
    if (this.includeJson) {
      const jsonStr = JSON.stringify(metadata, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      FileService.downloadBlob(blob, `${exportBaseName}.json`);
    }
  }

  private renderViewEffectExportOption() {
    if (!this.canExportViewEffect) return "";

    return html`
      <div class="form-group">
        <div class="checkbox-group">
          <input
            type="checkbox"
            id="apply-view-effect"
            .checked=${this.applyViewEffect}
            @change=${(e: Event) =>
              this.handleViewEffectChange((e.target as HTMLInputElement).checked)}
          />
          <label for="apply-view-effect"
            >Apply view effect (${this.activeViewEffectName})</label
          >
        </div>
        <p class="effect-export-hint">
          Creates a separate ${this.activeViewEffectId} copy at 4x scale or higher. The clean
          export path stays unchanged.
        </p>
      </div>
    `;
  }

  private renderExportSummary(width: number, height: number, frameCount: number) {
    const exportsMultipleFiles =
      frameCount > 1 &&
      this.format !== "spritesheet" &&
      this.format !== "webp-animated";

    return html`
      <div class="preview-info">
        <strong>Output:</strong> ${width} x ${height} px
        ${exportsMultipleFiles ? html` (${frameCount} files)` : ""}
        ${this.format === "webp-animated" ? html` (${frameCount} frames)` : ""}
        ${this.shouldApplyViewEffect ? html` · ${this.activeViewEffectName} copy` : ""}
      </div>
    `;
  }

  render() {
    const totalFrames = this.exportContext.animation.frames.value.length;
    const { width, height } = this.outputSize;
    const frameCount = this.getFrameCount();

    return html`
      <pf-dialog ?open=${this.open} width="450px" @pf-close=${this.close}>
        <span slot="title">Export Options</span>

        <div class="form-group">
          <label for="export-filename">Filename</label>
          <input
            id="export-filename"
            type="text"
            .value=${this.filename}
            @input=${(e: Event) =>
              (this.filename = (e.target as HTMLInputElement).value)}
          />
        </div>

        <div class="form-group">
          <label for="export-format">Format</label>
          <select
            id="export-format"
            .value=${this.format}
            @change=${(e: Event) =>
              this.handleFormatChange(
                (e.target as HTMLSelectElement).value as ExportFormat
              )}
          >
            <option value="pixelforge">PixelForge Project (.pf)</option>
            <option value="png">PNG Image</option>
            <option value="webp">WebP Image</option>
            <option value="webp-animated">Animated WebP</option>
            <option value="spritesheet">Sprite Sheet</option>
            <option value="aseprite">Aseprite (.ase)</option>
          </select>
        </div>

        <div class="row">
          <div class="form-group">
            <label for="export-scale">Scale</label>
            <select
              id="export-scale"
              .value=${String(this.scale)}
              @change=${(e: Event) =>
                (this.scale = parseInt((e.target as HTMLSelectElement).value))}
            >
              <option value="1" ?disabled=${this.shouldApplyViewEffect}>1x</option>
              <option value="2" ?disabled=${this.shouldApplyViewEffect}>2x</option>
              <option value="4">4x</option>
              <option value="8">8x</option>
              <option value="16">16x</option>
            </select>
          </div>

          <div class="form-group">
            <label>Frames</label>
            <select
              .value=${this.frameSelection}
              @change=${(e: Event) =>
                (this.frameSelection = (e.target as HTMLSelectElement)
                  .value as FrameSelection)}
            >
              <option value="current">Current Frame</option>
              <option value="all">All Frames (${totalFrames})</option>
              <option value="range">Frame Range</option>
            </select>
          </div>
        </div>

        ${this.renderViewEffectExportOption()}

        ${this.frameSelection === "range"
          ? html`
              <div class="row">
                <div class="form-group">
                  <label>Start Frame</label>
                  <input
                    type="number"
                    min="1"
                    max=${totalFrames}
                    .value=${String(this.frameStart)}
                    @input=${(e: Event) =>
                      (this.frameStart =
                        parseInt((e.target as HTMLInputElement).value) || 1)}
                  />
                </div>
                <div class="form-group">
                  <label>End Frame</label>
                  <input
                    type="number"
                    min="1"
                    max=${totalFrames}
                    .value=${String(this.frameEnd)}
                    @input=${(e: Event) =>
                      (this.frameEnd =
                        parseInt((e.target as HTMLInputElement).value) || 1)}
                  />
                </div>
              </div>
            `
          : ""}
        ${this.format === "spritesheet"
          ? html`
              <div class="row">
                <div class="form-group">
                  <label>Layout</label>
                  <select
                    .value=${this.spritesheetDirection}
                    @change=${(e: Event) =>
                      (this.spritesheetDirection = (
                        e.target as HTMLSelectElement
                      ).value as SpritesheetDirection)}
                  >
                    <option value="horizontal">Horizontal Strip</option>
                    <option value="vertical">Vertical Strip</option>
                    <option value="grid">Grid</option>
                  </select>
                </div>
                ${this.spritesheetDirection === "grid"
                  ? html`
                      <div class="form-group">
                        <label>Columns</label>
                        <input
                          type="number"
                          min="1"
                          max=${frameCount}
                          .value=${String(this.spritesheetColumns)}
                          @input=${(e: Event) =>
                            (this.spritesheetColumns =
                              parseInt((e.target as HTMLInputElement).value) ||
                              4)}
                        />
                      </div>
                    `
                  : ""}
              </div>

              <div class="form-group">
                <div class="checkbox-group">
                  <input
                    type="checkbox"
                    id="include-json"
                    .checked=${this.includeJson}
                    @change=${(e: Event) =>
                      (this.includeJson = (
                        e.target as HTMLInputElement
                      ).checked)}
                  />
                  <label for="include-json"
                    >Include JSON metadata (TexturePacker format)</label
                  >
                </div>
              </div>
            `
          : ""}

        <div class="form-group">
          <div class="checkbox-group">
            <input
              type="checkbox"
              id="use-bg"
              .checked=${this.useBackground}
              @change=${(e: Event) =>
                (this.useBackground = (e.target as HTMLInputElement).checked)}
            />
            <label for="use-bg">Fill background color</label>
          </div>
        </div>

        ${this.useBackground
          ? html`
              <div class="form-group">
                <label>Background Color</label>
                <div class="color-input">
                  <input
                    type="color"
                    .value=${this.backgroundColor}
                    @input=${(e: Event) =>
                      (this.backgroundColor = (
                        e.target as HTMLInputElement
                      ).value)}
                  />
                  <input
                    type="text"
                    .value=${this.backgroundColor}
                    @input=${(e: Event) =>
                      (this.backgroundColor = (
                        e.target as HTMLInputElement
                      ).value)}
                  />
                </div>
              </div>
            `
          : ""}

        ${this.exportError
          ? html`<p class="export-error" role="alert">${this.exportError}</p>`
          : ""}

        ${this.renderExportSummary(width, height, frameCount)}

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
    "pf-export-dialog": PFExportDialog;
  }
}
