import { html, css } from 'lit';
import { customElement, state, query } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { defaultProjectContext, type ProjectContext } from '../../stores/project-context';
import { settingsStore } from '../../stores/settings';
import {
  CRT_EFFECT_ID,
  CRT_PARAM_CONTROLS,
  CRT_PRESETS,
  CRT_PRESET_OPTIONS,
  getCrtParams,
  getCrtPresetId,
  ViewEffectPipeline,
  type CrtParamKey,
  type CrtPresetId,
} from '../../services/view-effects';
import type { Cel } from '../../types/animation';
import type { Layer } from '../../types/layer';
import { togglePlayback } from '../../services/playback-action';

type BackgroundType = 'white' | 'black' | 'checker';

const STORAGE_KEY_POSITION = 'pf-preview-position';
const STORAGE_KEY_COLLAPSED = 'pf-preview-collapsed';
const STORAGE_KEY_BG = 'pf-preview-bg';
const STORAGE_KEY_SIZE = 'pf-preview-size';

@customElement('pf-preview-overlay')
export class PFPreviewOverlay extends BaseComponent {
  static styles = css`
    :host {
      position: absolute;
      z-index: 100;
      user-select: none;
      pointer-events: none;
    }

    .container {
      position: relative;
      background: rgba(12, 15, 20, 0.9);
      border: 1px solid var(--pf-color-border);
      border-radius: var(--pf-radius-sm);
      box-shadow: var(--pf-shadow-panel);
      display: flex;
      flex-direction: column;
      min-width: 120px;
      pointer-events: auto;
      backdrop-filter: blur(14px);
    }

    .header {
      display: flex;
      align-items: center;
      padding: 4px 8px;
      background: rgba(255, 255, 255, 0.025);
      border-bottom: 1px solid var(--pf-color-border);
      border-radius: var(--pf-radius-sm) var(--pf-radius-sm) 0 0;
      cursor: grab;
      gap: 8px;
    }

    .header:active {
      cursor: grabbing;
    }

    .header-title {
      flex: 1;
      font-size: 11px;
      color: var(--pf-color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0;
    }

    .chevron {
      cursor: pointer;
      color: var(--pf-color-text-muted);
      font-size: 10px;
      transition: transform 0.15s ease;
      padding: 2px;
    }

    .chevron:hover {
      color: var(--pf-color-text-main);
    }

    .chevron.collapsed {
      transform: rotate(-90deg);
    }

    .content {
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transition:
        max-height 0.15s ease,
        opacity 0.15s ease;
    }

    .content.collapsed {
      max-height: 0;
      opacity: 0;
      pointer-events: none;
    }

    .preview-area {
      padding: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(6, 8, 12, 0.72);
      position: relative;
      cursor: crosshair;
    }

    .preview-canvas-wrapper {
      position: relative;
      background-color: var(--preview-bg-color);
      background-image: var(--preview-bg-image, none);
      background-position: var(--preview-bg-position, 0 0);
      background-size: var(--preview-bg-size, auto);
      box-shadow:
        0 0 0 1px var(--pf-color-border),
        0 12px 30px rgba(0, 0, 0, 0.36);
    }

    canvas {
      display: block;
      image-rendering: pixelated;
      background: transparent;
    }

    .effect-canvas {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }

    .effect-canvas[hidden] {
      display: none;
    }

    .preview-canvas-wrapper.bg-white {
      --preview-bg-color: white;
    }

    .preview-canvas-wrapper.bg-black {
      --preview-bg-color: black;
    }

    .preview-canvas-wrapper.bg-checker {
      --preview-bg-color: var(--pf-checker-dark-color);
      --preview-bg-image:
        linear-gradient(45deg, var(--pf-checker-light-color) 25%, transparent 25%),
        linear-gradient(-45deg, var(--pf-checker-light-color) 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, var(--pf-checker-light-color) 75%),
        linear-gradient(-45deg, transparent 75%, var(--pf-checker-light-color) 75%);
      --preview-bg-size: calc(var(--pf-checker-tile-size) * 2) calc(var(--pf-checker-tile-size) * 2);
      --preview-bg-position:
        0 0, 0 var(--pf-checker-tile-size),
        var(--pf-checker-tile-size) calc(-1 * var(--pf-checker-tile-size)),
        calc(-1 * var(--pf-checker-tile-size)) 0;
    }

    .viewport-indicator {
      position: absolute;
      border: 2px solid var(--pf-color-accent);
      pointer-events: none;
      box-sizing: border-box;
    }

    .controls {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 8px;
      border-top: 1px solid var(--pf-color-border);
      background: rgba(255, 255, 255, 0.025);
      gap: 4px;
    }

    .effect-actions {
      display: flex;
      gap: 2px;
    }

    .effect-button,
    .effect-settings-button {
      background: var(--pf-color-bg-input);
      border: 1px solid var(--pf-color-border);
      border-radius: var(--pf-radius-sm);
      color: var(--pf-color-text-muted);
      cursor: pointer;
      font-size: 10px;
      min-height: 20px;
      padding: 2px 6px;
    }

    .effect-button:hover,
    .effect-settings-button:hover {
      background: var(--pf-color-bg-hover);
      color: var(--pf-color-text-main);
    }

    .effect-button[aria-pressed='true'],
    .effect-settings-button[aria-expanded='true'] {
      border-color: var(--pf-color-accent);
      color: var(--pf-color-accent);
    }

    .effect-button:focus-visible,
    .effect-settings-button:focus-visible,
    .effect-panel select:focus-visible,
    .effect-panel input:focus-visible {
      outline: 2px solid var(--pf-color-accent);
      outline-offset: 1px;
    }

    .effect-panel {
      border-top: 1px solid var(--pf-color-border);
      display: grid;
      gap: 8px;
      min-width: 220px;
      padding: 8px;
    }

    .effect-preset-row,
    .effect-slider-row {
      align-items: center;
      display: grid;
      gap: 8px;
      grid-template-columns: 84px minmax(80px, 1fr) 34px;
    }

    .effect-preset-row {
      grid-template-columns: 84px minmax(120px, 1fr);
    }

    .effect-panel label,
    .effect-value {
      color: var(--pf-color-text-muted);
      font-size: 10px;
    }

    .effect-value {
      color: var(--pf-color-text-main);
      font-variant-numeric: tabular-nums;
      text-align: right;
    }

    .effect-panel select {
      background: var(--pf-color-bg-input);
      border: 1px solid var(--pf-color-border);
      border-radius: var(--pf-radius-sm);
      color: var(--pf-color-text-main);
      font: inherit;
      font-size: 11px;
      min-height: 24px;
    }

    .effect-panel input[type='range'] {
      accent-color: var(--pf-color-accent);
      min-width: 0;
      width: 100%;
    }

    .bg-selector {
      display: flex;
      gap: 2px;
    }

    .bg-btn {
      width: 18px;
      height: 18px;
      border: 1px solid var(--pf-color-border);
      border-radius: var(--pf-radius-sm);
      cursor: pointer;
      padding: 0;
    }

    .bg-btn:hover {
      border-color: var(--pf-color-text-muted);
    }

    .bg-btn.active {
      border-color: var(--pf-color-accent);
      box-shadow: 0 0 0 1px var(--pf-color-accent);
    }

    .bg-btn.white {
      background: white;
    }

    .bg-btn.black {
      background: black;
    }

    .bg-btn.checker {
      background-image:
        linear-gradient(45deg, var(--pf-checker-light-color) 25%, transparent 25%),
        linear-gradient(-45deg, var(--pf-checker-light-color) 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, var(--pf-checker-light-color) 75%),
        linear-gradient(-45deg, transparent 75%, var(--pf-checker-light-color) 75%);
      background-size: 6px 6px;
      background-position:
        0 0,
        0 3px,
        3px -3px,
        -3px 0px;
      background-color: var(--pf-checker-dark-color);
    }

    .play-btn {
      background: var(--pf-color-bg-input);
      border: 1px solid var(--pf-color-border);
      border-radius: var(--pf-radius-sm);
      color: var(--pf-color-text-muted);
      cursor: pointer;
      font-size: 10px;
      padding: 2px 8px;
      text-transform: uppercase;
    }

    .play-btn:hover {
      background: var(--pf-color-bg-hover);
      color: var(--pf-color-text-main);
    }

    .resize-handle {
      position: absolute;
      bottom: 0;
      right: 0;
      width: 12px;
      height: 12px;
      cursor: nwse-resize;
      opacity: 0.5;
      transition: opacity 0.15s ease;
    }

    .resize-handle:hover {
      opacity: 1;
    }

    .resize-handle::before,
    .resize-handle::after {
      content: '';
      position: absolute;
      background: var(--pf-color-text-muted);
    }

    .resize-handle::before {
      bottom: 3px;
      right: 3px;
      width: 6px;
      height: 1px;
      transform: rotate(-45deg);
      transform-origin: right bottom;
    }

    .resize-handle::after {
      bottom: 5px;
      right: 5px;
      width: 4px;
      height: 1px;
      transform: rotate(-45deg);
      transform-origin: right bottom;
    }
  `;

