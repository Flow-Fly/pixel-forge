import { css, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';

type VariantId = 'A' | 'B' | 'C';
type HistoryView = 'session' | 'recovery';

interface VariantDefinition {
  id: VariantId;
  name: string;
  question: string;
}

const variants: VariantDefinition[] = [
  {
    id: 'A',
    name: 'Command ledger',
    question: 'Can familiar undo stay primary while recovery remains separate?',
  },
  {
    id: 'B',
    name: 'Activity story',
    question: 'Do semantic groups make a long drawing session easier to navigate?',
  },
  {
    id: 'C',
    name: 'Safety center',
    question: 'Should recovery confidence lead, with undo kept compact?',
  },
];

const sessionEntries = [
  { id: 'highlights', label: 'Paint highlights', detail: 'Pencil · Face · Frame 1', time: 'Now' },
  { id: 'palette', label: 'Change palette color', detail: 'Rose 4 → Rose 3', time: '12s' },
  { id: 'shadow', label: 'Shade jacket', detail: 'Pencil · Jacket · Frame 1', time: '24s' },
  { id: 'move', label: 'Move left arm', detail: 'Selection · 3 px right', time: '1m' },
  { id: 'outline', label: 'Clean outline', detail: 'Eraser · Character · Frame 1', time: '2m' },
];

const recoveryEntries = [
  {
    id: 'recovery-now',
    label: 'Latest local checkpoint',
    time: '10:43',
    detail: '4.8 MB · current device',
  },
  {
    id: 'recovery-previous',
    label: 'Before palette cleanup',
    time: '10:36',
    detail: '4.6 MB · current device',
  },
  {
    id: 'recovery-open',
    label: 'When project opened',
    time: '09:58',
    detail: '4.1 MB · current device',
  },
];

@customElement('pf-history-prototype')
export class PFHistoryPrototype extends BaseComponent {
  static styles = css`
    :host {
      display: flex;
      min-height: 0;
      height: 100%;
      color: var(--pf-color-text-main);
      font-size: 11px;
    }

    * {
      box-sizing: border-box;
    }

    button {
      font: inherit;
    }

    .prototype {
      display: flex;
      flex: 1;
      min-width: 0;
      min-height: 0;
      flex-direction: column;
      overflow: hidden;
      background: var(--pf-color-bg-panel);
    }

    .eyebrow {
      margin: 0;
      color: var(--pf-color-text-muted);
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .prototype-title {
      margin: 3px 0 0;
      font-size: 13px;
      line-height: 1.25;
    }

    .muted {
      color: var(--pf-color-text-muted);
    }

    .scroll-area {
      min-height: 0;
      overflow-y: auto;
      scrollbar-width: thin;
    }

    .icon-button,
    .quiet-button,
    .primary-button,
    .tab,
    .history-row,
    .recovery-card,
    .story-card,
    .mini-command,
    .switch-button,
    .switch-arrow {
      border: 0;
      color: inherit;
      cursor: pointer;
    }

    button:focus-visible {
      outline: 2px solid var(--pf-color-accent, #62a8ff);
      outline-offset: 2px;
    }

    .quiet-button,
    .primary-button {
      min-height: 28px;
      border-radius: 4px;
      padding: 5px 8px;
      font-weight: 600;
    }

    .quiet-button {
      border: 1px solid var(--pf-color-border);
      background: var(--pf-color-bg-input, #20252d);
    }

    .primary-button {
      background: var(--pf-color-accent, #4e8ee8);
      color: #fff;
    }

    .quiet-button:hover,
    .icon-button:hover,
    .history-row:hover,
    .recovery-card:hover,
    .story-card:hover,
    .mini-command:hover {
      background: var(--pf-color-bg-hover);
    }

    .notice {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 7px 9px;
      border-top: 1px solid var(--pf-color-border);
      color: var(--pf-color-text-muted);
      background: var(--pf-color-bg-secondary, #191e25);
      font-size: 10px;
    }

    .notice::before {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #58b879;
      content: '';
    }

    /* Variant A: dense, familiar command ledger with explicit scopes. */
    .ledger-header {
      padding: 10px 9px 8px;
      border-bottom: 1px solid var(--pf-color-border);
    }

    .scope-summary {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      margin-top: 8px;
      color: var(--pf-color-text-muted);
      font-size: 10px;
    }

    .tabs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      padding: 4px;
      border-bottom: 1px solid var(--pf-color-border);
      gap: 3px;
      background: var(--pf-color-bg-secondary, #191e25);
    }

    .tab {
      border-radius: 3px;
      padding: 6px;
      background: transparent;
      color: var(--pf-color-text-muted);
    }

    .tab[aria-selected='true'] {
      background: var(--pf-color-bg-panel);
      color: var(--pf-color-text-main);
      box-shadow: 0 0 0 1px var(--pf-color-border);
    }

    .ledger-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      padding: 8px;
      border-bottom: 1px solid var(--pf-color-border);
    }

    .history-row {
      display: grid;
      width: 100%;
      grid-template-columns: 11px minmax(0, 1fr) auto;
      gap: 7px;
      padding: 7px 9px;
      border-bottom: 1px solid color-mix(in srgb, var(--pf-color-border) 55%, transparent);
      text-align: left;
      background: transparent;
    }

    .history-row[aria-pressed='true'] {
      background: color-mix(in srgb, var(--pf-color-accent, #4e8ee8) 16%, transparent);
    }

    .history-node {
      position: relative;
      width: 7px;
      height: 7px;
      margin-top: 3px;
      border: 2px solid var(--pf-color-text-muted);
      border-radius: 50%;
    }

    .history-node::after {
      position: absolute;
      top: 7px;
      left: 1px;
      width: 1px;
      height: 29px;
      background: var(--pf-color-border);
      content: '';
    }

    .history-row:last-child .history-node::after {
      display: none;
    }

    .row-copy,
    .story-copy {
      min-width: 0;
    }

    .row-title {
      display: block;
      overflow: hidden;
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .row-detail,
    .row-time {
      color: var(--pf-color-text-muted);
      font-size: 9px;
    }

    .row-detail {
      display: block;
      margin-top: 2px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .recovery-list {
      display: grid;
      gap: 6px;
      padding: 8px;
    }

    .scope-explainer {
      margin: 0;
      padding: 8px;
      border-bottom: 1px solid var(--pf-color-border);
      color: var(--pf-color-text-muted);
      line-height: 1.45;
    }

    .recovery-card {
      display: grid;
      width: 100%;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 3px 8px;
      padding: 8px;
      border: 1px solid var(--pf-color-border);
      border-radius: 4px;
      background: var(--pf-color-bg-secondary, #191e25);
      text-align: left;
    }

    .recovery-card strong {
      font-size: 10px;
    }

    .recovery-card span {
      color: var(--pf-color-text-muted);
      font-size: 9px;
    }

    /* Variant B: actions become human-readable groups on a visual story line. */
    .story-header {
      padding: 11px 10px 9px;
      background: linear-gradient(135deg, rgba(103, 86, 193, 0.2), transparent 65%);
      border-bottom: 1px solid var(--pf-color-border);
    }

    .story-summary {
      margin: 6px 0 0;
      color: var(--pf-color-text-muted);
      line-height: 1.4;
    }

    .story-line {
      position: relative;
      display: grid;
      gap: 8px;
      padding: 10px 8px 12px 18px;
    }

    .story-line::before {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 9px;
      width: 2px;
      background: linear-gradient(var(--pf-color-accent, #4e8ee8), var(--pf-color-border));
      content: '';
    }

    .story-card {
      position: relative;
      display: grid;
      width: 100%;
      grid-template-columns: 34px minmax(0, 1fr);
      gap: 8px;
      padding: 8px;
      border: 1px solid var(--pf-color-border);
      border-radius: 6px;
      background: var(--pf-color-bg-secondary, #191e25);
      text-align: left;
    }

    .story-card::before {
      position: absolute;
      top: 15px;
      left: -13px;
      width: 7px;
      height: 7px;
      border: 2px solid var(--pf-color-bg-panel);
      border-radius: 50%;
      background: var(--pf-color-accent, #4e8ee8);
      content: '';
    }

    .story-card[aria-pressed='true'] {
      border-color: var(--pf-color-accent, #4e8ee8);
    }

    .pixel-preview {
      display: grid;
      width: 34px;
      height: 34px;
      grid-template-columns: repeat(4, 1fr);
      grid-template-rows: repeat(4, 1fr);
      overflow: hidden;
      border: 1px solid var(--pf-color-border);
      border-radius: 3px;
      background: #202531;
      image-rendering: pixelated;
    }

    .pixel-preview i:nth-child(3n + 1),
    .pixel-preview i:nth-child(5) {
      background: #e48b72;
    }

    .pixel-preview i:nth-child(4n + 2) {
      background: #793f63;
    }

    .pixel-preview.blue i:nth-child(3n + 1) {
      background: #5792c7;
    }

    .pixel-preview.blue i:nth-child(4n + 2) {
      background: #27455f;
    }

    .story-title {
      display: flex;
      justify-content: space-between;
      gap: 4px;
      font-weight: 700;
    }

    .story-meta {
      display: block;
      margin-top: 3px;
      color: var(--pf-color-text-muted);
      font-size: 9px;
      line-height: 1.35;
    }

    .checkpoint {
      margin-left: -9px;
      padding: 5px 7px;
      border: 1px dashed var(--pf-color-border);
      border-radius: 4px;
      color: var(--pf-color-text-muted);
      background: var(--pf-color-bg-panel);
      font-size: 9px;
    }

    .story-inspector {
      padding: 8px;
      border-top: 1px solid var(--pf-color-border);
      background: var(--pf-color-bg-secondary, #191e25);
    }

    .story-inspector strong {
      display: block;
      margin-bottom: 6px;
    }

    .inspector-actions {
      display: flex;
      gap: 6px;
    }

    /* Variant C: recovery confidence is the primary hierarchy. */
    .safety-header {
      padding: 11px 10px 10px;
      border-bottom: 1px solid var(--pf-color-border);
      background: linear-gradient(155deg, rgba(49, 145, 95, 0.22), transparent 60%);
    }

    .saved-state {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 8px;
      align-items: center;
      margin-top: 8px;
    }

    .saved-badge {
      display: grid;
      width: 34px;
      height: 34px;
      place-items: center;
      border: 1px solid rgba(88, 184, 121, 0.55);
      border-radius: 50%;
      background: rgba(88, 184, 121, 0.14);
      color: #74d494;
      font-size: 17px;
    }

    .saved-copy strong,
    .saved-copy span {
      display: block;
    }

    .saved-copy span {
      margin-top: 2px;
      color: var(--pf-color-text-muted);
      font-size: 9px;
    }

    .safety-section {
      padding: 9px;
      border-bottom: 1px solid var(--pf-color-border);
    }

    .section-heading {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 7px;
    }

    .section-heading h3 {
      margin: 0;
      font-size: 11px;
    }

    .section-heading span {
      color: var(--pf-color-text-muted);
      font-size: 9px;
    }

    .restore-hero {
      padding: 9px;
      border: 1px solid var(--pf-color-border);
      border-radius: 6px;
      background: var(--pf-color-bg-secondary, #191e25);
    }

    .restore-hero strong,
    .restore-hero span {
      display: block;
    }

    .restore-hero span {
      margin: 3px 0 8px;
      color: var(--pf-color-text-muted);
      font-size: 9px;
      line-height: 1.35;
    }

    .restore-actions {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 6px;
    }

    .compact-stack {
      display: grid;
      gap: 3px;
    }

    .mini-command {
      display: grid;
      width: 100%;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 6px;
      align-items: center;
      padding: 5px 6px;
      border-radius: 3px;
      background: transparent;
      text-align: left;
    }

    .mini-command[aria-pressed='true'] {
      background: var(--pf-color-bg-hover);
    }

    .command-type {
      display: grid;
      width: 18px;
      height: 18px;
      place-items: center;
      border-radius: 3px;
      background: var(--pf-color-bg-input, #20252d);
      color: var(--pf-color-text-muted);
      font-size: 9px;
    }

    .storage-meter {
      height: 4px;
      margin: 7px 0 4px;
      overflow: hidden;
      border-radius: 4px;
      background: var(--pf-color-bg-input, #20252d);
    }

    .storage-meter span {
      display: block;
      width: 28%;
      height: 100%;
      background: #58b879;
    }

    /* Fixed comparison control: intentionally available only through the dev-only prototype route. */
    .variant-switcher {
      position: fixed;
      z-index: 10000;
      bottom: 24px;
      left: 50%;
      display: grid;
      width: min(560px, calc(100vw - 24px));
      grid-template-columns: 38px minmax(0, 1fr) 38px;
      align-items: stretch;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 9px;
      background: rgba(17, 20, 26, 0.96);
      box-shadow: 0 10px 36px rgba(0, 0, 0, 0.45);
      color: #f4f6f9;
      transform: translateX(-50%);
      backdrop-filter: blur(12px);
    }

    .switch-arrow {
      background: transparent;
      color: #aeb6c4;
      font-size: 18px;
    }

    .switch-button {
      padding: 7px 10px;
      background: transparent;
      text-align: center;
    }

    .switch-button strong,
    .switch-button span {
      display: block;
    }

    .switch-button strong {
      font-size: 12px;
    }

    .switch-button span {
      margin-top: 2px;
      color: #9fa9b8;
      font-size: 10px;
    }

    .prototype-feedback {
      position: fixed;
      z-index: 9999;
      right: 16px;
      bottom: 92px;
      max-width: 260px;
      padding: 8px 10px;
      border: 1px solid var(--pf-color-border);
      border-radius: 5px;
      background: var(--pf-color-bg-panel);
      box-shadow: 0 7px 24px rgba(0, 0, 0, 0.35);
      font-size: 10px;
    }
  `;

  @state() private variant: VariantId = this.variantFromUrl();
  @state() private historyView: HistoryView = 'session';
  @state() private selectedId = 'highlights';
  @state() private feedback = '';

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('popstate', this.handlePopState);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('popstate', this.handlePopState);
  }

  private variantFromUrl(): VariantId {
    const candidate = new URLSearchParams(window.location.search).get('variant')?.toUpperCase();
    return candidate === 'B' || candidate === 'C' ? candidate : 'A';
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
    url.searchParams.set('prototype', 'history');
    url.searchParams.set('variant', variant);
    window.history.pushState({}, '', url);
    this.variant = variant;
    this.feedback = '';
  }

  private showFeedback(message: string) {
    this.feedback = `${message} — prototype only; no project data changed.`;
  }

  private renderPixelPreview(tone: 'rose' | 'blue' = 'rose') {
    return html`
      <span class="pixel-preview ${tone === 'blue' ? 'blue' : ''}" aria-hidden="true">
        ${Array.from({ length: 16 }, () => html`<i></i>`)}
      </span>
    `;
  }

  private renderVariantA() {
    return html`
      <div class="prototype">
        <header class="ledger-header">
          <p class="eyebrow">Variant A · familiar first</p>
          <h2 class="prototype-title">Command ledger</h2>
          <div class="scope-summary">
            <span>Session · 5 actions</span>
            <span>Clears when closed</span>
          </div>
        </header>

        <div class="tabs" role="tablist" aria-label="History scope">
          <button
            class="tab"
            role="tab"
            aria-selected=${this.historyView === 'session'}
            @click=${() => (this.historyView = 'session')}
          >
            Undo history
          </button>
          <button
            class="tab"
            role="tab"
            aria-selected=${this.historyView === 'recovery'}
            @click=${() => (this.historyView = 'recovery')}
          >
            Recovery
          </button>
        </div>

        ${
          this.historyView === 'session'
            ? html`
                <div class="ledger-actions">
                  <button
                    class="primary-button"
                    @click=${() => this.showFeedback('Undo one action')}
                  >
                    Undo
                  </button>
                  <button class="quiet-button" @click=${() => this.showFeedback('Redo one action')}>
                    Redo
                  </button>
                </div>
                <div class="scroll-area" aria-label="Session actions">
                  ${sessionEntries.map(
                  (entry) => html`
                    <button
                      class="history-row"
                      aria-pressed=${this.selectedId === entry.id}
                      @click=${() => (this.selectedId = entry.id)}
                    >
                      <span class="history-node" aria-hidden="true"></span>
                      <span class="row-copy">
                        <span class="row-title">${entry.label}</span>
                        <span class="row-detail">${entry.detail}</span>
                      </span>
                      <span class="row-time">${entry.time}</span>
                    </button>
                  `
                )}
                </div>
                <div class="notice">All changes are in this open session</div>
              `
            : html`
                <p class="scope-explainer">
                  Recovery checkpoints survive reloads on this device. Restoring creates a new copy.
                </p>
                <div class="scroll-area recovery-list">
                  ${recoveryEntries.map(
                  (entry) => html`
                    <button
                      class="recovery-card"
                      @click=${() => this.showFeedback(`Preview ${entry.label.toLowerCase()}`)}
                    >
                      <strong>${entry.label}</strong>
                      <span>${entry.time}</span>
                      <span>${entry.detail}</span>
                      <span>Preview →</span>
                    </button>
                  `
                )}
                </div>
                <div class="notice">14 MB of 50 MB used on this device</div>
              `
        }
      </div>
    `;
  }

  private renderVariantB() {
    const selectedGroup = this.selectedId === 'shade-group' ? 'Shade character' : 'Refine face';

    return html`
      <div class="prototype">
        <header class="story-header">
          <p class="eyebrow">Variant B · meaning first</p>
          <h2 class="prototype-title">Your drawing story</h2>
          <p class="story-summary">Pixel Forge grouped 11 commands into 3 moments.</p>
        </header>

        <div class="scroll-area story-line" aria-label="Grouped session activity">
          <button
            class="story-card"
            aria-pressed=${this.selectedId !== 'shade-group'}
            @click=${() => (this.selectedId = 'face-group')}
          >
            ${this.renderPixelPreview()}
            <span class="story-copy">
              <span class="story-title"
                ><span>Refine face</span><span class="muted">Now</span></span
              >
              <span class="story-meta">4 strokes · highlight, palette, eyes</span>
            </span>
          </button>

          <button
            class="story-card"
            aria-pressed=${this.selectedId === 'shade-group'}
            @click=${() => (this.selectedId = 'shade-group')}
          >
            ${this.renderPixelPreview('blue')}
            <span class="story-copy">
              <span class="story-title"
                ><span>Shade character</span><span class="muted">1m</span></span
              >
              <span class="story-meta">5 actions · jacket, arm, outline</span>
            </span>
          </button>

          <div class="checkpoint">Local checkpoint · 10:36 · survives reload</div>

          <button
            class="story-card"
            aria-pressed="false"
            @click=${() => (this.selectedId = 'pose-group')}
          >
            ${this.renderPixelPreview('blue')}
            <span class="story-copy">
              <span class="story-title"><span>Adjust pose</span><span class="muted">4m</span></span>
              <span class="story-meta">2 actions · selection move</span>
            </span>
          </button>

          <div class="checkpoint">Project opened · 09:58</div>
        </div>

        <aside class="story-inspector" aria-label="Selected activity">
          <strong>${selectedGroup}</strong>
          <div class="inspector-actions">
            <button
              class="primary-button"
              @click=${() => this.showFeedback(`Undo ${selectedGroup}`)}
            >
              Undo group
            </button>
            <button class="quiet-button" @click=${() => this.showFeedback(`Open ${selectedGroup}`)}>
              See commands
            </button>
          </div>
        </aside>
      </div>
    `;
  }

  private renderVariantC() {
    return html`
      <div class="prototype">
        <header class="safety-header">
          <p class="eyebrow">Variant C · safety first</p>
          <h2 class="prototype-title">History & recovery</h2>
          <div class="saved-state">
            <span class="saved-badge" aria-hidden="true">✓</span>
            <span class="saved-copy">
              <strong>Protected on this device</strong>
              <span>Checkpoint updated 12 seconds ago</span>
            </span>
          </div>
        </header>

        <div class="scroll-area">
          <section class="safety-section" aria-labelledby="recover-heading">
            <div class="section-heading">
              <h3 id="recover-heading">Recover your work</h3>
              <span>Survives reload</span>
            </div>
            <div class="restore-hero">
              <strong>Before palette cleanup</strong>
              <span>10:36 · 4.6 MB · Restore opens a copy, so the current project stays safe.</span>
              <div class="restore-actions">
                <button
                  class="primary-button"
                  @click=${() => this.showFeedback('Preview recovery copy')}
                >
                  Preview copy
                </button>
                <button
                  class="quiet-button"
                  @click=${() => this.showFeedback('Open all recovery points')}
                >
                  All 3
                </button>
              </div>
            </div>
          </section>

          <section class="safety-section" aria-labelledby="undo-heading">
            <div class="section-heading">
              <h3 id="undo-heading">Quick undo</h3>
              <span>This session only</span>
            </div>
            <div class="compact-stack">
              ${sessionEntries.slice(0, 4).map(
                (entry, index) => html`
                  <button
                    class="mini-command"
                    aria-pressed=${this.selectedId === entry.id}
                    @click=${() => (this.selectedId = entry.id)}
                  >
                    <span class="command-type" aria-hidden="true">${index + 1}</span>
                    <span>${entry.label}</span>
                    <span class="row-time">${entry.time}</span>
                  </button>
                `
              )}
            </div>
            <button
              class="quiet-button"
              style="width: 100%; margin-top: 7px"
              @click=${() => this.showFeedback('Open detailed session commands')}
            >
              Inspect all session actions
            </button>
          </section>

          <section class="safety-section" aria-labelledby="storage-heading">
            <div class="section-heading">
              <h3 id="storage-heading">Local storage</h3>
              <span>14 MB / 50 MB</span>
            </div>
            <div
              class="storage-meter"
              role="progressbar"
              aria-valuemin="0"
              aria-valuemax="50"
              aria-valuenow="14"
            >
              <span></span>
            </div>
            <span class="muted"
              >Old checkpoints roll off automatically. Current projects are never removed.</span
            >
          </section>
        </div>
      </div>
    `;
  }

  private renderSwitcher() {
    const current = variants.find((variant) => variant.id === this.variant) ?? variants[0];

    return html`
      <nav class="variant-switcher" aria-label="History prototype variants">
        <button
          class="switch-arrow"
          @click=${() => this.moveVariant(-1)}
          aria-label="Previous variant"
        >
          ←
        </button>
        <button class="switch-button" @click=${() => this.moveVariant(1)} title="Switch variant">
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

    return html`
      ${
        this.variant === 'A'
          ? this.renderVariantA()
          : this.variant === 'B'
            ? this.renderVariantB()
            : this.renderVariantC()
      }
      ${this.feedback ? html`<div class="prototype-feedback" role="status">${this.feedback}</div>` : nothing}
      ${this.renderSwitcher()}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pf-history-prototype': PFHistoryPrototype;
  }
}
