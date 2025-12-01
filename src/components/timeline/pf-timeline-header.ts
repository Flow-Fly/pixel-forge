import { html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { animationStore } from '../../stores/animation';

@customElement('pf-timeline-header')
export class PFTimelineHeader extends BaseComponent {
  static styles = css`
    :host {
      display: flex;
      height: 32px;
      background-color: var(--pf-color-bg-surface);
      border-bottom: 1px solid var(--pf-color-border);
    }

    .frame-number {
      width: 32px;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      color: var(--pf-color-text-muted);
      border-right: 1px solid var(--pf-color-border);
      cursor: pointer;
      position: relative;
    }

    .frame-number:hover {
      background-color: var(--pf-color-bg-hover);
      color: var(--pf-color-text-main);
    }

    .frame-number.active {
      background-color: var(--pf-color-primary-muted);
      color: var(--pf-color-primary);
      font-weight: bold;
    }

    .tag-marker {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
      background-color: var(--pf-color-primary);
    }
    
    .tag-label {
      position: absolute;
      top: -20px;
      left: 50%;
      transform: translateX(-50%);
      background-color: var(--pf-color-bg-tooltip);
      color: var(--pf-color-text-on-tooltip);
      padding: 2px 4px;
      border-radius: 2px;
      font-size: 10px;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s;
      z-index: 10;
    }

    .frame-number:hover .tag-label {
      opacity: 1;
    }
  `;

  selectFrame(frameId: string) {
    animationStore.goToFrame(frameId);
  }

  handleContextMenu(e: MouseEvent, frameId: string) {
    e.preventDefault();
    const frame = animationStore.frames.value.find(f => f.id === frameId);
    if (!frame) return;

    // Simple prompt for now - in a real app we'd use a dialog
    if (frame.tags && frame.tags.length > 0) {
      if (confirm(`Remove tag "${frame.tags[0].name}"?`)) {
        animationStore.removeTag(frameId, frame.tags[0].id);
      }
    } else {
      const name = prompt('Enter tag name:');
      if (name) {
        animationStore.addTag(frameId, name, '#ff0000'); // Default color
      }
    }
  }

  render() {
    const frames = animationStore.frames.value;
    const currentFrameId = animationStore.currentFrameId.value;

    return html`
      ${frames.map((frame, index) => {
        const hasTag = frame.tags && frame.tags.length > 0;
        const tag = hasTag ? frame.tags![0] : null;
        
        return html`
          <div 
            class="frame-number ${frame.id === currentFrameId ? 'active' : ''}"
            @click=${() => this.selectFrame(frame.id)}
            @contextmenu=${(e: MouseEvent) => this.handleContextMenu(e, frame.id)}
            title=${tag ? `Tag: ${tag.name}` : `Frame ${index + 1}`}
          >
            ${tag ? html`
              <div class="tag-marker" style="background-color: ${tag.color}"></div>
              <div class="tag-label">${tag.name}</div>
            ` : ''}
            ${index + 1}
          </div>
        `;
      })}
    `;
  }
}
