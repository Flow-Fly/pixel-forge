import { html, css, nothing } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { autoSaveService } from '../../services/auto-save';
import { projectLibrary } from '../../services/project-library';
import type { ProjectMeta } from '../../services/persistence/project-repository';
import { getActiveProjectContext } from '../../stores/project-context';
import { workspaceStore } from '../../stores/workspace';

@customElement('pf-project-browser')
export class PFProjectBrowser extends BaseComponent {
  static styles = css`
    :host {
      display: block;
      color: var(--pf-color-text-main);
    }

    dialog {
      box-sizing: border-box;
      max-width: calc(100vw - 32px);
      max-height: 90vh;
      overflow: auto;
      padding: 16px;
      color: var(--pf-color-text-main);
      background: rgba(13, 16, 21, 0.96);
      border: 1px solid var(--pf-color-border);
      border-radius: var(--pf-radius-md);
      box-shadow: var(--pf-shadow-lg);
    }

    dialog::backdrop {
      background-color: rgba(0, 0, 0, 0.64);
      backdrop-filter: blur(8px);
    }

    .browser-dialog {
      width: min(960px, calc(100vw - 32px));
    }

    .delete-dialog {
      width: min(360px, calc(100vw - 32px));
    }

    .dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 16px;
    }

    .dialog-title {
      margin: 0;
      color: var(--pf-color-text-main);
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0;
      text-transform: uppercase;
    }

    .shell {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 18px;
      max-height: min(720px, calc(100vh - 140px));
      min-height: 0;
    }

    .toolbar {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
    }

    .subtitle {
      margin: 0;
      color: var(--pf-color-text-muted);
      font-size: var(--pf-font-size-sm);
      text-transform: none;
    }

    .project-list {
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
      padding: 2px;
    }

    .header-actions,
    .card-actions,
    .rename-actions,
    .empty-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    form.header-actions,
    .empty-action,
    .new-card-form,
    .dialog-close-form {
      margin: 0;
    }

    .new-card-form {
      display: flex;
    }

    .new-card-form .new-card {
      width: 100%;
    }

    button {
      border: 1px solid var(--pf-color-border);
      border-radius: var(--pf-radius-sm);
      background: rgba(13, 16, 21, 0.78);
      color: var(--pf-color-text-main);
      cursor: pointer;
      font-size: var(--pf-font-size-sm);
      padding: 7px 10px;
    }

    button:hover,
    button:focus-visible {
      background: var(--pf-color-bg-hover);
      outline: 1px solid var(--pf-color-accent);
      outline-offset: 1px;
    }

    .primary {
      background: var(--pf-color-primary-transparent);
      border-color: var(--pf-color-accent);
      color: var(--pf-color-accent-hover);
    }

    .danger {
      border-color: rgba(196, 124, 114, 0.7);
      color: #f0aaa2;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 14px;
    }

    article,
    .new-card,
    .empty {
      border: 1px solid var(--pf-color-border);
      border-radius: var(--pf-radius-md);
      background: rgba(13, 16, 21, 0.72);
      box-shadow: var(--pf-shadow-sm);
    }

    article {
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .project-open,
    .new-card {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      text-align: left;
      gap: 10px;
      min-height: 170px;
      padding: 12px;
      border: 0;
      border-radius: 0;
      background: transparent;
    }

    .new-card {
      justify-content: center;
      text-align: center;
      border: 1px dashed var(--pf-color-border-strong);
      min-height: 226px;
    }

    .new-card.guided {
      border-color: color-mix(in srgb, var(--pf-color-accent) 62%, var(--pf-color-border));
      background: var(--pf-color-primary-transparent);
    }

    .thumbnail {
      display: grid;
      place-items: center;
      aspect-ratio: 4 / 3;
      min-height: 112px;
      border: 1px solid var(--pf-color-border);
      border-radius: var(--pf-radius-sm);
      background:
        linear-gradient(45deg, rgba(255, 255, 255, 0.08) 25%, transparent 25% 75%, rgba(255, 255, 255, 0.08) 75%) 0 0 / 16px 16px,
        linear-gradient(45deg, transparent 25%, rgba(255, 255, 255, 0.05) 25% 75%, transparent 75%) 8px 8px / 16px 16px,
        rgba(3, 5, 8, 0.7);
      color: var(--pf-color-text-muted);
      font-size: var(--pf-font-size-xs);
      overflow: hidden;
    }

    .thumbnail img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
      image-rendering: pixelated;
    }

    .thumbnail-label {
      padding: 4px;
    }

    .project-name {
      margin: 0;
      font-size: 15px;
      font-weight: 700;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .meta {
      margin: 0;
      color: var(--pf-color-text-muted);
      font-size: var(--pf-font-size-xs);
    }

    .card-actions {
      padding: 0 12px 12px;
    }

    .rename-form {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
    }

    label {
      display: flex;
      flex-direction: column;
      gap: 5px;
      color: var(--pf-color-text-muted);
      font-size: var(--pf-font-size-xs);
    }

    input {
      box-sizing: border-box;
      width: 100%;
      border: 1px solid var(--pf-color-border);
      border-radius: var(--pf-radius-sm);
      background: var(--pf-color-bg-input);
      color: var(--pf-color-text-main);
      padding: 8px;
      font-size: var(--pf-font-size-sm);
    }

    .empty,
    .error,
    .loading {
      padding: 24px;
      color: var(--pf-color-text-muted);
    }

    .error {
      border: 1px solid rgba(196, 124, 114, 0.7);
      border-radius: var(--pf-radius-sm);
      color: #f0aaa2;
      background: rgba(196, 124, 114, 0.08);
    }

    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 16px;
    }

    @media (max-width: 640px) {
      .shell {
        max-height: calc(100vh - 120px);
      }

      .toolbar {
        flex-direction: column;
      }
    }
  `;

