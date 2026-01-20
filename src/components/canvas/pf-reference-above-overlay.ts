import { css } from "lit";
import { customElement } from "lit/decorators.js";
import { PFReferenceOverlayBase } from "./pf-reference-overlay-base";
import { referenceImageStore } from "../../stores/reference-image";
import { viewportStore } from "../../stores/viewport";
import type { ReferenceImage } from "../../types/reference";

// Selection handle constants
const HANDLE_SIZE = 8;
const ROTATION_HANDLE_OFFSET = 20;
const ROTATION_HANDLE_RADIUS = 6;
const DASH_PATTERN: [number, number] = [4, 4];
const SELECTION_COLOR = "#00aaff";

@customElement("pf-reference-above-overlay")
export class PFReferenceAboveOverlay extends PFReferenceOverlayBase {
  static styles = css`
    ${PFReferenceOverlayBase.baseStyles}
    :host {
      z-index: 44;
    }
  `;

  protected getZIndex(): number {
    return 44;
  }

  protected filterImages(images: ReferenceImage[]): ReferenceImage[] {
    return images.filter((img) => img.visible && img.aboveLayers);
  }

  protected accessAdditionalSignals(): void {
    // Active image ID needed for selection handles reactivity
    void referenceImageStore.activeImageId.value;
  }

  protected drawAdditional(
    ctx: CanvasRenderingContext2D,
    zoom: number,
    panX: number,
    panY: number
  ): void {
    // Selection handles always render in the above overlay (on top of all layers)
    // regardless of whether the reference image itself is above or below layers.
    // This ensures handles are always visible and interactable.
    const activeImage = referenceImageStore.getActiveImage();
    if (activeImage && activeImage.visible) {
      this.drawSelectionHandles(ctx, activeImage, zoom, panX, panY);
    }
  }

  private drawSelectionHandles(
    ctx: CanvasRenderingContext2D,
    img: ReferenceImage,
    zoom: number,
    panX: number,
    panY: number
  ) {
    const scaledWidth = img.canvas.width * img.scale * zoom;
    const scaledHeight = img.canvas.height * img.scale * zoom;
    const screenX = img.x * zoom + panX;
    const screenY = img.y * zoom + panY;

    ctx.save();
    ctx.translate(screenX + scaledWidth / 2, screenY + scaledHeight / 2);
    ctx.rotate((img.rotation * Math.PI) / 180);

    // Draw dashed bounding box
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 1;
    ctx.setLineDash(DASH_PATTERN);
    ctx.strokeRect(-scaledWidth / 2, -scaledHeight / 2, scaledWidth, scaledHeight);
    ctx.setLineDash([]);

    // Draw corner and edge handles
    const handles = [
      { x: -scaledWidth / 2, y: -scaledHeight / 2 }, // top-left
      { x: scaledWidth / 2, y: -scaledHeight / 2 },  // top-right
      { x: -scaledWidth / 2, y: scaledHeight / 2 },  // bottom-left
      { x: scaledWidth / 2, y: scaledHeight / 2 },   // bottom-right
      { x: 0, y: -scaledHeight / 2 },                 // top-center
      { x: 0, y: scaledHeight / 2 },                  // bottom-center
      { x: -scaledWidth / 2, y: 0 },                  // left-center
      { x: scaledWidth / 2, y: 0 },                   // right-center
    ];

    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 1;

    for (const handle of handles) {
      ctx.fillRect(
        handle.x - HANDLE_SIZE / 2,
        handle.y - HANDLE_SIZE / 2,
        HANDLE_SIZE,
        HANDLE_SIZE
      );
      ctx.strokeRect(
        handle.x - HANDLE_SIZE / 2,
        handle.y - HANDLE_SIZE / 2,
        HANDLE_SIZE,
        HANDLE_SIZE
      );
    }

    // Draw rotation handle (circle above top center)
    const rotationHandleY = -scaledHeight / 2 - ROTATION_HANDLE_OFFSET;
    ctx.beginPath();
    ctx.arc(0, rotationHandleY, ROTATION_HANDLE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.stroke();

    // Draw line from top center to rotation handle
    ctx.beginPath();
    ctx.moveTo(0, -scaledHeight / 2);
    ctx.lineTo(0, rotationHandleY + ROTATION_HANDLE_RADIUS);
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.stroke();

    ctx.restore();
  }
}
