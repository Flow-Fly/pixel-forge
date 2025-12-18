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
 * Handle types
 */
type HandleType = "resize-corner" | "resize-edge" | "rotation";

/**
 * Handle positions
 */
type HandlePosition =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right"
  | "rotation-button";

interface HandleInfo {
  type: HandleType;
  position: HandlePosition;
  screenX: number;
  screenY: number;
  cursor: string;
}

/**
 * Transform handles overlay for resize and rotation.
 * - Corner squares: resize both dimensions
 * - Edge rectangles: resize single dimension
 * - Single rotation button at top-right corner
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
      pointer-events: auto;
      box-sizing: border-box;
    }

    /* Resize corner handles - squares */
    .handle.resize-corner {
      width: 10px;
      height: 10px;
      margin-left: -5px;
      margin-top: -5px;
      background: white;
      border: 1px solid #333;
      border-radius: 2px;
    }

    .handle.resize-corner:hover {
      background: #4a9eff;
    }

    /* Resize edge handles - rectangles */
    .handle.resize-edge {
      background: white;
      border: 1px solid #333;
      border-radius: 2px;
    }

    .handle.resize-edge.horizontal {
      width: 16px;
      height: 8px;
      margin-left: -8px;
      margin-top: -4px;
    }

    .handle.resize-edge.vertical {
      width: 8px;
      height: 16px;
      margin-left: -4px;
      margin-top: -8px;
    }

    .handle.resize-edge:hover {
      background: #4a9eff;
    }

    /* Rotation handle - single button at top-right */
    .handle.rotation {
      width: 18px;
      height: 18px;
      margin-left: -9px;
      margin-top: -9px;
      border-radius: 50%;
      background: white;
      border: 1px solid #333;
      cursor: grab;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
    }

    .handle.rotation:hover {
      background: #4a9eff;
    }

    /* Rotation arrow icon */
    .handle.rotation::after {
      content: "↻";
      color: #333;
      font-size: 12px;
      font-weight: bold;
    }

    .handle.rotation:hover::after {
      color: white;
    }

    .handle.dragging {
      cursor: grabbing !important;
    }

    /* Rotation angle tooltip */
    .rotation-tooltip {
      position: absolute;
      background: rgba(0, 0, 0, 0.8);
      color: #4a9eff;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 11px;
      font-family: monospace;
      white-space: nowrap;
      pointer-events: none;
    }
  `;

  // Handle positioning
  private readonly ROTATION_OFFSET = 16; // Distance from corner for rotation handles

  // Drag state
  @state() private isDragging = false;
  @state() private activeHandle: HandleInfo | null = null;

  // Rotation drag state
  private dragStartAngle = 0;
  private initialRotation = 0;

  // Resize drag state
  private dragStartX = 0;
  private dragStartY = 0;
  private initialScale = { x: 1, y: 1 };
  private initialBounds: { width: number; height: number } | null = null;

  connectedCallback() {
    super.connectedCallback();
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

    // Get bounds based on state
    let screenLeft: number, screenTop: number, screenRight: number, screenBottom: number;
    let centerX: number, centerY: number;

    if (state.type === "transforming") {
      // For transforming, use original bounds + offset + scale
      // Scale is applied from the center, so calculate center first, then scaled dimensions
      const bounds = state.originalBounds;
      const offset = state.currentOffset;
      const scale = state.scale;

      // Center point (pivot for scaling)
      const centerPixelX = bounds.x + offset.x + bounds.width / 2;
      const centerPixelY = bounds.y + offset.y + bounds.height / 2;

      // Scaled half-dimensions
      const halfWidth = (bounds.width * scale.x) / 2;
      const halfHeight = (bounds.height * scale.y) / 2;

      // Screen positions accounting for scale
      screenLeft = (centerPixelX - halfWidth) * zoom + panX;
      screenTop = (centerPixelY - halfHeight) * zoom + panY;
      screenRight = (centerPixelX + halfWidth) * zoom + panX;
      screenBottom = (centerPixelY + halfHeight) * zoom + panY;
    } else {
      const bounds = selectionStore.bounds;
      if (!bounds) return [];
      screenLeft = bounds.x * zoom + panX;
      screenTop = bounds.y * zoom + panY;
      screenRight = (bounds.x + bounds.width) * zoom + panX;
      screenBottom = (bounds.y + bounds.height) * zoom + panY;
    }

    centerX = (screenLeft + screenRight) / 2;
    centerY = (screenTop + screenBottom) / 2;

    const handles: HandleInfo[] = [];

    // Resize corner handles (on the bounds)
    handles.push(
      { type: "resize-corner", position: "top-left", screenX: screenLeft, screenY: screenTop, cursor: "nwse-resize" },
      { type: "resize-corner", position: "top-right", screenX: screenRight, screenY: screenTop, cursor: "nesw-resize" },
      { type: "resize-corner", position: "bottom-left", screenX: screenLeft, screenY: screenBottom, cursor: "nesw-resize" },
      { type: "resize-corner", position: "bottom-right", screenX: screenRight, screenY: screenBottom, cursor: "nwse-resize" }
    );

    // Resize edge handles (on the edges)
    handles.push(
      { type: "resize-edge", position: "top", screenX: centerX, screenY: screenTop, cursor: "ns-resize" },
      { type: "resize-edge", position: "bottom", screenX: centerX, screenY: screenBottom, cursor: "ns-resize" },
      { type: "resize-edge", position: "left", screenX: screenLeft, screenY: centerY, cursor: "ew-resize" },
      { type: "resize-edge", position: "right", screenX: screenRight, screenY: centerY, cursor: "ew-resize" }
    );

    // Single rotation handle at top-right corner (outside the selection)
    const rotOffset = this.ROTATION_OFFSET;
    handles.push({
      type: "rotation",
      position: "rotation-button",
      screenX: screenRight + rotOffset,
      screenY: screenTop - rotOffset,
      cursor: "grab"
    });

    return handles;
  }

  private getSelectionCenter(): { x: number; y: number } | null {
    const state = selectionStore.state.value;
    const zoom = viewportStore.zoom.value;
    const panX = viewportStore.panX.value;
    const panY = viewportStore.panY.value;

    if (state.type === "transforming") {
      const bounds = state.originalBounds;
      const offset = state.currentOffset;
      return {
        x: (bounds.x + offset.x + bounds.width / 2) * zoom + panX,
        y: (bounds.y + offset.y + bounds.height / 2) * zoom + panY,
      };
    }

    const bounds = selectionStore.bounds;
    if (!bounds) return null;

    return {
      x: (bounds.x + bounds.width / 2) * zoom + panX,
      y: (bounds.y + bounds.height / 2) * zoom + panY,
    };
  }

  private handleMouseDown = (e: MouseEvent, handle: HandleInfo) => {
    e.preventDefault();
    e.stopPropagation();

    const state = selectionStore.state.value;

    // Signal start of transform if needed
    if (state.type === "selected" || state.type === "floating") {
      const eventType = handle.type === "rotation" ? "rotation-start" : "resize-start";
      this.dispatchEvent(
        new CustomEvent(eventType, {
          bubbles: true,
          composed: true,
          detail: { handle: handle.position },
        })
      );
    }

    this.isDragging = true;
    this.activeHandle = handle;

    if (handle.type === "rotation") {
      // Rotation drag setup
      const center = this.getSelectionCenter();
      if (!center) return;

      const rect = this.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      this.dragStartAngle = angleFromCenter(center.x, center.y, mouseX, mouseY);
      this.initialRotation = selectionStore.rotation;
      selectionStore.startRotationDrag();
    } else {
      // Resize drag setup
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.initialScale = { ...selectionStore.scale };

      // Get original bounds for calculating new scale
      const currentState = selectionStore.state.value;
      if (currentState.type === "transforming") {
        this.initialBounds = {
          width: currentState.originalBounds.width,
          height: currentState.originalBounds.height,
        };
      } else {
        const bounds = selectionStore.bounds;
        if (bounds) {
          this.initialBounds = { width: bounds.width, height: bounds.height };
        }
      }

      selectionStore.startScaleDrag();
    }
  };

  private handleDocumentMouseMove = (e: MouseEvent) => {
    if (!this.isDragging || !this.activeHandle) return;

    if (this.activeHandle.type === "rotation") {
      this.handleRotationDrag(e);
    } else {
      this.handleResizeDrag(e);
    }
  };

  private handleRotationDrag(e: MouseEvent) {
    const center = this.getSelectionCenter();
    if (!center) return;

    const rect = this.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const currentAngle = angleFromCenter(center.x, center.y, mouseX, mouseY);
    let deltaAngle = currentAngle - this.dragStartAngle;

    if (deltaAngle > 180) deltaAngle -= 360;
    if (deltaAngle < -180) deltaAngle += 360;

    let newRotation = this.initialRotation + deltaAngle;

    if (e.shiftKey) {
      newRotation = snapAngle(newRotation, 15);
    }

    newRotation = normalizeAngle(newRotation);
    selectionStore.updateRotation(newRotation);
  }

  private handleResizeDrag(e: MouseEvent) {
    if (!this.activeHandle || !this.initialBounds) return;

    const zoom = viewportStore.zoom.value;
    const deltaX = (e.clientX - this.dragStartX) / zoom;
    const deltaY = (e.clientY - this.dragStartY) / zoom;

    const pos = this.activeHandle.position;
    const origWidth = this.initialBounds.width;
    const origHeight = this.initialBounds.height;

    let newScaleX = this.initialScale.x;
    let newScaleY = this.initialScale.y;

    // Calculate current size based on initial scale
    const currentWidth = origWidth * this.initialScale.x;
    const currentHeight = origHeight * this.initialScale.y;

    // Calculate new scale based on handle position
    switch (pos) {
      case "right":
        newScaleX = (currentWidth + deltaX) / origWidth;
        break;
      case "left":
        newScaleX = (currentWidth - deltaX) / origWidth;
        break;
      case "bottom":
        newScaleY = (currentHeight + deltaY) / origHeight;
        break;
      case "top":
        newScaleY = (currentHeight - deltaY) / origHeight;
        break;
      case "bottom-right":
        newScaleX = (currentWidth + deltaX) / origWidth;
        newScaleY = (currentHeight + deltaY) / origHeight;
        break;
      case "bottom-left":
        newScaleX = (currentWidth - deltaX) / origWidth;
        newScaleY = (currentHeight + deltaY) / origHeight;
        break;
      case "top-right":
        newScaleX = (currentWidth + deltaX) / origWidth;
        newScaleY = (currentHeight - deltaY) / origHeight;
        break;
      case "top-left":
        newScaleX = (currentWidth - deltaX) / origWidth;
        newScaleY = (currentHeight - deltaY) / origHeight;
        break;
    }

    // Clamp to minimum
    newScaleX = Math.max(0.1, newScaleX);
    newScaleY = Math.max(0.1, newScaleY);

    // Shift key = maintain aspect ratio for corner handles
    if (e.shiftKey && this.activeHandle.type === "resize-corner") {
      const uniformScale = Math.max(newScaleX, newScaleY);
      newScaleX = uniformScale;
      newScaleY = uniformScale;
    }

    selectionStore.updateScale(newScaleX, newScaleY);
  }

  private handleDocumentMouseUp = () => {
    if (this.isDragging && this.activeHandle) {
      if (this.activeHandle.type === "rotation") {
        selectionStore.endRotationDrag();
        this.dispatchEvent(
          new CustomEvent("rotation-end", { bubbles: true, composed: true })
        );
      } else {
        selectionStore.endScaleDrag();
        this.dispatchEvent(
          new CustomEvent("resize-end", { bubbles: true, composed: true })
        );
      }
    }

    this.isDragging = false;
    this.activeHandle = null;
    this.initialBounds = null;
  };

  render() {
    // Access signals for reactivity
    const state = selectionStore.state.value;
    void viewportStore.zoom.value;
    void viewportStore.panX.value;
    void viewportStore.panY.value;

    const handles = this.getHandles();

    if (handles.length === 0) {
      return nothing;
    }

    // Get rotation for tooltip display
    const rotation = state.type === "transforming" ? state.rotation : 0;
    const isRotating = this.isDragging && this.activeHandle?.type === "rotation";
    const rotationHandle = handles.find(h => h.type === "rotation");

    return html`
      ${handles.map(
        (handle) => html`
          <div
            class="handle ${handle.type} ${
              handle.type === "resize-edge"
                ? handle.position === "top" || handle.position === "bottom"
                  ? "horizontal"
                  : "vertical"
                : ""
            } ${this.isDragging && this.activeHandle === handle ? "dragging" : ""}"
            style="left: ${handle.screenX}px; top: ${handle.screenY}px; cursor: ${handle.cursor};"
            @mousedown=${(e: MouseEvent) => this.handleMouseDown(e, handle)}
          ></div>
        `
      )}
      ${isRotating && rotationHandle ? html`
        <div
          class="rotation-tooltip"
          style="left: ${rotationHandle.screenX + 14}px; top: ${rotationHandle.screenY - 8}px;"
        >
          ${Math.round(rotation)}°
        </div>
      ` : nothing}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pf-transform-handles": PFTransformHandles;
  }
}
