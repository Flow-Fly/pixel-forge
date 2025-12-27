import { html, css, nothing } from "lit";
import { customElement, property, state, query } from "lit/decorators.js";
import { BaseComponent } from "./base-component";

export interface ContextMenuItem {
  type: "item" | "divider" | "slider" | "input" | "color-picker";
  label?: string;
  icon?: string;
  action?: () => void;
  disabled?: boolean;
  // For item type - prevent auto-close after action (useful for submenus)
  keepOpen?: boolean;
  // For slider type
  min?: number;
  max?: number;
  value?: number;
  step?: number;
  unit?: string; // e.g. '%', 'ms', 'px' - defaults to 'ms' for backwards compatibility
  onSliderChange?: (value: number) => void; // Called during drag (for live preview)
  onSliderCommit?: (value: number) => void; // Called on release (for final commit)
  // For input type
  inputValue?: string;
  inputType?: "text" | "number"; // defaults to 'text'
  inputMin?: number;
  inputMax?: number;
  placeholder?: string;
  onInputChange?: (value: string) => void;
  onInputSubmit?: (value: string) => void;
  onNumberChange?: (value: number) => void; // For number inputs
  // For color picker
  colors?: string[];
  selectedColor?: string;
  onColorSelect?: (color: string) => void;
}

@customElement("pf-context-menu")
export class PFContextMenu extends BaseComponent {
  @property({ type: Boolean, reflect: true }) open = false;
  @property({ type: Number }) x = 0;
  @property({ type: Number }) y = 0;
  @property({ type: Array }) items: ContextMenuItem[] = [];

  @state() private focusedIndex = -1;
  // Track slider values for display - reactive so label updates
  @state() private sliderDisplayValues: Map<number, number> = new Map();

  @query(".menu") private menuElement!: HTMLElement;
  private anchorElement: HTMLElement | null = null;
  private openedAt: number = 0;
  // Track if we're interacting with a slider (to prevent close)
  private isInteractingWithSlider = false;

