import { html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { animationStore } from '../../stores/animation';
import { layerStore } from '../../stores/layers';

@customElement('pf-preview-window')
export class PFPreviewWindow extends BaseComponent {
  static styles = css`
    :host {
      display: block;
      width: 200px;
      background-color: var(--pf-color-bg-panel);
      border: 1px solid var(--pf-color-border);
      display: flex;
      flex-direction: column;
    }

    .header {
      padding: 8px;
      border-bottom: 1px solid var(--pf-color-border);
      font-size: 12px;
      color: var(--pf-color-text-muted);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .preview-area {
      flex: 1;
      min-height: 150px;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: #2a2a2a;
      overflow: hidden;
      position: relative;
    }

    canvas {
      image-rendering: pixelated;
      background-color: white;
      box-shadow: 0 0 10px rgba(0,0,0,0.5);
    }
    
    .controls {
      padding: 8px;
      border-top: 1px solid var(--pf-color-border);
      display: flex;
      justify-content: center;
      gap: 8px;
    }
    
    button {
      background: none;
      border: 1px solid var(--pf-color-border);
      color: var(--pf-color-text-main);
      border-radius: 4px;
      cursor: pointer;
      font-size: 10px;
      padding: 2px 6px;
    }
  `;

  @state() private previewCanvas: HTMLCanvasElement | null = null;
  @state() private ctx: CanvasRenderingContext2D | null = null;
  private animationFrameId: number = 0;
  private lastFrameTime: number = 0;

  connectedCallback() {
    super.connectedCallback();
    this.startAnimationLoop();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    cancelAnimationFrame(this.animationFrameId);
  }

  firstUpdated() {
    this.previewCanvas = this.shadowRoot?.querySelector('canvas') || null;
    if (this.previewCanvas) {
      this.ctx = this.previewCanvas.getContext('2d');
    }
  }

  startAnimationLoop() {
    const loop = (timestamp: number) => {
      if (!this.lastFrameTime) this.lastFrameTime = timestamp;
      const elapsed = timestamp - this.lastFrameTime;
      const fps = animationStore.fps.value;
      const interval = 1000 / fps;

      if (animationStore.isPlaying.value && elapsed > interval) {
        this.advanceFrame();
        this.lastFrameTime = timestamp;
      }

      this.renderPreview();
      this.animationFrameId = requestAnimationFrame(loop);
    };
    this.animationFrameId = requestAnimationFrame(loop);
  }

  advanceFrame() {
    const frames = animationStore.frames.value;
    const currentId = animationStore.currentFrameId.value;
    const currentIndex = frames.findIndex(f => f.id === currentId);
    const nextIndex = (currentIndex + 1) % frames.length;
    animationStore.currentFrameId.value = frames[nextIndex].id;
  }

  renderPreview() {
    if (!this.ctx || !this.previewCanvas) return;

    // Clear
    this.ctx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);

    const currentFrameId = animationStore.currentFrameId.value;
    const layers = layerStore.layers.value;
    const cels = animationStore.cels.value;

    // Render layers for current frame
    for (const layer of layers) {
      if (layer.visible) {
        const key = animationStore.getCelKey(layer.id, currentFrameId);
        const cel = cels.get(key);
        if (cel && cel.canvas) {
          this.ctx.globalAlpha = layer.opacity / 255;
          this.ctx.globalCompositeOperation = layer.blendMode === 'normal' ? 'source-over' : layer.blendMode as GlobalCompositeOperation;
          this.ctx.drawImage(cel.canvas, 0, 0);
        }
      }
    }
    
    this.ctx.globalAlpha = 1;
    this.ctx.globalCompositeOperation = 'source-over';
  }

  togglePlay() {
    animationStore.isPlaying.value = !animationStore.isPlaying.value;
  }

  render() {
    const isPlaying = animationStore.isPlaying.value;
    
    return html`
      <div class="header">
        <span>Preview</span>
      </div>
      <div class="preview-area">
        <canvas width="64" height="64" style="width: 128px; height: 128px;"></canvas>
      </div>
      <div class="controls">
        <button @click=${this.togglePlay}>${isPlaying ? 'Pause' : 'Play'}</button>
      </div>
    `;
  }
}
