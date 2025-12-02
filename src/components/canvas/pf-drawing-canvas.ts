import { html, css, type PropertyValueMap } from 'lit';
import { customElement, property, query } from 'lit/decorators.js';
import { BaseComponent } from '../../core/base-component';
import { layerStore } from '../../stores/layers';
import { selectionStore } from '../../stores/selection';
import { toolStore, type ToolType } from '../../stores/tools';
import { animationStore } from '../../stores/animation';
import { historyStore } from '../../stores/history';
import { BrushCommand } from '../../commands/drawing-commands';
import type { ModifierKeys } from '../../tools/base-tool';

@customElement('pf-drawing-canvas')
export class PFDrawingCanvas extends BaseComponent {
  @property({ type: Number }) width = 64;
  @property({ type: Number }) height = 64;
  @property({ type: Number }) zoom = 10;

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
      background-color: white; /* Default canvas background */
      box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
      /* Cursor is set dynamically based on active tool */
      cursor: crosshair;
    }
  `;

  private ctx!: CanvasRenderingContext2D;
  private activeTool: any; // TODO: Type properly
  private previousImageData: ImageData | null = null;

  protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
    super.firstUpdated(_changedProperties);
    this.ctx = this.canvas.getContext('2d')!;
    
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

    if (_changedProperties.has('width') || _changedProperties.has('height') || _changedProperties.has('zoom')) {
      this.resizeCanvas();
    }
    
    // Always re-render when updated (which happens on signal changes)
    this.renderCanvas();
  }

  private async loadTool(toolName: ToolType) {
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
      default:
        console.warn(`Unknown tool: ${toolName}`);
        return;
    }

    if (ToolClass) {
      this.activeTool = new ToolClass(this.ctx);

      // Set cursor based on tool
      if (this.canvas && this.activeTool.cursor) {
        this.canvas.style.cursor = this.activeTool.cursor;
      }
    }
  }

  resizeCanvas() {
    if (!this.canvas) return;
    
    // Resize canvas element based on zoom
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    
    const displayWidth = this.width * this.zoom;
    const displayHeight = this.height * this.zoom;

    this.canvas.style.width = `${displayWidth}px`;
    this.canvas.style.height = `${displayHeight}px`;
    
    // Also resize the host to match
    this.style.width = `${displayWidth}px`;
    this.style.height = `${displayHeight}px`;
  }

  renderCanvas() {
    if (!this.ctx) return;

    // Clear main canvas
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Draw onion skins if enabled
    this.drawOnionSkins();
    
    // Composite layers
    const layers = layerStore.layers.value;
    // Render from bottom to top
    for (const layer of layers) {
      if (layer.visible && layer.canvas) {
        this.ctx.globalAlpha = layer.opacity / 255;
        this.ctx.globalCompositeOperation = layer.blendMode === 'normal' ? 'source-over' : layer.blendMode as GlobalCompositeOperation;
        this.ctx.drawImage(layer.canvas, 0, 0);
      }
    }
    
    // Reset composite operation
    this.ctx.globalAlpha = 1;
    this.ctx.globalCompositeOperation = 'source-over';

    // Draw selection overlay
    this.drawSelection();
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
    const selection = selectionStore.selection.value;
    if (selection.type === 'none' || !selection.bounds) return;

    const { x, y, w, h } = selection.bounds;
    
    // Draw marching ants
    this.ctx.save();
    this.ctx.strokeStyle = 'white';
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([4, 4]);
    this.ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    
    this.ctx.strokeStyle = 'black';
    this.ctx.lineDashOffset = 4;
    this.ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    this.ctx.restore();
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
    };
  }

  private handleMouseDown(e: MouseEvent) {
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
        this.renderCanvas(); // Re-render after tool action
      }
    }
  }

  private handleMouseMove(e: MouseEvent) {
    if (!this.activeTool) return;
    const { x, y } = this.getCanvasCoordinates(e);
    const modifiers = this.getModifiers(e);

    if (e.buttons === 1) {
      this.activeTool.onDrag(x, y, modifiers);
      this.renderCanvas(); // Re-render during drag
    } else {
      this.activeTool.onMove(x, y, modifiers);
    }
  }

  private handleMouseUp(e: MouseEvent) {
    if (!this.activeTool) return;
    const { x, y } = this.getCanvasCoordinates(e);
    const modifiers = this.getModifiers(e);
    this.activeTool.onUp(x, y, modifiers);
    this.renderCanvas(); // Final render

    // Capture state after drawing and create command
    const activeLayerId = layerStore.activeLayerId.value;
    const activeLayer = layerStore.layers.value.find((l) => l.id === activeLayerId);

    if (activeLayer && activeLayer.canvas && this.previousImageData) {
      const layerCtx = activeLayer.canvas.getContext('2d');
      if (layerCtx) {
        const newImageData = layerCtx.getImageData(0, 0, this.width, this.height);

        // Only create command if image data actually changed
        // For now, we assume it changed if mouse was down.
        // Optimization: Compare data buffers?

        const command = new BrushCommand(
          activeLayer.canvas,
          { x: 0, y: 0, w: this.width, h: this.height },
          this.previousImageData,
          newImageData
        );

        historyStore.execute(command);
        this.previousImageData = null;
      }
    }
  }

  render() {
    return html`
      <canvas
        @mousedown=${this.handleMouseDown}
        @mousemove=${this.handleMouseMove}
        @mouseup=${this.handleMouseUp}
        @mouseleave=${this.handleMouseUp}
      ></canvas>
    `;
  }
}
