import { html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { referenceImageStore } from "../../stores/reference-image";
import type { ReferenceImage } from "../../types/reference";

@customElement("pf-references-panel")
export class PFReferencesPanel extends BaseComponent {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--pf-spacing-2, 8px);
      padding: var(--pf-spacing-2, 8px);
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--pf-spacing-2, 8px);
    }

    .header-controls {
      display: flex;
      gap: var(--pf-spacing-1, 4px);
    }

    .icon-btn {
      background: transparent;
      border: none;
      color: var(--pf-color-text-main, #e0e0e0);
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      font-size: 14px;
    }

    .icon-btn:hover {
      background: var(--pf-color-bg-hover, #2a2a2a);
    }

    .icon-btn.active {
      color: var(--pf-color-accent, #4a9eff);
    }

    .empty-state {
      text-align: center;
      padding: var(--pf-spacing-4, 16px);
      color: var(--pf-color-text-muted, #808080);
      font-size: var(--pf-font-size-sm, 12px);
    }

    .image-list {
      display: flex;
      flex-direction: column;
      gap: var(--pf-spacing-2, 8px);
    }

    .image-row {
      display: flex;
      gap: var(--pf-spacing-2, 8px);
      padding: var(--pf-spacing-2, 8px);
      background: var(--pf-color-bg-dark, #1a1a1a);
      border-radius: 4px;
      border: 1px solid transparent;
    }

    .image-row.active {
      border-color: var(--pf-color-accent, #4a9eff);
    }

    .thumbnail {
      width: 48px;
      height: 48px;
      background: var(--pf-color-bg-panel, #252525);
      border-radius: 4px;
      overflow: hidden;
      cursor: pointer;
      flex-shrink: 0;
    }

    .thumbnail img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .image-controls {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: var(--pf-spacing-1, 4px);
      min-width: 0;
    }

    .control-row {
      display: flex;
      align-items: center;
      gap: var(--pf-spacing-1, 4px);
    }

    .opacity-slider {
      flex: 1;
      height: 4px;
      -webkit-appearance: none;
      background: var(--pf-color-bg-panel, #252525);
      border-radius: 2px;
      cursor: pointer;
    }

    .opacity-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 12px;
      height: 12px;
      background: var(--pf-color-accent, #4a9eff);
      border-radius: 50%;
      cursor: pointer;
    }

    .opacity-value {
      font-size: var(--pf-font-size-xs, 10px);
      color: var(--pf-color-text-muted, #808080);
      width: 32px;
      text-align: right;
    }

    .transform-section {
      margin-top: var(--pf-spacing-2, 8px);
      padding-top: var(--pf-spacing-2, 8px);
      border-top: 1px solid var(--pf-color-border, #333);
    }

    .transform-row {
      display: flex;
      align-items: center;
      gap: var(--pf-spacing-2, 8px);
      margin-bottom: var(--pf-spacing-1, 4px);
    }

    .transform-label {
      font-size: var(--pf-font-size-xs, 10px);
      color: var(--pf-color-text-muted, #808080);
      width: 50px;
    }

    .transform-input {
      flex: 1;
      background: var(--pf-color-bg-dark, #1a1a1a);
      border: 1px solid var(--pf-color-border, #333);
      border-radius: 4px;
      padding: 4px 8px;
      color: var(--pf-color-text-main, #e0e0e0);
      font-size: var(--pf-font-size-sm, 12px);
    }

    .transform-input:focus {
      outline: none;
      border-color: var(--pf-color-accent, #4a9eff);
    }

    input[type="file"] {
      display: none;
    }
  `;

  @state() private thumbnails = new Map<string, string>();

  updated() {
    // Generate thumbnails for new images
    const images = referenceImageStore.images.value;
    for (const img of images) {
      if (!this.thumbnails.has(img.id)) {
        this.generateThumbnail(img);
      }
    }
    // Clean up old thumbnails
    for (const id of this.thumbnails.keys()) {
      if (!images.find((img) => img.id === id)) {
        URL.revokeObjectURL(this.thumbnails.get(id)!);
        this.thumbnails.delete(id);
      }
    }
  }

  private generateThumbnail(img: ReferenceImage) {
    const thumbCanvas = document.createElement("canvas");
    thumbCanvas.width = 48;
    thumbCanvas.height = 48;
    const ctx = thumbCanvas.getContext("2d")!;

    // Scale to fit
    const scale = Math.min(48 / img.canvas.width, 48 / img.canvas.height);
    const w = img.canvas.width * scale;
    const h = img.canvas.height * scale;
    const x = (48 - w) / 2;
    const y = (48 - h) / 2;

    ctx.drawImage(img.canvas, x, y, w, h);

    thumbCanvas.toBlob((blob) => {
      if (blob) {
        this.thumbnails.set(img.id, URL.createObjectURL(blob));
        this.requestUpdate();
      }
    });
  }

  private handleAddClick() {
    const input = this.renderRoot.querySelector('input[type="file"]') as HTMLInputElement;
    input?.click();
  }

  private async handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      await referenceImageStore.addImage(file);
      input.value = "";
    }
  }

  private handleImageClick(id: string) {
    // Toggle selection - if already selected, deselect
    if (referenceImageStore.activeImageId.value === id) {
      referenceImageStore.setActiveImage(null);
    } else {
      referenceImageStore.setActiveImage(id);
    }
  }

  private handleVisibilityToggle(id: string, visible: boolean) {
    referenceImageStore.updateImage(id, { visible: !visible });
  }

  private handleLockToggle(id: string, locked: boolean) {
    referenceImageStore.updateImage(id, { locked: !locked });
  }

  private handleLayerToggle(id: string, aboveLayers: boolean) {
    referenceImageStore.updateImage(id, { aboveLayers: !aboveLayers });
  }

  private handleOpacityChange(id: string, e: Event) {
    const value = parseFloat((e.target as HTMLInputElement).value);
    referenceImageStore.updateImage(id, { opacity: value });
  }

  private handleDelete(id: string) {
    referenceImageStore.removeImage(id);
  }

  private handlePositionChange(id: string, axis: "x" | "y", value: string) {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      referenceImageStore.updateImage(id, { [axis]: num });
    }
  }

  private handleScaleChange(id: string, value: string) {
    const num = parseFloat(value);
    if (!isNaN(num) && num >= 0.1 && num <= 5) {
      referenceImageStore.updateImage(id, { scale: num });
    }
  }

  private handleRotationChange(id: string, value: string) {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      referenceImageStore.updateImage(id, { rotation: num % 360 });
    }
  }

  private handleResetRotation(id: string) {
    referenceImageStore.updateImage(id, { rotation: 0 });
  }

  render() {
    const images = referenceImageStore.images.value;
    const activeId = referenceImageStore.activeImageId.value;
    const enabled = referenceImageStore.enabled.value;
    const activeImage = images.find((img) => img.id === activeId);

    return html`
      <div class="header">
        <div class="header-controls">
          <button
            class="icon-btn ${enabled ? 'active' : ''}"
            @click=${() => referenceImageStore.toggleEnabled()}
            title="${enabled ? 'Hide all references' : 'Show all references'}"
          >
            ${enabled ? "V" : "H"}
          </button>
          <button class="icon-btn" @click=${this.handleAddClick} title="Add reference image">
            +
          </button>
        </div>
      </div>

      <input
        type="file"
        accept=".png,.jpg,.jpeg,.gif,.webp"
        @change=${this.handleFileSelect}
      />

      ${images.length === 0
        ? html`
            <div class="empty-state">
              No reference images.<br />
              Click + to add one.
            </div>
          `
        : html`
            <div class="image-list">
              ${images.map(
                (img) => html`
                  <div class="image-row ${img.id === activeId ? 'active' : ''}">
                    <div class="thumbnail" @click=${() => this.handleImageClick(img.id)}>
                      ${this.thumbnails.has(img.id)
                        ? html`<img src=${this.thumbnails.get(img.id)!} alt="" />`
                        : ""}
                    </div>
                    <div class="image-controls">
                      <div class="control-row">
                        <button
                          class="icon-btn ${img.visible ? 'active' : ''}"
                          @click=${() => this.handleVisibilityToggle(img.id, img.visible)}
                          title="${img.visible ? 'Hide' : 'Show'}"
                        >
                          ${img.visible ? "V" : "H"}
                        </button>
                        <button
                          class="icon-btn ${img.locked ? 'active' : ''}"
                          @click=${() => this.handleLockToggle(img.id, img.locked)}
                          title="${img.locked ? 'Unlock' : 'Lock'}"
                        >
                          ${img.locked ? "L" : "U"}
                        </button>
                        <button
                          class="icon-btn"
                          @click=${() => this.handleLayerToggle(img.id, img.aboveLayers)}
                          title="${img.aboveLayers ? 'Move below layers' : 'Move above layers'}"
                        >
                          ${img.aboveLayers ? "A" : "B"}
                        </button>
                        <button
                          class="icon-btn"
                          @click=${() => this.handleDelete(img.id)}
                          title="Delete"
                        >
                          X
                        </button>
                      </div>
                      <div class="control-row">
                        <input
                          type="range"
                          class="opacity-slider"
                          min="0.1"
                          max="0.9"
                          step="0.05"
                          .value=${String(img.opacity)}
                          @input=${(e: Event) => this.handleOpacityChange(img.id, e)}
                        />
                        <span class="opacity-value">${Math.round(img.opacity * 100)}%</span>
                      </div>
                    </div>
                  </div>
                `
              )}
            </div>
          `}

      ${activeImage
        ? html`
            <div class="transform-section">
              <div class="transform-row">
                <span class="transform-label">X:</span>
                <input
                  type="number"
                  class="transform-input"
                  .value=${String(Math.round(activeImage.x))}
                  @change=${(e: Event) => this.handlePositionChange(activeImage.id, "x", (e.target as HTMLInputElement).value)}
                />
                <span class="transform-label">Y:</span>
                <input
                  type="number"
                  class="transform-input"
                  .value=${String(Math.round(activeImage.y))}
                  @change=${(e: Event) => this.handlePositionChange(activeImage.id, "y", (e.target as HTMLInputElement).value)}
                />
              </div>
              <div class="transform-row">
                <span class="transform-label">Scale:</span>
                <input
                  type="number"
                  class="transform-input"
                  min="0.1"
                  max="5"
                  step="0.1"
                  .value=${String(activeImage.scale)}
                  @change=${(e: Event) => this.handleScaleChange(activeImage.id, (e.target as HTMLInputElement).value)}
                />
              </div>
              <div class="transform-row">
                <span class="transform-label">Rotation:</span>
                <input
                  type="number"
                  class="transform-input"
                  .value=${String(Math.round(activeImage.rotation))}
                  @change=${(e: Event) => this.handleRotationChange(activeImage.id, (e.target as HTMLInputElement).value)}
                />
                <button class="icon-btn" @click=${() => this.handleResetRotation(activeImage.id)} title="Reset rotation">
                  R
                </button>
              </div>
            </div>
          `
        : ""}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pf-references-panel": PFReferencesPanel;
  }
}
