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
import type { ModifierKeys, Point } from "../../tools/base-tool";
import { ToolController } from "../../tools/tool-controller";
import { rectClamp, type Rect } from "../../types/geometry";
import type { Layer } from "../../types/layer";
import { extractIndexRegion } from "../../utils/buffer-region";
import {
  getFont,
  renderText,
  getCursorX,
  renderCursor,
  getDefaultFont,
} from "../../utils/pixel-fonts";
import { TextTool } from "../../tools/text-tool";

/** Tools that paint pixels on the active layer (vs. select/navigate). */
const DRAWING_TOOLS = [
  "pencil",
  "eraser",
  "fill",
  "gradient",
  "line",
  "rectangle",
  "ellipse",
] as const;

const DRAWING_TOOL_SET = new Set<ToolType>(DRAWING_TOOLS);
const SELECTION_TOOL_SET = new Set<ToolType>([
  "marquee-rect",
  "lasso",
  "polygonal-lasso",
  "magic-wand",
]);
const VIEWPORT_TOOL_SET = new Set<ToolType>(["hand", "zoom"]);
const LAYER_WARNING_TOOL_SET = new Set<ToolType>([...DRAWING_TOOLS, "text"]);

type EditableLayer = Layer & { canvas: HTMLCanvasElement };

interface StrokeTarget {
  layerId: string;
  layer: EditableLayer;
  context: CanvasRenderingContext2D;
}

interface ActiveLayerLookup {
  layerId: string | null;
  layer: Layer | undefined;
}

