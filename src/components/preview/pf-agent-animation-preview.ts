import { css, html, LitElement, type PropertyValues } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import type { Frame, FrameTag } from '../../types/animation';
import { createPlaybackEngine, type PlaybackEngine } from '../../stores/animation/playback';
import type {
  AnimationEvaluationBundle,
  AnimationEvaluationFrame,
} from '../../editor/animation-observation';

/**
 * Data-only animation preview. The bundle is detached before it reaches this
 * element, so playback callbacks never resolve or mutate a ProjectContext.
 */
@customElement('pf-agent-animation-preview')
export class PFAgentAnimationPreview extends LitElement {
  static styles = css`
    :host {
      --agent-animation-border: #394453;
      --agent-animation-muted: #aeb9c8;
      --agent-animation-text: #f1f4f8;
      --agent-animation-panel: #151b24;
      --agent-animation-accent: #8bd3ff;
      color: var(--agent-animation-text);
      display: block;
      font-family: system-ui, sans-serif;
      min-width: 0;
      container-type: inline-size;
    }

    .surface {
      background: var(--agent-animation-panel);
      border: 1px solid var(--agent-animation-border);
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
    .error-state,
    figcaption,
    .delta-summary {
      color: var(--agent-animation-muted);
      font-size: 0.8125rem;
      line-height: 1.5;
      overflow-wrap: anywhere;
    }

    .metadata {
      display: grid;
      gap: 4px;
    }

    .toolbar,
    .seek,
    .tag-metadata,
    .delta-list {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    button,
    select,
    input {
      accent-color: var(--agent-animation-accent);
      font: inherit;
    }

    button,
    select {
      background: #202a37;
      border: 1px solid var(--agent-animation-border);
      border-radius: 4px;
      color: var(--agent-animation-text);
      min-height: 32px;
      padding: 4px 10px;
    }

    button:focus-visible,
    select:focus-visible,
    input:focus-visible {
      outline: 2px solid var(--agent-animation-accent);
      outline-offset: 2px;
    }

    input[type='range'] {
      flex: 1 1 180px;
      min-width: 120px;
    }

    .figures,
    .keyframes {
      display: grid;
      gap: 16px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      min-width: 0;
    }

    .keyframes {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    figure {
      display: grid;
      gap: 8px;
      margin: 0;
      min-width: 0;
    }

    .canvas-frame {
      align-items: flex-start;
      background-color: #29313b;
      background-image:
        linear-gradient(45deg, #596575 25%, transparent 25%),
        linear-gradient(-45deg, #596575 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #596575 75%),
        linear-gradient(-45deg, transparent 75%, #596575 75%);
      background-position: 0 0, 0 8px, 8px -8px, -8px 0;
      background-size: 16px 16px;
      border: 1px solid var(--agent-animation-border);
      box-sizing: border-box;
      display: flex;
      justify-content: flex-start;
      max-width: 100%;
      min-height: 32px;
      min-width: 0;
      overflow: auto;
      padding: 8px;
    }

    .solid-background {
      background: var(--agent-animation-background, #000);
    }

    canvas {
      display: block;
      flex: 0 0 auto;
      image-rendering: pixelated;
      image-rendering: crisp-edges;
    }

    .contact-canvas {
      height: auto;
      max-width: 100%;
      width: 100%;
    }

    .intended-canvas {
      height: var(--canvas-height);
      width: var(--canvas-width);
    }

    .keyframe-canvas {
      height: var(--inspection-height);
      width: var(--inspection-width);
    }

    .status {
      color: var(--agent-animation-accent);
      font-size: 0.875rem;
      font-variant-numeric: tabular-nums;
    }

    @container (max-width: 640px) {
      .surface {
        padding: 12px;
      }

      .figures,
      .keyframes {
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

  @property({ attribute: false }) bundle: AnimationEvaluationBundle | null = null;
  @property({ type: String }) error = '';

  @state() private currentFrameId = '';
  @state() private playbackMode: 'all' | 'tag' = 'all';
  @state() private activeTagId: string | null = null;
  @state() private isPlaying = false;

  @query('.contact-canvas') private contactCanvas?: HTMLCanvasElement;
  @query('.intended-canvas') private intendedCanvas?: HTMLCanvasElement;

  private playbackEngine: PlaybackEngine | null = null;
  private playbackFrames: Frame[] = [];
  private playbackTags: FrameTag[] = [];

  protected willUpdate(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has('bundle')) this.resetBundlePlayback();
  }

  protected updated(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has('bundle') || changedProperties.has('currentFrameId' as keyof PFAgentAnimationPreview)) {
      this.paintCanvases();
    }
  }

  disconnectedCallback(): void {
    this.stopPlayback();
    super.disconnectedCallback();
  }

  protected render() {
    if (this.error) {
      return html`
        <section class="surface" aria-labelledby="animation-preview-title">
          <h2 id="animation-preview-title">Agent Animation Preview</h2>
          <p class="error-state" role="alert">${this.error}</p>
        </section>
      `;
    }
    const bundle = this.bundle;
    if (!bundle) {
      return html`
        <section class="surface" aria-labelledby="animation-preview-title">
          <h2 id="animation-preview-title">Agent Animation Preview</h2>
          <p class="empty-state" role="status">No animation evaluation bundle available.</p>
        </section>
      `;
    }

    const frame = this.currentFrame(bundle);
    if (!frame) return html``;
    const backgroundClass = bundle.request.background.kind === 'solid' ? 'solid-background' : '';
    const backgroundStyle = bundle.request.background.kind === 'solid'
      ? `--agent-animation-background: ${bundle.request.background.color}`
      : '';
    const currentIndex = bundle.frames.findIndex((candidate) => candidate.frameId === frame.frameId);
    const currentTag = bundle.tags.find((tag) => tag.id === this.activeTagId);

    return html`
      <section class="surface" aria-labelledby="animation-preview-title">
        <div class="metadata">
          <h2 id="animation-preview-title">Agent Animation Preview</h2>
          <span>Project ${bundle.target.projectId}, revision ${bundle.revision}, ${bundle.canvas.width} × ${bundle.canvas.height}</span>
          <span>Bundle digest ${bundle.digest}</span>
        </div>