  @query('.preview-canvas') previewCanvas!: HTMLCanvasElement;
  @query('.effect-canvas') effectCanvas!: HTMLCanvasElement;

  @state() private collapsed = false;
  @state() private bgType: BackgroundType = 'checker';
  @state() private posX = 0;
  @state() private posY = 0;
  @state() private isDragging = false;
  @state() private dragOffsetX = 0;
  @state() private dragOffsetY = 0;
  @state() private previewSize = 128; // User-configurable preview size
  @state() private isResizing = false;
  @state() private viewEffectsSupported = false;
  @state() private effectsPanelOpen = false;
  private resizeStartX = 0;
  private resizeStartY = 0;
  private resizeStartSize = 0;

  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrameId: number = 0;
  private context: ProjectContext = defaultProjectContext;
  private viewEffectPipeline: ViewEffectPipeline | null = null;

  // Preview sizing constraints
  private readonly MAX_PREVIEW_SIZE = 300; // Max user-resizable size
  private readonly MIN_PREVIEW_SIZE = 64; // Min user-resizable size

  connectedCallback() {
    super.connectedCallback();
    this.subscribeToActiveProjectContext((context) => {
      this.context = context;
      this.requestUpdate();
    });
    this.loadState();
    this.startAnimationLoop();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    cancelAnimationFrame(this.animationFrameId);
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mouseup', this.handleMouseUp);
    window.removeEventListener('mousemove', this.handleResizeMouseMove);
    window.removeEventListener('mouseup', this.handleResizeMouseUp);
    this.viewEffectPipeline?.dispose();
  }

