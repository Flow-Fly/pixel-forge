import { html, css, type PropertyValueMap } from 'lit';
import { customElement, property, query } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { layerStore } from '../../stores/layers';
import { toolStore, type ToolType } from '../../stores/tools';
import { selectionStore } from '../../stores/selection';
import { CommitFloatCommand } from '../../commands/selection-commands';
import { animationStore } from '../../stores/animation';
import { historyStore } from '../../stores/history';
import { dirtyRectStore } from '../../stores/dirty-rect';
import { viewportStore } from '../../stores/viewport';
import { renderScheduler } from '../../services/render-scheduler';
import { OptimizedDrawingCommand } from '../../commands/optimized-drawing-command';
import type { ModifierKeys } from '../../tools/base-tool';
import { rectClamp, type Rect } from '../../types/geometry';

@customElement('pf-drawing-canvas')
export class PFDrawingCanvas extends BaseComponent {
  @property({ type: Number }) width = 64;
  @property({ type: Number }) height = 64;

  @query('canvas') canvas!: HTMLCanvasElement;

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
  private activeTool: any; // TODO: Type properly
  private previousImageData: ImageData | null = null;

  // Document-level event handlers for out-of-canvas tracking
  private boundDocumentMouseMove: ((e: MouseEvent) => void) | null = null;
  private boundDocumentMouseUp: ((e: MouseEvent) => void) | null = null;
  private isStrokeActive = false;

  protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
    super.firstUpdated(_changedProperties);

    // Get context with performance hints
    this.ctx = this.canvas.getContext('2d', {
      alpha: true,
      desynchronized: true, // Hint for lower latency (may not be supported everywhere)
      willReadFrequently: false // We mostly write, read only for history snapshots
    })!;

    // Explicit setting for pixel art - critical for crisp rendering
    this.ctx.imageSmoothingEnabled = false;

    // Initial tool load
    this.loadTool(toolStore.activeTool.value);

