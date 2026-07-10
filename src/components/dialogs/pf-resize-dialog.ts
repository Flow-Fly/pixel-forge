import { html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { defaultProjectContext, type ProjectContext } from '../../stores/project-context';
import '../ui/pf-dialog';

@customElement('pf-resize-dialog')
export class PFResizeDialog extends BaseComponent {
  static styles = css`
    .input-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .restriction {
      margin: 0;
      color: var(--pf-color-text-muted);
      font-size: var(--pf-font-size-xs);
      line-height: 1.45;
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
  `;

  @property({ type: Boolean }) open = false;
  @state() width = 64;
  @state() height = 64;
  private context: ProjectContext = defaultProjectContext;

  connectedCallback() {
    super.connectedCallback();
    this.subscribeToActiveProjectContext((context) => {
      this.context = context;
      if (this.open) this.readProjectSize();
      this.requestUpdate();
    });
  }

  willUpdate(changedProperties: Map<string, unknown>) {
    // Update dimensions when dialog opens
    if (changedProperties.has('open') && this.open) {
      this.readProjectSize();
    }
  }

  render() {
    const guidedProject = this.context.guidedDrawing.active;

    return html`
      <pf-dialog
        ?open=${this.open}
        width="300px"
        @pf-close=${this.close}
      >
        <span slot="title">Resize Canvas</span>

        ${guidedProject
          ? html`
              <p class="restriction" role="status">
                Guided projects keep their canvas size fixed so every number stays aligned.
              </p>
            `
          : ''}

        <div class="input-group">
          <label>Width (px)</label>
          <input
            type="number"
            min="1"
            max="2048"
            ?disabled=${guidedProject}
            .value=${this.width}
            @input=${(e: Event) => this.width = parseInt((e.target as HTMLInputElement).value)}
          >
        </div>
        <div class="input-group">
          <label>Height (px)</label>
          <input
            type="number"
            min="1"
            max="2048"
            ?disabled=${guidedProject}
            .value=${this.height}
            @input=${(e: Event) => this.height = parseInt((e.target as HTMLInputElement).value)}
          >
        </div>

        <div slot="actions">
          <button class="secondary" @click=${this.close}>Cancel</button>
          <button class="primary" ?disabled=${guidedProject} @click=${this.apply}>Resize</button>
        </div>
      </pf-dialog>
    `;
  }

  close() {
    this.open = false;
    this.dispatchEvent(new CustomEvent('close'));
  }

  apply() {
    if (this.context.guidedDrawing.active) return;

    const width = Math.max(1, Math.min(2048, this.width));
    const height = Math.max(1, Math.min(2048, this.height));
    this.context.project.resizeCanvas(width, height);
    this.close();
  }

  private readProjectSize() {
    this.width = this.context.project.width.value;
    this.height = this.context.project.height.value;
  }
}