  @property({ type: Boolean }) canClose = false;
  @state() private projects: ProjectMeta[] = [];
  @state() private isLoading = true;
  @state() private errorMessage = '';
  @state() private renamingProjectId: string | null = null;
  @state() private renameValue = '';
  @state() private deleteTarget: ProjectMeta | null = null;
  @query('.browser-dialog') private browserDialog?: HTMLDialogElement;
  @query('.delete-dialog') private deleteDialog?: HTMLDialogElement;
  private thumbnailUrls = new Map<string, string>();
  private isDisconnecting = false;

  connectedCallback() {
    super.connectedCallback();
    this.isDisconnecting = false;
    void this.loadProjects();
  }

  disconnectedCallback() {
    this.isDisconnecting = true;
    this.closeNativeDialog(this.deleteDialog);
    this.closeNativeDialog(this.browserDialog);
    this.clearThumbnailUrls();
    super.disconnectedCallback();
  }

  protected updated() {
    this.showNativeDialog(this.browserDialog);
    this.syncDeleteDialog();
  }

  render() {
    const canDismissBrowser = this.canDismissBrowser();

    return html`
      <dialog
        aria-labelledby="project-browser-title"
        class="browser-dialog"
        closedby=${canDismissBrowser ? 'any' : 'none'}
        @cancel=${this.handleBrowserDialogCancel}
        @click=${this.handleBrowserBackdropClick}
        @close=${this.handleBrowserDialogClose}
      >
        <div class="dialog-header">
          <h2 class="dialog-title" id="project-browser-title">Project Library</h2>
          ${this.canClose
            ? html`
                <form method="dialog" class="dialog-close-form">
                  <button type="submit" value="close">
                    Close
                  </button>
                </form>
              `
            : nothing}
        </div>
        <section class="shell" aria-label="Project library">
          <div class="toolbar">
            <p class="subtitle">Open a saved sprite, start fresh, or use an image as guidance.</p>
            <form method="dialog" class="header-actions">
              <button class="primary" type="submit" value="new-project">
                New Project
              </button>
              <button type="submit" value="guided-drawing">
                Guided Drawing
              </button>
              ${this.canClose
                ? html`
                    <button type="submit" value="close">
                      Back to Editor
                    </button>
                  `
                : nothing}
            </form>
          </div>

          ${this.errorMessage
            ? html`<div class="error" role="alert">${this.errorMessage}</div>`
            : nothing}

          <div class="project-list">
            ${this.isLoading
              ? html`<div class="loading">Loading projects...</div>`
              : this.renderProjectGrid()}
          </div>
        </section>
      </dialog>
      ${this.renderDeleteDialog()}
    `;
  }

  private renderProjectGrid() {
    if (this.projects.length === 0) {
      return html`
        <div class="empty">
          <p>No projects saved yet.</p>
          <div class="empty-actions">
            <form method="dialog" class="empty-action">
              <button class="primary" type="submit" value="new-project">
                Create First Project
              </button>
            </form>
            <form method="dialog" class="empty-action">
              <button type="submit" value="guided-drawing">
                Create Guided Drawing
              </button>
            </form>
          </div>
        </div>
      `;
    }

    return html`
      <div class="grid">
        <form method="dialog" class="new-card-form">
          <button class="new-card" type="submit" value="new-project">
            <strong>New Project</strong>
            <span class="meta">Choose a size and start drawing.</span>
          </button>
        </form>
        <form method="dialog" class="new-card-form">
          <button class="new-card guided" type="submit" value="guided-drawing">
            <strong>Guided Drawing</strong>
            <span class="meta">Start from an image in a separate numbered project.</span>
          </button>
        </form>
        ${this.projects.map((project) => this.renderProject(project))}
      </div>
    `;
  }