  firstUpdated() {
    if (this.previewCanvas) {
      this.ctx = this.previewCanvas.getContext('2d');
    }
    if (this.effectCanvas) {
      this.viewEffectPipeline = new ViewEffectPipeline(this.effectCanvas);
      this.viewEffectsSupported = this.viewEffectPipeline.isSupported;
    }
    // Set default position if not loaded
    if (this.posX === 0 && this.posY === 0) {
      this.posX = 8;
      this.posY = 8;
    }
  }

  private loadState() {
    const savedPos = localStorage.getItem(STORAGE_KEY_POSITION);
    if (savedPos) {
      try {
        const { x, y } = JSON.parse(savedPos);
        this.posX = x;
        this.posY = y;
      } catch {
        // Corrupt saved position — ignore and keep defaults
      }
    }

    const savedCollapsed = localStorage.getItem(STORAGE_KEY_COLLAPSED);
    if (savedCollapsed !== null) {
      this.collapsed = savedCollapsed === 'true';
    }

    const savedBg = localStorage.getItem(STORAGE_KEY_BG) as BackgroundType;
    if (savedBg && ['white', 'black', 'checker'].includes(savedBg)) {
      this.bgType = savedBg;
    }

    const savedSize = localStorage.getItem(STORAGE_KEY_SIZE);
    if (savedSize) {
      const size = parseInt(savedSize, 10);
      if (size >= this.MIN_PREVIEW_SIZE && size <= this.MAX_PREVIEW_SIZE) {
        this.previewSize = size;
      }
    }
  }

