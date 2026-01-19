import { html, css, type PropertyValueMap } from "lit";
import { customElement, query } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { tilemapStore } from "../../stores/tilemap";
import { tilesetStore } from "../../stores/tileset";
import { modeStore } from "../../stores/mode";
import { dirtyRectStore } from "../../stores/dirty-rect";
import { toolStore } from "../../stores/tools";
import { TileBrushTool } from "../../tools/tile-brush-tool";

/**
 * pf-tilemap-canvas - Canvas component for tilemap rendering
 *
 * A separate canvas component for tilemap mode that:
 * - Renders the tilemap at the correct pixel dimensions
 * - Supports dirty rect tracking for efficient rendering
 * - Uses pixelated rendering for crisp tiles
 *
 * This component does NOT extend pf-drawing-canvas as the Architecture doc states:
 * "Create separate pf-tilemap-canvas component (not extending pf-drawing-canvas)"
 * "Fundamentally different rendering logic (tile grid vs pixel buffer)"
 */
@customElement("pf-tilemap-canvas")
export class PFTilemapCanvas extends BaseComponent {
  @query("canvas") canvas!: HTMLCanvasElement;

  static styles = css`
    :host {
      display: block;
      position: relative;
      width: 100%;
      height: 100%;
      background-color: var(--pf-color-bg-dark, #2a2a2a);
      overflow: hidden;
      box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
    }

    canvas {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      image-rendering: pixelated;
      box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
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

  /**
   * Get the total width of the tilemap in pixels
   */
  private get pixelWidth(): number {
    return tilemapStore.pixelWidth;
  }

  /**
   * Get the total height of the tilemap in pixels
   */
  private get pixelHeight(): number {
    return tilemapStore.pixelHeight;
  }

  protected firstUpdated(_changedProperties: PropertyValueMap<any>): void {
    super.firstUpdated(_changedProperties);

    // Get context with performance hints
    const ctx = this.canvas.getContext("2d", {
      alpha: true,
      desynchronized: true, // Hint for lower latency
      willReadFrequently: false,
    });

    if (ctx) {
      this.ctx = ctx;
      // Critical for pixel art - disable anti-aliasing
      this.ctx.imageSmoothingEnabled = false;
    }

    // Initial canvas setup
    this.resizeCanvas();
    this.renderCanvas();

    // Set up tool event handlers
    this.setupToolEventHandlers();
  }

  /**
   * Set up mouse event handlers for tool interactions
   */
  private setupToolEventHandlers(): void {
    // Create bound handlers for cleanup
    this.boundHandleMouseMove = (e: MouseEvent) => this.handleMouseMove(e);
    this.boundHandleMouseDown = (e: MouseEvent) => this.handleMouseDown(e);
    this.boundHandleMouseUp = (e: MouseEvent) => this.handleMouseUp(e);
    this.boundHandleMouseLeave = () => this.handleMouseLeave();

    this.canvas.addEventListener('mousemove', this.boundHandleMouseMove);
    this.canvas.addEventListener('mousedown', this.boundHandleMouseDown);
    this.canvas.addEventListener('mouseup', this.boundHandleMouseUp);
    this.canvas.addEventListener('mouseleave', this.boundHandleMouseLeave);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    // Clean up event listeners
    if (this.boundHandleMouseMove) {
      this.canvas?.removeEventListener('mousemove', this.boundHandleMouseMove);
    }
    if (this.boundHandleMouseDown) {
      this.canvas?.removeEventListener('mousedown', this.boundHandleMouseDown);
    }
    if (this.boundHandleMouseUp) {
      this.canvas?.removeEventListener('mouseup', this.boundHandleMouseUp);
    }
    if (this.boundHandleMouseLeave) {
      this.canvas?.removeEventListener('mouseleave', this.boundHandleMouseLeave);
    }
  }

  /**
   * Convert mouse event coordinates to canvas pixel coordinates
   */
  private getCanvasCoords(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  /**
   * Get modifier keys from mouse event
   */
  private getModifiers(e: MouseEvent) {
    return {
      shift: e.shiftKey,
      ctrl: e.ctrlKey,
      alt: e.altKey,
      button: e.button,
    };
  }

  private handleMouseMove(e: MouseEvent): void {
    if (toolStore.activeTool.value !== 'tile-brush') return;
    const { x, y } = this.getCanvasCoords(e);
    this.tileBrushTool.onMove(x, y, this.getModifiers(e));
  }

  private handleMouseDown(e: MouseEvent): void {
    if (toolStore.activeTool.value !== 'tile-brush') return;
    const { x, y } = this.getCanvasCoords(e);
    this.tileBrushTool.onDown(x, y, this.getModifiers(e));
  }

  private handleMouseUp(e: MouseEvent): void {
    if (toolStore.activeTool.value !== 'tile-brush') return;
    const { x, y } = this.getCanvasCoords(e);
    this.tileBrushTool.onUp(x, y, this.getModifiers(e));
  }

  private handleMouseLeave(): void {
    // Clear preview when mouse leaves canvas
    if (toolStore.activeTool.value === 'tile-brush') {
      this.tileBrushTool.onMove(-1, -1); // Out of bounds clears preview
    }
  }

  protected updated(
    _changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>
  ): void {
    super.updated(_changedProperties);

    // Check if tilemap dimensions changed and resize if needed
    if (
      this.canvas &&
      (this.canvas.width !== this.pixelWidth ||
        this.canvas.height !== this.pixelHeight)
    ) {
      this.resizeCanvas();
    }

    // Request full redraw for signal-triggered updates
    dirtyRectStore.requestFullRedraw();
    this.renderCanvas();
  }

  /**
   * Resize the canvas to match the tilemap dimensions
   */
  resizeCanvas(): void {
    if (!this.canvas) return;

    // Set canvas to logical pixel dimensions
    this.canvas.width = this.pixelWidth;
    this.canvas.height = this.pixelHeight;

    // Display size matches logical size - viewport scales it
    this.canvas.style.width = `${this.pixelWidth}px`;
    this.canvas.style.height = `${this.pixelHeight}px`;

    // Host matches canvas size
    this.style.width = `${this.pixelWidth}px`;
    this.style.height = `${this.pixelHeight}px`;

    // Re-apply context settings after resize (context may be reset)
    if (this.ctx) {
      this.ctx.imageSmoothingEnabled = false;
    }
  }

  // Tool instance for tile operations and preview
  private tileBrushTool: TileBrushTool = new TileBrushTool();

  // Bound event handlers for cleanup
  private boundHandleMouseMove: ((e: MouseEvent) => void) | null = null;
  private boundHandleMouseDown: ((e: MouseEvent) => void) | null = null;
  private boundHandleMouseUp: ((e: MouseEvent) => void) | null = null;
  private boundHandleMouseLeave: (() => void) | null = null;

  /**
   * Render the tilemap canvas
   *
   * Renders all visible layers with their tiles, then renders
   * the ghost preview if tile-brush tool is active.
   */
  renderCanvas(): void {
    if (!this.ctx) return;

    const fullRedraw = dirtyRectStore.consumeFullRedraw();

    if (fullRedraw) {
      // Full redraw - clear entire canvas
      this.ctx.clearRect(0, 0, this.pixelWidth, this.pixelHeight);

      // Render all visible layers
      this.renderLayers();

      // Render ghost preview if tile-brush is active
      this.renderPreview();
    }
  }

  /**
   * Render all visible tile layers
   */
  private renderLayers(): void {
    const layers = tilemapStore.layers.value;
    const tilesetId = tilemapStore.activeTilesetId.value;
    if (!tilesetId) return;

    const tileset = tilesetStore.getTileset(tilesetId);
    if (!tileset) return;

    const tileWidth = tilemapStore.tileWidth.value;
    const tileHeight = tilemapStore.tileHeight.value;
    const mapWidth = tilemapStore.width.value;
    const mapHeight = tilemapStore.height.value;

    // Render layers from bottom to top (first in array = bottom)
    for (const layer of layers) {
      if (!layer.visible) continue;

      // Apply layer opacity
      const previousAlpha = this.ctx.globalAlpha;
      this.ctx.globalAlpha = layer.opacity;

      // Render each tile in the layer
      for (let y = 0; y < mapHeight; y++) {
        for (let x = 0; x < mapWidth; x++) {
          const index = y * layer.width + x;
          const tileId = layer.data[index];

          // Skip empty tiles (0 = empty)
          if (tileId === 0) continue;

          // Convert 1-based storage ID to 0-based tileset index
          const tileIndex = tileId - 1;

          // Get tile source rectangle
          const rect = tilesetStore.getTileRect(tilesetId, tileIndex);
          if (!rect) continue;

          // Draw tile
          this.ctx.drawImage(
            tileset.image,
            rect.x, rect.y, rect.width, rect.height,
            x * tileWidth, y * tileHeight, tileWidth, tileHeight
          );
        }
      }

      // Restore opacity
      this.ctx.globalAlpha = previousAlpha;
    }
  }

  /**
   * Render a ghost preview tile at the current hover position
   * Only renders when tile-brush tool is active
   */
  private renderPreview(): void {
    // Check if tile-brush is the active tool
    if (toolStore.activeTool.value !== 'tile-brush') return;

    // Get preview from tool
    const preview = this.tileBrushTool.getPreviewTile();
    if (!preview) return;

    this.renderTilePreview(preview.tileIndex, preview.x, preview.y);
  }

  /**
   * Render a ghost preview tile at the given position
   * @param tileIndex - 0-based tile index from tileset
   * @param tileX - Tile X coordinate
   * @param tileY - Tile Y coordinate
   */
  renderTilePreview(tileIndex: number, tileX: number, tileY: number): void {
    const tilesetId = tilemapStore.activeTilesetId.value;
    if (!tilesetId) return;

    const tileset = tilesetStore.getTileset(tilesetId);
    const rect = tilesetStore.getTileRect(tilesetId, tileIndex);
    if (!tileset || !rect) return;

    const tileWidth = tilemapStore.tileWidth.value;
    const tileHeight = tilemapStore.tileHeight.value;

    // Draw at 50% opacity for ghost effect
    this.ctx.globalAlpha = 0.5;
    this.ctx.drawImage(
      tileset.image,
      rect.x, rect.y, rect.width, rect.height,
      tileX * tileWidth, tileY * tileHeight, tileWidth, tileHeight
    );
    this.ctx.globalAlpha = 1.0;
  }

  render() {
    // Access signals to register them with SignalWatcher for reactive updates
    void modeStore.mode.value;
    void tilemapStore.width.value;
    void tilemapStore.height.value;
    void tilemapStore.tileWidth.value;
    void tilemapStore.tileHeight.value;
    void tilemapStore.layers.value; // Re-render when tiles change
    void tilemapStore.activeTilesetId.value; // Re-render when tileset changes
    void toolStore.activeTool.value; // Re-render when tool changes (for preview)
    void tilesetStore.selectedTileIndex.value; // Re-render when selected tile changes (for preview)

    return html`<canvas></canvas>`;
  }
}
