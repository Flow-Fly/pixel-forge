import { html, css, render } from "lit";
import { customElement, property } from "lit/decorators.js";
import { BaseComponent } from "../../../core/base-component";
import { animationStore } from "../../../stores/animation";
import { layerStore } from "../../../stores/layers";
import { projectStore } from "../../../stores/project";
import { renderFrameToCanvas } from "../../../utils/preview-renderer";

const FRAME_WIDTH = 32;
const PREVIEW_SCALE = 2;

@customElement("pf-timeline-resize-preview")
export class PFTimelineResizePreview extends BaseComponent {
  static styles = css`
    :host {
      display: none;
    }
  `;

  @property({ type: String }) tagId: string | null = null;
  @property({ type: String }) edge: "left" | "right" | null = null;
  @property({ type: Number }) previewIndex: number | null = null;
  @property({ type: Object }) headerRect: DOMRect | null = null;

  private portal: HTMLDivElement | null = null;

  connectedCallback() {
    super.connectedCallback();
    this.portal = document.createElement("div");
    this.portal.id = "resize-preview-portal";
    this.portal.style.cssText = `
      position: fixed;
      z-index: 10000;
      pointer-events: none;
      display: none;
    `;
    document.body.appendChild(this.portal);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.portal && this.portal.parentNode) {
      this.portal.parentNode.removeChild(this.portal);
      this.portal = null;
    }
  }

  protected updated(changedProperties: Map<string, unknown>): void {
    super.updated(changedProperties);
    if (
      changedProperties.has("previewIndex") ||
      changedProperties.has("tagId") ||
      changedProperties.has("edge")
    ) {
      this.renderPortal();
    }
  }

  private renderPortal() {
    if (!this.portal) return;

    if (!this.tagId || this.previewIndex === null || !this.headerRect) {
      this.portal.style.display = "none";
      return;
    }

    const tag = animationStore.tags.value.find((t) => t.id === this.tagId);
    if (!tag) return;

    const frames = animationStore.frames.value;
    const layers = layerStore.layers.value;
    const cels = animationStore.cels.value;
    const canvasW = projectStore.width.value;
    const canvasH = projectStore.height.value;

    // Calculate preview range
    const previewStart =
      this.edge === "left"
        ? Math.min(this.previewIndex, tag.endFrameIndex)
        : tag.startFrameIndex;
    const previewEnd =
      this.edge === "right"
        ? Math.max(this.previewIndex, tag.startFrameIndex)
        : tag.endFrameIndex;

    const previewStartLabel = `Frame ${previewStart + 1}`;
    const previewEndLabel = `Frame ${previewEnd + 1}`;

    // Calculate positions
    const previewWidth = canvasW * PREVIEW_SCALE + 10;
    const previewHeight = canvasH * PREVIEW_SCALE + 24;

    const startX =
      this.headerRect.left +
      previewStart * FRAME_WIDTH +
      FRAME_WIDTH / 2 -
      previewWidth / 2;
    const endX =
      this.headerRect.left +
      previewEnd * FRAME_WIDTH +
      FRAME_WIDTH / 2 -
      previewWidth / 2;

    let previewY = this.headerRect.top - previewHeight - 8;
    if (previewY < 8) {
      previewY = this.headerRect.bottom + 8;
    }

    const previewFrameStyle = `
      position: fixed;
      top: ${previewY}px;
      z-index: 10000;
      pointer-events: none;
      background: var(--pf-color-bg-panel, #1e1e1e);
      border: 1px solid var(--pf-color-border, #3e3e3e);
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      padding: 4px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
    `;

    const canvasStyle = `
      display: block;
      image-rendering: pixelated;
      width: ${canvasW * PREVIEW_SCALE}px;
      height: ${canvasH * PREVIEW_SCALE}px;
      background-image: linear-gradient(45deg, #404040 25%, transparent 25%),
        linear-gradient(-45deg, #404040 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #404040 75%),
        linear-gradient(-45deg, transparent 75%, #404040 75%);
      background-size: 8px 8px;
      background-position: 0 0, 0 4px, 4px -4px, -4px 0px;
      background-color: #606060;
    `;

    const template = html`
      <div
        class="resize-preview-start"
        style="${previewFrameStyle} left: ${startX}px;"
      >
        <canvas
          class="resize-preview-start-canvas"
          width="${canvasW}"
          height="${canvasH}"
          style="${canvasStyle}"
        ></canvas>
        <span
          style="font-size: 9px; color: var(--pf-color-text-muted, #888); white-space: nowrap;"
        >
          ${previewStartLabel}
        </span>
      </div>
      <div
        class="resize-preview-end"
        style="${previewFrameStyle} left: ${endX}px;"
      >
        <canvas
          class="resize-preview-end-canvas"
          width="${canvasW}"
          height="${canvasH}"
          style="${canvasStyle}"
        ></canvas>
        <span
          style="font-size: 9px; color: var(--pf-color-text-muted, #888); white-space: nowrap;"
        >
          ${previewEndLabel}
        </span>
      </div>
    `;

    render(template, this.portal);
    this.portal.style.display = "block";

    // Render frame content to canvases after DOM update
    requestAnimationFrame(() => {
      if (!this.portal) return;

      const startCanvas = this.portal.querySelector(
        ".resize-preview-start-canvas"
      ) as HTMLCanvasElement;
      const endCanvas = this.portal.querySelector(
        ".resize-preview-end-canvas"
      ) as HTMLCanvasElement;

      if (startCanvas && frames[previewStart]) {
        const ctx = startCanvas.getContext("2d");
        if (ctx) {
          renderFrameToCanvas(ctx, frames[previewStart].id, layers, cels);
        }
      }

      if (endCanvas && frames[previewEnd]) {
        const ctx = endCanvas.getContext("2d");
        if (ctx) {
          renderFrameToCanvas(ctx, frames[previewEnd].id, layers, cels);
        }
      }
    });
  }

  hide() {
    if (this.portal) {
      this.portal.style.display = "none";
    }
  }

  render() {
    return html``;
  }
}
