import { html, css, type PropertyValueMap } from "lit";
import { customElement, query } from "lit/decorators.js";
import { BaseComponent } from "../../core/base-component";
import { tilemapStore } from "../../stores/tilemap";
import { tilesetStore } from "../../stores/tileset";
import { tileSelectionStore } from "../../stores/tile-selection";
import { modeStore } from "../../stores/mode";
import { dirtyRectStore } from "../../stores/dirty-rect";
import { toolStore } from "../../stores/tools";
import { TileBrushTool } from "../../tools/tile-brush-tool";
import { TileEraserTool } from "../../tools/tile-eraser-tool";
import { TileFillTool } from "../../tools/tile-fill-tool";
import { TileSelectTool } from "../../tools/tile-select-tool";

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
    } else if (activeTool === 'tile-select') {
      this.tileSelectTool.onMove(x, y, modifiers);
    }
  }

  private handleMouseDown(e: MouseEvent): void {
    const activeTool = toolStore.activeTool.value;
    const { x, y } = this.getCanvasCoords(e);
    const modifiers = this.getModifiers(e);

    // If in paste preview mode, click confirms paste at current position
    if (tileSelectionStore.isPasteMode) {
      const activeLayerId = tilemapStore.activeLayerId.value;
      if (activeLayerId) {
        tileSelectionStore.confirmPaste(activeLayerId);
      }
      return;
    }

    if (activeTool === 'tile-brush') {
      this.tileBrushTool.onDown(x, y, modifiers);
    } else if (activeTool === 'tile-eraser') {
      this.tileEraserTool.onDown(x, y, modifiers);
    } else if (activeTool === 'tile-fill') {
      this.tileFillTool.onDown(x, y, modifiers);
    } else if (activeTool === 'tile-select') {
      this.tileSelectTool.onDown(x, y, modifiers);
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
    } else if (activeTool === 'tile-select') {
      this.tileSelectTool.onUp(x, y, modifiers);
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
    } else if (activeTool === 'tile-select') {
      this.tileSelectTool.onMove(-1, -1); // Out of bounds clears preview
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
  private tileSelectTool: TileSelectTool = new TileSelectTool();

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
   * selection overlay, paste preview, and ghost preview.
   */
  renderCanvas(): void {
    if (!this.ctx) return;

    const fullRedraw = dirtyRectStore.consumeFullRedraw();

    if (fullRedraw) {
      // Full redraw - clear entire canvas
      this.ctx.clearRect(0, 0, this.pixelWidth, this.pixelHeight);

      // Render all visible layers
      this.renderLayers();

      // Render selection (both active and preview during drag)
      this.renderSelection();

      // Render paste preview if in paste mode
      this.renderPastePreview();

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

  /**
   * Render tile selection overlay
   * Story 3-5 Task 3.2, 3.3, 3.4, 3.5
   *
   * Renders both:
   * - Active selection from tileSelectionStore (marching ants / highlight)
   * - Drag preview from tileSelectTool during active drag
   */
  private renderSelection(): void {
    const tileWidth = tilemapStore.tileWidth.value;
    const tileHeight = tilemapStore.tileHeight.value;

    // Render drag preview during selection (takes priority)
    const preview = this.tileSelectTool.getSelectionPreview();
    if (preview) {
      this.renderSelectionRect(
        preview.x * tileWidth,
        preview.y * tileHeight,
        preview.width * tileWidth,
        preview.height * tileHeight,
        true // isPreview
      );
      return; // Don't render final selection while dragging
    }

    // Render active selection from store
    const sel = tileSelectionStore.selection.value;
    if (sel) {
      this.renderSelectionRect(
        sel.x * tileWidth,
        sel.y * tileHeight,
        sel.width * tileWidth,
        sel.height * tileHeight,
        false // not preview
      );
    }
  }

  /**
   * Render a selection rectangle with highlight border
   * Story 3-5 Task 3.2, 3.3
   *
   * @param pixelX - Left pixel coordinate
   * @param pixelY - Top pixel coordinate
   * @param pixelW - Width in pixels
   * @param pixelH - Height in pixels
   * @param isPreview - True if this is a drag preview (different styling)
   */
  private renderSelectionRect(
    pixelX: number,
    pixelY: number,
    pixelW: number,
    pixelH: number,
    isPreview: boolean
  ): void {
    // Draw selection highlight fill (semi-transparent)
    this.ctx.fillStyle = isPreview
      ? 'rgba(0, 150, 255, 0.15)'  // Lighter for preview
      : 'rgba(0, 150, 255, 0.2)';  // --color-selection equivalent
    this.ctx.fillRect(pixelX, pixelY, pixelW, pixelH);

    // Draw selection border (marching ants effect via dashed line)
    this.ctx.strokeStyle = isPreview
      ? 'rgba(0, 150, 255, 0.6)'  // Lighter for preview
      : '#0096FF';                // --color-selection
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([4, 4]); // Dashed line for marching ants effect
    this.ctx.strokeRect(pixelX + 0.5, pixelY + 0.5, pixelW - 1, pixelH - 1);
    this.ctx.setLineDash([]); // Reset to solid
    this.ctx.lineWidth = 1;
  }

  /**
   * Render paste preview at cursor position
   * Story 3-5 Task 8.1, 8.2, 8.3
   *
   * Renders clipboard tiles as semi-transparent preview following cursor
   */
  private renderPastePreview(): void {
    const clip = tileSelectionStore.clipboard.value;
    const pos = tileSelectionStore.pastePreview.value;
    if (!clip || !pos) return;

    const tileWidth = tilemapStore.tileWidth.value;
    const tileHeight = tilemapStore.tileHeight.value;
    const tilesetId = tilemapStore.activeTilesetId.value;
    if (!tilesetId) return;

    const tileset = tilesetStore.getTileset(tilesetId);
    if (!tileset) return;

    // Draw each tile from clipboard at preview position (semi-transparent)
    this.ctx.globalAlpha = 0.6;

    for (let ty = 0; ty < clip.height; ty++) {
      for (let tx = 0; tx < clip.width; tx++) {
        const tileId = clip.data[ty * clip.width + tx];
        if (tileId === 0) continue; // Skip empty tiles

        const targetX = (pos.x + tx) * tileWidth;
        const targetY = (pos.y + ty) * tileHeight;

        // Get tile from tileset (tileId is 1-based, tileset index is 0-based)
        const rect = tilesetStore.getTileRect(tilesetId, tileId - 1);
        if (rect) {
          this.ctx.drawImage(
            tileset.image,
            rect.x, rect.y, rect.width, rect.height,
            targetX, targetY, tileWidth, tileHeight
          );
        }
      }
    }

    this.ctx.globalAlpha = 1.0;

    // Draw preview border (green to indicate paste target)
    const previewW = clip.width * tileWidth;
    const previewH = clip.height * tileHeight;
    this.ctx.strokeStyle = '#00FF00'; // Green for paste preview
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([4, 4]);
    this.ctx.strokeRect(
      pos.x * tileWidth + 0.5,
      pos.y * tileHeight + 0.5,
      previewW - 1,
      previewH - 1
    );
    this.ctx.setLineDash([]);
    this.ctx.lineWidth = 1;
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
    void tileSelectionStore.selection.value; // Re-render when selection changes
    void tileSelectionStore.pastePreview.value; // Re-render when paste preview changes

    return html`<canvas></canvas>`;
  }
}