  private renderProject(project: ProjectMeta) {
    if (this.renamingProjectId === project.id) {
      return html`
        <article>
          <form class="rename-form" @submit=${(event: SubmitEvent) => this.saveRename(event, project)}>
            <label>
              Project name
              <input
                name="project-name"
                .value=${this.renameValue}
                @input=${this.handleRenameInput}
              >
            </label>
            <div class="rename-actions">
              <button class="primary" type="submit">Save</button>
              <button type="button" @click=${this.cancelRename}>Cancel</button>
            </div>
          </form>
        </article>
      `;
    }

    return html`
      <article>
        <button class="project-open" type="button" @click=${() => this.openProject(project.id)}>
          ${this.renderThumbnail(project)}
          <span class="project-name" title=${project.name}>${project.name}</span>
          <span class="meta">${project.width} x ${project.height}px</span>
          <span class="meta">Edited ${this.formatLastEdited(project.lastModified)}</span>
        </button>
        <div class="card-actions">
          <button type="button" @click=${() => this.startRename(project)}>Rename</button>
          <button type="button" @click=${() => this.duplicateProject(project.id)}>Duplicate</button>
          <button class="danger" type="button" @click=${() => (this.deleteTarget = project)}>
            Delete
          </button>
        </div>
      </article>
    `;
  }

  private renderDeleteDialog() {
    const project = this.deleteTarget;

    return html`
      <dialog
        aria-labelledby="delete-project-title"
        class="delete-dialog"
        closedby="any"
        @click=${this.handleDeleteBackdropClick}
        @close=${this.handleDeleteDialogClose}
      >
        ${project
          ? html`
              <div class="dialog-header">
                <h2 class="dialog-title" id="delete-project-title">Delete Project</h2>
              </div>
              <p>
                Delete "${project.name}" from this browser?
              </p>
              <div class="dialog-actions">
                <button type="button" class="secondary" @click=${this.cancelDelete}>
                  Cancel
                </button>
                <button type="button" class="primary danger" @click=${this.confirmDelete}>
                  Delete
                </button>
              </div>
            `
          : nothing}
      </dialog>
    `;
  }

  private async loadProjects() {
    this.isLoading = true;
    this.errorMessage = '';

    try {
      const projects = await projectLibrary.listProjects();
      this.updateThumbnailUrls(projects);
      this.projects = projects;
    } catch (error) {
      this.errorMessage = this.errorText(error, 'Failed to load projects.');
    } finally {
      this.isLoading = false;
    }
  }

  private renderThumbnail(project: ProjectMeta) {
    const url = this.thumbnailUrls.get(project.id);
    return html`
      <span class="thumbnail" aria-hidden="true">
        ${url
          ? html`<img src=${url} alt="">`
          : html`<span class="thumbnail-label">${project.width}x${project.height}</span>`}
      </span>
    `;
  }

  private updateThumbnailUrls(projects: ProjectMeta[]) {
    this.clearThumbnailUrls();

    for (const project of projects) {
      if (!project.thumbnail) continue;

      const blob = new Blob([project.thumbnail as BlobPart], {
        type: 'image/png',
      });
      this.thumbnailUrls.set(project.id, URL.createObjectURL(blob));
    }
  }

  private clearThumbnailUrls() {
    for (const url of this.thumbnailUrls.values()) {
      URL.revokeObjectURL(url);
    }
    this.thumbnailUrls.clear();
  }

  private async openProject(id: string) {
    this.errorMessage = '';

    try {
      const result = await workspaceStore.openProject(id, {
        saveActiveContext: this.canClose,
      });
      if (!result.ok) {
        this.errorMessage = result.message;
        return;
      }
      this.dispatchEvent(new CustomEvent('project-opened', { bubbles: true, composed: true }));
    } catch (error) {
      this.errorMessage = this.errorText(error, 'Failed to open project.');
    }
  }

  private startRename(project: ProjectMeta) {
    this.renamingProjectId = project.id;
    this.renameValue = project.name;
  }

  private handleRenameInput = (event: Event) => {
    this.renameValue = (event.target as HTMLInputElement).value;
  };

  private async saveRename(event: SubmitEvent, project: ProjectMeta) {
    event.preventDefault();
    const name = this.renameValue.trim();
    if (!name) return;

    this.errorMessage = '';
    try {
      const openItem = workspaceStore.getProjectItem(project.id);
      if (openItem) {
        openItem.context.project.name.value = name;
        await autoSaveService.saveNow(openItem.context);
      } else {
        await projectLibrary.renameProject(project.id, name);
      }
      this.renamingProjectId = null;
      await this.loadProjects();
    } catch (error) {
      this.errorMessage = this.errorText(error, 'Failed to rename project.');
    }
  }

