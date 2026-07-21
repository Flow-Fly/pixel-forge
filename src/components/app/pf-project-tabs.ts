import { html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { autoSaveService } from '../../services/auto-save';
import {
  WORKSPACE_OPEN_ITEM_LIMIT,
  workspaceItemLimitMessage,
  workspaceStore,
  type WorkspaceItem,
} from '../../stores/workspace';

@customElement('pf-project-tabs')
export class PFProjectTabs extends BaseComponent {
  static styles = css`
    :host {
      display: block;
      container-type: inline-size;
      border-bottom: 1px solid var(--pf-color-border);
      background: linear-gradient(180deg, rgba(17, 21, 28, 0.96), rgba(10, 13, 18, 0.92));
      box-shadow: 0 1px 0 rgba(255, 255, 255, 0.035) inset;
    }

    .tabs {
      display: flex;
      align-items: end;
      gap: 4px;
      min-width: 0;
      padding: 6px 8px 0;
    }

    .tab-list {
      display: flex;
      flex: 1 1 auto;
      align-items: end;
      gap: 4px;
      min-width: 0;
      margin: 0;
      padding: 0;
      list-style: none;
      overflow-x: auto;
      scrollbar-width: thin;
    }

    .tab-item {
      display: flex;
      flex: 0 0 auto;
      align-items: stretch;
      min-width: 0;
      border: 1px solid var(--pf-color-border);
      border-bottom: 0;
      border-radius: 6px 6px 0 0;
      background: rgba(10, 13, 18, 0.74);
      color: var(--pf-color-text-muted);
      overflow: hidden;
    }

    .tab-item.active {
      background: rgba(22, 27, 36, 0.96);
      color: var(--pf-color-text-main);
      border-color: var(--pf-color-border-strong);
      box-shadow: 0 1px 0 rgba(255, 255, 255, 0.045) inset;
    }

    button {
      font: inherit;
      color: inherit;
      border: 0;
      background: transparent;
      cursor: pointer;
    }

    button:focus-visible {
      outline: 2px solid var(--pf-color-accent);
      outline-offset: -2px;
    }

    button:disabled {
      cursor: default;
      opacity: 0.44;
    }

    .tab-button {
      display: flex;
      align-items: center;
      gap: 7px;
      max-width: 220px;
      min-width: 96px;
      padding: 8px 10px;
      text-align: left;
    }

    .tab-name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 12px;
      font-weight: 600;
    }

    .dirty-dot {
      width: 7px;
      height: 7px;
      flex: 0 0 auto;
      border-radius: 50%;
      background: var(--pf-color-accent);
      box-shadow: 0 0 8px rgba(99, 179, 237, 0.5);
    }

    .close-button,
    .active-close-button,
    .add-button {
      display: grid;
      place-items: center;
      width: 28px;
      min-width: 28px;
      font-size: 16px;
      line-height: 1;
    }

    .close-button:hover:not(:disabled),
    .active-close-button:hover,
    .add-button:hover {
      background: rgba(255, 255, 255, 0.06);
      color: var(--pf-color-text-main);
    }

    .active-close-button,
    .add-button {
      align-self: stretch;
      height: 34px;
      margin-bottom: 1px;
      border: 1px solid var(--pf-color-border);
      border-radius: 6px 6px 0 0;
      color: var(--pf-color-text-muted);
      background: rgba(10, 13, 18, 0.62);
    }

    .active-close-button {
      display: none;
    }

    @container (max-width: 1024px) {
      .tab-item.active .close-button {
        display: none;
      }

      .active-close-button {
        display: grid;
      }
    }

    .error {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 10px 7px;
      color: #f0aaa2;
      font-size: 12px;
    }

    .error button {
      padding: 2px 6px;
      border: 1px solid currentColor;
      border-radius: var(--pf-radius-sm);
    }

    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
      border: 0;
    }
  `;

  @state() private errorMessage = '';
  private feedbackTimer: number | null = null;

  disconnectedCallback() {
    this.dismissFeedback();
    super.disconnectedCallback();
  }

  private showFeedback(message: string) {
    this.dismissFeedback();
    this.errorMessage = message;
    this.feedbackTimer = window.setTimeout(() => {
      this.errorMessage = '';
      this.feedbackTimer = null;
    }, 6000);
  }

  private dismissFeedback = () => {
    if (this.feedbackTimer !== null) {
      clearTimeout(this.feedbackTimer);
      this.feedbackTimer = null;
    }
    this.errorMessage = '';
  };

  private activateItem(itemId: string) {
    const result = workspaceStore.activate(itemId);
    if (result.ok) {
      this.dismissFeedback();
    } else {
      this.showFeedback(result.message);
    }
  }

  private async closeItem(itemId: string) {
    try {
      const result = await workspaceStore.closeProject(itemId);
      if (result.ok) {
        this.dismissFeedback();
      } else {
        this.showFeedback(result.message);
      }
    } catch {
      this.showFeedback('Could not close project.');
    }
  }

  private closeItemOnMiddleClick(event: MouseEvent, itemId: string) {
    if (event.button !== 1) return;

    event.preventDefault();
    void this.closeItem(itemId);
  }

  private preventMiddleMouseDefault(event: MouseEvent) {
    if (event.button === 1) {
      event.preventDefault();
    }
  }

  private openProjectBrowser() {
    if (workspaceStore.items.value.length >= WORKSPACE_OPEN_ITEM_LIMIT) {
      this.showFeedback(workspaceItemLimitMessage());
      return;
    }

    this.dismissFeedback();
    this.dispatchEvent(new CustomEvent('show-project-browser', { bubbles: true, composed: true }));
  }

  private projectName(item: WorkspaceItem) {
    return item.context.project.name.value || 'Untitled';
  }

  private tabLabel(name: string, isDirty: boolean) {
    return isDirty ? `${name}, unsaved changes` : name;
  }

  render() {
    const items = workspaceStore.items.value;
    const activeItemId = workspaceStore.activeItemId.value;
    const activeItem = items.find((item) => item.id === activeItemId);
    const activeCloseLabel = activeItem ? `Close ${this.projectName(activeItem)}` : '';
    const canClose = items.length > 1;
    const canOpenAnotherProject = items.length < WORKSPACE_OPEN_ITEM_LIMIT;

    return html`
      <nav class="tabs" aria-label="Open projects">
        <ul class="tab-list">
          ${items.map((item) => {
            const isActive = item.id === activeItemId;
            const isDirty = autoSaveService.isDirty(item.context);
            const name = this.projectName(item);

            return html`
              <li class=${isActive ? 'tab-item active' : 'tab-item'}>
                <button
                  class="tab-button"
                  type="button"
                  aria-current=${isActive ? 'page' : 'false'}
                  aria-label=${this.tabLabel(name, isDirty)}
                  @click=${() => this.activateItem(item.id)}
                  @mousedown=${this.preventMiddleMouseDefault}
                  @auxclick=${(event: MouseEvent) => this.closeItemOnMiddleClick(event, item.id)}
                >
                  ${isDirty ? html`<span class="dirty-dot" aria-hidden="true"></span>` : ''}
                  <span class="tab-name">${name}</span>
                </button>
                <button
                  class="close-button"
                  type="button"
                  ?disabled=${!canClose}
                  aria-label=${`Close ${name}`}
                  title=${canClose ? `Close ${name}` : 'At least one project must stay open'}
                  @click=${() => this.closeItem(item.id)}
                >
                  x
                </button>
              </li>
            `;
          })}
        </ul>
        ${
          canClose && activeItem
            ? html`
                <button
                  class="active-close-button"
                  type="button"
                  aria-label=${activeCloseLabel}
                  title=${activeCloseLabel}
                  @click=${() => this.closeItem(activeItem.id)}
                >
                  x
                </button>
              `
            : ''
        }
        <button
          class="add-button"
          type="button"
          aria-label="Open project"
          title=${canOpenAnotherProject ? 'Open project' : workspaceItemLimitMessage()}
          @click=${this.openProjectBrowser}
        >
          +
        </button>
      </nav>
      <span class="visually-hidden" role="status" aria-live="polite" aria-atomic="true"
        >${this.errorMessage}</span
      >
      ${this.errorMessage
        ? html`
            <div class="error">
              <span aria-hidden="true">${this.errorMessage}</span>
              <button type="button" @click=${this.dismissFeedback}>Dismiss</button>
            </div>
          `
        : ''}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pf-project-tabs': PFProjectTabs;
  }
}
