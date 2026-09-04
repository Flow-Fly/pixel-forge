import { css, html, LitElement, type PropertyValues } from 'lit';
import { customElement, property, query } from 'lit/decorators.js';
import type {
  RenderObservation,
  RenderObservationSource,
} from '../../editor/observations';

/**
 * A reusable, data-only preview for one detached render checkpoint.
 * It deliberately has no project-context subscription or editor view state.
 */
@customElement('pf-agent-preview-surface')
export class PFAgentPreviewSurface extends LitElement {
  static styles = css`
    :host {
      --agent-preview-border: #394453;
      --agent-preview-muted: #aeb9c8;
      --agent-preview-text: #f1f4f8;
      --agent-preview-panel: #151b24;
      --agent-preview-accent: #8bd3ff;
      color: var(--agent-preview-text);
      display: block;
      font-family: system-ui, sans-serif;
      min-width: 0;
      container-type: inline-size;
    }

    .surface {
      background: var(--agent-preview-panel);
      border: 1px solid var(--agent-preview-border);
      border-radius: 8px;
      box-sizing: border-box;
      display: grid;
      gap: 16px;
      min-width: 0;
      padding: 16px;
    }

    h2,
    h3,
    p {
      margin: 0;
    }

    h2 {
      font-size: 1rem;
      line-height: 1.35;
    }

    h3 {
      font-size: 0.875rem;
      line-height: 1.35;
    }

    .metadata,
    .empty-state,
    .error-state {
      color: var(--agent-preview-muted);
      font-size: 0.8125rem;
      line-height: 1.5;
    }

    .metadata {
      display: grid;
      gap: 4px;
      overflow-wrap: anywhere;
    }

    .source-badge {
      border: 1px solid var(--agent-preview-accent);
      border-radius: 999px;
      color: var(--agent-preview-accent);
      display: inline-block;
      font-size: 0.6875rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      padding: 2px 8px;
      text-transform: uppercase;
    }

    .figures {
      display: grid;
      gap: 16px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      min-width: 0;
    }

    figure {
      display: grid;
      gap: 8px;
      margin: 0;
      min-width: 0;
    }

    figcaption {
      color: var(--agent-preview-muted);
      font-size: 0.75rem;
      line-height: 1.4;
      overflow-wrap: anywhere;
    }

    .canvas-frame {
      align-items: flex-start;
      border: 1px solid var(--agent-preview-border);
      box-sizing: border-box;
      display: flex;
      justify-content: flex-start;
      max-width: 100%;
      min-height: 32px;
      min-width: 0;
      overflow: auto;
      padding: 8px;
    }

    .checkerboard {
      background-color: #29313b;
      background-image:
        linear-gradient(45deg, #596575 25%, transparent 25%),
        linear-gradient(-45deg, #596575 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #596575 75%),
        linear-gradient(-45deg, transparent 75%, #596575 75%);
      background-position: 0 0, 0 8px, 8px -8px, -8px 0;
      background-size: 16px 16px;
    }

    .solid-background {
      background: var(--agent-preview-background, #000);
    }

    canvas {
      display: block;
      flex: 0 0 auto;
      image-rendering: pixelated;
      image-rendering: crisp-edges;
    }

    .intended-canvas {
      height: var(--canvas-height);
      width: var(--canvas-width);
    }

    .inspection-canvas {
      height: var(--inspection-height);
      width: var(--inspection-width);
    }

    @container (max-width: 640px) {
      .surface {
        padding: 12px;
      }

      .figures {
        grid-template-columns: minmax(0, 1fr);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      *,
      *::before,
      *::after {
        animation-duration: 0.001ms !important;
        animation-iteration-count: 1 !important;
        scroll-behavior: auto !important;
        transition-duration: 0.001ms !important;
      }
    }
  `;

  @property({ attribute: false }) observation: RenderObservation | null = null;
  @property({ type: String }) error = '';

  @query('.intended-canvas') private intendedCanvas?: HTMLCanvasElement;
  @query('.inspection-canvas') private inspectionCanvas?: HTMLCanvasElement;