  private cancelRename = () => {
    this.renamingProjectId = null;
    this.renameValue = '';
  };

  private async duplicateProject(id: string) {
    this.errorMessage = '';

    try {
      const activeContext = getActiveProjectContext();
      if (id === activeContext.project.id.value) {
        await autoSaveService.saveNow(activeContext);
      }
      await projectLibrary.duplicateProject(id);
      await this.loadProjects();
    } catch (error) {
      this.errorMessage = this.errorText(error, 'Failed to duplicate project.');
    }
  }

  private confirmDelete = async () => {
    const project = this.deleteTarget;
    if (!project) return;

    this.errorMessage = '';
    this.deleteTarget = null;

    try {
      const activeContext = getActiveProjectContext();
      const deletedOpenProject = project.id === activeContext.project.id.value;
      await projectLibrary.deleteProject(project.id, { context: activeContext });
      await this.loadProjects();

      if (deletedOpenProject) {
        this.dispatchEvent(
          new CustomEvent('current-project-deleted', { bubbles: true, composed: true })
        );
      }
    } catch (error) {
      this.errorMessage = this.errorText(error, 'Failed to delete project.');
    }
  };

  private closeBrowser = () => {
    this.dispatchEvent(
      new CustomEvent('project-browser-close', { bubbles: true, composed: true })
    );
  };

  private canDismissBrowser() {
    return this.canClose && !this.deleteTarget;
  }

  private syncDeleteDialog() {
    if (this.deleteTarget) {
      this.showNativeDialog(this.deleteDialog);
      return;
    }

    this.closeNativeDialog(this.deleteDialog);
  }

  private showNativeDialog(dialog: HTMLDialogElement | undefined) {
    if (!dialog || dialog.open || !dialog.isConnected) return;

    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
      return;
    }

    dialog.setAttribute('open', '');
  }

  private closeNativeDialog(dialog: HTMLDialogElement | undefined) {
    if (!dialog?.open) return;

    if (typeof dialog.close === 'function') {
      dialog.close();
      return;
    }

    dialog.removeAttribute('open');
    dialog.dispatchEvent(new Event('close'));
  }

  private clickIsInsideDialog(dialog: HTMLDialogElement, event: MouseEvent) {
    const rect = dialog.getBoundingClientRect();
    return (
      rect.top <= event.clientY &&
      event.clientY <= rect.top + rect.height &&
      rect.left <= event.clientX &&
      event.clientX <= rect.left + rect.width
    );
  }

  private handleBrowserDialogCancel = (event: Event) => {
    if (!this.canDismissBrowser()) {
      event.preventDefault();
    }
  };

  private handleBrowserBackdropClick = (event: MouseEvent) => {
    if (!this.canDismissBrowser() || event.target !== event.currentTarget) return;

    const dialog = event.currentTarget as HTMLDialogElement;
    if (!this.clickIsInsideDialog(dialog, event)) {
      this.closeNativeDialog(dialog);
    }
  };

  private handleBrowserDialogClose = () => {
    if (this.isDisconnecting) return;

    const returnValue = this.browserDialog?.returnValue ?? '';
    if (this.browserDialog) {
      this.browserDialog.returnValue = '';
    }

    if (returnValue === 'new-project') {
      this.dispatchEvent(
        new CustomEvent('show-new-project-dialog', { bubbles: true, composed: true })
      );
      return;
    }

    if (returnValue === 'guided-drawing') {
      this.dispatchEvent(
        new CustomEvent('show-paint-by-number-dialog', { bubbles: true, composed: true })
      );
      return;
    }

    if (!this.canDismissBrowser()) {
      this.showNativeDialog(this.browserDialog);
      return;
    }
    this.closeBrowser();
  };

  private cancelDelete = () => {
    this.closeNativeDialog(this.deleteDialog);
  };

  private handleDeleteBackdropClick = (event: MouseEvent) => {
    if (event.target !== event.currentTarget) return;

    const dialog = event.currentTarget as HTMLDialogElement;
    if (!this.clickIsInsideDialog(dialog, event)) {
      this.closeNativeDialog(dialog);
    }
  };

  private handleDeleteDialogClose = () => {
    if (!this.isDisconnecting) {
      this.deleteTarget = null;
    }
  };

  private formatLastEdited(lastModified: number) {
    const diffSeconds = Math.max(0, Math.floor((Date.now() - lastModified) / 1000));
    if (diffSeconds < 60) return 'just now';

    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }

  private errorText(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pf-project-browser': PFProjectBrowser;
  }
}