    // Initial render
    this.renderCanvas();
  }

  protected updated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
    super.updated(_changedProperties);

    // Check if tool changed
    const currentTool = toolStore.activeTool.value;
    if (this.activeTool?.name !== currentTool) {
      this.loadTool(currentTool);
    }

    if (_changedProperties.has('width') || _changedProperties.has('height')) {
      this.resizeCanvas();
    }

    // Request full redraw for signal-triggered updates (layer visibility, frame changes, etc.)
    dirtyRectStore.requestFullRedraw();
    this.renderCanvas();
  }

  private async loadTool(toolName: ToolType) {
    // Auto-commit floating selection when switching to drawing tools
    const drawingTools = ['pencil', 'eraser', 'fill', 'gradient', 'line', 'rectangle', 'ellipse'];
    if (drawingTools.includes(toolName)) {
      const state = selectionStore.state.value;
      if (state.type === 'floating') {
        const activeLayerId = layerStore.activeLayerId.value;
        const layer = layerStore.layers.value.find((l) => l.id === activeLayerId);
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

    let ToolClass;

    switch (toolName) {
      case 'pencil':
        const { PencilTool } = await import('../../tools/pencil-tool');
        ToolClass = PencilTool;
        break;
      case 'eraser':
        const { EraserTool } = await import('../../tools/eraser-tool');
        ToolClass = EraserTool;
        break;
      case 'eyedropper':
        const { EyedropperTool } = await import('../../tools/eyedropper-tool');
        ToolClass = EyedropperTool;
        break;
      case 'marquee-rect':
        const { MarqueeRectTool } = await import('../../tools/selection/marquee-rect-tool');
        ToolClass = MarqueeRectTool;
        break;
      case 'lasso':
        const { LassoTool } = await import('../../tools/selection/lasso-tool');
        ToolClass = LassoTool;
        break;
      case 'polygonal-lasso':
        const { PolygonalLassoTool } = await import('../../tools/selection/polygonal-lasso-tool');
        ToolClass = PolygonalLassoTool;
        break;
      case 'magic-wand':
        const { MagicWandTool } = await import('../../tools/selection/magic-wand-tool');
        ToolClass = MagicWandTool;
        break;
      case 'line':
        const { LineTool } = await import('../../tools/shape-tool');
        ToolClass = LineTool;
        break;
      case 'rectangle':
        const { RectangleTool } = await import('../../tools/shape-tool');
        ToolClass = RectangleTool;
        break;
      case 'ellipse':
        const { EllipseTool } = await import('../../tools/shape-tool');
        ToolClass = EllipseTool;
        break;
      case 'fill':
        const { FillTool } = await import('../../tools/fill-tool');
        ToolClass = FillTool;
        break;
      case 'gradient':
        const { GradientTool } = await import('../../tools/gradient-tool');
        ToolClass = GradientTool;
        break;
      case 'transform':
        const { TransformTool } = await import('../../tools/transform-tool');
        ToolClass = TransformTool;
        break;
      case 'hand':
        const { HandTool } = await import('../../tools/hand-tool');
        ToolClass = HandTool;
        break;
      case 'zoom':
        const { ZoomTool } = await import('../../tools/zoom-tool');
        ToolClass = ZoomTool;
        break;
      default:
        console.warn(`Unknown tool: ${toolName}`);
        return;
    }

    if (ToolClass) {
      this.activeTool = new ToolClass(this.ctx);

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
      this.ctx.rect(dirtyRect.x, dirtyRect.y, dirtyRect.width, dirtyRect.height);
      this.ctx.clip();

      // Clear just the dirty region
      this.ctx.clearRect(dirtyRect.x, dirtyRect.y, dirtyRect.width, dirtyRect.height);

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

    for (const layer of layers) {
      if (layer.visible && layer.canvas) {
        this.ctx.globalAlpha = layer.opacity / 255;
        this.ctx.globalCompositeOperation = layer.blendMode === 'normal' ? 'source-over' : layer.blendMode as GlobalCompositeOperation;

        if (dirtyRect) {
          // Draw only the dirty region from layer
          this.ctx.drawImage(
            layer.canvas,
            dirtyRect.x, dirtyRect.y, dirtyRect.width, dirtyRect.height,
            dirtyRect.x, dirtyRect.y, dirtyRect.width, dirtyRect.height
          );
        } else {
          this.ctx.drawImage(layer.canvas, 0, 0);
        }
      }
    }

    // Reset composite operation
    this.ctx.globalAlpha = 1;
    this.ctx.globalCompositeOperation = 'source-over';
  }

  private drawOnionSkins() {
    const { enabled, prevFrames, nextFrames, opacityStep, tint } = animationStore.onionSkin.value;
    if (!enabled) return;

    const frames = animationStore.frames.value;
    const currentFrameId = animationStore.currentFrameId.value;
    const currentIndex = frames.findIndex(f => f.id === currentFrameId);
    if (currentIndex === -1) return;

    const activeLayerId = layerStore.activeLayerId.value;
    if (!activeLayerId) return;

    const cels = animationStore.cels.value;

    // Helper to draw a frame
    const drawFrame = (index: number, isPrev: boolean, distance: number) => {
      if (index < 0 || index >= frames.length) return;
      
      const frame = frames[index];
      const key = animationStore.getCelKey(activeLayerId, frame.id);
      const cel = cels.get(key);
      
      if (cel && cel.canvas) {
        const opacity = Math.max(0.1, 1 - (distance * opacityStep));
        
        this.ctx.save();
        this.ctx.globalAlpha = opacity;
        
        if (tint) {
          // Create a temporary canvas for tinting
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = this.width;
          tempCanvas.height = this.height;
          const tempCtx = tempCanvas.getContext('2d')!;
          
          tempCtx.drawImage(cel.canvas, 0, 0);
          tempCtx.globalCompositeOperation = 'source-in';
          tempCtx.fillStyle = isPrev ? '#ff0000' : '#0000ff'; // Red for prev, Blue for next
          tempCtx.fillRect(0, 0, this.width, this.height);
          
          this.ctx.drawImage(tempCanvas, 0, 0);
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
      document.removeEventListener('mousemove', this.boundDocumentMouseMove);
      this.boundDocumentMouseMove = null;
    }
    if (this.boundDocumentMouseUp) {
      document.removeEventListener('mouseup', this.boundDocumentMouseUp);
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
    // Skip drawing during pan operations:
    // - Middle mouse button (button 1) is for panning
    // - Alt+click is for panning
    // - Spacebar pan mode
    if (e.button === 1 || e.altKey || viewportStore.isSpacebarDown.value) {
      return;
    }

    if (!this.activeTool) return;
    const { x, y } = this.getCanvasCoordinates(e);
    const modifiers = this.getModifiers(e);

    // Update active tool context to the active layer's canvas
    const activeLayerId = layerStore.activeLayerId.value;
    const activeLayer = layerStore.layers.value.find((l) => l.id === activeLayerId);

    if (activeLayer && activeLayer.canvas && !activeLayer.locked && activeLayer.visible) {
      const layerCtx = activeLayer.canvas.getContext('2d');
      if (layerCtx) {
        // Capture state before drawing
        this.previousImageData = layerCtx.getImageData(0, 0, this.width, this.height);

        // Update tool context to layer context
        this.activeTool.setContext(layerCtx);

        this.activeTool.onDown(x, y, modifiers);

        // Mark stroke as active and attach document-level listeners
        // This allows us to track mouse movement even outside the canvas
        this.isStrokeActive = true;
        this.boundDocumentMouseMove = this.handleDocumentMouseMove.bind(this);
        this.boundDocumentMouseUp = this.handleDocumentMouseUp.bind(this);
        document.addEventListener('mousemove', this.boundDocumentMouseMove);
        document.addEventListener('mouseup', this.boundDocumentMouseUp);

        // Schedule render instead of immediate call
        renderScheduler.scheduleRender(() => this.renderCanvas());
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

    // Emit cursor position (clamped) for brush overlay
    window.dispatchEvent(
      new CustomEvent('canvas-cursor', {
        detail: { x: Math.floor(x), y: Math.floor(y) },
      })
    );

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
    const activeLayer = layerStore.layers.value.find((l) => l.id === activeLayerId);

    if (activeLayer && activeLayer.canvas && this.previousImageData && strokeBounds && activeLayerId) {
      const layerCtx = activeLayer.canvas.getContext('2d');
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
          bounds.x, bounds.y, bounds.width, bounds.height
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
    window.dispatchEvent(
      new CustomEvent('canvas-cursor', {
        detail: { x: Math.floor(x), y: Math.floor(y) },
      })
    );

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
    window.dispatchEvent(new CustomEvent('canvas-cursor-leave'));

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
  private extractRegion(fullImageData: ImageData, bounds: Rect): Uint8ClampedArray {
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
  private uint8ArrayEquals(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
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
      case 'pencil': return 'Brush Stroke';
      case 'eraser': return 'Erase';
      case 'fill': return 'Fill';
      case 'gradient': return 'Gradient';
      case 'line': return 'Draw Line';
      case 'rectangle': return 'Draw Rectangle';
      case 'ellipse': return 'Draw Ellipse';
      default: return 'Drawing';
    }
  }

  render() {
    // Access signals to register them with SignalWatcher for reactive updates
    // This ensures canvas re-renders when these values change
    void historyStore.version.value;
    void layerStore.layers.value;
    void animationStore.currentFrameId.value;

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
