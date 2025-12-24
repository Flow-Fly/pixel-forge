import { html, css, type PropertyValueMap } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { layerStore } from "../../stores/layers";
import { toolStore, type ToolType } from "../../stores/tools";
import { selectionStore } from "../../stores/selection";
import { CommitFloatCommand } from "../../commands/selection-commands";
import { animationStore } from "../../stores/animation";
import { historyStore } from "../../stores/history";
import { dirtyRectStore } from "../../stores/dirty-rect";
import { viewportStore } from "../../stores/viewport";
import { renderScheduler } from "../../services/render-scheduler";
import { onionSkinCache } from "../../services/onion-skin-cache";
import { OptimizedDrawingCommand } from "../../commands/optimized-drawing-command";
import type { BaseTool, ModifierKeys } from "../../tools/base-tool";
import { loadTool, isDrawingTool } from "../../tools/tool-loader";
import { rectClamp, type Rect } from "../../types/geometry";
import {
  getFont,
  renderText,
  getCursorX,
  renderCursor,
  getDefaultFont,
} from "../../utils/pixel-fonts";
import { TextTool } from "../../tools/text-tool";

@customElement("pf-drawing-canvas")
export class PFDrawingCanvas extends BaseComponent {
  @property({ type: Number }) width = 64;
  @property({ type: Number }) height = 64;

  @query("canvas") canvas!: HTMLCanvasElement;

  static styles = css`
    :host {
      display: block;
      position: relative;
      width: 100%;
      height: 100%;
      background-color: #2a2a2a; /* Dark background for canvas area */
      overflow: hidden;
      box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
    }

    canvas {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      image-rendering: pixelated;
      /* Transparent background - checkerboard pattern shows through from viewport */
      box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
      /* Cursor is set dynamically based on active tool */
      cursor: crosshair;
    }

    /* Inherit cursor from host during pan mode (set by viewport) */
    :host([pan-cursor="grab"]) canvas {
      cursor: grab !important;
    }
    :host([pan-cursor="grabbing"]) canvas {
      cursor: grabbing !important;
    }

  `;

  private ctx!: CanvasRenderingContext2D;
  private activeTool: BaseTool | null = null;
  private previousImageData: ImageData | null = null;

  // Document-level event handlers for out-of-canvas tracking
  private boundDocumentMouseMove: ((e: MouseEvent) => void) | null = null;
  private boundDocumentMouseUp: ((e: MouseEvent) => void) | null = null;
  private isStrokeActive = false;

  protected firstUpdated(
    _changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>
  ): void {
    super.firstUpdated(_changedProperties);

    // Get context with performance hints
    this.ctx = this.canvas.getContext("2d", {
      alpha: true,
      desynchronized: true, // Hint for lower latency (may not be supported everywhere)
      willReadFrequently: false, // We mostly write, read only for history snapshots
    })!;

    // Explicit setting for pixel art - critical for crisp rendering
    this.ctx.imageSmoothingEnabled = false;

    // Initial tool load
    this.loadToolByName(toolStore.activeTool.value);

    // Initial render
    this.renderCanvas();
  }

  protected updated(
    _changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>
  ): void {
    super.updated(_changedProperties);

    // Check if tool changed
    const currentTool = toolStore.activeTool.value;
    if (this.activeTool?.name !== currentTool) {
      this.loadToolByName(currentTool);
    }

    if (_changedProperties.has("width") || _changedProperties.has("height")) {
      this.resizeCanvas();
    }

    // Request full redraw for signal-triggered updates (layer visibility, frame changes, etc.)
    dirtyRectStore.requestFullRedraw();
    this.renderCanvas();
  }

