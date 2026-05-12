import { html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { tilemapStore } from "../../stores/tilemap";

/**
 * Hero Edit Indicator Badge with Navigation Arrows
 * Story 5-3 Task 4
 * Story 5-5 Task 1: Added arrow navigation indicators
 *
 * Displays "Editing Tile #N [Esc to exit]" during hero edit mode.
 * Shows arrow indicators for navigation to adjacent tiles.
 * Positioned at top-center of canvas viewport with fade-in animation.
 * Respects prefers-reduced-motion for accessibility.
 */
@customElement("pf-hero-edit-indicator")
export class PFHeroEditIndicator extends BaseComponent {
  /**
   * Track which arrows are available (updated reactively)
   * Story 5-5 Task 1.4
   */
  @state() private hasUp = false;
  @state() private hasDown = false;
  @state() private hasLeft = false;
  @state() private hasRight = false;

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

    /* Story 5-5 Task 1.2: Arrow indicator container */
    .arrow-container {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      pointer-events: none;
      /* Size matches approximate editing area */
      width: 200px;
      height: 200px;
    }

    /* Story 5-5 Task 1.2: Arrow indicator styling */
    .nav-arrow {
      position: absolute;
      width: 44px; /* Task 1.7: 44px minimum touch target */
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: auto; /* Allow clicking */
      cursor: pointer;
      background: var(--pf-color-bg-surface, #1e1e1e);
      border: 2px solid var(--pf-color-border, #404040);
      border-radius: var(--pf-radius-sm, 4px);
      color: var(--pf-color-text-main, #e0e0e0);
      font-size: 20px;
      transition: background-color 150ms ease, border-color 150ms ease, transform 150ms ease;
      opacity: 0;
      animation: fadeIn 300ms ease-out forwards;
      animation-delay: 200ms;
    }

    /* Task 1.5: Hover state with accent color */
    .nav-arrow:hover {
      background: var(--pf-color-accent, #f59e0b);
      border-color: var(--pf-color-accent, #f59e0b);
      color: var(--pf-color-bg-primary, #121212);
    }

    .nav-arrow:focus-visible {
      outline: 2px solid var(--pf-color-accent, #f59e0b);
      outline-offset: 2px;
    }

    .nav-arrow:active {
      transform: scale(0.95);
    }

    /* Respect reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .nav-arrow {
        animation: none;
        opacity: 1;
        transition: none;
      }
    }

    /* Story 5-5 Task 1.2: Arrow positioning */
    .nav-arrow.up {
      top: -32px;
      left: 50%;
      transform: translateX(-50%);
    }

    .nav-arrow.down {
      bottom: -32px;
      left: 50%;
      transform: translateX(-50%);
    }

    .nav-arrow.left {
      left: -32px;
      top: 50%;
      transform: translateY(-50%);
    }

    .nav-arrow.right {
      right: -32px;
      top: 50%;
      transform: translateY(-50%);
    }

    /* Hover transform adjustments */
    .nav-arrow.up:active { transform: translateX(-50%) scale(0.95); }
    .nav-arrow.down:active { transform: translateX(-50%) scale(0.95); }
    .nav-arrow.left:active { transform: translateY(-50%) scale(0.95); }
    .nav-arrow.right:active { transform: translateY(-50%) scale(0.95); }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    // Update arrow availability when store changes
    this.updateArrowStates();
    // Listen for tile switches to update arrows
    tilemapStore.addEventListener('hero-edit-tile-switched', this.handleTileSwitched);
    tilemapStore.addEventListener('hero-edit-transition-ended', this.handleTransitionEnded);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    tilemapStore.removeEventListener('hero-edit-tile-switched', this.handleTileSwitched);
    tilemapStore.removeEventListener('hero-edit-transition-ended', this.handleTransitionEnded);
  }

  /**
   * Handle tile switch event
   * Story 5-5 Task 1.4
   */
  private handleTileSwitched = (): void => {
    this.updateArrowStates();
  };

  /**
   * Handle transition end event
   * Story 5-5 Task 1.4
   */
  private handleTransitionEnded = (): void => {
    this.updateArrowStates();
  };

  /**
   * Update which arrows should be visible
   * Story 5-5 Task 1.3, 1.4
   */
  private updateArrowStates(): void {
    this.hasUp = tilemapStore.hasAdjacentTile('up');
    this.hasDown = tilemapStore.hasAdjacentTile('down');
    this.hasLeft = tilemapStore.hasAdjacentTile('left');
    this.hasRight = tilemapStore.hasAdjacentTile('right');
  }

  /**
   * Handle arrow click
   * Story 5-5 Task 5.1-5.5
   */
  private handleArrowClick(direction: 'up' | 'down' | 'left' | 'right', e: Event): void {
    e.preventDefault();
    e.stopPropagation(); // Task 5.5: Prevent propagation to canvas

    // Task 5.2: Verify transition is idle
    if (tilemapStore.heroEditTransition.value !== 'idle') {
      return;
    }

    // Task 5.3: Navigate to adjacent tile
    tilemapStore.navigateToAdjacentTile(direction);
  }

  /**
   * Handle keyboard activation on arrows
   * Story 5-5 Task 5.4
   */
  private handleArrowKeydown(direction: 'up' | 'down' | 'left' | 'right', e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.handleArrowClick(direction, e);
    }
  }

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

      <!-- Story 5-5 Task 1.1: Arrow navigation indicators -->
      <div class="arrow-container">
        ${this.hasUp ? html`
          <button
            class="nav-arrow up"
            @click=${(e: Event) => this.handleArrowClick('up', e)}
            @keydown=${(e: KeyboardEvent) => this.handleArrowKeydown('up', e)}
            aria-label="Navigate to tile above"
            title="Navigate up (Arrow key)"
          >▲</button>
        ` : nothing}

        ${this.hasDown ? html`
          <button
            class="nav-arrow down"
            @click=${(e: Event) => this.handleArrowClick('down', e)}
            @keydown=${(e: KeyboardEvent) => this.handleArrowKeydown('down', e)}
            aria-label="Navigate to tile below"
            title="Navigate down (Arrow key)"
          >▼</button>
        ` : nothing}

        ${this.hasLeft ? html`
          <button
            class="nav-arrow left"
            @click=${(e: Event) => this.handleArrowClick('left', e)}
            @keydown=${(e: KeyboardEvent) => this.handleArrowKeydown('left', e)}
            aria-label="Navigate to tile on left"
            title="Navigate left (Arrow key)"
          >◄</button>
        ` : nothing}

        ${this.hasRight ? html`
          <button
            class="nav-arrow right"
            @click=${(e: Event) => this.handleArrowClick('right', e)}
            @keydown=${(e: KeyboardEvent) => this.handleArrowKeydown('right', e)}
            aria-label="Navigate to tile on right"
            title="Navigate right (Arrow key)"
          >►</button>
        ` : nothing}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pf-hero-edit-indicator": PFHeroEditIndicator;
  }
}