  protected updated(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has('observation') || changedProperties.has('error')) {
      this.paintObservation();
    }
  }

  protected render() {
    const observation = this.observation;
    if (this.error) {
      return html`
        <section class="surface" aria-labelledby="preview-title">
          <h2 id="preview-title">Agent Preview Surface</h2>
          <p class="error-state" role="alert">${this.error}</p>
        </section>
      `;
    }
    if (!observation) {
      return html`
        <section class="surface" aria-labelledby="preview-title">
          <h2 id="preview-title">Agent Preview Surface</h2>
          <p class="empty-state" role="status">No render observation available.</p>
        </section>
      `;
    }

    const sourceLabel = observation.sourceKind === 'layer' ? 'Layer' : 'Composite';
    const regionLabel = formatRegion(observation.region);
    const background = observation.background;
    const backgroundClass = background.kind === 'solid' ? 'solid-background' : 'checkerboard';
    const backgroundStyle = background.kind === 'solid'
      ? `--agent-preview-background: ${background.color}`
      : '';
    const canvasStyle = `--canvas-width: ${observation.width}px; --canvas-height: ${observation.height}px;`;
    const inspectionStyle = `--inspection-width: ${observation.width * observation.scale}px; --inspection-height: ${observation.height * observation.scale}px;`;
    const sourceDescription = describeSource(observation.source);
    const metadataLabel = `${sourceLabel} source ${sourceDescription}, revision ${observation.revision}, region ${regionLabel}, scale ${observation.scale}, digest ${observation.digest}`;

    return html`
      <section class="surface" aria-labelledby="preview-title">
        <div>
          <h2 id="preview-title">Agent Preview Surface</h2>
          <p class="metadata" aria-label="Render checkpoint metadata">
            <span class="source-badge">${sourceLabel}</span>
            <span>${metadataLabel}</span>
          </p>
        </div>
        <div class="figures">
          <figure aria-labelledby="intended-caption">
            <div class="canvas-frame ${backgroundClass}" style=${backgroundStyle}>
              <canvas
                class="intended-canvas"
                width=${observation.width}
                height=${observation.height}
                style=${canvasStyle}
                role="img"
                aria-label="${sourceLabel} render at intended source-pixel size, revision ${observation.revision}, region ${regionLabel}, digest ${observation.digest}"
              ></canvas>
            </div>
            <figcaption id="intended-caption">Intended source-pixel view (${observation.width} × ${observation.height})</figcaption>
          </figure>
          <figure aria-labelledby="inspection-caption">
            <div class="canvas-frame ${backgroundClass}" style=${backgroundStyle}>
              <canvas
                class="inspection-canvas"
                width=${observation.width}
                height=${observation.height}
                style=${inspectionStyle}
                role="img"
                aria-label="${sourceLabel} render at ${observation.scale}× nearest-neighbor inspection scale, revision ${observation.revision}, region ${regionLabel}, digest ${observation.digest}"
              ></canvas>
            </div>
            <figcaption id="inspection-caption">Inspection view (${observation.scale}× nearest-neighbor)</figcaption>
          </figure>
        </div>
      </section>
    `;
  }

  private paintObservation(): void {
    const observation = this.observation;
    if (!observation) return;
    paintCanvas(this.intendedCanvas, observation.width, observation.height, observation.pixels);
    paintCanvas(this.inspectionCanvas, observation.width, observation.height, observation.pixels);
  }
}

function paintCanvas(
  canvas: HTMLCanvasElement | undefined,
  width: number,
  height: number,
  pixels: Uint8Array,
): void {
  if (!canvas || pixels.length !== width * height * 4) return;
  const drawing = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  if (!drawing) return;
  drawing.imageSmoothingEnabled = false;
  const imageData = drawing.createImageData(width, height);
  imageData.data.set(new Uint8ClampedArray(pixels));
  drawing.putImageData(imageData, 0, 0);
}

function describeSource(source: RenderObservationSource): string {
  if (source.kind === 'composite') return `frame ${source.frameId}`;
  return `layer ${source.layerId}, frame ${source.frameId}, cel ${source.celId}`;
}

function formatRegion(region: RenderObservation['region']): string {
  return `${region.x},${region.y} ${region.width} × ${region.height}`;
}
