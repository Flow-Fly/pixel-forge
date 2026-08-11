import { html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { defaultProjectContext, type ProjectContext } from '../../stores/project-context';
import {
  CANVAS_SIZE_MAX_DIMENSION,
  captureProjectTarget,
  executeCanvasSize,
  previewCanvasSize,
  type CanvasSizePreview,
  type CanvasSizeRequest,
  type ProjectTarget,
} from '../../editor/canvas-size';
import '../ui/pf-dialog';

@customElement('pf-resize-dialog')
export class PFResizeDialog extends BaseComponent {
  static styles = css`
    .input-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .restriction,
    .message {
      margin: 0;
      color: var(--pf-color-text-muted);
      font-size: var(--pf-font-size-xs);
      line-height: 1.45;
    }

    .message[role='alert'] {
      color: var(--pf-color-error, #ff8b8b);
    }

    label {
      font-size: 12px;
      color: var(--pf-color-text-muted);
    }

    input {
      background-color: var(--pf-color-bg-dark);
      border: 1px solid var(--pf-color-border);
      color: var(--pf-color-text-main);
      padding: 4px 8px;
      border-radius: 4px;
    }

    form {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    button {
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }

    button.primary {
      background-color: var(--pf-color-primary);
      color: white;
      border: none;
    }

    button.secondary {
      background-color: transparent;
      border: 1px solid var(--pf-color-border);
      color: var(--pf-color-text-main);
    }

    button:focus-visible,
    input:focus-visible {
      outline: 2px solid var(--pf-color-accent);
      outline-offset: 2px;
    }
  `;

  @property({ type: Boolean }) open = false;
  @state() width = 64;
  @state() height = 64;
  @state() private message = '';
  @state() private messageIsError = false;
  @state() private pendingConfirmation: CanvasSizePreview | null = null;
  @state() private submitting = false;

  private context: ProjectContext = defaultProjectContext;
  private operationContext: ProjectContext | null = null;
  private operationTarget: ProjectTarget | null = null;
  private expectedRevision = 0;

  connectedCallback() {
    super.connectedCallback();
    this.subscribeToActiveProjectContext((context) => {
      this.context = context;
      if (this.open && !this.operationContext) this.readProjectSize();
      this.requestUpdate();
    });
  }

  willUpdate(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('open') && this.open) {
      this.readProjectSize();
    }
  }

  render() {
    const operationContext = this.operationContext ?? this.context;
    const guidedProject = operationContext.guidedDrawing.active;

    return html`
      <pf-dialog
        ?open=${this.open}
        width="300px"
        @pf-close=${this.close}
      >
        <span slot="title">Resize Canvas</span>

        ${this.renderRestriction(guidedProject)}

        <form id="resize-canvas-form" @submit=${this.handleSubmit}>
          ${this.renderDimensionInput(
            'Width (px)',
            'resize-canvas-width',
            this.width,
            guidedProject,
            this.handleWidthInput
          )}
          ${this.renderDimensionInput(
            'Height (px)',
            'resize-canvas-height',
            this.height,
            guidedProject,
            this.handleHeightInput
          )}

          ${this.renderMessage()}
        </form>
        ${this.renderActions(guidedProject)}
      </pf-dialog>
    `;
  }

  private renderRestriction(guidedProject: boolean) {
    if (!guidedProject) return nothing;
    return html`
      <p class="restriction" role="status">
        Guided projects keep their canvas size fixed so every number stays aligned.
      </p>
    `;
  }

  private renderDimensionInput(
    label: string,
    id: string,
    value: number,
    guidedProject: boolean,
    onInput: (event: Event) => void
  ) {
    const messageId = this.message ? 'resize-message' : undefined;
    return html`
      <div class="input-group">
        <label for=${id}>${label}</label>
        <input
          id=${id}
          name=${id.endsWith('width') ? 'width' : 'height'}
          type="number"
          min="1"
          max=${CANVAS_SIZE_MAX_DIMENSION}
          inputmode="numeric"
          ?disabled=${guidedProject || this.submitting}
          aria-describedby=${messageId ?? ''}
          aria-invalid=${this.messageIsError ? 'true' : 'false'}
          .value=${String(value)}
          @input=${onInput}
        >
      </div>
    `;
  }

  private renderMessage() {
    if (!this.message) return nothing;
    return html`
      <p
        id="resize-message"
        class="message"
        role=${this.messageIsError ? 'alert' : 'status'}
        aria-live="polite"
      >${this.message}</p>
    `;
  }

  private renderActions(guidedProject: boolean) {
    const actionLabel = this.pendingConfirmation ? 'Confirm Crop' : 'Resize';
    return html`
      <div slot="actions">
        <button class="secondary" type="button" ?disabled=${this.submitting} @click=${this.close}>
          Cancel
        </button>
        <button
          class="primary"
          form="resize-canvas-form"
          type="submit"
          ?disabled=${guidedProject || this.submitting}
        >
          ${actionLabel}
        </button>
      </div>
    `;
  }

  close = () => {
    this.open = false;
    this.operationContext = null;
    this.operationTarget = null;
    this.pendingConfirmation = null;
    this.message = '';
    this.messageIsError = false;
    this.submitting = false;
    this.dispatchEvent(new CustomEvent('close'));
  };

  private handleSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    void this.apply();
  };

  private handleWidthInput = (event: Event) => {
    this.width = Number((event.target as HTMLInputElement).value);
    this.clearPendingDecision();
  };

  private handleHeightInput = (event: Event) => {
    this.height = Number((event.target as HTMLInputElement).value);
    this.clearPendingDecision();
  };

  private clearPendingDecision() {
    this.pendingConfirmation = null;
    this.message = '';
    this.messageIsError = false;
  }

  private async apply() {
    const context = this.operationContext ?? this.context;
    const target = this.operationTarget ?? captureProjectTarget(context);
    const request: CanvasSizeRequest = {
      target,
      expectedRevision: this.expectedRevision,
      width: this.width,
      height: this.height,
      offset: { x: 0, y: 0 },
    };

    this.submitting = true;
    this.message = '';
    this.messageIsError = false;

    if (!this.pendingConfirmation) {
      const preview = previewCanvasSize(context, request);
      if (!preview.ok) {
        this.showError(preview.error);
        this.submitting = false;
        return;
      }

      if (preview.preview.requiresConfirmation) {
        this.pendingConfirmation = preview.preview;
        this.message = this.cropMessage(preview.preview);
        this.submitting = false;
        return;
      }
    }

    const result = await executeCanvasSize(context, request, {
      confirmed: Boolean(this.pendingConfirmation),
      preview: this.pendingConfirmation ?? undefined,
    });
    if (!result.ok) {
      this.showError(result.error);
      this.submitting = false;
      return;
    }

    this.close();
  }

  private showError(error: { code: string; details?: Readonly<Record<string, string | number>> }) {
    this.messageIsError = true;
    this.message = this.errorMessage(error);
  }

  private errorMessage(error: { code: string; details?: Readonly<Record<string, string | number>> }) {
    if (error.code === 'revision_conflict') {
      return 'This project changed while the resize was open. Close and try again.';
    }
    if (error.code === 'target_not_found') {
      return 'The original project is no longer available.';
    }
    if (error.code === 'unsupported') {
      return 'Guided projects keep their canvas size fixed.';
    }
    if (error.code === 'limit_exceeded') {
      return 'The requested canvas is too large for this browser.';
    }
    if (error.details?.reason === 'confirmation_required') {
      return 'Confirm the crop before resizing.';
    }
    return 'Canvas size could not be changed. No pixels were modified.';
  }

  private cropMessage(preview: CanvasSizePreview) {
    const { rgbaPixels, indexedPixels } = preview.crop;
    const parts: string[] = [];
    if (rgbaPixels > 0) {
      parts.push(`${rgbaPixels} visible raster pixel${rgbaPixels === 1 ? '' : 's'}`);
    }
    if (indexedPixels > 0) {
      parts.push(`${indexedPixels} indexed pixel${indexedPixels === 1 ? '' : 's'}`);
    }
    return `This crop will discard ${parts.join(' and ')}. Press Confirm Crop to continue.`;
  }

  private readProjectSize() {
    const context = this.context;
    this.operationContext = context;
    this.operationTarget = captureProjectTarget(context);
    this.expectedRevision = context.project.revision.value;
    this.width = context.project.width.value;
    this.height = context.project.height.value;
    this.pendingConfirmation = null;
    this.message = '';
    this.messageIsError = false;
  }
}
