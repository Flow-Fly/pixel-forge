import { html, css, type PropertyValueMap } from "lit";
import { customElement, query } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { tilemapStore } from "../../stores/tilemap";
import { tilesetStore } from "../../stores/tileset";
import { modeStore } from "../../stores/mode";
import { dirtyRectStore } from "../../stores/dirty-rect";
import { toolStore } from "../../stores/tools";
import { TileBrushTool } from "../../tools/tile-brush-tool";
import { TileEraserTool } from "../../tools/tile-eraser-tool";
import { TileFillTool } from "../../tools/tile-fill-tool";

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
    this.boundHandleContextMenu = (e: MouseEvent) => e.preventDefault();

    this.canvas.addEventListener('mousemove', this.boundHandleMouseMove);
    this.canvas.addEventListener('mousedown', this.boundHandleMouseDown);
    this.canvas.addEventListener('mouseup', this.boundHandleMouseUp);
    this.canvas.addEventListener('mouseleave', this.boundHandleMouseLeave);
    // Prevent context menu on right-click (enables right-click quick erase)
    this.canvas.addEventListener('contextmenu', this.boundHandleContextMenu);
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
    if (this.boundHandleContextMenu) {
      this.canvas?.removeEventListener('contextmenu', this.boundHandleContextMenu);
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
    const activeTool = toolStore.activeTool.value;
    const { x, y } = this.getCanvasCoords(e);
    const modifiers = this.getModifiers(e);

    if (activeTool === 'tile-brush') {
      this.tileBrushTool.onMove(x, y, modifiers);
    } else if (activeTool === 'tile-eraser') {
      this.tileEraserTool.onMove(x, y, modifiers);
    } else if (activeTool === 'tile-fill') {
      this.tileFillTool.onMove(x, y, modifiers);
    }
  }

  private handleMouseDown(e: MouseEvent): void {
    const activeTool = toolStore.activeTool.value;
    const { x, y } = this.getCanvasCoords(e);
    const modifiers = this.getModifiers(e);

    if (activeTool === 'tile-brush') {
      this.tileBrushTool.onDown(x, y, modifiers);
    } else if (activeTool === 'tile-eraser') {
      this.tileEraserTool.onDown(x, y, modifiers);
    } else if (activeTool === 'tile-fill') {
      this.tileFillTool.onDown(x, y, modifiers);
    }
  }

  private handleMouseUp(e: MouseEvent): void {
    const activeTool = toolStore.activeTool.value;
    const { x, y } = this.getCanvasCoords(e);
    const modifiers = this.getModifiers(e);

    if (activeTool === 'tile-brush') {
      this.tileBrushTool.onUp(x, y, modifiers);
    } else if (activeTool === 'tile-eraser') {
      this.tileEraserTool.onUp(x, y, modifiers);
    } else if (activeTool === 'tile-fill') {
      this.tileFillTool.onUp(x, y, modifiers);
    }
  }

  private handleMouseLeave(): void {
    const activeTool = toolStore.activeTool.value;

    // Clear preview when mouse leaves canvas
    if (activeTool === 'tile-brush') {
      this.tileBrushTool.onMove(-1, -1); // Out of bounds clears preview
    } else if (activeTool === 'tile-eraser') {
      this.tileEraserTool.onMove(-1, -1); // Out of bounds clears preview
    } else if (activeTool === 'tile-fill') {
      this.tileFillTool.onMove(-1, -1); // Out of bounds clears preview
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

  // Tool instances for tile operations and preview
  private tileBrushTool: TileBrushTool = new TileBrushTool();
  private tileEraserTool: TileEraserTool = new TileEraserTool();
  private tileFillTool: TileFillTool = new TileFillTool();

  // Bound event handlers for cleanup
  private boundHandleMouseMove: ((e: MouseEvent) => void) | null = null;
  private boundHandleMouseDown: ((e: MouseEvent) => void) | null = null;
  private boundHandleMouseUp: ((e: MouseEvent) => void) | null = null;
  private boundHandleMouseLeave: (() => void) | null = null;
  private boundHandleContextMenu: ((e: MouseEvent) => void) | null = null;

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
   * Render preview at the current hover position
   * Renders ghost tile for brush, eraser indicator for eraser, or fill indicator for fill
   */
  private renderPreview(): void {
    const activeTool = toolStore.activeTool.value;

    if (activeTool === 'tile-brush') {
      // Get preview from brush tool
      const preview = this.tileBrushTool.getPreviewTile();
      if (!preview) return;
      this.renderTilePreview(preview.tileIndex, preview.x, preview.y);
    } else if (activeTool === 'tile-eraser') {
      // Get eraser position
      const eraserPos = this.tileEraserTool.getEraserPosition();
      if (!eraserPos) return;
      this.renderEraserPreview(eraserPos.x, eraserPos.y);
    } else if (activeTool === 'tile-fill') {
      // Get fill position
      const fillPos = this.tileFillTool.getFillPreviewPosition();
      if (!fillPos) return;
      this.renderFillPreview(fillPos.x, fillPos.y);
    }
  }

  /**
   * Render eraser preview indicator at the given tile position
   * Shows a red-tinted overlay on the tile to be erased
   */
  private renderEraserPreview(tileX: number, tileY: number): void {
    const tileWidth = tilemapStore.tileWidth.value;
    const tileHeight = tilemapStore.tileHeight.value;

    // Draw a red-tinted semi-transparent overlay
    this.ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
    this.ctx.fillRect(
      tileX * tileWidth,
      tileY * tileHeight,
      tileWidth,
      tileHeight
    );

    // Draw an X indicator
    this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    // Draw X from corners
    const x = tileX * tileWidth;
    const y = tileY * tileHeight;
    const padding = 2;
    this.ctx.moveTo(x + padding, y + padding);
    this.ctx.lineTo(x + tileWidth - padding, y + tileHeight - padding);
    this.ctx.moveTo(x + tileWidth - padding, y + padding);
    this.ctx.lineTo(x + padding, y + tileHeight - padding);
    this.ctx.stroke();
    this.ctx.lineWidth = 1;
  }

  /**
   * Render fill preview indicator at the given tile position
   * Shows the selected tile with a highlight border
   */
  private renderFillPreview(tileX: number, tileY: number): void {
    const tileWidth = tilemapStore.tileWidth.value;
    const tileHeight = tilemapStore.tileHeight.value;
    const selectedTile = tilesetStore.selectedTileIndex.value;

    const x = tileX * tileWidth;
    const y = tileY * tileHeight;

    // Draw the selected tile as ghost preview if a tile is selected
    if (selectedTile !== null) {
      this.renderTilePreview(selectedTile, tileX, tileY);
    }

    // Draw a cyan/blue highlight border to indicate fill target
    this.ctx.strokeStyle = 'rgba(0, 200, 255, 0.8)';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(x + 1, y + 1, tileWidth - 2, tileHeight - 2);
    this.ctx.lineWidth = 1;
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