  private async loadToolByName(toolName: ToolType) {
    // Auto-commit floating selection when switching to drawing tools
    if (isDrawingTool(toolName)) {
      const state = selectionStore.state.value;
      if (state.type === "floating") {
        const activeLayerId = layerStore.activeLayerId.value;
        const layer = layerStore.layers.value.find(
          (l) => l.id === activeLayerId
        );
        if (layer?.canvas) {
          const command = new CommitFloatCommand(
            layer.canvas,
            layer.id,
            state.imageData,
            state.originalBounds,
            state.currentOffset,
            state.shape,
            state.mask
          );
          historyStore.execute(command);
        }
      }
    }

    const tool = await loadTool(toolName, this.ctx);
    if (tool) {
      this.activeTool = tool;

      // Set cursor based on tool (brush preview overlay shows alongside cursor)
      if (this.canvas && this.activeTool.cursor) {
        this.canvas.style.cursor = this.activeTool.cursor;
      }
    }
  }

  resizeCanvas() {
    if (!this.canvas) return;

    // Set canvas to logical pixel dimensions
    // The viewport component handles zoom via CSS transform
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    // Display size matches logical size - viewport scales it
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;

    // Host matches canvas size
    this.style.width = `${this.width}px`;
    this.style.height = `${this.height}px`;

    // Re-apply context settings after resize (context may be reset)
    if (this.ctx) {
      this.ctx.imageSmoothingEnabled = false;
    }
  }

  renderCanvas() {
    if (!this.ctx) return;

    const fullRedraw = dirtyRectStore.consumeFullRedraw();
    const dirtyRect = fullRedraw ? null : dirtyRectStore.consumePendingDirty();

    if (dirtyRect && !fullRedraw) {
      // Partial redraw - clip to dirty region
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(
        dirtyRect.x,
        dirtyRect.y,
        dirtyRect.width,
        dirtyRect.height
      );
      this.ctx.clip();

      // Clear just the dirty region
      this.ctx.clearRect(
        dirtyRect.x,
        dirtyRect.y,
        dirtyRect.width,
        dirtyRect.height
      );

      // Render layers (clipped)
      this.renderLayers(dirtyRect);

      this.ctx.restore();
    } else {
      // Full redraw
      this.ctx.clearRect(0, 0, this.width, this.height);

      // Draw onion skins if enabled (only on full redraw)
      this.drawOnionSkins();

      // Render all layers
      this.renderLayers(null);
    }

    // Selection overlay always needs to be drawn
    this.drawSelection();
  }

  /**
   * Render visible layers, optionally clipped to a dirty rect.
   */
  private renderLayers(dirtyRect: Rect | null) {
    const layers = layerStore.layers.value;
    const currentFrameId = animationStore.currentFrameId.value;

    const cels = animationStore.cels.value;

    for (const layer of layers) {
      if (!layer.visible) continue;

      // Get cel for current frame to apply cel-level opacity
      const celKey = animationStore.getCelKey(layer.id, currentFrameId);
      const cel = cels.get(celKey);

      // Combine layer opacity (0-255) and cel opacity (0-100)
      const layerOpacity = layer.opacity / 255;
      const celOpacity = (cel?.opacity ?? 100) / 100;
      this.ctx.globalAlpha = layerOpacity * celOpacity;
      this.ctx.globalCompositeOperation =
        layer.blendMode === "normal"
          ? "source-over"
          : (layer.blendMode as GlobalCompositeOperation);

      if (layer.type === "text") {
        // Render text layer using pixel font
        this.renderTextLayer(layer.id, currentFrameId);
      } else if (layer.canvas) {
        // Render raster layer
        if (dirtyRect) {
          // Draw only the dirty region from layer
          this.ctx.drawImage(
            layer.canvas,
            dirtyRect.x,
            dirtyRect.y,
            dirtyRect.width,
            dirtyRect.height,
            dirtyRect.x,
            dirtyRect.y,
            dirtyRect.width,
            dirtyRect.height
          );
        } else {
          this.ctx.drawImage(layer.canvas, 0, 0);
        }
      }
    }

    // Reset composite operation
    this.ctx.globalAlpha = 1;
    this.ctx.globalCompositeOperation = "source-over";
  }

