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
    const zoom = this.context.viewport.zoom.value;
    void this.context.viewport.panX.value;
    void this.context.viewport.panY.value;
    void this.context.history.version.value;
    void this.context.layers.layers.value;

    return html`
      <canvas aria-label="Guided drawing numbers"></canvas>
      ${session && zoom < NUMBER_ZOOM_THRESHOLD
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
    const cells = collectVisibleGuidedNumberCells(
      snapshot.session.target,
      snapshot.pixels,
      snapshot.session.width,
      {
        zoom: viewport.zoom.value,
        panX: viewport.panX.value,
        panY: viewport.panY.value,
        viewportWidth: this.clientWidth,
        viewportHeight: this.clientHeight,
      },
    );

    this.drawCells(drawingContext, cells);
  }

  private drawCells(context: CanvasRenderingContext2D, cells: GuidedNumberCell[]) {
    const fontFamily = getComputedStyle(this).fontFamily || '"Departure Mono", monospace';
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    for (const cell of cells) {
      const label = String(cell.guideNumber);
      const fontSize = Math.min(14, cell.size * (label.length > 1 ? 0.5 : 0.58));
      const inset = Math.max(1, Math.round(cell.size * 0.1));
      const badgeWidth = cell.size - inset * 2;
      const badgeHeight = cell.size - inset * 2;
      const centerX = cell.screenX + cell.size / 2;
      const centerY = cell.screenY + cell.size / 2;

      context.fillStyle = 'rgba(7, 9, 13, 0.78)';
      context.fillRect(
        Math.round(cell.screenX + inset),
        Math.round(cell.screenY + inset),
        Math.max(1, Math.round(badgeWidth)),
        Math.max(1, Math.round(badgeHeight)),
      );
      context.font = `700 ${fontSize}px ${fontFamily}`;
      context.fillStyle = '#f5f3ee';
      context.fillText(label, centerX, centerY + 0.5, badgeWidth);
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