        <div class="toolbar" aria-label="Animation playback controls">
          <button
            type="button"
            aria-label=${this.isPlaying ? 'Pause animation' : 'Play animation'}
            @click=${this.togglePlayback}
          >${this.isPlaying ? 'Pause' : 'Play'}</button>
          <button type="button" aria-label="Previous frame" @click=${this.previousFrame}>Previous</button>
          <button type="button" aria-label="Next frame" @click=${this.nextFrame}>Next</button>
          <label>
            Playback range
            <select aria-label="Playback range" .value=${this.playbackMode === 'tag' && this.activeTagId ? `tag:${this.activeTagId}` : 'all'} @change=${this.changePlaybackRange}>
              <option value="all">All frames</option>
              ${bundle.tags.map((tag) => html`<option value=${`tag:${tag.id}`} ?selected=${this.playbackMode === 'tag' && tag.id === this.activeTagId}>${tag.name || tag.id} loop</option>`)}
            </select>
          </label>
          <label ?hidden=${this.playbackMode !== 'tag'}>
            Tag loop
            <select aria-label="Tag loop" .value=${this.activeTagId ?? ''} @change=${this.changeTag}>
              ${bundle.tags.map((tag) => html`<option value=${tag.id}>${tag.name || tag.id}</option>`)}
            </select>
          </label>
        </div>

        <div class="seek">
          <label for="animation-frame-seek">Frame ${frame.number} of ${bundle.frames.length}</label>
          <input
            id="animation-frame-seek"
            type="range"
            min="1"
            max=${bundle.frames.length}
            step="1"
            .value=${String(currentIndex + 1)}
            aria-label="Animation frame"
            @input=${this.seekFrame}
          />
        </div>

        <p class="status" role="status" aria-live="polite">
          ${this.isPlaying ? 'Playing' : 'Paused'} · Frame ${frame.number} · ${frame.duration} ms${currentTag ? ` · ${currentTag.name || currentTag.id}` : ''}
        </p>

