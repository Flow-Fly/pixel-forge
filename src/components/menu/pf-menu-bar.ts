import { html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { historyStore } from '../../stores/history';
import { layerStore } from '../../stores/layers';
import { projectStore } from '../../stores/project';
import { FlipLayerCommand, RotateLayerCommand } from '../../commands/layer-commands';
import { FileService } from '../../services/file-service';
import { type ProjectFile } from '../../types/project';

@customElement('pf-menu-bar')
export class PFMenuBar extends BaseComponent {
  static styles = css`
    :host {
      display: flex;
      height: 100%;
      align-items: center;
    }

    .menu-btn {
      padding: 0 var(--pf-spacing-2);
      cursor: pointer;
      color: var(--pf-color-text-muted);
      font-size: var(--pf-font-size-sm);
      user-select: none;
      background: none;
      border: none;
      height: 100%;
      display: flex;
      align-items: center;
    }

    .menu-btn:hover, .menu-btn:focus-visible {
      color: var(--pf-color-text-main);
      background-color: var(--pf-color-bg-surface);
    }

    [popover] {
      padding: var(--pf-spacing-1) 0;
      background-color: var(--pf-color-bg-panel);
      border: 1px solid var(--pf-color-border);
      border-radius: 4px;
      box-shadow: var(--pf-shadow-lg);
      color: var(--pf-color-text-main);
      min-width: 150px;
      margin: 0; /* Important for anchor positioning */
    }

    [popover]::backdrop {
      background-color: transparent;
    }

    .menu-item {
      padding: var(--pf-spacing-1) var(--pf-spacing-3);
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      font-size: var(--pf-font-size-sm);
    }

    .menu-item:hover {
      background-color: var(--pf-color-bg-surface);
    }

    .shortcut {
      color: var(--pf-color-text-muted);
      font-size: var(--pf-font-size-xs);
    }

    /* Anchor Positioning */
    #menu-file {
      position-anchor: --btn-file;
      top: anchor(bottom);
      left: anchor(left);
    }
    #btn-file {
      anchor-name: --btn-file;
    }

    #menu-edit {
      position-anchor: --btn-edit;
      top: anchor(bottom);
      left: anchor(left);
    }
    #btn-edit {
      anchor-name: --btn-edit;
    }

    #menu-view {
      position-anchor: --btn-view;
      top: anchor(bottom);
      left: anchor(left);
    }
    #btn-view {
      anchor-name: --btn-view;
    }

    #menu-image {
      position-anchor: --btn-image;
      top: anchor(bottom);
      left: anchor(left);
    }
    #btn-image {
      anchor-name: --btn-image;
    }
  `;

  flipLayer(direction: 'horizontal' | 'vertical') {
    const activeLayerId = layerStore.activeLayerId.value;
    if (activeLayerId) {
      historyStore.execute(new FlipLayerCommand(activeLayerId, direction));
    }
  }

  rotateLayer(angle: number) {
    const activeLayerId = layerStore.activeLayerId.value;
    if (activeLayerId) {
      historyStore.execute(new RotateLayerCommand(activeLayerId, angle));
    }
  }

  async saveProject() {
    const project = await projectStore.saveProject();
    FileService.saveToJSON(project, 'project.pf');
  }

  async openProject() {
    try {
      const project = await FileService.loadFromJSON<ProjectFile>();
      await projectStore.loadProject(project);
    } catch (e) {
      console.error('Failed to load project:', e);
    }
  }

  exportImage() {
    // Combine all layers
    const canvas = document.createElement('canvas');
    canvas.width = projectStore.width.value;
    canvas.height = projectStore.height.value;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      // Draw layers in order
      layerStore.layers.value.forEach(layer => {
        if (layer.visible && layer.canvas) {
          ctx.globalAlpha = layer.opacity / 255;
          ctx.drawImage(layer.canvas, 0, 0);
        }
      });
      FileService.exportToPNG(canvas, 'image.png');
    }
  }

  render() {
    return html`
      <button id="btn-file" class="menu-btn" popovertarget="menu-file">File</button>
      <div id="menu-file" popover>
        <div class="menu-item">New... <span class="shortcut">Ctrl+N</span></div>
        <div class="menu-item" @click=${this.openProject}>Open... <span class="shortcut">Ctrl+O</span></div>
        <div class="menu-item" @click=${this.saveProject}>Save <span class="shortcut">Ctrl+S</span></div>
        <div class="menu-item" @click=${this.exportImage}>Export PNG...</div>
      </div>

      <button id="btn-edit" class="menu-btn" popovertarget="menu-edit">Edit</button>
      <div id="menu-edit" popover>
        <div class="menu-item" @click=${() => historyStore.undo()}>Undo <span class="shortcut">Ctrl+Z</span></div>
        <div class="menu-item" @click=${() => historyStore.redo()}>Redo <span class="shortcut">Ctrl+Y</span></div>
        <div class="menu-item">Cut <span class="shortcut">Ctrl+X</span></div>
        <div class="menu-item">Copy <span class="shortcut">Ctrl+C</span></div>
        <div class="menu-item">Paste <span class="shortcut">Ctrl+V</span></div>
      </div>

      <button id="btn-view" class="menu-btn" popovertarget="menu-view">View</button>
      <div id="menu-view" popover>
        <div class="menu-item">Zoom In <span class="shortcut">Ctrl++</span></div>
        <div class="menu-item">Zoom Out <span class="shortcut">Ctrl+-</span></div>
        <div class="menu-item">Fit on Screen <span class="shortcut">Ctrl+0</span></div>
        <div class="menu-item">Grid Settings...</div>
      </div>

      <button id="btn-image" class="menu-btn" popovertarget="menu-image">Image</button>
      <div id="menu-image" popover>
        <div class="menu-item" @click=${() => this.dispatchEvent(new CustomEvent('resize-canvas', { bubbles: true, composed: true }))}>Resize Canvas...</div>
        <div class="menu-item" @click=${() => this.flipLayer('horizontal')}>Flip Horizontal</div>
        <div class="menu-item" @click=${() => this.flipLayer('vertical')}>Flip Vertical</div>
        <div class="menu-item" @click=${() => this.rotateLayer(90)}>Rotate 90° CW</div>
        <div class="menu-item" @click=${() => this.rotateLayer(-90)}>Rotate 90° CCW</div>
      </div>
    `;
  }
}