interface StrokeChange {
  previousRegion: Uint8ClampedArray;
  newRegion: Uint8ClampedArray;
}

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
      background-color: #151a21; /* Dark transparency base for canvas area */
      overflow: hidden;
      box-shadow: 0 0 0 1px var(--pf-color-border), 0 20px 70px rgba(0, 0, 0, 0.42);
    }

    canvas {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      image-rendering: pixelated;
      /* Transparent background - checkerboard pattern shows through from viewport */
      box-shadow: none;
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
  private toolController!: ToolController;
  private previousImageData: ImageData | null = null;

  // Index-buffer snapshot taken at stroke start, so the resulting command
  // can undo/redo palette indices along with the pixels
  private previousIndexSnapshot: Uint8Array | null = null;
  private strokeFrameId: string = "";

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
    this.toolController = new ToolController(this.ctx);

    // Initial tool load
    this.loadTool(toolStore.activeTool.value);

    // Initial render
    this.renderCanvas();
  }

  protected updated(
    _changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>
  ): void {
    super.updated(_changedProperties);

    // Check if tool changed
    const currentTool = toolStore.activeTool.value;
    if (!this.toolController.isActive(currentTool)) {
      this.loadTool(currentTool);
    }

    if (_changedProperties.has("width") || _changedProperties.has("height")) {
      this.resizeCanvas();
    }

    // Request full redraw for signal-triggered updates (layer visibility, frame changes, etc.)
    dirtyRectStore.requestFullRedraw();
    this.renderCanvas();
  }

  private async loadTool(toolName: ToolType) {
    this.commitFloatingSelectionForDrawingTool(toolName);

    const didLoadTool = await this.toolController.load(toolName);
    const cursor = this.toolController.cursor;
    if (didLoadTool && this.canvas && cursor) {
      // Set cursor based on tool (brush preview overlay shows alongside cursor)
      this.canvas.style.cursor = cursor;
    }
  }

  private commitFloatingSelectionForDrawingTool(toolName: ToolType) {
    if (!DRAWING_TOOL_SET.has(toolName)) return;

    const command = this.createCommitFloatCommand();
    if (command) {
      historyStore.execute(command);
    }
  }

  private createCommitFloatCommand(): CommitFloatCommand | null {
    const state = selectionStore.state.value;
    if (state.type !== "floating") return null;

    const activeLayer = this.getActiveLayer().layer;
    if (!activeLayer?.canvas) return null;

    return new CommitFloatCommand(
      activeLayer.canvas,
      activeLayer.id,
      state.imageData,
      state.originalBounds,
      state.currentOffset,
      state.shape,
      state.mask
    );
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

  private getClampedMousePoint(e: MouseEvent): Point {
    const point = this.getCanvasCoordinates(e);
    return this.clampToCanvas(point.x, point.y);
  }

  private emitCanvasCursor(point: Point) {
    const cursorEvent = new CustomEvent("canvas-cursor", {
      detail: { x: Math.floor(point.x), y: Math.floor(point.y) },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(cursorEvent);
    window.dispatchEvent(cursorEvent);
  }

  private shouldSkipToolMovement(): boolean {
    return viewportStore.isSpacebarDown.value || viewportStore.isPanning.value;
  }

  private scheduleCanvasRender() {
    renderScheduler.scheduleRender(() => this.renderCanvas());
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
    const currentTool = toolStore.activeTool.value;
    if (!this.shouldHandleCanvasMouseDown(e, currentTool)) return;

    const target = this.getStrokeTarget();
    if (!target) {
      this.showLayerWarningForTool(currentTool);
      return;
    }

    this.startStroke(e, currentTool, target);
  }

  private shouldHandleCanvasMouseDown(
    e: MouseEvent,
    currentTool: ToolType
  ): boolean {
    if (this.isPanGesture(e)) return false;
    if (VIEWPORT_TOOL_SET.has(currentTool)) return false;
    if (this.isQuickToolGesture(e, currentTool)) return false;
    return this.toolController.hasActiveTool;
  }

  private isPanGesture(e: MouseEvent): boolean {
    return e.button === 1 || viewportStore.isSpacebarDown.value;
  }

  private isQuickToolGesture(e: MouseEvent, currentTool: ToolType): boolean {
    if (SELECTION_TOOL_SET.has(currentTool)) return false;
    return e.altKey || e.metaKey || e.ctrlKey;
  }

  private getStrokeTarget(): StrokeTarget | null {
    const { layerId, layer } = this.getActiveLayer();
    if (!layerId || !this.isEditableLayer(layer)) return null;

    const currentFrameId = animationStore.currentFrameId.value;
    const editableLayer = this.getLayerForEdit(layerId, layer, currentFrameId);
    const context = editableLayer.canvas.getContext("2d");
    if (!context) return null;

    return { layerId, layer: editableLayer, context };
  }

  private getActiveLayer(): ActiveLayerLookup {
    const layerId = layerStore.activeLayerId.value;
    const layer = layerStore.layers.value.find((item) => item.id === layerId);
    return { layerId, layer };
  }

  private isEditableLayer(layer: Layer | undefined): layer is EditableLayer {
    if (!layer?.canvas) return false;
    return !layer.locked && layer.visible;
  }

  private getLayerForEdit(
    layerId: string,
    layer: EditableLayer,
    frameId: string
  ): EditableLayer {
    const wasUnlinked = animationStore.ensureUnlinkedForEdit(layerId, frameId);
    if (!wasUnlinked) return layer;

    const freshLayer = layerStore.layers.value.find(
      (item) => item.id === layerId
    );
    return this.isEditableLayer(freshLayer) ? freshLayer : layer;
  }

  private startStroke(
    e: MouseEvent,
    currentTool: ToolType,
    target: StrokeTarget
  ) {
    const point = this.getCanvasCoordinates(e);
    const modifiers = this.getModifiers(e);

    this.captureStrokeSnapshot(target, currentTool);
    dirtyRectStore.resetStroke();
    this.toolController.onDown(target.context, point, modifiers);
    this.attachDocumentListeners();
    this.scheduleCanvasRender();
  }

  private captureStrokeSnapshot(target: StrokeTarget, toolName: ToolType) {
    this.previousImageData = target.context.getImageData(
      0,
      0,
      this.width,
      this.height
    );

    this.strokeFrameId = animationStore.currentFrameId.value;
    this.previousIndexSnapshot = this.getPreviousIndexSnapshot(
      target.layerId,
      this.strokeFrameId,
      toolName
    );
  }

  private getPreviousIndexSnapshot(
    layerId: string,
    frameId: string,
    toolName: ToolType
  ): Uint8Array | null {
    const indexBuffer = DRAWING_TOOL_SET.has(toolName)
      ? animationStore.ensureCelIndexBuffer(layerId, frameId)
      : animationStore.getCelIndexBuffer(layerId, frameId);

    return indexBuffer ? new Uint8Array(indexBuffer) : null;
  }

  private attachDocumentListeners() {
    this.isStrokeActive = true;
    this.boundDocumentMouseMove = this.handleDocumentMouseMove.bind(this);
    this.boundDocumentMouseUp = this.handleDocumentMouseUp.bind(this);
    document.addEventListener("mousemove", this.boundDocumentMouseMove);
    document.addEventListener("mouseup", this.boundDocumentMouseUp);
  }

  private showLayerWarningForTool(toolName: ToolType) {
    if (!LAYER_WARNING_TOOL_SET.has(toolName)) return;

    const { layerId, layer } = this.getActiveLayer();
    const warning = this.getLayerWarning(layerId, layer);
    if (warning) {
      this.showWarning(warning);
    }
  }

  private getLayerWarning(
    layerId: string | null,
    layer: Layer | undefined
  ): string | null {
    if (!layerId || !layer) return "No layer selected";
    return this.getBlockedLayerWarning(layer);
  }

  private getBlockedLayerWarning(layer: Layer): string | null {
    if (layer.locked) return "Layer is locked";
    if (!layer.visible) return "Layer is hidden";
    return null;
  }

  /**
   * Document-level mouse move handler for out-of-canvas tracking.
   * Coordinates are clamped to canvas bounds.
   */
  private handleDocumentMouseMove(e: MouseEvent) {
    if (!this.canContinueStroke()) return;
    if (this.shouldSkipToolMovement()) return;

    const point = this.getClampedMousePoint(e);
    const modifiers = this.getModifiers(e);

    // Emit cursor position (clamped) for brush overlay and status bar
    this.emitCanvasCursor(point);

    this.toolController.onDrag(point, modifiers);
    this.scheduleCanvasRender();
  }

  /**
   * Document-level mouse up handler for out-of-canvas tracking.
   * Finalizes the stroke regardless of cursor position.
   */
  private handleDocumentMouseUp(e: MouseEvent) {
    if (!this.isStrokeActive) return;

    // Clean up document listeners first
    this.cleanupDocumentListeners();

    if (!this.toolController.hasActiveTool) {
      this.clearStrokeSnapshots();
      return;
    }

    const point = this.getClampedMousePoint(e);
    const modifiers = this.getModifiers(e);

    this.toolController.onUp(point, modifiers);

    // Get stroke bounds before flushing
    const strokeBounds = dirtyRectStore.flushStroke();

    this.renderFinalStrokeState();
    this.commitStrokeIfChanged(strokeBounds);
    this.clearStrokeSnapshots();
  }

  private canContinueStroke(): boolean {
    return this.isStrokeActive && this.toolController.hasActiveTool;
  }

  private renderFinalStrokeState() {
    renderScheduler.flush();
    dirtyRectStore.requestFullRedraw();
    this.renderCanvas();
  }

  private commitStrokeIfChanged(strokeBounds: Rect | null) {
    const bounds = this.getUsableStrokeBounds(strokeBounds);
    if (!bounds) return;

    const target = this.getActiveLayerContext();
    if (!target) return;

    const strokeChange = this.readStrokeChange(target.context, bounds);
    if (!strokeChange) return;

    const command = this.createStrokeCommand(
      target.layerId,
      bounds,
      strokeChange
    );
    historyStore.execute(command);
    this.invalidateOnionSkinCel(target.layerId);
  }

  private getUsableStrokeBounds(strokeBounds: Rect | null): Rect | null {
    if (!strokeBounds) return null;

    const bounds = rectClamp(strokeBounds, this.width, this.height);
    return this.isEmptyRect(bounds) ? null : bounds;
  }

  private isEmptyRect(bounds: Rect): boolean {
    return bounds.width <= 0 || bounds.height <= 0;
  }

  private getActiveLayerContext(): Pick<
    StrokeTarget,
    "layerId" | "context"
  > | null {
    const { layerId, layer } = this.getActiveLayer();
    if (!layerId || !this.hasCanvas(layer)) return null;

    const context = layer.canvas.getContext("2d");
    if (!context) return null;

    return { layerId, context };
  }

  private hasCanvas(layer: Layer | undefined): layer is EditableLayer {
    return Boolean(layer?.canvas);
  }

  private readStrokeChange(
    context: CanvasRenderingContext2D,
    bounds: Rect
  ): StrokeChange | null {
    if (!this.previousImageData) return null;

    const previousRegion = this.extractRegion(this.previousImageData, bounds);
    const newImageData = context.getImageData(
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height
    );

    if (this.uint8ArrayEquals(previousRegion, newImageData.data)) return null;
    return {
      previousRegion,
      newRegion: new Uint8ClampedArray(newImageData.data),
    };
  }

  private createStrokeCommand(
    layerId: string,
    bounds: Rect,
    strokeChange: StrokeChange
  ): OptimizedDrawingCommand {
    return new OptimizedDrawingCommand(
      layerId,
      bounds,
      strokeChange.previousRegion,
      strokeChange.newRegion,
      this.toolController.commandName,
      this.createStrokeIndexBufferData(layerId, bounds)
    );
  }

  private createStrokeIndexBufferData(layerId: string, bounds: Rect) {
    const currentIndexBuffer = animationStore.getCelIndexBuffer(
      layerId,
      this.strokeFrameId
    );
    if (!this.previousIndexSnapshot || !currentIndexBuffer) return undefined;

    return {
      frameId: this.strokeFrameId,
      canvasWidth: this.width,
      previousIndexData: extractIndexRegion(
        this.previousIndexSnapshot,
        this.width,
        bounds
      ),
      newIndexData: extractIndexRegion(currentIndexBuffer, this.width, bounds),
    };
  }

  private invalidateOnionSkinCel(layerId: string) {
    const celKey = animationStore.getCelKey(
      layerId,
      animationStore.currentFrameId.value
    );
    const cel = animationStore.cels.value.get(celKey);
    if (cel) {
      onionSkinCache.invalidateCel(cel.id);
    }
  }

  private clearStrokeSnapshots() {
    this.previousImageData = null;
    this.previousIndexSnapshot = null;
  }

  private handleMouseMove(e: MouseEvent) {
    // When stroke is active, document-level handler handles all movement
    // This avoids duplicate processing
    if (this.isStrokeActive) return;

    const point = this.getCanvasCoordinates(e);

    // Emit cursor position for status bar and brush cursor overlay
    this.emitCanvasCursor(point);

    // Skip tool interaction during pan operations
    if (this.shouldSkipToolMovement()) return;

    if (!this.toolController.hasActiveTool) return;
    const modifiers = this.getModifiers(e);

    // Only handle hover (onMove) since drag is handled by document listener when stroke is active
    this.toolController.onMove(point, modifiers);
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