        <div class="figures">
          <figure aria-labelledby="contact-sheet-caption">
            <div class="canvas-frame ${backgroundClass}" style=${backgroundStyle}>
              <canvas
                class="contact-canvas"
                width=${bundle.contactSheet.width}
                height=${bundle.contactSheet.height}
                role="img"
                aria-label="Animation contact sheet with ${bundle.frames.length} frames"
              ></canvas>
            </div>
            <figcaption id="contact-sheet-caption">Contact sheet (${bundle.contactSheet.columns} columns × ${bundle.contactSheet.rows} rows)</figcaption>
          </figure>
          <figure aria-labelledby="playback-caption">
            <div class="canvas-frame ${backgroundClass}" style=${backgroundStyle}>
              <canvas
                class="intended-canvas"
                width=${frame.render.width}
                height=${frame.render.height}
                style=${`--canvas-width: ${frame.render.width}px; --canvas-height: ${frame.render.height}px;`}
                role="img"
                aria-label="Intended-size playback frame ${frame.number}, ${frame.duration} milliseconds"
              ></canvas>
            </div>
            <figcaption id="playback-caption">Intended-size playback frame ${frame.number} (${frame.render.width} × ${frame.render.height})</figcaption>
          </figure>
        </div>

        <section aria-labelledby="keyframes-title">
          <h3 id="keyframes-title">Requested keyframes</h3>
          <div class="keyframes">
            ${bundle.keyframes.map((keyframe) => html`
              <figure>
                <div class="canvas-frame ${backgroundClass}" style=${backgroundStyle}>
                  <canvas
                    class="keyframe-canvas"
                    data-frame-id=${keyframe.frameId}
                    width=${keyframe.width}
                    height=${keyframe.height}
                    style=${`--inspection-width: ${keyframe.width * keyframe.scale}px; --inspection-height: ${keyframe.height * keyframe.scale}px;`}
                    role="img"
                    aria-label="Keyframe ${keyframe.frameNumber}, ${keyframe.duration} milliseconds"
                  ></canvas>
                </div>
                <figcaption>Frame ${keyframe.frameNumber} · ${keyframe.duration} ms · ${keyframe.digest}</figcaption>
              </figure>
            `)}
          </div>
        </section>

        <section aria-labelledby="timing-title">
          <h3 id="timing-title">Timing and tags</h3>
          <div class="tag-metadata">
            ${bundle.frames.map((candidate) => html`<span>Frame ${candidate.number}: ${candidate.duration} ms</span>`)}
            ${bundle.tags.map((tag) => html`<span>${tag.name || tag.id}: frames ${tag.startFrameIndex + 1}–${tag.endFrameIndex + 1}</span>`)}
          </div>
        </section>