  private savePosition() {
    localStorage.setItem(STORAGE_KEY_POSITION, JSON.stringify({ x: this.posX, y: this.posY }));
  }

  private saveCollapsed() {
    localStorage.setItem(STORAGE_KEY_COLLAPSED, String(this.collapsed));
  }

  private saveBgType() {
    localStorage.setItem(STORAGE_KEY_BG, this.bgType);
  }

  private saveSize() {
    localStorage.setItem(STORAGE_KEY_SIZE, String(this.previewSize));
  }

  private toggleCollapse() {
    this.collapsed = !this.collapsed;
    this.saveCollapsed();
  }

  private setBgType(type: BackgroundType) {
    this.bgType = type;
    this.saveBgType();
  }

  private handleHeaderMouseDown = (e: MouseEvent) => {
    // Don't start drag if clicking on chevron
    if ((e.target as HTMLElement).classList.contains('chevron')) return;

    this.isDragging = true;
    this.dragOffsetX = e.clientX - this.posX;
    this.dragOffsetY = e.clientY - this.posY;

    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mouseup', this.handleMouseUp);
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (!this.isDragging) return;

    this.posX = e.clientX - this.dragOffsetX;
    this.posY = e.clientY - this.dragOffsetY;

    // Keep within bounds
    const parent = this.parentElement;
    if (parent) {
      const maxX = parent.clientWidth - 140;
      const maxY = parent.clientHeight - 50;
      this.posX = Math.max(0, Math.min(this.posX, maxX));
      this.posY = Math.max(0, Math.min(this.posY, maxY));
    }
  };

  private handleMouseUp = () => {
    this.isDragging = false;
    this.savePosition();
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mouseup', this.handleMouseUp);
  };

  private handleResizeMouseDown = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    this.isResizing = true;
    this.resizeStartX = e.clientX;
    this.resizeStartY = e.clientY;
    this.resizeStartSize = this.previewSize;

