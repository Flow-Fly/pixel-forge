import { html, css } from "lit";
import { customElement } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { tilemapStore } from "../../stores/tilemap";

/**
 * Hero Edit Indicator Badge
 * Story 5-3 Task 4
 *
 * Displays "Editing Tile #N [Esc to exit]" during hero edit mode.
 * Positioned at top-center of canvas viewport with fade-in animation.
 * Respects prefers-reduced-motion for accessibility.
 */
@customElement("pf-hero-edit-indicator")
export class PFHeroEditIndicator extends BaseComponent {
  static styles = css`
    :host {
      position: absolute;
      top: var(--pf-spacing-4, 16px);
      left: 50%;
      transform: translateX(-50%);
      z-index: 100;
      pointer-events: none; /* Task 4.7: Don't block mouse events */
    }

    .indicator {
      background: var(--pf-color-bg-surface, #1e1e1e);
      color: var(--pf-color-text-main, #e0e0e0);
      padding: var(--pf-spacing-1, 4px) var(--pf-spacing-2, 8px);
      border-radius: var(--pf-radius-sm, 4px);
      font-size: var(--pf-font-size-sm, 12px);
      font-weight: 500;
      font-family: var(--pf-font-mono, monospace);
      /* Task 4.6: Subtle box-shadow for visibility */
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
      /* Task 4.7: Fade-in animation */
      opacity: 0;
      animation: fadeIn 300ms ease-out forwards;
    }

    /* Task 4.8: Respect reduced motion preference */
    @media (prefers-reduced-motion: reduce) {
      .indicator {
        animation: none;
        opacity: 1;
      }
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(-8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .tile-id {
      color: var(--pf-color-accent, #f59e0b);
    }

    .hint {
      color: var(--pf-color-text-muted, #808080);
      margin-left: var(--pf-spacing-1, 4px);
    }
  `;

  render() {
    // Task 4.3: Get tile ID from store
    const tileId = tilemapStore.editingTileId;

    return html`
      <div
        class="indicator"
        role="status"
        aria-live="polite"
      >
        Editing Tile <span class="tile-id">#${tileId}</span>
        <span class="hint">[Esc to exit]</span>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pf-hero-edit-indicator": PFHeroEditIndicator;
  }
}
