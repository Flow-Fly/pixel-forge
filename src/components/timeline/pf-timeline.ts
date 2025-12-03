import { html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import './pf-playback-controls';
import './pf-onion-skin-controls';
import './pf-timeline-header';
import './pf-timeline-layers';
import './pf-timeline-grid';

@customElement('pf-timeline')
export class PFTimeline extends BaseComponent {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      background-color: var(--pf-color-bg-panel);
      border-top: 1px solid var(--pf-color-border);
      overflow: hidden;
    }

    .controls-area {
      display: flex;
      align-items: center;
      padding: var(--pf-spacing-1);
      border-bottom: 1px solid var(--pf-color-border);
      background-color: var(--pf-color-bg-surface);
    }

    .timeline-content {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    .layers-sidebar {
      width: 200px;
      border-right: 1px solid var(--pf-color-border);
      display: flex;
      flex-direction: column;
      background-color: var(--pf-color-bg-panel);
    }

    .grid-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: auto;
      background-color: var(--pf-color-bg-dark);
    }
  `;

  render() {
    return html`
      <div class="controls-area">
        <pf-playback-controls></pf-playback-controls>
        <pf-onion-skin-controls></pf-onion-skin-controls>
      </div>
      <div class="timeline-content">
        <div class="layers-sidebar">
          <pf-timeline-layers></pf-timeline-layers>
        </div>
        <div class="grid-area">
          <pf-timeline-header></pf-timeline-header>
          <pf-timeline-grid></pf-timeline-grid>
        </div>
      </div>
    `;
  }
}