    window.addEventListener('mousemove', this.handleResizeMouseMove);
    window.addEventListener('mouseup', this.handleResizeMouseUp);
  };

  private handleResizeMouseMove = (e: MouseEvent) => {
    if (!this.isResizing) return;

    // Use the larger of X or Y delta for uniform scaling
    const deltaX = e.clientX - this.resizeStartX;
    const deltaY = e.clientY - this.resizeStartY;
    const delta = Math.max(deltaX, deltaY);

    const newSize = Math.max(
      this.MIN_PREVIEW_SIZE,
      Math.min(this.MAX_PREVIEW_SIZE, this.resizeStartSize + delta)
    );

    this.previewSize = newSize;
  };

  private handleResizeMouseUp = () => {
    this.isResizing = false;
    this.saveSize();
    window.removeEventListener('mousemove', this.handleResizeMouseMove);
    window.removeEventListener('mouseup', this.handleResizeMouseUp);
  };

  private handlePreviewClick(e: MouseEvent) {
    if (!this.previewCanvas) return;

    const rect = this.previewCanvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Convert to canvas coordinates
    const previewScale = this.getPreviewScale();
    const canvasX = clickX / previewScale;
    const canvasY = clickY / previewScale;

    // Center viewport on this point
    this.context.viewport.centerOn(canvasX, canvasY);
  }

  private togglePlay() {
    togglePlayback(this.context.animation);
  }

  private toggleCrtEffect() {
    if (settingsStore.activeViewEffect.value === CRT_EFFECT_ID) {
      settingsStore.setActiveViewEffect(null);
      return;
    }

    const storedParams = settingsStore.getViewEffectParams(CRT_EFFECT_ID);
    if (Object.keys(storedParams).length === 0) {
      settingsStore.setViewEffectParams(CRT_EFFECT_ID, { ...CRT_PRESETS.subtle });
    }
    settingsStore.setActiveViewEffect(CRT_EFFECT_ID);
  }

  private setCrtPreset(presetId: CrtPresetId | 'custom') {
    if (presetId === 'custom') return;
    if (presetId === 'off') {
      settingsStore.setActiveViewEffect(null);
      return;
    }

    settingsStore.setViewEffectParams(CRT_EFFECT_ID, { ...CRT_PRESETS[presetId] });
    settingsStore.setActiveViewEffect(CRT_EFFECT_ID);
  }

  private setCrtParam(key: CrtParamKey, value: number) {
    const params = getCrtParams(settingsStore.getViewEffectParams(CRT_EFFECT_ID));
    settingsStore.setViewEffectParams(CRT_EFFECT_ID, {
      ...params,
      [key]: value,
    });
    settingsStore.setActiveViewEffect(CRT_EFFECT_ID);
  }

  private startAnimationLoop() {
    // This loop only handles rendering; playback state lives in the active context.
    const loop = () => {
      this.renderPreview();
      this.animationFrameId = requestAnimationFrame(loop);
    };
    this.animationFrameId = requestAnimationFrame(loop);
  }

  private renderPreview() {
    if (!this.ctx || !this.previewCanvas) return;

    const { animation, layers } = this.context;
    const currentFrameId = animation.currentFrameId.value;
    const visibleLayers = layers.layers.value;
    const cels = animation.cels.value;
    const canvas = this.previewCanvas;
    const previewScale = this.getPreviewScale();

    // Clear at actual canvas size
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const layer of visibleLayers) {
      const key = `${layer.id}:${currentFrameId}`;
      this.drawPreviewLayer(layer, cels.get(key), canvas, previewScale);
    }

    // Reset composite settings
    this.ctx.globalAlpha = 1;
    this.ctx.globalCompositeOperation = 'source-over';

    this.renderViewEffect(canvas, previewScale);
  }

  private drawPreviewLayer(
    layer: Layer,
    cel: Cel | undefined,
    canvas: HTMLCanvasElement,
    previewScale: number
  ): void {
    if (!layer.visible) return;

    const canvasToUse = this.getLayerPreviewCanvas(layer, cel);
    if (!canvasToUse || !this.ctx) return;

    this.ctx.globalAlpha = (layer.opacity / 255) * this.getCelOpacity(cel);
    this.ctx.globalCompositeOperation = this.getLayerCompositeOperation(layer);

    if (previewScale >= 1) {
      this.ctx.drawImage(canvasToUse, 0, 0);
      return;
    }
    this.ctx.drawImage(canvasToUse, 0, 0, canvas.width, canvas.height);
  }

  private getLayerPreviewCanvas(layer: Layer, cel: Cel | undefined): HTMLCanvasElement | null {
    if (cel) return cel.canvas;
    return layer.canvas ?? null;
  }

  private getCelOpacity(cel: Cel | undefined): number {
    return cel ? (cel.opacity ?? 100) / 100 : 1;
  }

  private getLayerCompositeOperation(layer: Layer): GlobalCompositeOperation {
    return layer.blendMode === 'normal'
      ? 'source-over'
      : (layer.blendMode as GlobalCompositeOperation);
  }

  private renderViewEffect(source: HTMLCanvasElement, previewScale: number) {
    const effectId = settingsStore.activeViewEffect.value;
    const pipeline = this.viewEffectPipeline;
    if (!effectId || !pipeline?.isSupported) return;

    const projectWidth = this.context.project.width.value;
    const projectHeight = this.context.project.height.value;
    const displayWidth = Math.max(1, Math.round(projectWidth * previewScale));
    const displayHeight = Math.max(1, Math.round(projectHeight * previewScale));
    const pixelRatio = window.devicePixelRatio || 1;

    pipeline.render(effectId, source, settingsStore.getViewEffectParams(effectId), {
      width: displayWidth * pixelRatio,
      height: displayHeight * pixelRatio,
      spritePixelScale: previewScale * pixelRatio,
    });
  }

  /**
   * Calculate the preview scale to fit the canvas within the user-defined previewSize.
   */
  private getPreviewScale(): number {
    const canvasW = this.context.project.width.value;
    const canvasH = this.context.project.height.value;
    const maxDim = Math.max(canvasW, canvasH);

    // Scale to fit within user-defined preview size
    return this.previewSize / maxDim;
  }

  private getViewportIndicatorStyle() {
    const { project, viewport } = this.context;
    const canvasW = project.width.value;
    const canvasH = project.height.value;
    const zoom = viewport.zoom.value;
    const panX = viewport.panX.value;
    const panY = viewport.panY.value;
    const containerW = viewport.containerWidth.value;
    const containerH = viewport.containerHeight.value;

    if (containerW === 0 || containerH === 0) return null;

    // Calculate what portion of the canvas is visible
    // Visible area in canvas coordinates
    const visibleLeft = Math.max(0, -panX / zoom);
    const visibleTop = Math.max(0, -panY / zoom);
    const visibleRight = Math.min(canvasW, (containerW - panX) / zoom);
    const visibleBottom = Math.min(canvasH, (containerH - panY) / zoom);

    // Convert to preview coordinates
    const scale = this.getPreviewScale();
    const left = visibleLeft * scale;
    const top = visibleTop * scale;
    const width = (visibleRight - visibleLeft) * scale;
    const height = (visibleBottom - visibleTop) * scale;

    // Don't show if viewport covers entire canvas
    if (
      visibleLeft <= 0 &&
      visibleTop <= 0 &&
      visibleRight >= canvasW &&
      visibleBottom >= canvasH
    ) {
      return null;
    }

    return {
      left: `${left}px`,
      top: `${top}px`,
      width: `${Math.max(4, width)}px`,
      height: `${Math.max(4, height)}px`,
    };
  }

  private getContentStyle(): string {
    if (this.collapsed) return '';
    const extraHeight = this.effectsPanelOpen ? 300 : 100;
    return `max-height: ${this.previewSize + extraHeight}px`;
  }

  private renderPreviewSurface(options: {
    actualCanvasW: number;
    actualCanvasH: number;
    displayW: number;
    displayH: number;
    viewportStyle: ReturnType<PFPreviewOverlay['getViewportIndicatorStyle']>;
  }) {
    const { actualCanvasW, actualCanvasH, displayW, displayH, viewportStyle } = options;
    const effectHidden = !settingsStore.activeViewEffect.value || !this.viewEffectsSupported;

    return html`
      <div class="preview-area" @click=${this.handlePreviewClick}>
        <div class="preview-canvas-wrapper bg-${this.bgType}">
          <canvas
            class="preview-canvas"
            width="${actualCanvasW}"
            height="${actualCanvasH}"
            style="width: ${displayW}px; height: ${displayH}px;"
          ></canvas>
          <canvas
            class="effect-canvas"
            aria-hidden="true"
            ?hidden=${effectHidden}
            style="width: ${displayW}px; height: ${displayH}px;"
          ></canvas>
          ${
            viewportStyle
              ? html`
                  <div
                    class="viewport-indicator"
                    style="left: ${viewportStyle.left}; top: ${viewportStyle.top}; width: ${viewportStyle.width}; height: ${viewportStyle.height};"
                  ></div>
                `
              : ''
          }
        </div>
      </div>
    `;
  }

  private renderBackgroundControls() {
    return html`
      <div class="bg-selector">
        <button
          class="bg-btn white ${this.bgType === 'white' ? 'active' : ''}"
          @click=${() => this.setBgType('white')}
          title="White background"
        ></button>
        <button
          class="bg-btn black ${this.bgType === 'black' ? 'active' : ''}"
          @click=${() => this.setBgType('black')}
          title="Black background"
        ></button>
        <button
          class="bg-btn checker ${this.bgType === 'checker' ? 'active' : ''}"
          @click=${() => this.setBgType('checker')}
          title="Transparent (checker)"
        ></button>
      </div>
    `;
  }

  private renderEffectActions(crtIsActive: boolean) {
    if (!this.viewEffectsSupported) return '';

    return html`
      <div class="effect-actions">
        <button
          class="effect-button"
          type="button"
          aria-label="Toggle CRT effect"
          aria-pressed=${crtIsActive}
          @click=${this.toggleCrtEffect}
        >
          CRT
        </button>
        <button
          class="effect-settings-button"
          type="button"
          aria-controls="crt-effect-panel"
          aria-expanded=${this.effectsPanelOpen}
          @click=${() => (this.effectsPanelOpen = !this.effectsPanelOpen)}
        >
          Tune
        </button>
      </div>
    `;
  }

  private renderEffectPanel(
    crtPreset: CrtPresetId | 'custom',
    params: ReturnType<typeof getCrtParams>,
    crtIsActive: boolean
  ) {
    if (!this.viewEffectsSupported || !this.effectsPanelOpen) return '';

    return html`
      <div class="effect-panel" id="crt-effect-panel">
        <div class="effect-preset-row">
          <label for="crt-preset">Preset</label>
          <select
            id="crt-preset"
            .value=${crtPreset}
            @change=${(event: Event) =>
              this.setCrtPreset(
                (event.target as HTMLSelectElement).value as CrtPresetId | 'custom'
              )}
          >
            ${CRT_PRESET_OPTIONS.map(
              ({ id, label }) => html`
                <option value=${id} ?selected=${crtPreset === id}>${label}</option>
              `
            )}
            ${crtPreset === 'custom' ? html`<option value="custom" selected>Custom</option>` : ''}
          </select>
        </div>
        ${CRT_PARAM_CONTROLS.map(
          ({ key, label }) => html`
            <div class="effect-slider-row">
              <label for="crt-${key}">${label}</label>
              <input
                id="crt-${key}"
                type="range"
                min="0"
                max="1"
                step="0.01"
                ?disabled=${!crtIsActive}
                .value=${String(params[key])}
                aria-valuetext="${Math.round(params[key] * 100)} percent"
                @input=${(event: Event) =>
                  this.setCrtParam(key, parseFloat((event.target as HTMLInputElement).value))}
              />
              <output class="effect-value" for="crt-${key}"
                >${Math.round(params[key] * 100)}%</output
              >
            </div>
          `
        )}
      </div>
    `;
  }

  render() {
    const { animation, project } = this.context;
    const isPlaying = animation.isPlaying.value;
    const canvasW = project.width.value;
    const canvasH = project.height.value;
    const previewScale = this.getPreviewScale();
    const displayW = Math.round(canvasW * previewScale);
    const displayH = Math.round(canvasH * previewScale);

    // For small canvases (scaling UP): use native resolution, CSS handles pixelated scaling
    // For large canvases (scaling DOWN): use reduced resolution for performance
    const actualCanvasW = previewScale >= 1 ? canvasW : displayW;
    const actualCanvasH = previewScale >= 1 ? canvasH : displayH;

    const viewportStyle = this.getViewportIndicatorStyle();
    const crtIsActive = settingsStore.activeViewEffect.value === CRT_EFFECT_ID;
    const crtParams = getCrtParams(settingsStore.getViewEffectParams(CRT_EFFECT_ID));
    const displayedCrtParams = crtIsActive ? crtParams : CRT_PRESETS.off;
    const crtPreset = crtIsActive ? getCrtPresetId(crtParams) : 'off';

    return html`
      <div class="container" style="transform: translate(${this.posX}px, ${this.posY}px)">
        <div class="header" @mousedown=${this.handleHeaderMouseDown}>
          <span class="chevron ${this.collapsed ? 'collapsed' : ''}" @click=${this.toggleCollapse}
            >▼</span
          >
          <span class="header-title">Preview</span>
        </div>

        <div class="content ${this.collapsed ? 'collapsed' : ''}" style=${this.getContentStyle()}>
          ${this.renderPreviewSurface({
            actualCanvasW,
            actualCanvasH,
            displayW,
            displayH,
            viewportStyle,
          })}

          <div class="controls">
            ${this.renderBackgroundControls()} ${this.renderEffectActions(crtIsActive)}
            <button class="play-btn" @click=${this.togglePlay}>${isPlaying ? '⏸' : '▶'}</button>
          </div>

          ${this.renderEffectPanel(crtPreset, displayedCrtParams, crtIsActive)}
        </div>
        <div
          class="resize-handle"
          @mousedown=${this.handleResizeMouseDown}
          title="Drag to resize"
        ></div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pf-preview-overlay': PFPreviewOverlay;
  }
}
