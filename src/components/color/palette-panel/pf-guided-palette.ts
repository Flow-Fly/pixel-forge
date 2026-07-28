import { css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { BaseComponent } from '../../../core/base-component';
import { autoSaveService } from '../../../services/auto-save';
import {
  analyzeGuidedDrawingProgress,
  getGuidedDrawingSnapshot,
  type GuidedDrawingProgress,
} from '../../../services/paint-by-number/guided-progress';
import { defaultProjectContext, type ProjectContext } from '../../../stores/project-context';
import '../../ui/pf-dialog';

const EMPTY_PROGRESS: GuidedDrawingProgress = {
  total: 0,
  covered: 0,
  remaining: 0,
  percentage: 0,
  remainingByNumber: new Uint32Array(1),
};

@customElement('pf-guided-palette')
export class PFGuidedPalette extends BaseComponent {
  static styles = css`
    :host {
      display: grid;
      gap: 12px;
    }

    h2,
    h3,
    p {
      margin: 0;
    }

    h2,
    h3 {
      color: var(--pf-color-text-secondary);
      font-size: var(--pf-font-size-xs);
      text-transform: uppercase;
    }

    .progress-copy,
    .remaining,
    .artist-copy,
    .structure-note {
      color: var(--pf-color-text-muted);
      font-size: var(--pf-font-size-xs);
      line-height: 1.4;
    }

    .view-controls {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 5px;
    }

    .view-controls button {
      min-height: 30px;
      padding: 5px 7px;
      border: 1px solid var(--pf-color-border);
      border-radius: var(--pf-radius-sm);
      background: var(--pf-color-bg-dark);
      color: var(--pf-color-text-secondary);
      cursor: pointer;
      font-size: var(--pf-font-size-xs);
    }

    .view-controls button[aria-pressed='true'] {
      border-color: var(--pf-color-accent);
      background: var(--pf-color-primary-transparent);
      color: var(--pf-color-text-main);
    }

    .finish-section {
      display: grid;
      gap: 6px;
      padding-block-start: 2px;
      border-block-start: 1px solid var(--pf-color-border);
    }

    .finish-guidance {
      min-height: 32px;
      padding: 6px 8px;
      border: 1px solid var(--pf-color-border-strong);
      border-radius: var(--pf-radius-sm);
      background: transparent;
      color: var(--pf-color-text-main);
      cursor: pointer;
      font-size: var(--pf-font-size-xs);
    }

    .finish-guidance:hover {
      border-color: var(--pf-color-accent);
      background: var(--pf-color-bg-hover);
    }

    .finish-copy,
    .finish-error {
      margin: 0;
      color: var(--pf-color-text-muted);
      font-size: var(--pf-font-size-xs);
      line-height: 1.45;
    }

    .finish-error {
      color: var(--pf-color-danger, #f0aaa2);
    }

    .dialog-action {
      padding: 7px 10px;
      border: 1px solid var(--pf-color-border);
      border-radius: var(--pf-radius-sm);
      background: transparent;
      color: var(--pf-color-text-main);
      cursor: pointer;
    }

    .dialog-action.primary {
      border-color: var(--pf-color-accent);
      background: var(--pf-color-primary-transparent);
      color: var(--pf-color-accent-hover);
    }

    .dialog-action:disabled {
      cursor: wait;
      opacity: 0.55;
    }

    .structure-note {
      padding: 7px 8px;
      border-inline-start: 2px solid var(--pf-color-accent);
      background: var(--pf-color-primary-transparent);
    }

    progress {
      width: 100%;
      height: 6px;
      overflow: hidden;
      border: 0;
      border-radius: 999px;
      background: var(--pf-color-bg-input);
    }

    progress::-webkit-progress-bar {
      background: var(--pf-color-bg-input);
    }

    progress::-webkit-progress-value {
      background: var(--pf-color-accent);
    }

    progress::-moz-progress-bar {
      background: var(--pf-color-accent);
    }

    .guide-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 5px;
    }

    .guide-color {
      display: grid;
      grid-template-columns: 30px minmax(0, 1fr);
      align-items: center;
      gap: 7px;
      min-width: 0;
      padding: 5px;
      border: 1px solid var(--pf-color-border);
      border-radius: var(--pf-radius-sm);
      background: var(--pf-color-bg-dark);
      color: var(--pf-color-text-main);
      cursor: pointer;
      text-align: start;
    }

    .guide-color:hover {
      border-color: var(--pf-color-border-strong);
      background: var(--pf-color-bg-hover);
    }

    .guide-color[aria-pressed='true'] {
      border-color: var(--pf-color-accent);
      box-shadow: 0 0 0 1px var(--pf-color-primary-transparent);
    }

    button:focus-visible {
      outline: 2px solid var(--pf-color-accent);
      outline-offset: 2px;
    }

    .chip-wrap {
      position: relative;
      width: 30px;
      height: 30px;
    }

    .chip {
      display: block;
      width: 100%;
      height: 100%;
      border: 1px solid rgba(255, 255, 255, 0.24);
      border-radius: 2px;
      background: var(--guide-color);
      box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.38) inset;
    }

    .number {
      position: absolute;
      inset-block-start: -3px;
      inset-inline-start: -3px;
      min-width: 16px;
      padding: 1px 3px;
      border: 1px solid rgba(255, 255, 255, 0.28);
      border-radius: 2px;
      background: rgba(7, 9, 13, 0.9);
      color: #f5f3ee;
      font-size: 9px;
      font-weight: 700;
      line-height: 12px;
      text-align: center;
    }

    .color-copy {
      display: grid;
      min-width: 0;
    }

    .hex {
      overflow: hidden;
      color: var(--pf-color-text-secondary);
      font-size: 10px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .remaining {
      font-size: 9px;
      white-space: nowrap;
    }

    .shortcut-hint {
      justify-self: start;
      padding-inline: 3px;
      border: 1px solid var(--pf-color-border-strong);
      border-radius: 2px;
      background: var(--pf-color-bg-input);
      color: var(--pf-color-text-secondary);
      font-family: inherit;
      font-size: 8px;
      font-weight: 600;
      line-height: 11px;
      white-space: nowrap;
    }

    @media (forced-colors: active) {
      .shortcut-hint {
        border-color: ButtonText;
        background: ButtonFace;
        color: ButtonText;
      }
    }

    .artist-section {
      display: grid;
      gap: 7px;
      padding-block-start: 2px;
      border-block-start: 1px solid var(--pf-color-border);
    }

    .artist-grid {
      display: grid;
      grid-template-columns: repeat(8, minmax(0, 1fr));
      gap: 2px;
    }

    .artist-color {
      aspect-ratio: 1;
      min-width: 0;
      padding: 0;
      border: 1px solid var(--pf-color-border);
      border-radius: 2px;
      background: var(--artist-color);
      cursor: pointer;
    }

    .artist-color[aria-pressed='true'] {
      outline: 2px solid var(--pf-color-accent);
      outline-offset: 1px;
    }
  `;

  private context: ProjectContext = defaultProjectContext;
  @state() private finishConfirmationOpen = false;
  @state() private isFinishing = false;
  @state() private finishError = '';

  connectedCallback() {
    super.connectedCallback();
    this.subscribeToActiveProjectContext((context) => {
      this.context = context;
      this.requestUpdate();
    });
  }

  render() {
    const session = this.context.guidedDrawing.session.value;
    const palette = this.context.palette.mainColors.value;
    const primaryColor = this.context.colors.primaryColor.value.toLowerCase();
    void this.context.history.version.value;
    void this.context.layers.layers.value;

    if (!session) return html``;

    const progress = this.getProgress();
    const guideColorCount = session.guideColorCount ?? findHighestGuideNumber(session.target);
    const guideColors = palette.slice(0, guideColorCount);
    const artistColors = palette.slice(guideColorCount);

    return html`
      <section aria-labelledby="guided-palette-title">
        <h2 id="guided-palette-title">Guided palette</h2>
        <p class="progress-copy">
          ${progress.covered} of ${progress.total} cells covered ·
          ${progress.remaining} remaining · ${progress.percentage}%
        </p>
        <progress
          max=${Math.max(1, progress.total)}
          value=${progress.covered}
          aria-label="Guided drawing coverage"
        ></progress>
      </section>

      ${this.renderViewControls()}
      ${this.renderFinishGuidance(progress)}

      <div class="guide-grid">
        ${guideColors.map((color, index) => {
          const guideNumber = index + 1;
          const remaining = progress.remainingByNumber[guideNumber] ?? 0;
          const selected = color.toLowerCase() === primaryColor;
          const shortcutLabel = guideNumber <= 9 ? `, number key ${guideNumber}` : '';
          return html`
            <button
              class="guide-color"
              type="button"
              aria-pressed=${String(selected)}
              aria-label="Guide color ${guideNumber}, ${color}, ${remaining} cells remaining${shortcutLabel}"
              @click=${() => this.selectColor(color)}
            >
              <span class="chip-wrap" aria-hidden="true">
                <span class="chip" style="--guide-color: ${color}"></span>
                <span class="number">${guideNumber}</span>
              </span>
              <span class="color-copy" aria-hidden="true">
                <span class="hex">${color}</span>
                <span class="remaining">${remaining} left</span>
                ${guideNumber <= 9
                  ? html`<kbd class="shortcut-hint">Key ${guideNumber}</kbd>`
                  : ''}
              </span>
            </button>
          `;
        })}
      </div>

      <p class="structure-note">
        Canvas, palette, layers, and frames stay fixed so the numbered guide remains aligned.
        Drawing colors and tools are still yours.
      </p>

      ${artistColors.length > 0
        ? html`
            <section class="artist-section" aria-labelledby="artist-colors-title">
              <h3 id="artist-colors-title">Artist colors</h3>
              <p class="artist-copy">Colors you introduced while drawing off-guide.</p>
              <div class="artist-grid">
                ${artistColors.map((color) => html`
                  <button
                    class="artist-color"
                    type="button"
                    style="--artist-color: ${color}"
                    aria-label="Artist color ${color}"
                    aria-pressed=${String(color.toLowerCase() === primaryColor)}
                    @click=${() => this.selectColor(color)}
                  ></button>
                `)}
              </div>
            </section>
          `
        : ''}
    `;
  }

  private getProgress(): GuidedDrawingProgress {
    const snapshot = getGuidedDrawingSnapshot(this.context);
    return snapshot
      ? analyzeGuidedDrawingProgress(snapshot.session.target, snapshot.pixels)
      : EMPTY_PROGRESS;
  }

  private renderViewControls() {
    const guidance = this.context.guidedDrawing;
    const numbersVisible = guidance.numbersVisible.value;
    const targetPreviewVisible = guidance.targetPreviewVisible.value;

    return html`
      <div class="view-controls" aria-label="Guidance view">
        <button
          type="button"
          aria-pressed=${String(numbersVisible)}
          @click=${() => guidance.toggleNumbers()}
        >
          ${numbersVisible ? 'Hide numbers' : 'Show numbers'}
        </button>
        <button
          type="button"
          aria-pressed=${String(targetPreviewVisible)}
          @click=${() => guidance.toggleTargetPreview()}
        >
          ${targetPreviewVisible ? 'Hide target' : 'Preview target'}
        </button>
      </div>
    `;
  }

  private renderFinishGuidance(progress: GuidedDrawingProgress) {
    return html`
      <section class="finish-section" aria-label="Finish guidance">
        <button
          class="finish-guidance"
          type="button"
          @click=${this.openFinishConfirmation}
        >
          Finish guidance
        </button>
        <p class="finish-copy">You decide when the scaffold has done its job.</p>
      </section>

      <pf-dialog
        ?open=${this.finishConfirmationOpen}
        width="min(420px, calc(100vw - 32px))"
        @pf-close=${this.closeFinishConfirmation}
      >
        <span slot="title">Finish guidance?</span>
        <p class="finish-copy">
          Your drawing is ${progress.percentage}% covered. This removes the numbers and fixed
          guide structure. Your painted pixels and undo history stay exactly as they are.
        </p>
        ${this.finishError
          ? html`<p class="finish-error" role="alert">${this.finishError}</p>`
          : ''}
        <div slot="actions">
          <button
            class="dialog-action"
            type="button"
            ?disabled=${this.isFinishing}
            @click=${this.closeFinishConfirmation}
          >
            Keep guidance
          </button>
          <button
            class="dialog-action primary finish-confirm"
            type="button"
            ?disabled=${this.isFinishing}
            @click=${this.finishGuidance}
          >
            ${this.isFinishing ? 'Finishing…' : 'Finish guidance'}
          </button>
        </div>
      </pf-dialog>
    `;
  }

  private openFinishConfirmation = () => {
    this.finishError = '';
    this.finishConfirmationOpen = true;
  };

  private closeFinishConfirmation = () => {
    if (this.isFinishing) return;
    this.finishConfirmationOpen = false;
    this.finishError = '';
  };

  private finishGuidance = async () => {
    if (this.isFinishing || !this.context.guidedDrawing.active) return;

    this.isFinishing = true;
    this.finishError = '';
    this.context.guidedDrawing.beginFinish();
    try {
      await autoSaveService.saveNow(this.context);
      this.context.guidedDrawing.completeFinish();
      this.context.viewport.resetView();
      this.finishConfirmationOpen = false;
    } catch {
      this.context.guidedDrawing.cancelFinish();
      this.finishError = 'Guidance could not be finished safely. Your guide is still active.';
    } finally {
      this.isFinishing = false;
    }
  };

  private selectColor(color: string) {
    this.context.colors.setPrimaryColor(color);
    this.context.colors.updateLightnessVariations(color);
  }
}

function findHighestGuideNumber(target: Uint8Array): number {
  let highest = 0;
  for (const guideNumber of target) highest = Math.max(highest, guideNumber);
  return highest;
}

declare global {
  interface HTMLElementTagNameMap {
    'pf-guided-palette': PFGuidedPalette;
  }
}
