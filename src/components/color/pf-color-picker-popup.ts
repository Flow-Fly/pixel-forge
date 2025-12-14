import { html, css, type PropertyValues } from 'lit';
import { customElement, state, property, query } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';

/**
 * Custom color picker popup for editing palette colors.
 * Uses native popover API for light-dismiss behavior.
 *
 * Features:
 * - Square gradient (saturation x lightness) + vertical hue bar
 * - HSL sliders for precision
 * - Hex input field
 * - Apply / Cancel buttons
 * - Automatic repositioning to stay within viewport
 */
@customElement('pf-color-picker-popup')
export class PFColorPickerPopup extends BaseComponent {
  static styles = css`
    :host {
      display: contents;
    }

    .popup[popover] {
      position: fixed;
      margin: 0;
      padding: 12px;

      background: var(--pf-color-bg-panel, #1a1a1a);
      border: 1px solid var(--pf-color-border, #333);
      border-radius: 6px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      min-width: 240px;

      /* Reset popover defaults */
      color: inherit;
      overflow: visible;
    }

    .popup::backdrop {
      background: transparent;
    }

    .picker-area {
      display: flex;
      gap: 10px;
      margin-bottom: 12px;
    }

    .saturation-lightness {
      width: 180px;
      height: 180px;
      position: relative;
      border-radius: 4px;
      cursor: crosshair;
    }

    .sl-gradient {
      width: 100%;
      height: 100%;
      border-radius: 4px;
    }

    .sl-cursor {
      position: absolute;
      width: 12px;
      height: 12px;
      border: 2px solid white;
      border-radius: 50%;
      box-shadow: 0 0 2px rgba(0, 0, 0, 0.8);
      transform: translate(-50%, -50%);
      pointer-events: none;
    }

    .hue-bar {
      width: 20px;
      height: 180px;
      position: relative;
      border-radius: 4px;
      cursor: pointer;
      background: linear-gradient(to bottom,
        hsl(0, 100%, 50%),
        hsl(60, 100%, 50%),
        hsl(120, 100%, 50%),
        hsl(180, 100%, 50%),
        hsl(240, 100%, 50%),
        hsl(300, 100%, 50%),
        hsl(360, 100%, 50%)
      );
    }

    .hue-cursor {
      position: absolute;
      left: -2px;
      right: -2px;
      height: 6px;
      border: 2px solid white;
      border-radius: 3px;
      box-shadow: 0 0 2px rgba(0, 0, 0, 0.8);
      transform: translateY(-50%);
      pointer-events: none;
    }

    .sliders-section {
      margin-bottom: 12px;
    }

    .slider-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }

    .slider-label {
      width: 14px;
      font-size: 11px;
      color: var(--pf-color-text-muted, #808080);
      font-weight: 500;
    }

    .slider-input {
      flex: 1;
      height: 8px;
      -webkit-appearance: none;
      appearance: none;
      background: var(--pf-color-bg-surface, #2a2a2a);
      border-radius: 4px;
      outline: none;
    }

    .slider-input::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 14px;
      height: 14px;
      background: white;
      border-radius: 50%;
      cursor: pointer;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
    }

    .slider-value {
      width: 36px;
      font-size: 10px;
      color: var(--pf-color-text-muted, #808080);
      text-align: right;
      font-family: monospace;
    }

    .hex-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }

    .hex-label {
      font-size: 11px;
      color: var(--pf-color-text-muted, #808080);
    }

    .hex-input {
      flex: 1;
      padding: 6px 8px;
      background: var(--pf-color-bg-surface, #2a2a2a);
      border: 1px solid var(--pf-color-border, #333);
      border-radius: 4px;
      color: var(--pf-color-text-main, #e0e0e0);
      font-size: 12px;
      font-family: monospace;
    }

    .hex-input:focus {
      outline: none;
      border-color: var(--pf-color-accent, #4a9eff);
    }

    .hex-input.invalid {
      border-color: var(--pf-color-accent-red, #e53935);
    }

    .color-preview {
      width: 32px;
      height: 32px;
      border-radius: 4px;
      border: 1px solid var(--pf-color-border, #333);
    }

    .buttons {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }

    .btn {
      padding: 6px 14px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .btn-cancel {
      background: var(--pf-color-bg-surface, #2a2a2a);
      border: 1px solid var(--pf-color-border, #333);
      color: var(--pf-color-text-muted, #808080);
    }

    .btn-cancel:hover {
      background: var(--pf-color-bg-hover, #3a3a3a);
      color: var(--pf-color-text-main, #e0e0e0);
    }

    .btn-apply {
      background: var(--pf-color-accent, #4a9eff);
      border: none;
      color: white;
    }

    .btn-apply:hover {
      opacity: 0.9;
    }
  `;

