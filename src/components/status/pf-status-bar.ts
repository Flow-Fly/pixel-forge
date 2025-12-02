import { html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { viewportStore } from '../../stores/viewport';

@customElement('pf-status-bar')
export class PFStatusBar extends BaseComponent {
  static styles = css`
    :host {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      height: 100%;
    }

    .left,
    .right {
      display: flex;
      gap: var(--pf-spacing-4);
    }
  `;

  @property({ type: Object }) cursor = { x: 0, y: 0 };

  render() {
    const zoomPercent = viewportStore.zoomPercent;

    return html`
      <div class="left">
        <span>${this.cursor.x}, ${this.cursor.y}</span>
      </div>
      <div class="right">
        <span>${zoomPercent}%</span>
      </div>
    `;
  }
}
