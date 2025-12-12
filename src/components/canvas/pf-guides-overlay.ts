import { html, css, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { viewportStore } from "../../stores/viewport";
import { guidesStore } from "../../stores/guides";

/**
 * Overlay component that renders guide lines.
 * Lines extend across the entire workspace area.
 */
@customElement("pf-guides-overlay")
export class PFGuidesOverlay extends BaseComponent {
  static styles = css`
    :host {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      overflow: visible;
      z-index: 50;
    }

    .guide {
      position: absolute;
      background: var(--guide-color, #00ffff);
      opacity: 0.8;
    }

    .guide.horizontal {
      left: 0;
      right: 0;
      height: 1px;
    }

    .guide.vertical {
      top: 0;
      bottom: 0;
      width: 1px;
    }

    /* Subtle glow effect for visibility */
    .guide::before {
      content: "";
      position: absolute;
      background: var(--guide-color, #00ffff);
      opacity: 0.3;
    }

    .guide.horizontal::before {
      left: 0;
      right: 0;
      top: -1px;
      height: 3px;
    }

    .guide.vertical::before {
      top: 0;
      bottom: 0;
      left: -1px;
      width: 3px;
    }

    /* Preview guides during drag - dashed pattern */
    .guide.preview {
      opacity: 0.6;
      background: repeating-linear-gradient(
        90deg,
        var(--guide-color, #00ffff) 0px,
        var(--guide-color, #00ffff) 4px,
        transparent 4px,
        transparent 8px
      );
    }

    .guide.horizontal.preview {
      background: repeating-linear-gradient(
        90deg,
        var(--guide-color, #00ffff) 0px,
        var(--guide-color, #00ffff) 4px,
        transparent 4px,
        transparent 8px
      );
    }

    .guide.vertical.preview {
      background: repeating-linear-gradient(
        0deg,
        var(--guide-color, #00ffff) 0px,
        var(--guide-color, #00ffff) 4px,
        transparent 4px,
        transparent 8px
      );
    }

    .guide.preview::before {
      display: none;
    }
  `;

  render() {
    // Access reactive signals
    const horizontalGuide = guidesStore.horizontalGuide.value;
    const verticalGuide = guidesStore.verticalGuide.value;
    const visible = guidesStore.visible.value;
    const zoom = viewportStore.zoom.value;
    const panX = viewportStore.panX.value;
    const panY = viewportStore.panY.value;

    // Drag previews
    const dragPreviewH = guidesStore.dragPreviewHorizontal.value;
    const dragPreviewV = guidesStore.dragPreviewVertical.value;

    // Calculate screen positions for placed guides
    // Note: viewport-content is at (0,0), guides align with canvas pixels at panX/panY
    const horizontalScreenY =
      visible && horizontalGuide !== null
        ? panY + horizontalGuide * zoom
        : null;

    const verticalScreenX =
      visible && verticalGuide !== null
        ? panX + verticalGuide * zoom
        : null;

    // Calculate screen positions for drag previews
    const previewHorizontalY =
      dragPreviewH !== null
        ? panY + dragPreviewH * zoom
        : null;

    const previewVerticalX =
      dragPreviewV !== null
        ? panX + dragPreviewV * zoom
        : null;

    return html`
      ${horizontalScreenY !== null
        ? html`<div
            class="guide horizontal"
            style="top: ${horizontalScreenY}px"
          ></div>`
        : nothing}
      ${verticalScreenX !== null
        ? html`<div
            class="guide vertical"
            style="left: ${verticalScreenX}px"
          ></div>`
        : nothing}
      ${previewHorizontalY !== null
        ? html`<div
            class="guide horizontal preview"
            style="top: ${previewHorizontalY}px"
          ></div>`
        : nothing}
      ${previewVerticalX !== null
        ? html`<div
            class="guide vertical preview"
            style="left: ${previewVerticalX}px"
          ></div>`
        : nothing}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pf-guides-overlay": PFGuidesOverlay;
  }
}