  static styles = css`
    :host {
      display: block;
    }

    .menu {
      margin: 0;
      padding: 4px 0;
      border: 1px solid var(--pf-color-border, #444);
      background-color: var(--pf-color-bg-panel, #1a1a1a);
      border-radius: 6px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
      min-width: 160px;
      max-width: 280px;
      overflow-y: auto;
      max-height: calc(100vh - 16px);

      /* Fixed positioning - coordinates set via JS */
      position: fixed;
      top: 0;
      left: 0;
    }

    /* Popover API handles visibility - just style the backdrop */
    .menu::backdrop {
      background: transparent;
    }

    .menu-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      cursor: pointer;
      color: var(--pf-color-text-main, #fff);
      font-size: 12px;
      transition: background-color 0.1s;
    }

    .menu-item:hover,
    .menu-item.focused {
      background-color: var(--pf-color-bg-hover, #333);
    }

    .menu-item.disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .menu-item.disabled:hover {
      background-color: transparent;
    }

    .menu-item .icon {
      width: 16px;
      text-align: center;
      flex-shrink: 0;
    }

    .menu-item .label {
      flex: 1;
    }

    .divider {
      height: 1px;
      background-color: var(--pf-color-border, #444);
      margin: 4px 8px;
    }

    /* Slider item */
    .slider-item {
      padding: 8px 12px;
    }

    .slider-label {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
      font-size: 12px;
      color: var(--pf-color-text-muted, #aaa);
    }

    .slider-value {
      color: var(--pf-color-text-main, #fff);
      font-weight: 500;
    }

    .slider-input {
      width: 100%;
      height: 4px;
      -webkit-appearance: none;
      appearance: none;
      background: var(--pf-color-bg-dark, #0a0a0a);
      border-radius: 2px;
      outline: none;
    }

    .slider-input::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 14px;
      height: 14px;
      background: var(--pf-color-accent, #4a9eff);
      border-radius: 50%;
      cursor: pointer;
      transition: transform 0.1s;
    }

    .slider-input::-webkit-slider-thumb:hover {
      transform: scale(1.2);
    }

    /* Input item */
    .input-item {
      padding: 8px 12px;
    }

    .input-label {
      font-size: 12px;
      color: var(--pf-color-text-muted, #aaa);
      margin-bottom: 6px;
    }

    .text-input {
      width: 100%;
      padding: 6px 8px;
      background: var(--pf-color-bg-dark, #0a0a0a);
      border: 1px solid var(--pf-color-border, #444);
      border-radius: 4px;
      color: var(--pf-color-text-main, #fff);
      font-size: 12px;
      outline: none;
      box-sizing: border-box;
    }

    .text-input:focus {
      border-color: var(--pf-color-accent, #4a9eff);
    }

    /* Number input specific styles */
    .number-input {
      width: 60px;
      padding: 4px 6px;
      background: var(--pf-color-bg-dark, #0a0a0a);
      border: 1px solid var(--pf-color-border, #444);
      border-radius: 4px;
      color: var(--pf-color-text-main, #fff);
      font-size: 12px;
      outline: none;
      box-sizing: border-box;
      text-align: center;
    }

    .number-input:focus {
      border-color: var(--pf-color-accent, #4a9eff);
    }

    .number-input::-webkit-inner-spin-button,
    .number-input::-webkit-outer-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }

    .input-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .input-row .input-label {
      margin-bottom: 0;
      flex: 1;
    }

    /* Color picker */
    .color-picker-item {
      padding: 8px 12px;
    }

    .color-label {
      font-size: 12px;
      color: var(--pf-color-text-muted, #aaa);
      margin-bottom: 8px;
    }

    .color-grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 4px;
    }

    .color-swatch {
      width: 24px;
      height: 24px;
      border-radius: 4px;
      cursor: pointer;
      border: 2px solid transparent;
      transition: transform 0.1s, border-color 0.1s;
    }

    .color-swatch:hover {
      transform: scale(1.1);
    }

    .color-swatch.selected {
      border-color: var(--pf-color-text-main, #fff);
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("keydown", this.handleKeyDown);
    document.addEventListener("mousedown", this.handleDocumentMouseDown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("keydown", this.handleKeyDown);
    document.removeEventListener("mousedown", this.handleDocumentMouseDown);
  }

  updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties);
    if (changedProperties.has("open")) {
      if (this.open) {
        this.focusedIndex = -1;
        this.sliderDisplayValues = new Map();
        this.isInteractingWithSlider = false;
        // Delay opening to next frame to let the triggering event finish
        // This prevents the right-click from immediately dismissing the popover
        requestAnimationFrame(() => this.openPopover());
      } else {
        this.closePopover();
      }
    }
  }

  private openPopover() {
    if (!this.menuElement || !this.open) return;

    // Track when opened to prevent immediate dismissal from triggering click
    this.openedAt = Date.now();

    // Initial position (may be adjusted after measuring)
    this.updatePosition();

    // Show popover
    try {
      this.menuElement.showPopover();
    } catch {
      // Fallback for browsers without popover support
      this.menuElement.setAttribute("open", "");
    }

    // After showing, measure actual dimensions and re-position if needed
    requestAnimationFrame(() => {
      this.adjustPositionAfterRender();
    });
  }

  private adjustPositionAfterRender() {
    if (!this.menuElement) return;

    const rect = this.menuElement.getBoundingClientRect();
    const menuWidth = rect.width;
    const menuHeight = rect.height;

    let left = rect.left;
    let top = rect.top;

    // Check if menu extends past viewport and adjust
    if (rect.bottom > window.innerHeight - 8) {
      // Move up so bottom edge is within viewport
      top = window.innerHeight - menuHeight - 8;
    }
    if (rect.right > window.innerWidth - 8) {
      left = window.innerWidth - menuWidth - 8;
    }

    // Clamp to viewport
    left = Math.max(8, left);
    top = Math.max(8, top);

    this.menuElement.style.left = `${left}px`;
    this.menuElement.style.top = `${top}px`;
  }

  private closePopover() {
    if (!this.menuElement) return;

    try {
      this.menuElement.hidePopover();
    } catch {
      // Fallback
      this.menuElement.removeAttribute("open");
    }
  }

  private updatePosition() {
    if (!this.menuElement) return;

    // Always use manual positioning for consistent behavior across browsers
    // Estimate menu dimensions (actual dimensions available after first render)
    const menuWidth = 180;
    const menuHeight = Math.min(this.items.length * 36 + 8, 400);

    let left: number;
    let top: number;

    if (this.anchorElement) {
      // Position relative to anchor element
      const rect = this.anchorElement.getBoundingClientRect();
      left = rect.left;
      top = rect.bottom + 4; // Small gap below anchor

      // Flip vertically if needed
      if (top + menuHeight > window.innerHeight - 8) {
        top = rect.top - menuHeight - 4;
      }
      // Flip horizontally if needed
      if (left + menuWidth > window.innerWidth - 8) {
        left = rect.right - menuWidth;
      }
    } else {
      // Position at coordinates
      left = this.x;
      top = this.y;

      // Flip if needed
      if (left + menuWidth > window.innerWidth - 8) {
        left = this.x - menuWidth;
      }
      if (top + menuHeight > window.innerHeight - 8) {
        top = this.y - menuHeight;
      }
    }

    // Clamp to viewport
    left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - menuHeight - 8));

    this.menuElement.style.left = `${left}px`;
    this.menuElement.style.top = `${top}px`;
  }

  private clearAnchor() {
    this.anchorElement = null;
  }

  private handlePopoverToggle = (e: Event) => {
    const event = e as ToggleEvent;
    if (event.newState === "closed" && this.open) {
      // Popover was dismissed (click outside, Escape, etc.)
      this.open = false;
      this.dispatchEvent(new CustomEvent("close"));
    }
  };

  private handleDocumentMouseDown = (e: MouseEvent) => {
    if (!this.open) return;
    // Ignore if clicked within menu
    if (this.menuElement?.contains(e.target as Node)) return;
    // Ignore if too soon after opening (prevents right-click dismiss)
    if (Date.now() - this.openedAt < 200) return;
    // Ignore if interacting with a slider
    if (this.isInteractingWithSlider) return;
    this.close();
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    if (!this.open) return;

    const actionableItems = this.items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.type === "item" && !item.disabled);

    switch (e.key) {
      case "Escape":
        e.preventDefault();
        this.close();
        break;
      case "ArrowDown":
        e.preventDefault();
        if (actionableItems.length > 0) {
          const currentIdx = actionableItems.findIndex(
            ({ index }) => index === this.focusedIndex
          );
          const nextIdx =
            currentIdx < actionableItems.length - 1 ? currentIdx + 1 : 0;
          this.focusedIndex = actionableItems[nextIdx].index;
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        if (actionableItems.length > 0) {
          const currentIdx = actionableItems.findIndex(
            ({ index }) => index === this.focusedIndex
          );
          const prevIdx =
            currentIdx > 0 ? currentIdx - 1 : actionableItems.length - 1;
          this.focusedIndex = actionableItems[prevIdx].index;
        }
        break;
      case "Enter":
        e.preventDefault();
        if (this.focusedIndex >= 0) {
          const item = this.items[this.focusedIndex];
          if (item.type === "item" && !item.disabled) {
            this.handleItemClick(item, e);
          }
        }
        break;
    }
  };

  private handleItemClick(item: ContextMenuItem, e: Event) {
    e.stopPropagation();
    e.preventDefault();

    if (item.disabled) {
      return;
    }

    if (item.action) {
      item.action();
    }

    if (!item.keepOpen) {
      this.close();
    }
  }

  private handleSliderMouseDown(e: Event) {
    e.stopPropagation();
    this.isInteractingWithSlider = true;
    // Add global mouseup listener to clear interaction flag
    const handleMouseUp = () => {
      this.isInteractingWithSlider = false;
      document.removeEventListener("mouseup", handleMouseUp);
    };
    document.addEventListener("mouseup", handleMouseUp);
  }

  private handleSliderInput(
    item: ContextMenuItem,
    index: number,
    e: Event
  ) {
    e.stopPropagation();
    const input = e.target as HTMLInputElement;
    const value = parseFloat(input.value);

    // Update reactive state for display
    const newMap = new Map(this.sliderDisplayValues);
    newMap.set(index, value);
    this.sliderDisplayValues = newMap;

    // Call live preview callback (doesn't add to history)
    item.onSliderChange?.(value);
  }

  private handleSliderCommit(
    item: ContextMenuItem,
    index: number,
    e: Event
  ) {
    e.stopPropagation();
    const value = this.sliderDisplayValues.get(index);
    if (value !== undefined) {
      item.onSliderCommit?.(value);
    }
  }

  private handleInputChange(item: ContextMenuItem, e: Event) {
    const value = (e.target as HTMLInputElement).value;
    // Call change callback directly, no state storage
    item.onInputChange?.(value);
  }

  private handleNumberInputChange(item: ContextMenuItem, e: Event) {
    const input = e.target as HTMLInputElement;
    const value = parseInt(input.value, 10);
    if (!isNaN(value)) {
      item.onNumberChange?.(value);
    }
  }

  private handleInputKeyDown(item: ContextMenuItem, e: KeyboardEvent) {
    const input = e.target as HTMLInputElement;

    if (e.key === "Enter" && item.onInputSubmit) {
      e.stopPropagation();
      item.onInputSubmit(input.value);
      this.close();
    } else if (e.key === "Escape") {
      this.close();
    } else {
      e.stopPropagation(); // Don't let menu handle other keys while typing
    }
  }

  private handleColorSelect(item: ContextMenuItem, color: string) {
    if (item.onColorSelect) {
      item.onColorSelect(color);
    }
  }

  close() {
    this.open = false;
    this.clearAnchor();
    this.dispatchEvent(new CustomEvent("close"));
  }

  /**
   * Show the context menu anchored to an element.
   * @param anchor - The element to anchor the menu to
   * @param items - Menu items to display
   */
  show(anchor: HTMLElement, items: ContextMenuItem[]): void;
  /**
   * Show the context menu at specific coordinates (legacy).
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param items - Menu items to display
   */
  show(x: number, y: number, items: ContextMenuItem[]): void;
  show(
    anchorOrX: HTMLElement | number,
    itemsOrY: ContextMenuItem[] | number,
    maybeItems?: ContextMenuItem[]
  ) {
    // Clear previous anchor
    this.clearAnchor();

    if (typeof anchorOrX === "number") {
      // Legacy: show(x, y, items)
      this.x = anchorOrX;
      this.y = itemsOrY as number;
      this.items = maybeItems!;
      this.anchorElement = null;
    } else {
      // New: show(anchor, items)
      this.anchorElement = anchorOrX;
      this.items = itemsOrY as ContextMenuItem[];
      // Store coordinates for positioning
      const rect = anchorOrX.getBoundingClientRect();
      this.x = rect.left;
      this.y = rect.bottom;
    }

    this.open = true;
  }

  private renderItem(item: ContextMenuItem, index: number) {
    switch (item.type) {
      case "divider":
        return html`<div class="divider"></div>`;

      case "slider": {
        // Use displayed value if we have one, otherwise item.value
        const displayValue =
          this.sliderDisplayValues.get(index) ?? item.value ?? 100;
        // Use explicit unit if provided, otherwise default based on label
        const suffix =
          item.unit !== undefined
            ? item.unit
            : item.label?.includes("FPS")
              ? ""
              : "ms";
        return html`
          <div
            class="slider-item"
            @mousedown="${(e: Event) => e.stopPropagation()}"
          >
            <div class="slider-label">
              <span>${item.label}</span>
              <span class="slider-value">${displayValue}${suffix}</span>
            </div>
            <input
              type="range"
              class="slider-input"
              min="${item.min ?? 10}"
              max="${item.max ?? 1000}"
              step="${item.step ?? 1}"
              .value="${String(displayValue)}"
              @mousedown="${(e: Event) => this.handleSliderMouseDown(e)}"
              @input="${(e: Event) => this.handleSliderInput(item, index, e)}"
              @change="${(e: Event) => this.handleSliderCommit(item, index, e)}"
            />
          </div>
        `;
      }

      case "input":
        if (item.inputType === "number") {
          return html`
            <div
              class="input-item input-row"
              @mousedown="${(e: Event) => e.stopPropagation()}"
            >
              ${item.label
                ? html`<div class="input-label">${item.label}</div>`
                : nothing}
              <input
                type="number"
                class="number-input"
                min="${item.inputMin ?? 1}"
                max="${item.inputMax ?? 999}"
                value="${item.inputValue ?? ""}"
                @input="${(e: Event) => this.handleNumberInputChange(item, e)}"
                @keydown="${(e: KeyboardEvent) =>
                  this.handleInputKeyDown(item, e)}"
                @click="${(e: Event) => e.stopPropagation()}"
              />
            </div>
          `;
        }
        return html`
          <div
            class="input-item"
            @mousedown="${(e: Event) => e.stopPropagation()}"
          >
            ${item.label
              ? html`<div class="input-label">${item.label}</div>`
              : nothing}
            <input
              type="text"
              class="text-input"
              placeholder="${item.placeholder ?? ""}"
              value="${item.inputValue ?? ""}"
              @input="${(e: Event) => this.handleInputChange(item, e)}"
              @keydown="${(e: KeyboardEvent) =>
                this.handleInputKeyDown(item, e)}"
              @click="${(e: Event) => e.stopPropagation()}"
            />
          </div>
        `;

      case "color-picker":
        return html`
          <div
            class="color-picker-item"
            @mousedown="${(e: Event) => e.stopPropagation()}"
          >
            ${item.label
              ? html`<div class="color-label">${item.label}</div>`
              : nothing}
            <div class="color-grid">
              ${(item.colors ?? []).map(
                (color) => html`
                  <div
                    class="color-swatch ${color === item.selectedColor
                      ? "selected"
                      : ""}"
                    style="background-color: ${color}"
                    @click="${(e: Event) => {
                      e.stopPropagation();
                      this.handleColorSelect(item, color);
                    }}"
                  ></div>
                `
              )}
            </div>
          </div>
        `;

      case "item":
      default:
        return html`
          <div
            class="menu-item ${item.disabled ? "disabled" : ""} ${index ===
            this.focusedIndex
              ? "focused"
              : ""}"
            @mousedown="${(e: Event) => e.stopPropagation()}"
            @click="${(e: Event) => this.handleItemClick(item, e)}"
            @mouseenter="${() => {
              this.focusedIndex = index;
            }}"
          >
            ${item.icon
              ? html`<span class="icon">${item.icon}</span>`
              : nothing}
            <span class="label">${item.label}</span>
          </div>
        `;
    }
  }

  render() {
    return html`
      <div
        class="menu"
        popover="manual"
        @toggle="${this.handlePopoverToggle}"
      >
        ${this.items.map((item, index) => this.renderItem(item, index))}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pf-context-menu": PFContextMenu;
  }
}