  /**
   * Render a text layer using pixel fonts.
   */
  private renderTextLayer(layerId: string, frameId: string) {
    const layer = layerStore.layers.value.find((l) => l.id === layerId);
    if (!layer || layer.type !== "text" || !layer.textData) return;

    const textCelData = animationStore.getTextCelData(layerId, frameId);
    if (!textCelData) return;

    const { content, x, y } = textCelData;
    const { font: fontId, color } = layer.textData;

    // Get the font
    const font = getFont(fontId) || getDefaultFont();

    // Render the text
    if (content) {
      renderText(this.ctx, content, x, y, font, color);
    }

    // Render cursor if editing this layer
    const editingState = TextTool.editingState.value;
    if (
      editingState.isEditing &&
      editingState.layerId === layerId &&
      editingState.cursorVisible
    ) {
      const cursorX = getCursorX(
        content || "",
        editingState.cursorPosition,
        font,
        x
      );
      renderCursor(this.ctx, cursorX, y, font.charHeight, color);
    }
  }

  private drawOnionSkins() {
    const { enabled, prevFrames, nextFrames, opacityStep, tint } =
      animationStore.onionSkin.value;
    if (!enabled) return;

    const frames = animationStore.frames.value;
    const currentFrameId = animationStore.currentFrameId.value;
    const currentIndex = frames.findIndex((f) => f.id === currentFrameId);
    if (currentIndex === -1) return;

    const activeLayerId = layerStore.activeLayerId.value;
    if (!activeLayerId) return;

    const cels = animationStore.cels.value;

    // Helper to draw a frame with onion skin effect
    const drawFrame = (index: number, isPrev: boolean, distance: number) => {
      if (index < 0 || index >= frames.length) return;

      const frame = frames[index];
      const key = animationStore.getCelKey(activeLayerId, frame.id);
      const cel = cels.get(key);

      if (cel && cel.canvas) {
        const opacity = Math.max(0.1, 1 - distance * opacityStep);
        const tintColor = isPrev ? "#ff0000" : "#0000ff";

        this.ctx.save();
        this.ctx.globalAlpha = opacity;

        if (tint) {
          // Try to get cached tinted bitmap (fast path)
          const cachedBitmap = onionSkinCache.getSync(
            cel.id,
            tintColor,
            opacity
          );

          if (cachedBitmap) {
            // Cache hit - draw the cached bitmap
            this.ctx.drawImage(cachedBitmap, 0, 0);
          } else {
            // Cache miss - use sync fallback and populate cache for next time
            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = this.width;
            tempCanvas.height = this.height;
            const tempCtx = tempCanvas.getContext("2d")!;

            tempCtx.drawImage(cel.canvas, 0, 0);
            tempCtx.globalCompositeOperation = "source-in";
            tempCtx.fillStyle = tintColor;
            tempCtx.fillRect(0, 0, this.width, this.height);

            this.ctx.drawImage(tempCanvas, 0, 0);

            // Async populate cache for next render (fire and forget)
            onionSkinCache.populate(cel.id, cel.canvas, tintColor, opacity);
          }
        } else {
          this.ctx.drawImage(cel.canvas, 0, 0);
        }

        this.ctx.restore();
      }
    };

    // Draw previous frames
    for (let i = 1; i <= prevFrames; i++) {
      drawFrame(currentIndex - i, true, i);
    }

    // Draw next frames
    for (let i = 1; i <= nextFrames; i++) {
      drawFrame(currentIndex + i, false, i);
    }
  }

  drawSelection() {
    // Selection rendering is now handled by pf-selection-overlay component
    // This method is kept for backwards compatibility but does nothing
  }