        <section aria-labelledby="deltas-title">
          <h3 id="deltas-title">Adjacent Symbol Grid deltas</h3>
          <div class="delta-list">
            ${bundle.deltas.map((delta) => html`
              <p class="delta-summary">Frames ${delta.fromNumber} → ${delta.toNumber}: ${delta.changedCellCount} changed (${delta.unchangedCellCount} unchanged); ${delta.cells.filter((cell) => cell.kind === 'added').length} added, ${delta.cells.filter((cell) => cell.kind === 'removed').length} removed, ${delta.cells.filter((cell) => cell.kind === 'recolored').length} recolored.</p>
            `)}
          </div>
        </section>
      </section>
    `;
  }

  private resetBundlePlayback(): void {
    this.stopPlayback();
    const bundle = this.bundle;
    if (!bundle || bundle.frames.length === 0) {
      this.playbackEngine = null;
      this.playbackFrames = [];
      this.playbackTags = [];
      this.currentFrameId = '';
      this.activeTagId = null;
      this.playbackMode = 'all';
      return;
    }
    this.playbackFrames = bundle.frames.map((frame) => ({
      id: frame.frameId,
      order: frame.order,
      duration: frame.duration,
    }));
    this.playbackTags = bundle.tags.flatMap((tag) => {
      const start = this.playbackFrames.findIndex((frame) => frame.order >= tag.startFrameIndex);
      let end = -1;
      for (let index = this.playbackFrames.length - 1; index >= 0; index--) {
        if (this.playbackFrames[index]!.order <= tag.endFrameIndex) {
          end = index;
          break;
        }
      }
      if (start < 0 || end < start) return [];
      return [{
        id: tag.id,
        name: tag.name,
        color: tag.color,
        startFrameIndex: start,
        endFrameIndex: end,
        collapsed: tag.collapsed,
      }];
    });
    this.currentFrameId = this.playbackFrames[0]!.id;
    this.activeTagId = this.playbackTags[0]?.id ?? null;
    this.playbackMode = 'all';
    this.playbackEngine = createPlaybackEngine({
      getCurrentFrameId: () => this.currentFrameId,
      getFrames: () => this.playbackFrames,
      getTags: () => this.playbackTags,
      goToFrame: (frameId) => {
        if (this.playbackFrames.some((frame) => frame.id === frameId)) this.currentFrameId = frameId;
        this.requestUpdate();
      },
      getCurrentFrame: () => this.playbackFrames.find((frame) => frame.id === this.currentFrameId),
    });
  }

  private currentFrame(bundle: AnimationEvaluationBundle): AnimationEvaluationFrame | undefined {
    return bundle.frames.find((frame) => frame.frameId === this.currentFrameId) ?? bundle.frames[0];
  }

  private togglePlayback = (): void => {
    if (!this.playbackEngine) return;
    this.isPlaying = this.playbackEngine.toggle();
  };

  private stopPlayback(): void {
    this.playbackEngine?.stop();
    this.playbackEngine = null;
    this.isPlaying = false;
  }

  private previousFrame = (): void => {
    this.seekBy(-1);
  };

  private nextFrame = (): void => {
    if (!this.playbackEngine) return;
    this.playbackEngine.advanceFrame();
    this.requestUpdate();
  };

  private seekBy(offset: number): void {
    const index = this.playbackFrames.findIndex((frame) => frame.id === this.currentFrameId);
    if (index < 0 || this.playbackFrames.length === 0) return;
    const next = (index + offset + this.playbackFrames.length) % this.playbackFrames.length;
    this.currentFrameId = this.playbackFrames[next]!.id;
  }

  private seekFrame = (event: Event): void => {
    const value = Number((event.currentTarget as HTMLInputElement).value) - 1;
    const frame = this.playbackFrames[value];
    if (frame) this.currentFrameId = frame.id;
  };

  private changePlaybackRange = (event: Event): void => {
    const value = (event.currentTarget as HTMLSelectElement).value;
    if (value === 'all') {
      this.playbackMode = 'all';
      this.activeTagId = null;
      this.playbackEngine?.setMode('all');
      return;
    }
    const tagId = value.slice('tag:'.length);
    const tag = this.playbackTags.find((candidate) => candidate.id === tagId) ?? this.playbackTags[0];
    if (!tag) return;
    this.playbackMode = 'tag';
    this.activeTagId = tag.id;
    this.playbackEngine?.setMode('tag', tag.id);
    this.currentFrameId = this.playbackFrames[tag.startFrameIndex]?.id ?? this.currentFrameId;
  };

  private changeTag = (event: Event): void => {
    const tagId = (event.currentTarget as HTMLSelectElement).value;
    const tag = this.playbackTags.find((candidate) => candidate.id === tagId);
    if (!tag) return;
    this.activeTagId = tag.id;
    this.playbackMode = 'tag';
    this.playbackEngine?.setMode('tag', tag.id);
    this.currentFrameId = this.playbackFrames[tag.startFrameIndex]?.id ?? this.currentFrameId;
  };

  private paintCanvases(): void {
    const bundle = this.bundle;
    if (!bundle) return;
    paintCanvas(this.contactCanvas, bundle.contactSheet.width, bundle.contactSheet.height, bundle.contactSheet.pixels);
    const frame = this.currentFrame(bundle);
    if (frame) paintCanvas(this.intendedCanvas, frame.render.width, frame.render.height, frame.render.pixels);
    for (const canvas of this.renderRoot.querySelectorAll<HTMLCanvasElement>('.keyframe-canvas')) {
      const keyframe = bundle.keyframes.find((candidate) => candidate.frameId === canvas.dataset.frameId);
      if (keyframe) paintCanvas(canvas, keyframe.width, keyframe.height, keyframe.pixels);
    }
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
