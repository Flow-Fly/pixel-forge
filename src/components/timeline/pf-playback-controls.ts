import { html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { animationStore } from '../../stores/animation';
import { historyStore } from '../../stores/history';
import { AddFrameCommand, DeleteFrameCommand } from '../../commands/animation-commands';

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
  `;

  togglePlay() {
    animationStore.isPlaying.value = !animationStore.isPlaying.value;
  }

  addFrame() {
    historyStore.execute(new AddFrameCommand(true));
  }

  render() {
    const isPlaying = animationStore.isPlaying.value;
    const frameCount = animationStore.frames.value.length;
    const fps = animationStore.fps.value;

    return html`
      <button @click=${() => animationStore.goToFrame(animationStore.frames.value[0]?.id)}>|&lt;</button>
      <button class=${isPlaying ? 'active' : ''} @click=${this.togglePlay}>
        ${isPlaying ? 'Pause' : 'Play'}
      </button>
      <button @click=${() => animationStore.goToFrame(animationStore.frames.value[frameCount - 1]?.id)}>&gt;|</button>
      
      <div style="width: 1px; height: 16px; background: var(--pf-color-border); margin: 0 4px;"></div>
      
      <button @click=${this.addFrame} title="Add Duplicate Frame">+ Frame</button>
      <button @click=${this.deleteFrame} title="Delete Current Frame" ?disabled=${frameCount <= 1}>- Frame</button>
      
      <span style="font-size: 12px; color: var(--pf-color-text-muted); margin-left: 8px;">
        ${frameCount} Frames | ${fps} FPS
      </span>
    `;
  }

  deleteFrame() {
    const currentFrameId = animationStore.currentFrameId.value;
    if (currentFrameId) {
      historyStore.execute(new DeleteFrameCommand(currentFrameId));
    }
  }
}