  private getCanvasCoordinates(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  private getModifiers(e: MouseEvent): ModifierKeys {
    return {
      shift: e.shiftKey,
      ctrl: e.ctrlKey || e.metaKey,
      alt: e.altKey,
      button: e.button,
    };
  }

  /**
   * Clamp coordinates to canvas bounds for out-of-canvas tracking.
   */
  private clampToCanvas(x: number, y: number): { x: number; y: number } {
    return {
      x: Math.max(0, Math.min(this.canvas.width - 1, x)),
      y: Math.max(0, Math.min(this.canvas.height - 1, y)),
    };
  }

  /**
   * Clean up document-level listeners.
   */
  private cleanupDocumentListeners() {
    if (this.boundDocumentMouseMove) {
      document.removeEventListener("mousemove", this.boundDocumentMouseMove);
      this.boundDocumentMouseMove = null;
    }
    if (this.boundDocumentMouseUp) {
      document.removeEventListener("mouseup", this.boundDocumentMouseUp);
      this.boundDocumentMouseUp = null;
    }
    this.isStrokeActive = false;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    // Clean up any active document listeners when component is destroyed
    this.cleanupDocumentListeners();
  }

  private handleMouseDown(e: MouseEvent) {
    // Check if current tool is a selection tool (needs Alt for subtract mode)
    const currentTool = toolStore.activeTool.value;
    const isSelectionTool = [
      "marquee-rect",
      "lasso",
      "polygonal-lasso",
      "magic-wand",
    ].includes(currentTool);

    // Skip drawing when:
    // - Middle mouse button (panning)
    // - Spacebar pan mode
    // - Hand or Zoom tool (handled at viewport level)
    if (e.button === 1 || viewportStore.isSpacebarDown.value) {
      return;
    }

    // Hand and Zoom tools are handled at viewport level, not here
    if (currentTool === "hand" || currentTool === "zoom") {
      return;
    }

    // For non-selection tools:
    // - Alt/Cmd+click = quick eyedropper (handled by viewport)
    // - Ctrl+click = lightness shift (handled by viewport)
    // For selection tools: allow Alt through for subtract mode, Ctrl for shrink-to-content
    if (!isSelectionTool && (e.altKey || e.metaKey || e.ctrlKey)) {
      return;
    }

    if (!this.activeTool) return;
    const { x, y } = this.getCanvasCoordinates(e);
    const modifiers = this.getModifiers(e);

    // Update active tool context to the active layer's canvas
    const activeLayerId = layerStore.activeLayerId.value;
    const activeLayer = layerStore.layers.value.find(
      (l) => l.id === activeLayerId
    );

    if (
      activeLayer &&
      activeLayer.canvas &&
      !activeLayer.locked &&
      activeLayer.visible
    ) {
      // Copy-on-write: unlink cel before editing if it's shared with others
      const currentFrameId = animationStore.currentFrameId.value;
      const wasUnlinked = animationStore.ensureUnlinkedForEdit(
        activeLayerId!,
        currentFrameId
      );

      // If unlinked, the layer's canvas reference has changed - get fresh reference
      let targetLayer = activeLayer;
      if (wasUnlinked) {
        targetLayer = layerStore.layers.value.find(
          (l) => l.id === activeLayerId
        )!;
      }

      const layerCtx = targetLayer.canvas!.getContext("2d");
      if (layerCtx) {
        // Capture state before drawing
        this.previousImageData = layerCtx.getImageData(
          0,
          0,
          this.width,
          this.height
        );

        // Reset stroke dirty region to prevent pollution from previous execute/undo
        dirtyRectStore.resetStroke();

        // Update tool context to layer context
        this.activeTool.setContext(layerCtx);

        this.activeTool.onDown(x, y, modifiers);

        // Mark stroke as active and attach document-level listeners
        // This allows us to track mouse movement even outside the canvas
        this.isStrokeActive = true;
        this.boundDocumentMouseMove = this.handleDocumentMouseMove.bind(this);
        this.boundDocumentMouseUp = this.handleDocumentMouseUp.bind(this);
        document.addEventListener("mousemove", this.boundDocumentMouseMove);
        document.addEventListener("mouseup", this.boundDocumentMouseUp);

        // Schedule render instead of immediate call
        renderScheduler.scheduleRender(() => this.renderCanvas());
      }
    } else {
      // Show warning for drawing tools only (not selection/transform/eyedropper)
      const drawingTools = ["pencil", "eraser", "fill", "gradient", "line", "rectangle", "ellipse", "text"];
      const currentTool = toolStore.activeTool.value;
      if (drawingTools.includes(currentTool)) {
        if (!activeLayerId || !activeLayer) {
          this.showWarning("No layer selected");
        } else if (activeLayer.locked) {
          this.showWarning("Layer is locked");
        } else if (!activeLayer.visible) {
          this.showWarning("Layer is hidden");
        }
      }
    }
  }

  /**
   * Document-level mouse move handler for out-of-canvas tracking.
   * Coordinates are clamped to canvas bounds.
   */
  private handleDocumentMouseMove(e: MouseEvent) {
    if (!this.isStrokeActive || !this.activeTool) return;

    // Skip during pan operations
    if (viewportStore.isSpacebarDown.value || viewportStore.isPanning.value) {
      return;
    }

    const rawCoords = this.getCanvasCoordinates(e);
    const { x, y } = this.clampToCanvas(rawCoords.x, rawCoords.y);
    const modifiers = this.getModifiers(e);

    // Emit cursor position (clamped) for brush overlay and status bar
    const cursorEvent = new CustomEvent("canvas-cursor", {
      detail: { x: Math.floor(x), y: Math.floor(y) },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(cursorEvent);
    window.dispatchEvent(cursorEvent);

    this.activeTool.onDrag(x, y, modifiers);
    renderScheduler.scheduleRender(() => this.renderCanvas());
  }

  /**
   * Document-level mouse up handler for out-of-canvas tracking.
   * Finalizes the stroke regardless of cursor position.
   */
  private handleDocumentMouseUp(e: MouseEvent) {
    if (!this.isStrokeActive) return;

    // Clean up document listeners first
    this.cleanupDocumentListeners();

    if (!this.activeTool) return;

    const rawCoords = this.getCanvasCoordinates(e);
    const { x, y } = this.clampToCanvas(rawCoords.x, rawCoords.y);
    const modifiers = this.getModifiers(e);

    this.activeTool.onUp(x, y, modifiers);

    // Get stroke bounds before flushing
    const strokeBounds = dirtyRectStore.flushStroke();

    // Flush any pending renders before capturing final state
    renderScheduler.flush();

    // Request full redraw for final state
    dirtyRectStore.requestFullRedraw();
    this.renderCanvas();

    // Capture state after drawing and create command
    const activeLayerId = layerStore.activeLayerId.value;
    const activeLayer = layerStore.layers.value.find(
      (l) => l.id === activeLayerId
    );

    if (
      activeLayer &&
      activeLayer.canvas &&
      this.previousImageData &&
      strokeBounds &&
      activeLayerId
    ) {
      const layerCtx = activeLayer.canvas.getContext("2d");
      if (layerCtx) {
        // Clamp bounds to canvas dimensions
        const bounds = rectClamp(strokeBounds, this.width, this.height);

        // Skip if bounds are empty
        if (bounds.width <= 0 || bounds.height <= 0) {
          this.previousImageData = null;
          return;
        }

        // Extract only the affected region from previous snapshot
        const prevRegion = this.extractRegion(this.previousImageData, bounds);

        // Get current state of the affected region
        const newImageData = layerCtx.getImageData(
          bounds.x,
          bounds.y,
          bounds.width,
          bounds.height
        );

        // Only create command if data actually changed
        if (!this.uint8ArrayEquals(prevRegion, newImageData.data)) {
          const command = new OptimizedDrawingCommand(
            activeLayerId,
            bounds,
            prevRegion,
            new Uint8ClampedArray(newImageData.data),
            this.getCommandNameForTool()
          );
          historyStore.execute(command);

          // Invalidate onion skin cache for the modified cel
          const currentFrameId = animationStore.currentFrameId.value;
          const celKey = animationStore.getCelKey(
            activeLayerId,
            currentFrameId
          );
          const cel = animationStore.cels.value.get(celKey);
          if (cel) {
            onionSkinCache.invalidateCel(cel.id);
          }
        }

        this.previousImageData = null;
      }
    }
  }

  private handleMouseMove(e: MouseEvent) {
    // When stroke is active, document-level handler handles all movement
    // This avoids duplicate processing
    if (this.isStrokeActive) return;

    const { x, y } = this.getCanvasCoordinates(e);

    // Emit cursor position for status bar and brush cursor overlay
    const cursorEvent = new CustomEvent("canvas-cursor", {
      detail: { x: Math.floor(x), y: Math.floor(y) },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(cursorEvent);
    window.dispatchEvent(cursorEvent);

    // Skip tool interaction during pan operations
    if (viewportStore.isSpacebarDown.value || viewportStore.isPanning.value) {
      return;
    }

    if (!this.activeTool) return;
    const modifiers = this.getModifiers(e);

    // Only handle hover (onMove) since drag is handled by document listener when stroke is active
    this.activeTool.onMove(x, y, modifiers);
  }

  private handleMouseLeave = (_e: MouseEvent) => {
    // Notify brush cursor overlay that cursor left canvas
    window.dispatchEvent(new CustomEvent("canvas-cursor-leave"));

    // Don't commit stroke here - document-level listeners handle out-of-canvas tracking
    // The stroke will be finalized when mouse is released anywhere
  };

  private handleMouseUp(_e: MouseEvent) {
    // When stroke is active, document-level handler handles mouseup
    // This avoids duplicate processing since both canvas and document receive the event
    if (this.isStrokeActive) return;

    // This handles cases where mouseup happens without a prior mousedown on this canvas
    // (e.g., tool was not active, or layer was locked)
  }

  /**
   * Extract a rectangular region from full ImageData.
   */
  private extractRegion(
    fullImageData: ImageData,
    bounds: Rect
  ): Uint8ClampedArray {
    const result = new Uint8ClampedArray(bounds.width * bounds.height * 4);
    const fullWidth = fullImageData.width;

    for (let y = 0; y < bounds.height; y++) {
      const srcOffset = ((bounds.y + y) * fullWidth + bounds.x) * 4;
      const dstOffset = y * bounds.width * 4;
      result.set(
        fullImageData.data.subarray(srcOffset, srcOffset + bounds.width * 4),
        dstOffset
      );
    }

    return result;
  }

  /**
   * Compare two Uint8ClampedArray for equality.
   */
  private uint8ArrayEquals(
    a: Uint8ClampedArray,
    b: Uint8ClampedArray
  ): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  /**
   * Get command name based on active tool.
   */
  private getCommandNameForTool(): string {
    const toolName = this.activeTool?.name;
    switch (toolName) {
      case "pencil":
        return "Brush Stroke";
      case "eraser":
        return "Erase";
      case "fill":
        return "Fill";
      case "gradient":
        return "Gradient";
      case "line":
        return "Draw Line";
      case "rectangle":
        return "Draw Rectangle";
      case "ellipse":
        return "Draw Ellipse";
      default:
        return "Drawing";
    }
  }

  /**
   * Show a warning message (dispatches event to app level)
   */
  private showWarning(message: string) {
    window.dispatchEvent(
      new CustomEvent("show-warning-toast", {
        detail: { message },
      })
    );
  }

  render() {
    // Access signals to register them with SignalWatcher for reactive updates
    // This ensures canvas re-renders when these values change
    void historyStore.version.value;
    void layerStore.layers.value;
    void animationStore.currentFrameId.value;
    void animationStore.cels.value; // For text cel updates
    void TextTool.editingState.value; // For cursor blinking and text updates

    return html`
      <canvas
        @mousedown=${this.handleMouseDown}
        @mousemove=${this.handleMouseMove}
        @mouseup=${this.handleMouseUp}
        @mouseleave=${this.handleMouseLeave}
      ></canvas>
    `;
  }
}
