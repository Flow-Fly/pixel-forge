import { html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { viewportStore } from "../../stores/viewport";
import { projectStore } from "../../stores/project";

@customElement("pf-status-bar")
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
    .center,
    .right {
      display: flex;
      gap: var(--pf-spacing-4);
    }

    .center {
      color: var(--pf-color-text-muted);
    }

    .saved-indicator {
      color: var(--pf-color-text-muted);
      font-size: var(--pf-font-size-xs);
    }
  `;

  @property({ type: Object }) cursor = { x: 0, y: 0 };

  private formatLastSaved(timestamp: number | null): string {
    if (!timestamp) return '';

    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 5000) return 'Saved just now';
    if (diff < 60000) return `Saved ${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `Saved ${Math.floor(diff / 60000)}m ago`;

    const date = new Date(timestamp);
    return `Saved at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  render() {
    const zoomPercent = viewportStore.zoomPercent;
    const lastSaved = projectStore.lastSaved.value;

    return html`
      <div class="left">
        <span>${this.cursor.x + 1}, ${this.cursor.y + 1}</span>
      </div>
      <div class="center">
        ${lastSaved ? html`<span class="saved-indicator">${this.formatLastSaved(lastSaved)}</span>` : ''}
      </div>
      <div class="right">
        <span>${zoomPercent}%</span>
      </div>
    `;
  }
}
