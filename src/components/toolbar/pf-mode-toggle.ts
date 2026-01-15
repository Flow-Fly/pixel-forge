import { html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { modeStore } from "../../stores/mode";

/**
 * Mode Toggle Component
 *
 * A segmented control for switching between Art (Pixel Art) and Map (Tilemap) modes.
 * Implements WCAG 2.1 AA accessibility with proper ARIA attributes and keyboard navigation.
 *
 * Features:
 * - Reactive updates via modeStore signal subscription
 * - Global M key shortcut for quick mode switching
 * - Arrow key navigation when focused
 * - 200ms transition animation (respects prefers-reduced-motion)
 * - Emits 'mode-changed' custom event for panel orchestration
 */
@customElement("pf-mode-toggle")
export class PfModeToggle extends BaseComponent {
  static styles = css`
    :host {
      display: inline-flex;
    }

    .toggle-container {
      display: flex;
      gap: var(--pf-spacing-1);
      background: var(--pf-color-bg-surface);
      padding: var(--pf-spacing-1);
      border-radius: var(--pf-radius-md);
      border: 1px solid var(--pf-color-border);
    }

    .toggle-btn {
      display: flex;
      align-items: center;
      gap: var(--pf-spacing-1);
      padding: var(--pf-spacing-1) var(--pf-spacing-2);
      border: none;
      border-radius: var(--pf-radius-sm);
      background: transparent;
      color: var(--pf-color-text-muted);
      font-family: var(--pf-font-mono);
      font-size: var(--pf-font-size-sm);
      cursor: pointer;
      transition: background-color 200ms ease-out, color 200ms ease-out;
      outline: none;
    }

    .toggle-btn:hover:not(.active) {
      background: var(--pf-color-bg-hover);
      color: var(--pf-color-text-secondary);
    }

    .toggle-btn.active {
      background: var(--pf-color-accent);
      color: var(--pf-color-bg-dark);
    }

    .toggle-btn:focus-visible {
      outline: 2px solid var(--pf-color-accent);
      outline-offset: 2px;
    }

    /* Reduced motion support (AC #4) */
    @media (prefers-reduced-motion: reduce) {
      .toggle-btn {
        transition: none;
      }
    }

    /* Visually hidden but accessible to screen readers */
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
  `;

  private boundHandleKeyDown: (e: KeyboardEvent) => void;

  /** Screen reader announcement message */
  @state() private announcement = "";

  constructor() {
    super();
    this.boundHandleKeyDown = this.handleGlobalKeyDown.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("keydown", this.boundHandleKeyDown);
  }

  disconnectedCallback() {
    window.removeEventListener("keydown", this.boundHandleKeyDown);
    super.disconnectedCallback();
  }

  /**
   * Handle global M key shortcut (AC #2)
   * Only triggers if not focused on an input/textarea
   */
  private handleGlobalKeyDown(e: KeyboardEvent) {
    if (e.key === "m" || e.key === "M") {
      const activeEl = document.activeElement;
      const tagName = activeEl?.tagName?.toUpperCase();

      // Don't trigger if user is typing in an input or textarea
      if (tagName === "INPUT" || tagName === "TEXTAREA") {
        return;
      }

      // Also check for contenteditable elements
      if (activeEl instanceof HTMLElement && activeEl.isContentEditable) {
        return;
      }

      e.preventDefault();
      modeStore.toggleMode();
      this.emitModeChanged(modeStore.mode.value);
    }
  }

  /**
   * Handle arrow key navigation within the toggle (AC #5)
   * Moves focus to the newly active tab per WCAG tabs pattern
   */
  private handleContainerKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      modeStore.toggleMode();
      const newMode = modeStore.mode.value;
      this.emitModeChanged(newMode);

      // Move focus to the newly active button
      this.updateComplete.then(() => {
        const newActiveButton = this.shadowRoot?.querySelector(
          `[data-mode="${newMode}"]`
        ) as HTMLButtonElement | null;
        newActiveButton?.focus();
      });
    }
  }

  /**
   * Handle button click to change mode (AC #1)
   */
  private handleModeChange(mode: "art" | "map") {
    if (modeStore.mode.value !== mode) {
      modeStore.setMode(mode);
      this.emitModeChanged(mode);
    }
  }

  /**
   * Emit mode-changed custom event for panel orchestration (AC #3)
   * Also announces the change to screen readers
   */
  private emitModeChanged(mode: "art" | "map") {
    this.dispatchEvent(
      new CustomEvent("mode-changed", {
        detail: { mode },
        bubbles: true,
        composed: true,
      })
    );

    // Announce mode change to screen readers
    this.announcement =
      mode === "art"
        ? "Switched to Pixel Art Mode"
        : "Switched to Tilemap Mode";
  }

  render() {
    const currentMode = modeStore.mode.value;

    return html`
      <div
        class="toggle-container"
        role="tablist"
        aria-label="Editor mode"
        @keydown=${this.handleContainerKeyDown}
      >
        <button
          role="tab"
          data-mode="art"
          aria-selected=${currentMode === "art"}
          class="toggle-btn ${currentMode === "art" ? "active" : ""}"
          @click=${() => this.handleModeChange("art")}
          tabindex=${currentMode === "art" ? "0" : "-1"}
        >
          🎨 Art
        </button>
        <button
          role="tab"
          data-mode="map"
          aria-selected=${currentMode === "map"}
          class="toggle-btn ${currentMode === "map" ? "active" : ""}"
          @click=${() => this.handleModeChange("map")}
          tabindex=${currentMode === "map" ? "0" : "-1"}
        >
          🗺️ Map
        </button>
      </div>
      <!-- Screen reader announcement region -->
      <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
        ${this.announcement}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pf-mode-toggle": PfModeToggle;
  }
}