  @property({ type: Boolean }) open = false;
  @property({ type: String }) color = '#ff0000';
  @property({ type: Number }) paletteIndex = 0;
  @property({ type: Object }) anchorElement: HTMLElement | null = null;

  // Using HSV (Hue-Saturation-Value) for the picker, not HSL
  // HSV maps better to the visual gradient picker
  @state() private h = 0;   // 0-360
  @state() private s = 100; // 0-100 (saturation)
  @state() private v = 100; // 0-100 (value/brightness)
  @state() private hexInput = '';
  @state() private hexInvalid = false;
  @state() private isDraggingSL = false;
  @state() private isDraggingHue = false;

  @query('.popup') private popupEl!: HTMLElement;
  @query('.saturation-lightness') private slArea!: HTMLElement;
  @query('.hue-bar') private hueBar!: HTMLElement;

  // Popup dimensions (approximate)
  private static readonly POPUP_WIDTH = 240;
  private static readonly POPUP_HEIGHT = 360;
  private static readonly GAP = 8;

  private boundHandleOutsideClick = this.handleOutsideClick.bind(this);
  private boundHandleKeyDown = this.handleKeyDown.bind(this);

  protected updated(changedProps: PropertyValues) {
    if (changedProps.has('color') && this.color) {
      this.setFromHex(this.color);
    }
    if (changedProps.has('open')) {
      if (this.open) {
        this.hexInput = this.color;
        this.popupEl?.showPopover();
        this.positionPopup();
        // Add listeners after a frame to avoid catching the opening click
        requestAnimationFrame(() => {
          document.addEventListener('mousedown', this.boundHandleOutsideClick);
          document.addEventListener('keydown', this.boundHandleKeyDown);
        });
      } else {
        this.popupEl?.hidePopover();
        document.removeEventListener('mousedown', this.boundHandleOutsideClick);
        document.removeEventListener('keydown', this.boundHandleKeyDown);
      }
    }
    if (changedProps.has('anchorElement') && this.open) {
      this.positionPopup();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('mousedown', this.boundHandleOutsideClick);
    document.removeEventListener('keydown', this.boundHandleKeyDown);
  }

  private handleOutsideClick(e: MouseEvent) {
    // Check if click is outside the popup
    const path = e.composedPath();
    if (!path.includes(this.popupEl)) {
      this.handleCancel();
    }
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      this.handleCancel();
    }
  }

  private positionPopup() {
    if (!this.popupEl || !this.anchorElement) return;

    const anchorRect = this.anchorElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const gap = PFColorPickerPopup.GAP;

    // Get actual popup dimensions after it's shown
    const popupRect = this.popupEl.getBoundingClientRect();
    const popupWidth = popupRect.width || PFColorPickerPopup.POPUP_WIDTH;
    const popupHeight = popupRect.height || PFColorPickerPopup.POPUP_HEIGHT;

    // Try positions in order of preference
    const positions = [
      // Bottom-right of anchor
      { top: anchorRect.bottom + gap, left: anchorRect.right + gap },
      // Bottom-left of anchor
      { top: anchorRect.bottom + gap, left: anchorRect.left - popupWidth - gap },
      // Top-right of anchor
      { top: anchorRect.top - popupHeight - gap, left: anchorRect.right + gap },
      // Top-left of anchor
      { top: anchorRect.top - popupHeight - gap, left: anchorRect.left - popupWidth - gap },
      // Right of anchor (centered vertically)
      { top: anchorRect.top + anchorRect.height / 2 - popupHeight / 2, left: anchorRect.right + gap },
      // Left of anchor (centered vertically)
      { top: anchorRect.top + anchorRect.height / 2 - popupHeight / 2, left: anchorRect.left - popupWidth - gap },
    ];

    // Find first position that fits in viewport
    let bestPosition = positions[0];
    for (const pos of positions) {
      const fitsHorizontally = pos.left >= 0 && pos.left + popupWidth <= viewportWidth;
      const fitsVertically = pos.top >= 0 && pos.top + popupHeight <= viewportHeight;
      if (fitsHorizontally && fitsVertically) {
        bestPosition = pos;
        break;
      }
    }

    // Clamp to viewport bounds as last resort
    bestPosition.left = Math.max(gap, Math.min(bestPosition.left, viewportWidth - popupWidth - gap));
    bestPosition.top = Math.max(gap, Math.min(bestPosition.top, viewportHeight - popupHeight - gap));

    this.popupEl.style.top = `${bestPosition.top}px`;
    this.popupEl.style.left = `${bestPosition.left}px`;
  }

