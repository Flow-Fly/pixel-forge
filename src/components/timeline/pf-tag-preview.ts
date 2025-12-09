import { html, css } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { animationStore } from '../../stores/animation';
import { layerStore } from '../../stores/layers';
import { projectStore } from '../../stores/project';
import { renderFrameToCanvas, getFrameIdsForTag } from '../../utils/preview-renderer';

const PREVIEW_SCALE = 2;
const HOVER_DELAY = 300;

@customElement('pf-tag-preview')
export class PFTagPreview extends BaseComponent {
  static styles = css`
    :host {
      position: fixed;
      z-index: 1000;
      pointer-events: none;
      display: none;
    }

    :host([visible]) {
      display: block;
    }

    .preview-container {
      background: var(--pf-color-bg-panel, #1e1e1e);
      border: 1px solid var(--pf-color-border, #3e3e3e);
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      padding: 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }

    .preview-label {
      font-size: 10px;
      color: var(--pf-color-text-muted, #888);
      white-space: nowrap;
    }

    .preview-canvas {
      display: block;
      image-rendering: pixelated;
      background-image:
        linear-gradient(45deg, #404040 25%, transparent 25%),
        linear-gradient(-45deg, #404040 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #404040 75%),
        linear-gradient(-45deg, transparent 75%, #404040 75%);
      background-size: 8px 8px;
      background-position: 0 0, 0 4px, 4px -4px, -4px 0px;
      background-color: #606060;
    }
  `;

  @property({ type: String, reflect: true }) tagId: string = '';
  @property({ type: Boolean, reflect: true }) visible: boolean = false;
  @property({ type: Number }) posX: number = 0;
  @property({ type: Number }) posY: number = 0;

  @query('.preview-canvas') previewCanvas!: HTMLCanvasElement;

  @state() private tagName: string = '';

  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrameId: number | null = null;
  private frameIds: string[] = [];
  private currentFrameIndex: number = 0;
  private lastFrameTime: number = 0;
  private hoverTimeout: number | null = null;

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stopAnimation();
    this.clearHoverTimeout();
  }

  updated(changedProps: Map<string, unknown>) {
    if (changedProps.has('visible')) {
      if (this.visible) {
        this.startAnimation();
      } else {
        this.stopAnimation();
      }
    }

    if (changedProps.has('tagId') && this.tagId) {
      this.loadTagInfo();
    }
  }

  firstUpdated() {
    if (this.previewCanvas) {
      this.ctx = this.previewCanvas.getContext('2d');
    }
  }

  private loadTagInfo() {
    const tag = animationStore.tags.value.find(t => t.id === this.tagId);
    if (tag) {
      this.tagName = tag.name;
      this.frameIds = getFrameIdsForTag(this.tagId);
      this.currentFrameIndex = 0;
    }
  }

  /**
   * Show the preview after a delay.
   * Call this when hovering over a collapsed tag.
   */
  showWithDelay(tagId: string, x: number, y: number) {
    this.clearHoverTimeout();

    this.hoverTimeout = window.setTimeout(() => {
      this.tagId = tagId;
      this.posX = x;
      this.posY = y;
      this.loadTagInfo();
      this.visible = true;
    }, HOVER_DELAY);
  }

  /**
   * Hide the preview and cancel any pending show.
   */
  hide() {
    this.clearHoverTimeout();
    this.visible = false;
    this.stopAnimation();
  }

  private clearHoverTimeout() {
    if (this.hoverTimeout !== null) {
      window.clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }
  }

  private startAnimation() {
    if (this.animationFrameId !== null) return;

    this.lastFrameTime = performance.now();

    const loop = (timestamp: number) => {
      if (!this.visible) {
        this.animationFrameId = null;
        return;
      }

      // Get frame duration from current frame or use default
      const frames = animationStore.frames.value;
      const currentFrameId = this.frameIds[this.currentFrameIndex];
      const currentFrame = frames.find(f => f.id === currentFrameId);
      const frameDuration = currentFrame?.duration ?? 100;

      const elapsed = timestamp - this.lastFrameTime;

      if (elapsed >= frameDuration) {
        // Advance to next frame
        this.currentFrameIndex = (this.currentFrameIndex + 1) % this.frameIds.length;
        this.lastFrameTime = timestamp;
      }

      this.renderFrame();
      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  private stopAnimation() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private renderFrame() {
    if (!this.ctx || this.frameIds.length === 0) return;

    const frameId = this.frameIds[this.currentFrameIndex];
    const layers = layerStore.layers.value;
    const cels = animationStore.cels.value;

    renderFrameToCanvas(this.ctx, frameId, layers, cels);
  }

  render() {
    const canvasW = projectStore.width.value;
    const canvasH = projectStore.height.value;
    const displayW = canvasW * PREVIEW_SCALE;
    const displayH = canvasH * PREVIEW_SCALE;
    const frameCount = this.frameIds.length;

    return html`
      <div
        class="preview-container"
        style="transform: translate(${this.posX}px, ${this.posY - displayH - 40}px)"
      >
        <canvas
          class="preview-canvas"
          width="${canvasW}"
          height="${canvasH}"
          style="width: ${displayW}px; height: ${displayH}px;"
        ></canvas>
        <span class="preview-label">${this.tagName} (${frameCount} frames)</span>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pf-tag-preview': PFTagPreview;
  }
}
