import { html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { selectionStore } from "../../stores/selection";
import { viewportStore } from "../../stores/viewport";
import {
  angleFromCenter,
  snapAngle,
  normalizeAngle,
} from "../../utils/rotation";

/**
 * Handle positions relative to bounding box
 */
type HandlePosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

interface HandleInfo {
  position: HandlePosition;
  screenX: number;
  screenY: number;
}

/**
 * Transform handles overlay for rotation.
 * Uses positioned DOM elements for handles so they only capture their own events.
 */
@customElement("pf-transform-handles")
export class PFTransformHandles extends BaseComponent {
  static styles = css`
    :host {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 50;
    }

    .handle {
      position: absolute;
      width: 14px;
      height: 14px;
      margin-left: -7px;
      margin-top: -7px;
      border-radius: 50%;
      background: white;
      border: 1px solid #333;
      cursor: grab;
      pointer-events: auto;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .handle:hover {
      background: #4a9eff;
    }

    .handle::after {
      content: "";
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: #333;
    }

    .handle.dragging {
      cursor: grabbing;
    }
  `;

  // Handle properties
  private readonly HANDLE_OFFSET = 12; // Distance from corner

  // Drag state
  @state() private isDragging = false;
  @state() private handles: HandleInfo[] = [];
  private dragStartAngle = 0;
  private initialRotation = 0;

  connectedCallback() {
    super.connectedCallback();
    // Global mouse events for drag continuation
    document.addEventListener("mousemove", this.handleDocumentMouseMove);
    document.addEventListener("mouseup", this.handleDocumentMouseUp);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("mousemove", this.handleDocumentMouseMove);
    document.removeEventListener("mouseup", this.handleDocumentMouseUp);
  }

  private getHandles(): HandleInfo[] {
    const state = selectionStore.state.value;
    if (
      state.type !== "floating" &&
      state.type !== "transforming" &&
      state.type !== "selected"
    ) {
      return [];
    }

    const zoom = viewportStore.zoom.value;
    const panX = viewportStore.panX.value;
    const panY = viewportStore.panY.value;

    // For transforming state, use original bounds + offset and apply rotation
    if (state.type === "transforming") {
      const bounds = state.originalBounds;
      const moveOffset = state.currentOffset;
      const rotation = state.rotation;

      // Calculate center in screen coordinates (with offset applied)
      const centerX = (bounds.x + moveOffset.x + bounds.width / 2) * zoom + panX;
      const centerY = (bounds.y + moveOffset.y + bounds.height / 2) * zoom + panY;

      // Half dimensions
      const halfW = (bounds.width * zoom) / 2;
      const halfH = (bounds.height * zoom) / 2;

      // Corner positions relative to center (before rotation)
      const handleOffset = this.HANDLE_OFFSET;
      const corners = [
        {
          pos: "top-left" as HandlePosition,
          x: -halfW - handleOffset,
          y: -halfH - handleOffset,
        },
        {
          pos: "top-right" as HandlePosition,
          x: halfW + handleOffset,
          y: -halfH - handleOffset,
        },
        {
          pos: "bottom-left" as HandlePosition,
          x: -halfW - handleOffset,
          y: halfH + handleOffset,
        },
        {
          pos: "bottom-right" as HandlePosition,
          x: halfW + handleOffset,
          y: halfH + handleOffset,
        },
      ];

      // Apply rotation to each corner
      const radians = (rotation * Math.PI) / 180;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);

      return corners.map((corner) => ({
        position: corner.pos,
        screenX: centerX + corner.x * cos - corner.y * sin,
        screenY: centerY + corner.x * sin + corner.y * cos,
      }));
    }

    // For non-transforming states, use bounds directly (no rotation)
    const bounds = selectionStore.bounds;
    if (!bounds) return [];

    // Calculate screen coordinates of bounding box
    const screenLeft = bounds.x * zoom + panX;
    const screenTop = bounds.y * zoom + panY;
    const screenRight = (bounds.x + bounds.width) * zoom + panX;
    const screenBottom = (bounds.y + bounds.height) * zoom + panY;

    // Offset handles outside the box
    const offset = this.HANDLE_OFFSET;

    return [
      {
        position: "top-left",
        screenX: screenLeft - offset,
        screenY: screenTop - offset,
      },
      {
        position: "top-right",
        screenX: screenRight + offset,
        screenY: screenTop - offset,
      },
      {
        position: "bottom-left",
        screenX: screenLeft - offset,
        screenY: screenBottom + offset,
      },
      {
        position: "bottom-right",
        screenX: screenRight + offset,
        screenY: screenBottom + offset,
      },
    ];
  }

  private getSelectionCenter(): { x: number; y: number } | null {
    const state = selectionStore.state.value;
    const zoom = viewportStore.zoom.value;
    const panX = viewportStore.panX.value;
    const panY = viewportStore.panY.value;

    // For transforming state, use original bounds + offset (rotation is around moved center)
    if (state.type === "transforming") {
      const bounds = state.originalBounds;
      const offset = state.currentOffset;
      return {
        x: (bounds.x + offset.x + bounds.width / 2) * zoom + panX,
        y: (bounds.y + offset.y + bounds.height / 2) * zoom + panY,
      };
    }

    // For other states, use calculated bounds
    const bounds = selectionStore.bounds;
    if (!bounds) return null;

    return {
      x: (bounds.x + bounds.width / 2) * zoom + panX,
      y: (bounds.y + bounds.height / 2) * zoom + panY,
    };
  }

  private handleMouseDown = (e: MouseEvent, handle: HandlePosition) => {
    const state = selectionStore.state.value;

    // If we're in selected or floating state, signal start of rotation
    if (state.type === "selected" || state.type === "floating") {
      this.dispatchEvent(
        new CustomEvent("rotation-start", {
          bubbles: true,
          composed: true,
          detail: { handle },
        })
      );
    }

    // Start drag tracking
    const center = this.getSelectionCenter();
    if (!center) return;

    // Convert mouse coordinates to viewport-relative
    const rect = this.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    this.isDragging = true;
    this.dragStartAngle = angleFromCenter(center.x, center.y, mouseX, mouseY);
    this.initialRotation = selectionStore.rotation;

    // Enable draft quality and rAF throttling for live preview performance
    selectionStore.startRotationDrag();

    e.preventDefault();
    e.stopPropagation();
  };

  private handleDocumentMouseMove = (e: MouseEvent) => {
    if (!this.isDragging) return;

    const center = this.getSelectionCenter();
    if (!center) return;

    // Convert mouse coordinates to viewport-relative
    const rect = this.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const currentAngle = angleFromCenter(center.x, center.y, mouseX, mouseY);
    let deltaAngle = currentAngle - this.dragStartAngle;

    // Handle wraparound
    if (deltaAngle > 180) deltaAngle -= 360;
    if (deltaAngle < -180) deltaAngle += 360;

    let newRotation = this.initialRotation + deltaAngle;

    // Snap to 15 degree increments when Shift is held
    if (e.shiftKey) {
      newRotation = snapAngle(newRotation, 15);
    }

    newRotation = normalizeAngle(newRotation);

    // Update rotation in store
    selectionStore.updateRotation(newRotation);
  };

  private handleDocumentMouseUp = () => {
    if (this.isDragging) {
      this.isDragging = false;

      // Regenerate preview at full quality now that drag is complete
      selectionStore.endRotationDrag();

      this.dispatchEvent(
        new CustomEvent("rotation-end", {
          bubbles: true,
          composed: true,
        })
      );
    }
  };

  render() {
    // Access signals for reactivity
    void selectionStore.state.value;
    void viewportStore.zoom.value;
    void viewportStore.panX.value;
    void viewportStore.panY.value;

    const handles = this.getHandles();

    if (handles.length === 0) {
      return nothing;
    }

    return html`
      ${handles.map(
        (handle) => html`
          <div
            class="handle ${this.isDragging ? "dragging" : ""}"
            style="left: ${handle.screenX}px; top: ${handle.screenY}px;"
            @mousedown=${(e: MouseEvent) =>
              this.handleMouseDown(e, handle.position)}
          ></div>
        `
      )}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pf-transform-handles": PFTransformHandles;
  }
}