  private setFromHex(hex: string) {
    const rgb = this.hexToRgb(hex);
    if (rgb) {
      const hsv = this.rgbToHsv(rgb.r, rgb.g, rgb.b);
      this.h = hsv.h;
      this.s = hsv.s;
      this.v = hsv.v;
      this.hexInput = hex;
    }
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  private rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;

    let h = 0;
    const s = max === 0 ? 0 : d / max;
    const v = max;

    if (max !== min) {
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }

    return { h: Math.round(h * 360), s: Math.round(s * 100), v: Math.round(v * 100) };
  }

  private hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
    s /= 100;
    v /= 100;

    const c = v * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = v - c;

    let r = 0, g = 0, b = 0;

    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }

    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255)
    };
  }

  private hsvToHex(h: number, s: number, v: number): string {
    const rgb = this.hsvToRgb(h, s, v);
    return '#' +
      rgb.r.toString(16).padStart(2, '0') +
      rgb.g.toString(16).padStart(2, '0') +
      rgb.b.toString(16).padStart(2, '0');
  }

  private get currentHex(): string {
    return this.hsvToHex(this.h, this.s, this.v);
  }

  // Saturation-Lightness area handlers
  private handleSLMouseDown(e: MouseEvent) {
    this.isDraggingSL = true;
    this.updateSL(e);
    window.addEventListener('mousemove', this.handleSLMouseMove);
    window.addEventListener('mouseup', this.handleSLMouseUp);
  }

  private handleSLMouseMove = (e: MouseEvent) => {
    if (this.isDraggingSL) {
      this.updateSL(e);
    }
  };

  private handleSLMouseUp = () => {
    this.isDraggingSL = false;
    window.removeEventListener('mousemove', this.handleSLMouseMove);
    window.removeEventListener('mouseup', this.handleSLMouseUp);
  };

  private updateSL(e: MouseEvent) {
    const rect = this.slArea.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    // x = saturation (left=0, right=100)
    // y = value/brightness (top=100, bottom=0)
    this.s = Math.round(x * 100);
    this.v = Math.round((1 - y) * 100);
    this.hexInput = this.currentHex;
    this.hexInvalid = false;
  }

  // Hue bar handlers
  private handleHueMouseDown(e: MouseEvent) {
    this.isDraggingHue = true;
    this.updateHue(e);
    window.addEventListener('mousemove', this.handleHueMouseMove);
    window.addEventListener('mouseup', this.handleHueMouseUp);
  }

  private handleHueMouseMove = (e: MouseEvent) => {
    if (this.isDraggingHue) {
      this.updateHue(e);
    }
  };

  private handleHueMouseUp = () => {
    this.isDraggingHue = false;
    window.removeEventListener('mousemove', this.handleHueMouseMove);
    window.removeEventListener('mouseup', this.handleHueMouseUp);
  };

  private updateHue(e: MouseEvent) {
    const rect = this.hueBar.getBoundingClientRect();
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    this.h = Math.round(y * 360);
    this.hexInput = this.currentHex;
    this.hexInvalid = false;
  }

  // Slider handlers
  private handleSliderChange(type: 'h' | 's' | 'v', e: Event) {
    const value = parseInt((e.target as HTMLInputElement).value);
    if (type === 'h') this.h = value;
    else if (type === 's') this.s = value;
    else if (type === 'v') this.v = value;
    this.hexInput = this.currentHex;
    this.hexInvalid = false;
  }

  // Hex input handler
  private handleHexInput(e: Event) {
    let value = (e.target as HTMLInputElement).value;
    this.hexInput = value;

    // Add # if missing
    if (value && !value.startsWith('#')) {
      value = '#' + value;
    }

    // Validate and apply
    if (/^#([a-fA-F0-9]{6})$/i.test(value)) {
      this.setFromHex(value.toLowerCase());
      this.hexInvalid = false;
    } else if (/^#([a-fA-F0-9]{3})$/i.test(value)) {
      // Expand 3-char hex
      const expanded = '#' + value[1] + value[1] + value[2] + value[2] + value[3] + value[3];
      this.setFromHex(expanded.toLowerCase());
      this.hexInvalid = false;
    } else if (value.length > 1) {
      this.hexInvalid = true;
    }
  }

  private handleApply() {
    this.dispatchEvent(new CustomEvent('apply', {
      detail: { color: this.currentHex, paletteIndex: this.paletteIndex },
      bubbles: true,
      composed: true
    }));
  }

  private handleCancel() {
    this.dispatchEvent(new CustomEvent('cancel', {
      bubbles: true,
      composed: true
    }));
  }

  render() {
    // HSV gradient:
    // - Horizontal: saturation (white on left, pure hue on right)
    // - Vertical: value/brightness (full brightness on top, black on bottom)
    const svGradient = `
      linear-gradient(to bottom, transparent, #000),
      linear-gradient(to right, #fff, hsl(${this.h}, 100%, 50%))
    `;

    // Calculate cursor positions
    const svCursorX = this.s;
    const svCursorY = 100 - this.v;
    const hueCursorY = (this.h / 360) * 100;

    return html`
      <div
        class="popup"
        popover="manual"
      >
        <div class="picker-area">
          <div
            class="saturation-lightness"
            @mousedown=${this.handleSLMouseDown}
          >
            <div class="sl-gradient" style="background: ${svGradient}"></div>
            <div
              class="sl-cursor"
              style="left: ${svCursorX}%; top: ${svCursorY}%; background: ${this.currentHex}"
            ></div>
          </div>
          <div
            class="hue-bar"
            @mousedown=${this.handleHueMouseDown}
          >
            <div class="hue-cursor" style="top: ${hueCursorY}%"></div>
          </div>
        </div>

        <div class="sliders-section">
          <div class="slider-row">
            <span class="slider-label">H</span>
            <input
              type="range"
              class="slider-input"
              min="0"
              max="360"
              .value=${String(this.h)}
              @input=${(e: Event) => this.handleSliderChange('h', e)}
            />
            <span class="slider-value">${this.h}°</span>
          </div>
          <div class="slider-row">
            <span class="slider-label">S</span>
            <input
              type="range"
              class="slider-input"
              min="0"
              max="100"
              .value=${String(this.s)}
              @input=${(e: Event) => this.handleSliderChange('s', e)}
            />
            <span class="slider-value">${this.s}%</span>
          </div>
          <div class="slider-row">
            <span class="slider-label">V</span>
            <input
              type="range"
              class="slider-input"
              min="0"
              max="100"
              .value=${String(this.v)}
              @input=${(e: Event) => this.handleSliderChange('v', e)}
            />
            <span class="slider-value">${this.v}%</span>
          </div>
        </div>

        <div class="hex-row">
          <span class="hex-label">Hex</span>
          <input
            type="text"
            class="hex-input ${this.hexInvalid ? 'invalid' : ''}"
            .value=${this.hexInput}
            @input=${this.handleHexInput}
          />
          <div class="color-preview" style="background: ${this.currentHex}"></div>
        </div>

        <div class="buttons">
          <button class="btn btn-cancel" @click=${this.handleCancel}>Cancel</button>
          <button class="btn btn-apply" @click=${this.handleApply}>Apply</button>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pf-color-picker-popup': PFColorPickerPopup;
  }
}
