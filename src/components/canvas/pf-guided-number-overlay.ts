import { css, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import { getGuidedDrawingSnapshot } from '../../services/paint-by-number/guided-progress';
import { defaultProjectContext, type ProjectContext } from '../../stores/project-context';
import { CanvasOverlay } from './canvas-overlay';

const NUMBER_ZOOM_THRESHOLD = 16;

export interface GuidedNumberCell {
  guideNumber: number;
  screenX: number;
  screenY: number;
  size: number;
}

export interface GuidedNumberViewport {
  zoom: number;
  panX: number;
  panY: number;
  viewportWidth: number;
  viewportHeight: number;
}

export interface GuidedNumberLabelStyle {
  fillStyle: string;
  fontSize: number;
  fontWeight: number;
  lineWidth: number;
  strokeStyle: string;
}

export function getGuidedNumberLabelStyle(
  cellSize: number,
  labelLength: number,
): GuidedNumberLabelStyle {
  return {
    fillStyle: 'rgba(245, 243, 238, 0.62)',
    fontSize: Math.min(12, Math.max(7, cellSize * (labelLength > 1 ? 0.46 : 0.52))),
    fontWeight: 500,
    lineWidth: Math.min(1.5, Math.max(1, cellSize * 0.06)),
    strokeStyle: 'rgba(7, 9, 13, 0.46)',
  };
}

export function collectVisibleGuidedTargetCells(
  target: Uint8Array,
  width: number,
  viewport: GuidedNumberViewport,
): GuidedNumberCell[] {
  const cells: GuidedNumberCell[] = [];
  for (let index = 0; index < target.length; index += 1) {
    const guideNumber = target[index];
    if (guideNumber === 0) continue;

    const x = index % width;
    const y = Math.floor(index / width);
    const screenX = x * viewport.zoom + viewport.panX;
    const screenY = y * viewport.zoom + viewport.panY;
    if (!isCellVisible(screenX, screenY, viewport)) continue;

    cells.push({
      guideNumber,
      screenX,
      screenY,
      size: viewport.zoom,
    });
  }

  return cells;
}

export function collectVisibleGuidedNumberCells(
  target: Uint8Array,
  pixels: Uint8ClampedArray,
  width: number,
  viewport: GuidedNumberViewport,
): GuidedNumberCell[] {
  if (pixels.length !== target.length * 4) {
    throw new RangeError('Guided drawing pixels do not match the target buffer');
  }
  if (viewport.zoom < NUMBER_ZOOM_THRESHOLD) return [];

  const cells: GuidedNumberCell[] = [];
  for (let index = 0; index < target.length; index += 1) {
    const guideNumber = target[index];
    if (guideNumber === 0 || pixels[index * 4 + 3] > 0) continue;

    const x = index % width;
    const y = Math.floor(index / width);
    const screenX = x * viewport.zoom + viewport.panX;
    const screenY = y * viewport.zoom + viewport.panY;
    if (!isCellVisible(screenX, screenY, viewport)) continue;

    cells.push({
      guideNumber,
      screenX,
      screenY,
      size: viewport.zoom,
    });
  }

  return cells;
}

@customElement('pf-guided-number-overlay')
export class PFGuidedNumberOverlay extends CanvasOverlay {
  static styles = css`
    :host {
      position: absolute;
      inset: 0;
      z-index: 49;
      pointer-events: none;
    }

    canvas {
      width: 100%;
      height: 100%;
    }

    .zoom-hint {
      position: absolute;
      inset-block-start: 34px;
      inset-inline-start: 50%;
      z-index: 3;
      margin: 0;
      padding: 6px 9px;
      transform: translateX(-50%);
      border: 1px solid var(--pf-color-border);
      border-radius: var(--pf-radius-sm);
      background: rgba(13, 16, 21, 0.9);
      color: var(--pf-color-text-secondary);
      box-shadow: var(--pf-shadow-md);
      font-size: var(--pf-font-size-xs);
      white-space: nowrap;
    }
  `;

  private context: ProjectContext = defaultProjectContext;
  private animationFrameId = 0;

  connectedCallback() {
    super.connectedCallback();
    this.subscribeToActiveProjectContext((context) => {
      this.context = context;
      this.requestUpdate();
      this.scheduleDraw();
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = 0;
  }

  firstUpdated() {
    super.firstUpdated();
    this.scheduleDraw();
  }

  updated() {
    this.scheduleDraw();
  }

  protected resizeCanvas() {
    super.resizeCanvas();
    this.scheduleDraw();
  }

  render() {
    const session = this.context.guidedDrawing.session.value;
    const numbersVisible = this.context.guidedDrawing.numbersVisible.value;
    void this.context.guidedDrawing.targetPreviewVisible.value;
    const zoom = this.context.viewport.zoom.value;
    void this.context.viewport.panX.value;
    void this.context.viewport.panY.value;
    void this.context.history.version.value;
    void this.context.layers.layers.value;

    return html`
      <canvas aria-label="Guided drawing numbers"></canvas>
      ${session && numbersVisible && zoom < NUMBER_ZOOM_THRESHOLD
        ? html`
            <p class="zoom-hint" role="status" aria-live="polite">
              Zoom in to see guide numbers
            </p>
          `
        : ''}
    `;
  }

  private scheduleDraw() {
    if (this.animationFrameId) return;
    this.animationFrameId = requestAnimationFrame(() => {
      this.animationFrameId = 0;
      this.draw();
    });
  }

  private draw() {
    const drawingContext = this.prepareFrame();
    if (!drawingContext) return;

    const snapshot = getGuidedDrawingSnapshot(this.context);
    if (!snapshot) return;

    const { viewport } = this.context;
    const frame = {
      zoom: viewport.zoom.value,
      panX: viewport.panX.value,
      panY: viewport.panY.value,
      viewportWidth: this.clientWidth,
      viewportHeight: this.clientHeight,
    };

    if (this.context.guidedDrawing.targetPreviewVisible.value) {
      const targetCells = collectVisibleGuidedTargetCells(
        snapshot.session.target,
        snapshot.session.width,
        frame,
      );
      this.drawTargetPreview(
        drawingContext,
        targetCells,
        this.context.palette.mainColors.value,
      );
    }

    if (!this.context.guidedDrawing.numbersVisible.value) return;

    const numberCells = collectVisibleGuidedNumberCells(
      snapshot.session.target,
      snapshot.pixels,
      snapshot.session.width,
      frame,
    );

    this.drawNumbers(drawingContext, numberCells);
  }

  private drawTargetPreview(
    context: CanvasRenderingContext2D,
    cells: GuidedNumberCell[],
    palette: string[],
  ) {
    context.save();
    context.globalAlpha = 0.72;
    for (const cell of cells) {
      const color = palette[cell.guideNumber - 1];
      if (!color) continue;

      context.fillStyle = color;
      context.fillRect(
        Math.floor(cell.screenX),
        Math.floor(cell.screenY),
        Math.ceil(cell.size),
        Math.ceil(cell.size),
      );
    }
    context.restore();
  }

  private drawNumbers(context: CanvasRenderingContext2D, cells: GuidedNumberCell[]) {
    const fontFamily = getComputedStyle(this).fontFamily || '"Departure Mono", monospace';
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    for (const cell of cells) {
      const label = String(cell.guideNumber);
      const style = getGuidedNumberLabelStyle(cell.size, label.length);
      const centerX = cell.screenX + cell.size / 2;
      const centerY = cell.screenY + cell.size / 2;

      context.font = `${style.fontWeight} ${style.fontSize}px ${fontFamily}`;
      context.lineJoin = 'round';
      context.lineWidth = style.lineWidth;
      context.strokeStyle = style.strokeStyle;
      context.strokeText(label, centerX, centerY + 0.5, cell.size);
      context.fillStyle = style.fillStyle;
      context.fillText(label, centerX, centerY + 0.5, cell.size);
    }
  }
}

function isCellVisible(
  screenX: number,
  screenY: number,
  viewport: GuidedNumberViewport,
): boolean {
  return screenX + viewport.zoom >= 0
    && screenY + viewport.zoom >= 0
    && screenX <= viewport.viewportWidth
    && screenY <= viewport.viewportHeight;
}

declare global {
  interface HTMLElementTagNameMap {
    'pf-guided-number-overlay': PFGuidedNumberOverlay;
  }
}
