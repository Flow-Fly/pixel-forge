import { html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { autoSaveService } from '../../services/auto-save';
import { workspaceStore, type WorkspaceItem } from '../../stores/workspace';

@customElement('pf-project-tabs')
export class PFProjectTabs extends BaseComponent {
  static styles = css`
    :host {
      display: block;
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
    .add-button {
      display: grid;
      place-items: center;
      width: 28px;
      min-width: 28px;
      font-size: 16px;
      line-height: 1;
    }

    .close-button:hover:not(:disabled),
    .add-button:hover {
      background: rgba(255, 255, 255, 0.06);
      color: var(--pf-color-text-main);
    }

    .add-button {
      align-self: stretch;
      height: 34px;
      margin-bottom: 1px;
      border: 1px solid var(--pf-color-border);
      border-radius: 6px 6px 0 0;
      color: var(--pf-color-text-muted);
      background: rgba(10, 13, 18, 0.62);
    }

    .error {
      padding: 5px 10px 7px;
      color: #f0aaa2;
      font-size: 12px;
    }
  `;

  @state() private errorMessage = '';

  private activateItem(itemId: string) {
    const result = workspaceStore.activate(itemId);
    this.errorMessage = result.ok ? '' : result.message;
  }

  private async closeItem(itemId: string) {
    try {
      const result = await workspaceStore.closeProject(itemId);
      this.errorMessage = result.ok ? '' : result.message;
    } catch {
      this.errorMessage = 'Could not close project.';
    }
  }

  private openProjectBrowser() {
    this.errorMessage = '';
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
    const canClose = items.length > 1;

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
        <button
          class="add-button"
          type="button"
          aria-label="Open project"
          title="Open project"
          @click=${this.openProjectBrowser}
        >
          +
        </button>
      </nav>
      ${this.errorMessage ? html`<div class="error">${this.errorMessage}</div>` : ''}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pf-project-tabs': PFProjectTabs;
  }
}
