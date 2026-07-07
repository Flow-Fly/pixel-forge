import { html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { autoSaveService } from '../../services/auto-save';
import { projectLibrary } from '../../services/project-library';
import type { ProjectMeta } from '../../services/persistence/project-repository';
import { projectStore } from '../../stores/project';
import '../ui/pf-dialog';

@customElement('pf-project-browser')
export class PFProjectBrowser extends BaseComponent {
  static styles = css`
    :host {
      position: fixed;
      inset: 0;
      z-index: 900;
      display: block;
      color: var(--pf-color-text-main);
      background:
        radial-gradient(circle at 20% 20%, rgba(200, 173, 127, 0.1), transparent 28%),
        linear-gradient(180deg, rgba(14, 18, 25, 0.98), rgba(5, 7, 10, 0.98));
      overflow: auto;
    }

    .shell {
      min-height: 100%;
      box-sizing: border-box;
      padding: 36px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
    }

    h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: 0;
    }

    .subtitle {
      margin: 6px 0 0;
      color: var(--pf-color-text-muted);
      font-size: var(--pf-font-size-sm);
      text-transform: none;
    }

    .header-actions,
    .card-actions,
    .rename-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
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

    @media (max-width: 640px) {
      .shell {
        padding: 18px;
      }

      header {
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
  private thumbnailUrls = new Map<string, string>();

  connectedCallback() {
    super.connectedCallback();
    void this.loadProjects();
  }

  disconnectedCallback() {
    this.clearThumbnailUrls();
    super.disconnectedCallback();
  }

  render() {
    return html`
      <section class="shell" aria-label="Project library">
        <header>
          <div>
            <h1>Project Library</h1>
            <p class="subtitle">Open a saved sprite or start a fresh canvas.</p>
          </div>
          <div class="header-actions">
            <button class="primary" type="button" @click=${this.requestNewProject}>
              New Project
            </button>
            ${this.canClose
              ? html`
                  <button type="button" @click=${this.closeBrowser}>
                    Back to Editor
                  </button>
                `
              : nothing}
          </div>
        </header>

        ${this.errorMessage
          ? html`<div class="error" role="alert">${this.errorMessage}</div>`
          : nothing}

        ${this.isLoading
          ? html`<div class="loading">Loading projects...</div>`
          : this.renderProjectGrid()}

        ${this.renderDeleteDialog()}
      </section>
    `;
  }

  private renderProjectGrid() {
    if (this.projects.length === 0) {
      return html`
        <div class="empty">
          <p>No projects saved yet.</p>
          <button class="primary" type="button" @click=${this.requestNewProject}>
            Create First Project
          </button>
        </div>
      `;
    }

    return html`
      <div class="grid">
        <button class="new-card" type="button" @click=${this.requestNewProject}>
          <strong>New Project</strong>
          <span class="meta">Choose a size and start drawing.</span>
        </button>
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
    if (!project) return nothing;

    return html`
      <pf-dialog
        open
        width="360px"
        @pf-close=${() => (this.deleteTarget = null)}
      >
        <span slot="title">Delete Project</span>
        <p>
          Delete "${project.name}" from this browser?
        </p>
        <div slot="actions">
          <button type="button" class="secondary" @click=${() => (this.deleteTarget = null)}>
            Cancel
          </button>
          <button type="button" class="primary danger" @click=${this.confirmDelete}>
            Delete
          </button>
        </div>
      </pf-dialog>
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
      await projectLibrary.openProject(id);
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
      if (project.id === projectStore.id.value) {
        projectStore.name.value = name;
        await autoSaveService.saveNow();
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
      if (id === projectStore.id.value) {
        await autoSaveService.saveNow();
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
      const deletedOpenProject = project.id === projectStore.id.value;
      await projectLibrary.deleteProject(project.id);
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

  private requestNewProject = () => {
    this.dispatchEvent(
      new CustomEvent('show-new-project-dialog', { bubbles: true, composed: true })
    );
  };

  private closeBrowser = () => {
    this.dispatchEvent(
      new CustomEvent('project-browser-close', { bubbles: true, composed: true })
    );
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
