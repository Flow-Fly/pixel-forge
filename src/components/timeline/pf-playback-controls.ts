import { html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { animationStore } from '../../stores/animation';
import { historyStore } from '../../stores/history';
import { AddFrameCommand, DeleteFrameCommand } from '../../commands/animation-commands';

const DURATION_UNIT_KEY = 'pf-timeline-duration-unit';

@customElement('pf-playback-controls')
export class PFPlaybackControls extends BaseComponent {
  static styles = css`
    :host {
      display: flex;
      gap: var(--pf-spacing-2);
      align-items: center;
    }

    button {
      background: none;
      border: 1px solid var(--pf-color-border);
      color: var(--pf-color-text-main);
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }

    button:hover {
      background-color: var(--pf-color-bg-hover);
    }

    button.active {
      background-color: var(--pf-color-primary);
      color: white;
      border-color: var(--pf-color-primary);
    }

    .info-text {
      font-size: 12px;
      color: var(--pf-color-text-muted);
      margin-left: 8px;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .unit-toggle {
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 3px;
      transition: background-color 0.15s;
    }

    .unit-toggle:hover {
      background-color: var(--pf-color-bg-hover);
      color: var(--pf-color-text-main);
    }
  `;

  @state() private durationUnit: 'ms' | 'fps' = 'ms';

  connectedCallback() {
    super.connectedCallback();
    const saved = localStorage.getItem(DURATION_UNIT_KEY);
    if (saved === 'fps' || saved === 'ms') {
      this.durationUnit = saved;
    }
  }

  togglePlay() {
    animationStore.togglePlayback();
  }

  addFrame() {
    historyStore.execute(new AddFrameCommand(true));
  }

  deleteFrame() {
    const currentFrameId = animationStore.currentFrameId.value;
    if (currentFrameId) {
      historyStore.execute(new DeleteFrameCommand(currentFrameId));
    }
  }

  private toggleUnit() {
    this.durationUnit = this.durationUnit === 'ms' ? 'fps' : 'ms';
    localStorage.setItem(DURATION_UNIT_KEY, this.durationUnit);

    // Dispatch event to notify timeline header
    this.dispatchEvent(new CustomEvent('unit-change', {
      detail: { unit: this.durationUnit },
      bubbles: true,
      composed: true
    }));
  }

  private getEffectiveFPS(): number {
    const frames = animationStore.frames.value;
    if (frames.length === 0) return 0;

    const totalDuration = frames.reduce((sum, f) => sum + f.duration, 0);
    const avgDuration = totalDuration / frames.length;
    return Math.round(1000 / avgDuration);
  }

  private getAverageDuration(): number {
    const frames = animationStore.frames.value;
    if (frames.length === 0) return 100;

    const totalDuration = frames.reduce((sum, f) => sum + f.duration, 0);
    return Math.round(totalDuration / frames.length);
  }

  render() {
    const isPlaying = animationStore.isPlaying.value;
    const frameCount = animationStore.frames.value.length;
    const effectiveFPS = this.getEffectiveFPS();
    const avgDuration = this.getAverageDuration();

    return html`
      <button @click=${() => animationStore.goToFrame(animationStore.frames.value[0]?.id)}>|&lt;</button>
      <button class=${isPlaying ? 'active' : ''} @click=${this.togglePlay}>
        ${isPlaying ? 'Pause' : 'Play'}
      </button>
      <button @click=${() => animationStore.goToFrame(animationStore.frames.value[frameCount - 1]?.id)}>&gt;|</button>

      <div style="width: 1px; height: 16px; background: var(--pf-color-border); margin: 0 4px;"></div>

      <button @click=${this.addFrame} title="Add Duplicate Frame">+ Frame</button>
      <button @click=${this.deleteFrame} title="Delete Current Frame" ?disabled=${frameCount <= 1}>- Frame</button>

      <span class="info-text">
        ${frameCount} Frames |
        <span
          class="unit-toggle"
          @click=${this.toggleUnit}
          title="Click to toggle between ms and FPS"
        >
          ${this.durationUnit === 'fps'
            ? `${effectiveFPS} FPS`
            : `${avgDuration} ms`}
        </span>
      </span>
    `;
  }
}
