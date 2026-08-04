import { css, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { defaultProjectContext, type ProjectContext } from '../../stores/project-context';

// PROTOTYPE: three angled-guide interaction models on the existing editor viewport.
// Switch with ?prototype=angled-guides&variant=A|B|C. No guide state is persisted.

type VariantId = 'A' | 'B' | 'C';
type PixelSlope = '1:1' | '2:1' | '1:2';

interface VariantDefinition {
  id: VariantId;
  name: string;
  question: string;
}

const variants: VariantDefinition[] = [
  {
    id: 'A',
    name: '45° quick guide',
    question: 'Is one simple diagonal enough?',
  },
  {
    id: 'B',
    name: 'Free-angle guide tool',
    question: 'Does arbitrary precision earn its complexity?',
  },
  {
    id: 'C',
    name: 'Pixel-slope compass',
    question: 'Should pixel-native slopes define the power boundary?',
  },
];

const slopeAngles: Record<PixelSlope, number> = {
  '1:1': 45,
  '2:1': 26.565,
  '1:2': 63.435,
};

@customElement('pf-angled-guides-prototype')
export class PFAngledGuidesPrototype extends BaseComponent {
  static styles = css`
    :host {
      position: absolute;
      z-index: 102;
      inset: 0;
      overflow: hidden;
      pointer-events: none;
      color: var(--pf-color-text-main, #f2f5f8);
      font:
        11px/1.35 system-ui,
        sans-serif;
    }

    * {
      box-sizing: border-box;
    }

    button,
    input {
      font: inherit;
    }

    button,
    input,
    label,
    .anchor-handle,
    .angle-handle {
      pointer-events: auto;
    }

    button {
      min-height: 36px;
      border: 1px solid var(--pf-color-border, #3d4653);
      border-radius: 5px;
      background: var(--pf-color-bg-input, #222833);
      color: inherit;
      cursor: pointer;
    }

    button:hover {
      background: var(--pf-color-bg-hover, #303846);
    }

    button:focus-visible,
    input:focus-visible,
    .anchor-handle:focus-visible,
    .angle-handle:focus-visible {
      outline: 2px solid var(--pf-color-accent, #67a7ff);
      outline-offset: 2px;
    }

    .panel {
      position: absolute;
      overflow: hidden;
      border: 1px solid var(--pf-color-border, #3d4653);
      border-radius: 8px;
      background: color-mix(in srgb, var(--pf-color-bg-panel, #171c24) 94%, transparent);
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.4);
      pointer-events: auto;
      backdrop-filter: blur(12px);
    }

    .panel-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 11px;
      border-bottom: 1px solid var(--pf-color-border, #3d4653);
    }

    .eyebrow {
      display: block;
      margin-bottom: 2px;
      color: var(--pf-color-text-muted, #9aa5b5);
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .panel-title {
      margin: 0;
      font-size: 13px;
    }

    .scope-badge {
      flex: none;
      padding: 3px 5px;
      border: 1px solid var(--pf-color-border, #3d4653);
      border-radius: 999px;
      color: var(--pf-color-text-muted, #9aa5b5);
      font-size: 9px;
      white-space: nowrap;
    }

    .section {
      padding: 10px 11px;
      border-bottom: 1px solid var(--pf-color-border, #3d4653);
    }

    .section:last-child {
      border-bottom: 0;
    }

    .section-label {
      display: block;
      margin-bottom: 6px;
      color: var(--pf-color-text-muted, #9aa5b5);
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
    }

    .segmented {
      display: grid;
      grid-auto-columns: 1fr;
      grid-auto-flow: column;
      gap: 4px;
    }

    .segmented button[aria-pressed='true'],
    .toggle[aria-pressed='true'],
    .tool-button[aria-pressed='true'] {
      border-color: var(--pf-color-accent, #67a7ff);
      background: color-mix(in srgb, var(--pf-color-accent, #67a7ff) 20%, transparent);
      color: #fff;
    }

    .toggle-list {
      display: grid;
      gap: 5px;
    }

    .toggle {
      display: flex;
      width: 100%;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 8px;
      text-align: left;
    }

    .toggle-state {
      color: var(--pf-color-text-muted, #9aa5b5);
      font-size: 9px;
    }

    .plain-action {
      width: 100%;
      padding: 6px 8px;
    }

    .danger-action {
      border-color: rgba(235, 105, 105, 0.48);
      color: #ffaaaa;
    }

    .guide-line {
      position: absolute;
      left: var(--guide-x);
      top: var(--guide-y);
      width: 220vmax;
      border-top: 1px solid var(--pf-color-ember-rest, #52d9ff);
      filter: drop-shadow(0 0 2px rgba(82, 217, 255, 0.45));
      opacity: 0.92;
      transform: translate(-50%, -50%) rotate(var(--guide-angle));
      transform-origin: center;
    }

    .guide-line::after {
      position: absolute;
      right: 0;
      left: 0;
      top: -3px;
      border-top: 5px solid color-mix(in srgb, var(--pf-color-ember-rest, #52d9ff) 20%, transparent);
      content: '';
    }

    .guide-line.secondary {
      border-top-style: dashed;
      opacity: 0.62;
    }

    .guide-line.snap {
      border-top-color: #f6cd64;
      filter: drop-shadow(0 0 3px rgba(246, 205, 100, 0.55));
    }

    .guide-line.mirror {
      border-top-width: 2px;
    }

    .anchor-handle,
    .angle-handle {
      position: absolute;
      display: grid;
      width: 38px;
      height: 38px;
      place-items: center;
      border: 0;
      border-radius: 50%;
      background: transparent;
      transform: translate(-50%, -50%);
      touch-action: none;
      cursor: move;
    }

    .anchor-handle::before,
    .angle-handle::before {
      width: 12px;
      height: 12px;
      border: 2px solid #071018;
      border-radius: 50%;
      background: var(--pf-color-ember-rest, #52d9ff);
      box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.8);
      content: '';
    }

    .angle-handle {
      cursor: crosshair;
    }

    .angle-handle::before {
      border-radius: 3px;
      background: #f6cd64;
    }

    .line-label {
      position: absolute;
      padding: 3px 6px;
      border: 1px solid rgba(82, 217, 255, 0.6);
      border-radius: 4px;
      background: rgba(8, 14, 21, 0.9);
      color: #c8f4ff;
      font-size: 9px;
      transform: translate(12px, -28px);
      white-space: nowrap;
    }

    .creation-hint {
      position: absolute;
      top: 32px;
      left: 32px;
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 6px 8px;
      border: 1px solid var(--pf-color-border, #3d4653);
      border-radius: 5px;
      background: rgba(12, 17, 24, 0.88);
      color: var(--pf-color-text-muted, #9aa5b5);
      pointer-events: auto;
    }

    .creation-hint strong {
      color: var(--pf-color-text-main, #f2f5f8);
    }

    /* Variant A: one minimal session guide controlled from the ruler corner. */
    .quick-panel {
      top: 38px;
      right: 12px;
      width: 220px;
    }

    .corner-launcher {
      position: absolute;
      top: 0;
      left: 0;
      display: grid;
      width: 24px;
      height: 24px;
      min-height: 24px;
      place-items: center;
      padding: 0;
      border: 0;
      border-radius: 0;
      background: #1e2731;
      color: var(--pf-color-ember-rest, #52d9ff);
      pointer-events: auto;
    }

    .direction-glyph {
      font-size: 17px;
      line-height: 1;
    }

    .axis-readout {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 6px;
      align-items: center;
      color: var(--pf-color-text-muted, #9aa5b5);
    }

    /* Variant B: a dedicated guide tool with explicit arbitrary-angle properties. */
    .tool-rail {
      position: absolute;
      top: 50%;
      left: 34px;
      display: grid;
      gap: 4px;
      padding: 4px;
      border: 1px solid var(--pf-color-border, #3d4653);
      border-radius: 7px;
      background: rgba(14, 19, 27, 0.94);
      pointer-events: auto;
      transform: translateY(-50%);
    }

    .tool-button {
      width: 40px;
      min-height: 40px;
      padding: 0;
    }

    .properties-panel {
      top: 38px;
      right: 12px;
      width: 244px;
    }

    .angle-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 62px;
      gap: 8px;
      align-items: center;
    }

    .angle-row input[type='range'] {
      width: 100%;
      accent-color: var(--pf-color-accent, #67a7ff);
    }

    .angle-row input[type='number'] {
      width: 62px;
      min-height: 34px;
      border: 1px solid var(--pf-color-border, #3d4653);
      border-radius: 4px;
      background: var(--pf-color-bg-input, #222833);
      color: inherit;
      text-align: center;
    }

    .guide-list {
      display: grid;
      gap: 4px;
    }

    .guide-list button {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 7px;
      align-items: center;
      padding: 6px 7px;
      text-align: left;
    }

    .guide-swatch {
      width: 16px;
      border-top: 2px solid var(--pf-color-ember-rest, #52d9ff);
      transform: rotate(-25deg);
    }

    /* Variant C: a touch-first bottom sheet of pixel-native slope presets. */
    .slope-sheet {
      right: 12px;
      bottom: 84px;
      left: 36px;
      display: grid;
      grid-template-columns: minmax(180px, 1fr) minmax(190px, 0.8fr) minmax(170px, 0.7fr);
    }

    .slope-sheet .section {
      border-right: 1px solid var(--pf-color-border, #3d4653);
      border-bottom: 0;
    }

    .slope-sheet .section:last-child {
      border-right: 0;
    }

    .slope-options {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 5px;
    }

    .slope-option {
      min-height: 54px;
      padding: 5px;
    }

    .slope-option strong,
    .slope-option span {
      display: block;
    }

    .slope-option span {
      margin-top: 2px;
      color: var(--pf-color-text-muted, #9aa5b5);
      font-size: 9px;
    }

    .slope-option[aria-pressed='true'] {
      border-color: var(--pf-color-accent, #67a7ff);
      background: color-mix(in srgb, var(--pf-color-accent, #67a7ff) 20%, transparent);
    }

    .pixel-step {
      position: absolute;
      top: 34px;
      left: 36px;
      padding: 7px 9px;
      border: 1px solid rgba(246, 205, 100, 0.52);
      border-radius: 5px;
      background: rgba(12, 17, 24, 0.9);
      color: #f6dc91;
      pointer-events: auto;
    }

    .pixel-step strong,
    .pixel-step span {
      display: block;
    }

    .pixel-step span {
      margin-top: 2px;
      color: var(--pf-color-text-muted, #9aa5b5);
      font-size: 9px;
    }

    /* Shared prototype switcher. */
    .variant-switcher {
      position: fixed;
      z-index: 10000;
      bottom: 24px;
      left: 50%;
      display: grid;
      width: min(570px, calc(100vw - 24px));
      grid-template-columns: 42px minmax(0, 1fr) 42px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 9px;
      background: rgba(12, 16, 22, 0.97);
      box-shadow: 0 12px 38px rgba(0, 0, 0, 0.5);
      color: #f4f6f9;
      pointer-events: auto;
      transform: translateX(-50%);
      backdrop-filter: blur(12px);
    }

    .switch-arrow,
    .switch-label {
      min-height: 48px;
      border: 0;
      border-radius: 0;
      background: transparent;
    }

    .switch-arrow {
      color: #b5bfcd;
      font-size: 18px;
    }

    .switch-label strong,
    .switch-label span {
      display: block;
    }

    .switch-label strong {
      font-size: 12px;
    }

    .switch-label span {
      margin-top: 2px;
      color: #9fa9b8;
      font-size: 10px;
    }

    .prototype-notice {
      position: fixed;
      z-index: 9999;
      right: 14px;
      bottom: 86px;
      max-width: 270px;
      padding: 7px 9px;
      border: 1px solid var(--pf-color-border, #3d4653);
      border-radius: 5px;
      background: rgba(12, 17, 24, 0.94);
      color: var(--pf-color-text-muted, #9aa5b5);
      pointer-events: auto;
    }

    @media (max-width: 760px) {
      .quick-panel,
      .properties-panel {
        top: auto;
        right: 8px;
        bottom: 82px;
        left: 32px;
        width: auto;
      }

      .tool-rail {
        top: 36px;
        right: 8px;
        left: auto;
        grid-auto-flow: column;
        transform: none;
      }

      .slope-sheet {
        right: 8px;
        bottom: 82px;
        left: 32px;
        grid-template-columns: 1fr;
        max-height: min(55vh, 430px);
        overflow-y: auto;
      }

      .slope-sheet .section {
        border-right: 0;
        border-bottom: 1px solid var(--pf-color-border, #3d4653);
      }

      .creation-hint,
      .pixel-step {
        top: 66px;
      }
    }
  `;

  @state() private variant: VariantId = this.variantFromUrl();
  @state() private anchorX = 16;
  @state() private anchorY = 16;
  @state() private direction: '/' | '\\' = '/';
  @state() private arbitraryAngle = 32;
  @state() private pixelSlope: PixelSlope = '2:1';
  @state() private paired = true;
  @state() private visible = true;
  @state() private snapping = true;
  @state() private mirroring = false;
  @state() private notice = '';

  private context: ProjectContext = defaultProjectContext;
  private dragging: 'anchor' | 'angle' | null = null;

  connectedCallback() {
    super.connectedCallback();
    this.subscribeToActiveProjectContext((context) => {
      this.context = context;
      this.centerAnchor();
    });
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('popstate', this.handlePopState);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('popstate', this.handlePopState);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.stopDragging);
  }

  private variantFromUrl(): VariantId {
    const value = new URLSearchParams(window.location.search).get('variant')?.toUpperCase();
    return value === 'B' || value === 'C' ? value : 'A';
  }

  private handlePopState = () => {
    this.variant = this.variantFromUrl();
  };

  private handleKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (
      target?.matches('input, textarea, select') ||
      target?.isContentEditable ||
      (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
    ) {
      return;
    }

    event.preventDefault();
    this.moveVariant(event.key === 'ArrowRight' ? 1 : -1);
  };

  private moveVariant(offset: number) {
    const currentIndex = variants.findIndex((variant) => variant.id === this.variant);
    const nextIndex = (currentIndex + offset + variants.length) % variants.length;
    this.selectVariant(variants[nextIndex].id);
  }

  private selectVariant(variant: VariantId) {
    const url = new URL(window.location.href);
    url.searchParams.set('prototype', 'angled-guides');
    url.searchParams.set('variant', variant);
    window.history.pushState({}, '', url);
    this.variant = variant;
    this.notice = '';
  }

  private centerAnchor() {
    this.anchorX = Math.round(this.context.project.width.value / 2);
    this.anchorY = Math.round(this.context.project.height.value / 2);
  }

  private startDragging(kind: 'anchor' | 'angle', event: PointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.dragging = kind;
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.stopDragging);
  }

  private handlePointerMove = (event: PointerEvent) => {
    if (!this.dragging) return;

    const rect = this.getBoundingClientRect();
    const { viewport, project } = this.context;
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;

    if (this.dragging === 'anchor') {
      this.anchorX = Math.round(
        Math.max(
          0,
          Math.min(project.width.value, (screenX - viewport.panX.value) / viewport.zoom.value)
        )
      );
      this.anchorY = Math.round(
        Math.max(
          0,
          Math.min(project.height.value, (screenY - viewport.panY.value) / viewport.zoom.value)
        )
      );
      return;
    }

    const anchor = this.anchorScreenPosition();
    const degrees = (Math.atan2(screenY - anchor.y, screenX - anchor.x) * 180) / Math.PI;
    const normalized = ((degrees % 180) + 180) % 180;
    this.arbitraryAngle = Math.round(normalized);
  };

  private stopDragging = () => {
    this.dragging = null;
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.stopDragging);
  };

  private anchorScreenPosition() {
    const { viewport } = this.context;
    return {
      x: viewport.panX.value + this.anchorX * viewport.zoom.value,
      y: viewport.panY.value + this.anchorY * viewport.zoom.value,
    };
  }

  private showNotice(message: string) {
    this.notice = `${message} — prototype only; no project state changed.`;
  }

  private renderGuide(angle: number, options: { secondary?: boolean; label?: string } = {}) {
    if (!this.visible) return nothing;

    const anchor = this.anchorScreenPosition();
    const classes = [
      'guide-line',
      options.secondary ? 'secondary' : '',
      this.snapping ? 'snap' : '',
      this.mirroring ? 'mirror' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return html`
      <div
        class=${classes}
        style="--guide-x: ${anchor.x}px; --guide-y: ${anchor.y}px; --guide-angle: ${angle}deg"
      ></div>
      ${
        options.label
          ? html`<span class="line-label" style="left: ${anchor.x}px; top: ${anchor.y}px">
              ${options.label}
            </span>`
          : nothing
      }
    `;
  }

  private renderAnchorHandle() {
    const anchor = this.anchorScreenPosition();
    return html`
      <button
        class="anchor-handle"
        style="left: ${anchor.x}px; top: ${anchor.y}px"
        aria-label="Move guide anchor. Current position ${this.anchorX}, ${this.anchorY}"
        @pointerdown=${(event: PointerEvent) => this.startDragging('anchor', event)}
      ></button>
    `;
  }

  private renderAngleHandle() {
    const anchor = this.anchorScreenPosition();
    const radians = (this.arbitraryAngle * Math.PI) / 180;
    const distance = 110;
    const x = anchor.x + Math.cos(radians) * distance;
    const y = anchor.y + Math.sin(radians) * distance;

    return html`
      <button
        class="angle-handle"
        style="left: ${x}px; top: ${y}px"
        aria-label="Change guide angle. Current angle ${this.arbitraryAngle} degrees"
        @pointerdown=${(event: PointerEvent) => this.startDragging('angle', event)}
      ></button>
    `;
  }

  private renderBehaviorToggles() {
    return html`
      <div class="toggle-list">
        <button
          class="toggle"
          aria-pressed=${this.visible}
          @click=${() => (this.visible = !this.visible)}
        >
          <span>Show guide</span><span class="toggle-state">${this.visible ? 'On' : 'Off'}</span>
        </button>
        <button
          class="toggle"
          aria-pressed=${this.snapping}
          @click=${() => (this.snapping = !this.snapping)}
        >
          <span>Snap tools</span><span class="toggle-state">${this.snapping ? 'On' : 'Off'}</span>
        </button>
        <button
          class="toggle"
          aria-pressed=${this.mirroring}
          @click=${() => (this.mirroring = !this.mirroring)}
        >
          <span>Mirror drawing</span
          ><span class="toggle-state">${this.mirroring ? 'On' : 'Off'}</span>
        </button>
      </div>
    `;
  }

  private renderVariantA() {
    const angle = this.direction === '/' ? -45 : 45;

    return html`
      ${this.renderGuide(angle, { label: `${this.direction} 45° · ${this.anchorX}, ${this.anchorY}` })}
      ${this.renderAnchorHandle()}

      <button
        class="corner-launcher"
        aria-label="Place a 45 degree guide at canvas center"
        @click=${this.centerAnchor}
      >
        <span class="direction-glyph">◩</span>
      </button>
      <div class="creation-hint">
        <strong>45° guide</strong><span>Drag from the ruler corner, or tap ◩</span>
      </div>

      <aside class="panel quick-panel" aria-label="45 degree guide controls">
        <header class="panel-header">
          <div>
            <span class="eyebrow">Variant A · minimal</span>
            <h2 class="panel-title">Diagonal guide</h2>
          </div>
          <span class="scope-badge">Session only</span>
        </header>
        <section class="section">
          <span class="section-label">Direction</span>
          <div class="segmented">
            <button aria-pressed=${this.direction === '/'} @click=${() => (this.direction = '/')}>
              ／
            </button>
            <button aria-pressed=${this.direction === '\\'} @click=${() => (this.direction = '\\')}>
              ＼
            </button>
          </div>
        </section>
        <section class="section">
          <span class="section-label">Anchor</span>
          <div class="axis-readout">
            <span>X ${this.anchorX} · Y ${this.anchorY}</span>
            <button @click=${this.centerAnchor}>Center</button>
          </div>
        </section>
        <section class="section">${this.renderBehaviorToggles()}</section>
        <section class="section">
          <button class="plain-action danger-action" @click=${() => (this.visible = false)}>
            Remove guide
          </button>
        </section>
      </aside>
    `;
  }

  private renderVariantB() {
    return html`
      ${this.renderGuide(this.arbitraryAngle, { label: `${this.arbitraryAngle}° · Guide 1` })}
      ${this.renderAnchorHandle()} ${this.renderAngleHandle()}

      <div class="tool-rail" aria-label="Prototype tool rail">
        <button class="tool-button" aria-label="Pencil tool">✎</button>
        <button class="tool-button" aria-label="Selection tool">▣</button>
        <button class="tool-button" aria-pressed="true" aria-label="Guide tool">╱</button>
      </div>

      <div class="creation-hint">
        <strong>Guide tool</strong><span>Drag two points across the canvas</span>
      </div>

      <aside class="panel properties-panel" aria-label="Free-angle guide properties">
        <header class="panel-header">
          <div>
            <span class="eyebrow">Variant B · precision</span>
            <h2 class="panel-title">Guide properties</h2>
          </div>
          <span class="scope-badge">Saved in project</span>
        </header>
        <section class="section">
          <span class="section-label">Angle</span>
          <div class="angle-row">
            <input
              type="range"
              min="0"
              max="179"
              .value=${String(this.arbitraryAngle)}
              aria-label="Guide angle"
              @input=${(event: Event) =>
                (this.arbitraryAngle = Number((event.target as HTMLInputElement).value))}
            />
            <input
              type="number"
              min="0"
              max="179"
              .value=${String(this.arbitraryAngle)}
              aria-label="Guide angle in degrees"
              @change=${(event: Event) =>
                (this.arbitraryAngle = Math.max(
                  0,
                  Math.min(179, Number((event.target as HTMLInputElement).value))
                ))}
            />
          </div>
        </section>
        <section class="section">
          <span class="section-label">Guides</span>
          <div class="guide-list">
            <button aria-pressed="true">
              <span class="guide-swatch"></span><span>Guide 1</span
              ><span>${this.arbitraryAngle}°</span>
            </button>
            <button @click=${() => this.showNotice('Added another free-angle guide')}>
              <span>＋</span><span>Add guide</span><span></span>
            </button>
          </div>
        </section>
        <section class="section">${this.renderBehaviorToggles()}</section>
        <section class="section">
          <button class="plain-action danger-action" @click=${() => (this.visible = false)}>
            Delete selected guide
          </button>
        </section>
      </aside>
    `;
  }

  private renderVariantC() {
    const angle = slopeAngles[this.pixelSlope];
    const degreeLabel = `${Math.round(angle * 10) / 10}°`;

    return html`
      ${this.renderGuide(-angle, { label: `${this.pixelSlope} pixels · ${degreeLabel}` })}
      ${this.paired ? this.renderGuide(angle, { secondary: true }) : nothing}
      ${this.renderAnchorHandle()}

      <div class="pixel-step">
        <strong>${this.pixelSlope} pixel slope ${this.paired ? 'pair' : 'guide'}</strong>
        <span>Anchor ${this.anchorX}, ${this.anchorY} · project-saved</span>
      </div>

      <aside class="panel slope-sheet" aria-label="Pixel slope guide controls">
        <section class="section">
          <span class="eyebrow">Variant C · pixel-native</span>
          <h2 class="panel-title">Choose a pixel slope</h2>
          <div class="slope-options" style="margin-top: 8px">
            ${(['1:1', '2:1', '1:2'] as const).map(
              (slope) => html`
                <button
                  class="slope-option"
                  aria-pressed=${this.pixelSlope === slope}
                  @click=${() => (this.pixelSlope = slope)}
                >
                  <strong>${slope}</strong>
                  <span>${Math.round(slopeAngles[slope] * 10) / 10}°</span>
                </button>
              `
            )}
          </div>
        </section>
        <section class="section">
          <span class="section-label">Arrangement</span>
          <div class="segmented">
            <button aria-pressed=${!this.paired} @click=${() => (this.paired = false)}>
              Single
            </button>
            <button aria-pressed=${this.paired} @click=${() => (this.paired = true)}>
              Mirrored pair
            </button>
          </div>
          <button class="plain-action" style="margin-top: 6px" @click=${this.centerAnchor}>
            Center on canvas
          </button>
        </section>
        <section class="section">
          <span class="section-label">Behavior</span>
          ${this.renderBehaviorToggles()}
        </section>
      </aside>
    `;
  }

  private renderSwitcher() {
    const current = variants.find((variant) => variant.id === this.variant) ?? variants[0];
    return html`
      <nav class="variant-switcher" aria-label="Angled guide prototype variants">
        <button
          class="switch-arrow"
          @click=${() => this.moveVariant(-1)}
          aria-label="Previous variant"
        >
          ←
        </button>
        <button class="switch-label" @click=${() => this.moveVariant(1)} title="Switch variant">
          <strong>${current.id} · ${current.name}</strong>
          <span>${current.question} · Use ← →</span>
        </button>
        <button class="switch-arrow" @click=${() => this.moveVariant(1)} aria-label="Next variant">
          →
        </button>
      </nav>
    `;
  }

  render() {
    if (!import.meta.env.DEV) return nothing;

    const { project, viewport } = this.context;
    void project.width.value;
    void project.height.value;
    void viewport.panX.value;
    void viewport.panY.value;
    void viewport.zoom.value;

    return html`
      ${
        this.variant === 'A'
          ? this.renderVariantA()
          : this.variant === 'B'
            ? this.renderVariantB()
            : this.renderVariantC()
      }
      ${this.notice ? html`<div class="prototype-notice" role="status">${this.notice}</div>` : nothing}
      ${this.renderSwitcher()}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pf-angled-guides-prototype': PFAngledGuidesPrototype;
  }
}
