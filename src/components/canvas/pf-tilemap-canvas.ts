import { html, css, type PropertyValueMap } from "lit";
import { customElement, query, state } from "lit/decorators.js";
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
import type { HeroEditZoomParams } from "../../types/tilemap";
// Story 5-3 Task 5.1: Import hero edit indicator component
import "./pf-hero-edit-indicator";

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

  /**
   * Context menu visibility state
   * Story 5-1 Task 5
   */
  @state() private contextMenuVisible = false;

  /**
   * Last clicked tile position for zoom animation
   * Story 5-2 Task 2.3
   */
  @state() private lastClickedTilePosition: { x: number; y: number } | null = null;

  /**
   * Stored hero edit zoom parameters
   * Story 5-2 Task 2.2
   */
  private heroEditZoomParams: HeroEditZoomParams | null = null;

  /** Context menu position in screen coordinates */
  @state() private contextMenuPosition = { x: 0, y: 0 };

  /** Tile ID for the context menu target (null if not over a tile) */
  @state() private contextMenuTileId: number | null = null;

  /**
   * Tile position for context menu target (Code Review Fix M2)
   * Stored so hero edit zoom targets correct tile instance
   */
  private contextMenuTilePosition: { x: number; y: number } | null = null;

  /**
   * Flag to prevent race condition with click-outside handler
   * Set true when menu opens, checked before registering click handler
   */
  private contextMenuJustOpened = false;

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
      /* Story 5-2 Task 3.1: CSS transitions for zoom animation */
      transition: transform var(--hero-edit-transition-duration, 300ms) ease-out;
      transform-origin: center center;
    }

    /* Story 5-2 Task 5.5: Respect reduced motion preference */
    @media (prefers-reduced-motion: reduce) {
      canvas {
        transition: none !important;
      }
    }

    /* Inherit cursor from host during pan mode (set by viewport) */
    :host([pan-cursor="grab"]) canvas {
      cursor: grab !important;
    }
    :host([pan-cursor="grabbing"]) canvas {
      cursor: grabbing !important;
    }

    /* Story 5-1 Task 5.10: Context menu styling */
    .context-menu {
      position: fixed;
      background: var(--pf-color-surface, #3a3a3a);
      border: 1px solid var(--pf-color-border, #555);
      border-radius: var(--pf-radius-sm, 4px);
      padding: var(--pf-spacing-xs, 4px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      z-index: 1000;
      min-width: 120px;
    }

    .context-menu-item {
      padding: var(--pf-spacing-xs, 4px) var(--pf-spacing-sm, 8px);
      cursor: pointer;
      border-radius: var(--pf-radius-xs, 2px);
      color: var(--pf-color-text, #fff);
      font-size: 0.875rem;
    }

    .context-menu-item:hover,
    .context-menu-item:focus {
      background: var(--pf-color-accent, #0096FF);
      color: white;
      outline: none;
    }

    .context-menu-item:focus-visible {
      outline: 2px solid var(--pf-color-accent, #0096FF);
      outline-offset: -2px;
    }

    .context-menu-divider {
      height: 1px;
      background: var(--pf-color-border, #555);
      margin: var(--pf-spacing-xs, 4px) 0;
    }
  `;

  private ctx!: CanvasRenderingContext2D;

  // Tool instances for tile operations and preview
  private readonly tileTools = {
    'tile-brush': new TileBrushTool(),
    'tile-eraser': new TileEraserTool(),
    'tile-fill': new TileFillTool(),
    'tile-select': new TileSelectTool(),
  } as const;

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

    // Story 5-2 Task 3.3, 3.7: Set up hero edit transition event listeners
    this.setupHeroEditTransitionListeners();

    // Story 5-2 Task 5.2: Set up reduced motion preference listener (Code Review Fix H2)
    this.setupReducedMotionListener();
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
    // Story 5-1 Task 5: Replace simple prevent with context menu handler
    this.boundHandleContextMenu = (e: MouseEvent) => this.handleContextMenu(e);
    // Story 5-1 Task 4: Add double-click handler for hero edit
    this.boundHandleDoubleClick = (e: MouseEvent) => this.handleDoubleClick(e);

    this.canvas.addEventListener('mousemove', this.boundHandleMouseMove);
    this.canvas.addEventListener('mousedown', this.boundHandleMouseDown);
    this.canvas.addEventListener('mouseup', this.boundHandleMouseUp);
    this.canvas.addEventListener('mouseleave', this.boundHandleMouseLeave);
    this.canvas.addEventListener('contextmenu', this.boundHandleContextMenu);
    // Story 5-1 Task 4.1: Add dblclick listener
    this.canvas.addEventListener('dblclick', this.boundHandleDoubleClick);
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
    // Story 5-1 Task 4: Clean up double-click handler
    if (this.boundHandleDoubleClick) {
      this.canvas?.removeEventListener('dblclick', this.boundHandleDoubleClick);
    }
    // Clean up context menu listeners
    this.cleanupContextMenuListeners();
    // Story 5-2: Clean up hero edit transition listeners
    this.cleanupHeroEditTransitionListeners();
    // Story 5-2: Clean up reduced motion listener (Code Review Fix H2)
    this.cleanupReducedMotionListener();
  }

  /**
   * Clean up context menu event listeners
   * Story 5-1 Task 5
   */
  private cleanupContextMenuListeners(): void {
    document.removeEventListener('click', this.handleClickOutside);
    document.removeEventListener('keydown', this.handleContextMenuKeydown);
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

  private getTileTool(toolName: string) {
    return this.tileTools[toolName as keyof typeof this.tileTools];
  }

  private handleMouseMove(e: MouseEvent): void {
    const tool = this.getTileTool(toolStore.activeTool.value);
    if (tool) {
      const { x, y } = this.getCanvasCoords(e);
      tool.onMove(x, y, this.getModifiers(e));

      // Story 5-1 Task 6: Cursor change for editable tiles
      // Check if hovering over a placed tile
      const { x: tileX, y: tileY } = this.getTileCoords(x, y);
      const activeLayerId = tilemapStore.activeLayerId.value;

      if (activeLayerId && this.canvas) {
        const mapWidth = tilemapStore.width.value;
        const mapHeight = tilemapStore.height.value;

        // Check bounds before getting tile
        if (tileX >= 0 && tileX < mapWidth && tileY >= 0 && tileY < mapHeight) {
          const tileId = tilemapStore.getTile(activeLayerId, tileX, tileY);

          // Task 6.2: If over placed tile and current tool is tile brush/selection, set cursor to pointer
          // NOTE: Intentionally limited to tile-brush and tile-select tools only.
          // Eraser and fill tools have their own cursor semantics that shouldn't be overridden.
          // This matches the UX spec which focuses on edit discoverability for placement tools.
          const activeTool = toolStore.activeTool.value;
          if (tileId > 0 && (activeTool === 'tile-brush' || activeTool === 'tile-select')) {
            this.canvas.style.cursor = 'pointer';
          } else {
            // Task 6.3: If over empty cell, maintain current tool cursor
            this.canvas.style.cursor = tool.cursor;
          }
        } else {
          this.canvas.style.cursor = tool.cursor;
        }
      } else if (this.canvas) {
        this.canvas.style.cursor = tool.cursor;
      }
    }
  }

  private handleMouseDown(e: MouseEvent): void {
    // If in paste preview mode, click confirms paste at current position
    if (tileSelectionStore.isPasteMode) {
      const activeLayerId = tilemapStore.activeLayerId.value;
      if (activeLayerId) {
        tileSelectionStore.confirmPaste(activeLayerId);
      }
      return;
    }

    const tool = this.getTileTool(toolStore.activeTool.value);
    if (tool) {
      const { x, y } = this.getCanvasCoords(e);
      tool.onDown(x, y, this.getModifiers(e));
    }
  }

  private handleMouseUp(e: MouseEvent): void {
    const tool = this.getTileTool(toolStore.activeTool.value);
    if (tool) {
      const { x, y } = this.getCanvasCoords(e);
      tool.onUp(x, y, this.getModifiers(e));
    }
  }

  private handleMouseLeave(): void {
    const tool = this.getTileTool(toolStore.activeTool.value);
    if (tool) {
      tool.onMove(-1, -1); // Out of bounds clears preview
    }
  }

  // ========================================
  // Story 5-1: Hero Edit Entry Handlers (Tasks 4-6)
  // ========================================

  /**
   * Convert pixel coordinates to tile coordinates
   * Story 5-1 Task 4.3
   */
  private getTileCoords(pixelX: number, pixelY: number): { x: number; y: number } {
    const tileWidth = tilemapStore.tileWidth.value;
    const tileHeight = tilemapStore.tileHeight.value;
    return {
      x: Math.floor(pixelX / tileWidth),
      y: Math.floor(pixelY / tileHeight)
    };
  }

  /**
   * Calculate zoom parameters for hero edit view
   * Story 5-2 Task 2.1
   *
   * Target: Display tile at minimum 400px for comfortable editing
   *
   * @param tileId - The tile ID being edited
   * @param tileX - Tile X coordinate
   * @param tileY - Tile Y coordinate
   * @returns Calculated zoom parameters
   */
  getHeroEditZoomParams(_tileId: number, tileX: number, tileY: number): HeroEditZoomParams {
    const tileWidth = tilemapStore.tileWidth.value;
    const tileHeight = tilemapStore.tileHeight.value;

    // Get viewport dimensions (use logical OR to treat 0 as invalid)
    const viewportWidth = this.canvas?.clientWidth || 400;
    const viewportHeight = this.canvas?.clientHeight || 400;

    // Target display size for edited tile (minimum 400px, max 80% of viewport)
    const targetSize = Math.min(
      Math.max(400, Math.min(viewportWidth, viewportHeight) * 0.6),
      Math.min(viewportWidth, viewportHeight) * 0.8
    );

    // Calculate zoom level needed (Task 2.3)
    const zoomX = targetSize / tileWidth;
    const zoomY = targetSize / tileHeight;
    const zoomLevel = Math.min(zoomX, zoomY);

    // Calculate tile center in canvas coords (Task 2.3)
    const tileCenterX = (tileX + 0.5) * tileWidth;
    const tileCenterY = (tileY + 0.5) * tileHeight;

    // Calculate offset to center tile in viewport
    const viewportCenterX = viewportWidth / 2;
    const viewportCenterY = viewportHeight / 2;

    const offsetX = viewportCenterX - tileCenterX * zoomLevel;
    const offsetY = viewportCenterY - tileCenterY * zoomLevel;

    return {
      zoomLevel,
      offsetX,
      offsetY,
      tileCenterX,
      tileCenterY,
      tileX,
      tileY
    };
  }

  /**
   * Handle double-click to enter hero edit mode
   * Story 5-1 Task 4.2-4.7
   */
  private handleDoubleClick(e: MouseEvent): void {
    // Task 4.7: Prevent default to avoid text selection
    e.preventDefault();

    // Task 4.3: Convert mouse coords to tile coords
    const { x: pixelX, y: pixelY } = this.getCanvasCoords(e);
    const { x: tileX, y: tileY } = this.getTileCoords(pixelX, pixelY);

    // Task 4.4: Get tile ID at clicked position
    const activeLayerId = tilemapStore.activeLayerId.value;
    if (!activeLayerId) return;

    // Check bounds
    const mapWidth = tilemapStore.width.value;
    const mapHeight = tilemapStore.height.value;
    if (tileX < 0 || tileX >= mapWidth || tileY < 0 || tileY >= mapHeight) {
      return;
    }

    const tileId = tilemapStore.getTile(activeLayerId, tileX, tileY);

    // Task 4.5: If tileId === 0 (empty), return early - no action
    if (tileId === 0) {
      return;
    }

    // Story 5-2: Store position for zoom animation
    this.lastClickedTilePosition = { x: tileX, y: tileY };

    // Task 4.6: If tileId > 0, call enterHeroEdit
    tilemapStore.enterHeroEdit(tileId);
  }

  /**
   * Handle context menu (right-click)
   * Story 5-1 Task 5.1-5.6
   */
  private handleContextMenu(e: MouseEvent): void {
    // Task 5.5: Prevent default browser context menu
    e.preventDefault();

    // Task 5.3: Convert mouse coords to tile coords
    const { x: pixelX, y: pixelY } = this.getCanvasCoords(e);
    const { x: tileX, y: tileY } = this.getTileCoords(pixelX, pixelY);

    const activeLayerId = tilemapStore.activeLayerId.value;
    if (!activeLayerId) return;

    // Check bounds
    const mapWidth = tilemapStore.width.value;
    const mapHeight = tilemapStore.height.value;
    if (tileX < 0 || tileX >= mapWidth || tileY < 0 || tileY >= mapHeight) {
      return;
    }

    // Task 5.4: Get tile ID at position
    const tileId = tilemapStore.getTile(activeLayerId, tileX, tileY);

    // Store context menu state
    this.contextMenuTileId = tileId;
    // Code Review Fix M2: Store tile position for correct zoom target
    this.contextMenuTilePosition = { x: tileX, y: tileY };
    // Task 5.6: Position at mouse coords
    this.contextMenuPosition = { x: e.clientX, y: e.clientY };
    this.contextMenuVisible = true;

    // Task 5.8: Add click-outside handler
    // Use flag to prevent race condition - the click handler registered in the same
    // event loop tick could fire immediately on some browsers
    this.contextMenuJustOpened = true;
    requestAnimationFrame(() => {
      this.contextMenuJustOpened = false;
      document.addEventListener('click', this.handleClickOutside);
      // Task 5.9: Add Escape key handler
      document.addEventListener('keydown', this.handleContextMenuKeydown);
    });
  }

  /**
   * Handle click outside context menu
   * Story 5-1 Task 5.8 (Code Review Fix: race condition prevention)
   */
  private handleClickOutside = (e: MouseEvent): void => {
    // Check race condition flag - menu just opened, ignore this click
    if (this.contextMenuJustOpened) return;

    // Check if click is inside context menu
    const target = e.target as HTMLElement;
    const contextMenu = this.shadowRoot?.querySelector('.context-menu');
    if (contextMenu && contextMenu.contains(target)) {
      return; // Click inside menu, don't close
    }
    this.closeContextMenu();
  };

  /**
   * Close the context menu
   * Story 5-1 Task 5.8
   */
  private closeContextMenu = (): void => {
    this.contextMenuVisible = false;
    this.contextMenuTileId = null;
    // Code Review Fix M2: Clear stored tile position
    this.contextMenuTilePosition = null;
    document.removeEventListener('click', this.handleClickOutside);
    document.removeEventListener('keydown', this.handleContextMenuKeydown);
  };

  /**
   * Handle keyboard events for context menu
   * Story 5-1 Task 5.9
   * Code Review Fix: Added arrow key navigation and Enter/Space activation
   */
  private handleContextMenuKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      this.closeContextMenu();
      return;
    }

    // Handle arrow key navigation between menu items
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const menu = this.shadowRoot?.querySelector('.context-menu');
      if (!menu) return;

      const items = Array.from(menu.querySelectorAll('.context-menu-item')) as HTMLElement[];
      if (items.length === 0) return;

      const currentFocus = this.shadowRoot?.activeElement as HTMLElement;
      const currentIndex = items.indexOf(currentFocus);

      let nextIndex: number;
      if (e.key === 'ArrowDown') {
        nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
      } else {
        nextIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
      }

      items[nextIndex]?.focus();
    }
  };

  /**
   * Handle keyboard activation of menu item (Enter/Space)
   * Code Review Fix: NFR17 keyboard accessibility
   */
  private handleMenuItemKeydown(e: KeyboardEvent, action: () => void): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      action();
    }
  }

  /**
   * Handle Edit Tile menu item click
   * Story 5-1 Task 5.7
   */
  private handleEditTileClick(): void {
    if (this.contextMenuTileId && this.contextMenuTileId > 0) {
      // Code Review Fix M2: Use stored position for correct zoom target
      if (this.contextMenuTilePosition) {
        this.lastClickedTilePosition = this.contextMenuTilePosition;
      }
      tilemapStore.enterHeroEdit(this.contextMenuTileId);
    }
    this.closeContextMenu();
  }

  // ========================================
  // Story 5-2: Hero Edit Zoom Animation (Tasks 3-5)
  // ========================================

  /** Bound handler for hero-edit-entered event */
  private boundHandleHeroEditEntered: ((e: Event) => void) | null = null;
  /** Bound handler for hero-edit-exited event */
  private boundHandleHeroEditExited: ((e: Event) => void) | null = null;
  /** Bound handler for transitionend event */
  private boundHandleTransitionEnd: ((e: Event) => void) | null = null;

  /**
   * Cached reduced motion preference (Code Review Fix H2)
   * Story 5-2 Task 5.2: Cache matchMedia result
   */
  private _prefersReducedMotion = false;
  /** MediaQueryList for reduced motion preference */
  private reducedMotionMediaQuery: MediaQueryList | null = null;
  /** Bound handler for reduced motion media query changes */
  private boundHandleReducedMotionChange: ((e: MediaQueryListEvent) => void) | null = null;

  /**
   * Set up hero edit transition event listeners
   * Story 5-2 Task 3.3, 3.7, 4.3, 4.4
   */
  private setupHeroEditTransitionListeners(): void {
    this.boundHandleHeroEditEntered = (e: Event) => this.handleHeroEditEntered(e as CustomEvent);
    this.boundHandleHeroEditExited = (e: Event) => this.handleHeroEditExited(e as CustomEvent);
    this.boundHandleTransitionEnd = (e: Event) => this.handleTransitionEnd(e as TransitionEvent);

    tilemapStore.addEventListener('hero-edit-entered', this.boundHandleHeroEditEntered);
    tilemapStore.addEventListener('hero-edit-exited', this.boundHandleHeroEditExited);

    // Code Review Fix M3: Guard canvas reference and log warning if not available
    if (this.canvas) {
      this.canvas.addEventListener('transitionend', this.boundHandleTransitionEnd);
    } else {
      console.warn('pf-tilemap-canvas: Canvas not available during transition listener setup');
    }
  }

  /**
   * Clean up hero edit transition listeners
   */
  private cleanupHeroEditTransitionListeners(): void {
    if (this.boundHandleHeroEditEntered) {
      tilemapStore.removeEventListener('hero-edit-entered', this.boundHandleHeroEditEntered);
    }
    if (this.boundHandleHeroEditExited) {
      tilemapStore.removeEventListener('hero-edit-exited', this.boundHandleHeroEditExited);
    }
    if (this.boundHandleTransitionEnd && this.canvas) {
      this.canvas.removeEventListener('transitionend', this.boundHandleTransitionEnd);
    }
  }

  /**
   * Handle hero-edit-entered event - trigger zoom-in animation
   * Story 5-2 Task 3.3-3.5
   */
  private handleHeroEditEntered = (e: CustomEvent): void => {
    const { tileId } = e.detail;

    // Use last clicked position if available, otherwise find tile position
    const tilePosition = this.lastClickedTilePosition ?? this.findTilePosition(tileId);
    if (!tilePosition) return;

    const params = this.getHeroEditZoomParams(tileId, tilePosition.x, tilePosition.y);
    this.heroEditZoomParams = params;
    this.animateZoomIn(params);
  };

  /**
   * Handle hero-edit-exited event - trigger zoom-out animation
   * Story 5-2 Task 4.2
   */
  private handleHeroEditExited = (_e: CustomEvent): void => {
    this.animateZoomOut();
  };

  /**
   * Handle transitionend event - call finishHeroEditTransition
   * Story 5-2 Task 3.7, 4.4
   */
  private handleTransitionEnd = (e: TransitionEvent): void => {
    // Only handle transform transitions
    if (e.propertyName !== 'transform') return;

    // Notify store that transition is complete
    tilemapStore.finishHeroEditTransition();
  };

  /**
   * Find a tile's position in the map layers
   * Used when position isn't cached from click event
   */
  private findTilePosition(tileId: number): { x: number; y: number } | null {
    const layers = tilemapStore.layers.value;
    const activeLayerId = tilemapStore.activeLayerId.value;
    if (!activeLayerId) return null;

    const layer = layers.find(l => l.id === activeLayerId);
    if (!layer) return null;

    // Search for tile in layer data
    for (let i = 0; i < layer.data.length; i++) {
      if (layer.data[i] === tileId) {
        const x = i % layer.width;
        const y = Math.floor(i / layer.width);
        return { x, y };
      }
    }
    return null;
  }

  /**
   * Animate zoom-in to hero edit view
   * Story 5-2 Task 3.2, 3.4-3.6
   */
  private animateZoomIn(params: HeroEditZoomParams): void {
    if (!this.canvas) return;

    // Task 5.3, 5.4: If reduced motion preferred, set transition duration to 0
    if (this.prefersReducedMotion) {
      this.canvas.style.setProperty('--hero-edit-transition-duration', '0ms');
    } else {
      this.canvas.style.setProperty('--hero-edit-transition-duration', '300ms');
    }

    // Task 3.4: Set transform origin to tile center
    this.canvas.style.transformOrigin = `${params.tileCenterX}px ${params.tileCenterY}px`;

    // Task 3.6: Use requestAnimationFrame for smooth animation start
    requestAnimationFrame(() => {
      if (!this.canvas) return;

      // Task 3.5: Apply zoom transform
      // The base transform is translate(-50%, -50%) for centering
      // We need to compose with scale and additional offset
      const baseTransform = 'translate(-50%, -50%)';
      const offsetInZoom = {
        x: params.offsetX / params.zoomLevel,
        y: params.offsetY / params.zoomLevel
      };

      this.canvas.style.transform = `${baseTransform} scale(${params.zoomLevel}) translate(${offsetInZoom.x}px, ${offsetInZoom.y}px)`;

      // Task 5.4: For reduced motion, still fire events but immediately
      // Code Review Fix M1: Use queueMicrotask for immediate async execution
      if (this.prefersReducedMotion) {
        queueMicrotask(() => {
          tilemapStore.finishHeroEditTransition();
        });
      }
    });
  }

  /**
   * Animate zoom-out from hero edit view
   * Story 5-2 Task 4.1-4.3
   */
  private animateZoomOut(): void {
    if (!this.canvas) return;

    // Task 5.3, 5.4: If reduced motion preferred, set transition duration to 0
    if (this.prefersReducedMotion) {
      this.canvas.style.setProperty('--hero-edit-transition-duration', '0ms');
    } else {
      this.canvas.style.setProperty('--hero-edit-transition-duration', '300ms');
    }

    // Task 4.2: Reset transform to default (will animate due to CSS transition)
    this.canvas.style.transform = 'translate(-50%, -50%)';

    // Task 5.4: For reduced motion, still fire events but immediately
    // Code Review Fix M1: Use queueMicrotask for immediate async execution
    if (this.prefersReducedMotion) {
      queueMicrotask(() => {
        tilemapStore.finishHeroEditTransition();
      });
    }

    // Clear stored params
    this.heroEditZoomParams = null;
    this.lastClickedTilePosition = null;
  }

  /**
   * Set up listener for reduced motion preference changes
   * Story 5-2 Task 5.2 (Code Review Fix H2)
   */
  private setupReducedMotionListener(): void {
    this.reducedMotionMediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this._prefersReducedMotion = this.reducedMotionMediaQuery.matches;

    this.boundHandleReducedMotionChange = (e: MediaQueryListEvent) => {
      this._prefersReducedMotion = e.matches;
    };

    this.reducedMotionMediaQuery.addEventListener('change', this.boundHandleReducedMotionChange);
  }

  /**
   * Clean up reduced motion listener
   * Story 5-2 Task 5.2 (Code Review Fix H2)
   */
  private cleanupReducedMotionListener(): void {
    if (this.reducedMotionMediaQuery && this.boundHandleReducedMotionChange) {
      this.reducedMotionMediaQuery.removeEventListener('change', this.boundHandleReducedMotionChange);
    }
  }

  /**
   * Check if reduced motion is preferred
   * Story 5-2 Task 5.1, 5.2
   * Uses cached value that updates via listener (Code Review Fix H2)
   */
  private get prefersReducedMotion(): boolean {
    return this._prefersReducedMotion;
  }

  protected updated(
    _changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>
  ): void {
    super.updated(_changedProperties);

    // Check if tilemap dimensions changed and resize if needed
    if (
      this.canvas &&
      (this.canvas.width !== tilemapStore.pixelWidth ||
        this.canvas.height !== tilemapStore.pixelHeight)
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
    this.canvas.width = tilemapStore.pixelWidth;
    this.canvas.height = tilemapStore.pixelHeight;

    // Display size matches logical size - viewport scales it
    this.canvas.style.width = `${tilemapStore.pixelWidth}px`;
    this.canvas.style.height = `${tilemapStore.pixelHeight}px`;

    // Host matches canvas size
    this.style.width = `${tilemapStore.pixelWidth}px`;
    this.style.height = `${tilemapStore.pixelHeight}px`;

    // Re-apply context settings after resize (context may be reset)
    if (this.ctx) {
      this.ctx.imageSmoothingEnabled = false;
    }
  }

  // Bound event handlers for cleanup
  private boundHandleMouseMove: ((e: MouseEvent) => void) | null = null;
  private boundHandleMouseDown: ((e: MouseEvent) => void) | null = null;
  private boundHandleMouseUp: ((e: MouseEvent) => void) | null = null;
  private boundHandleMouseLeave: (() => void) | null = null;
  private boundHandleContextMenu: ((e: MouseEvent) => void) | null = null;
  // Story 5-1 Task 4: Double-click handler
  private boundHandleDoubleClick: ((e: MouseEvent) => void) | null = null;

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
      this.ctx.clearRect(0, 0, tilemapStore.pixelWidth, tilemapStore.pixelHeight);

      // Render all visible layers
      this.renderLayers();

      // Render selection (both active and preview during drag)
      this.renderSelection();

      // Render paste preview if in paste mode
      this.renderPastePreview();

      // Render ghost preview if tile-brush is active
      this.renderPreview();

      // Story 5-3 Task 2.6: Render dim overlay AFTER layers, BEFORE grid
      this.renderHeroEditDimOverlay();

      // Story 5-2 Task 6: Render pixel grid in hero edit mode (when fully zoomed)
      this.renderHeroEditGrid();

      // Story 5-2 Task 7: Render highlight during zoom transition
      this.renderHeroEditHighlight();
    }
  }

  /**
   * Render all visible tile layers
   * Story 5-3 Task 3: Enhanced with live preview during hero edit
   *
   * When in hero edit mode, other instances of the editing tile
   * show live preview of changes at 60% opacity (dimmed).
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

    // Story 5-3 Task 3.2: Hero edit state for live preview
    const heroEditActive = tilemapStore.heroEditActive;
    const transitionIdle = tilemapStore.heroEditTransition.value === 'idle';
    const heroState = tilemapStore.heroEditState.value;
    const editingTileId = heroState.tileId;
    const editingCanvas = heroState.editingCanvas;
    const editingTilePos = this.heroEditZoomParams;

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
          const destX = x * tileWidth;
          const destY = y * tileHeight;

          // Story 5-3 Task 3.3-3.4: Check for live preview
          const isEditingTile = heroEditActive &&
            transitionIdle &&
            tileId === editingTileId &&
            editingCanvas;

          const isEditingPosition = editingTilePos &&
            x === editingTilePos.tileX &&
            y === editingTilePos.tileY;

          if (isEditingTile && !isEditingPosition) {
            // Task 3.3: Render editingCanvas for other instances of same tile
            // Task 3.4: Apply 60% opacity (dimmed)
            const savedAlpha = this.ctx.globalAlpha;
            this.ctx.globalAlpha *= 0.6; // Stack with layer opacity

            this.ctx.drawImage(
              editingCanvas,
              0, 0, editingCanvas.width, editingCanvas.height,
              destX, destY, tileWidth, tileHeight
            );

            this.ctx.globalAlpha = savedAlpha;
          } else {
            // Normal tile rendering
            const rect = tilesetStore.getTileRect(tilesetId, tileIndex);
            if (!rect) continue;

            this.ctx.drawImage(
              tileset.image,
              rect.x, rect.y, rect.width, rect.height,
              destX, destY, tileWidth, tileHeight
            );
          }
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
      const preview = this.tileTools['tile-brush'].getPreviewTile();
      if (!preview) return;
      this.renderTilePreview(preview.tileIndex, preview.x, preview.y);
    } else if (activeTool === 'tile-eraser') {
      const eraserPos = this.tileTools['tile-eraser'].getEraserPosition();
      if (!eraserPos) return;
      this.renderEraserPreview(eraserPos.x, eraserPos.y);
    } else if (activeTool === 'tile-fill') {
      const fillPos = this.tileTools['tile-fill'].getFillPreviewPosition();
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
    const preview = this.tileTools['tile-select'].getSelectionPreview();
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

  /**
   * Render dimmed overlay for hero edit mode
   * Story 5-3 Task 2.1-2.7
   *
   * Renders semi-transparent overlay over entire map, with clear
   * window for the tile being edited. Surrounding tiles are dimmed
   * at 60% opacity (40% dim overlay) per UX-9 specification.
   */
  private renderHeroEditDimOverlay(): void {
    // Task 2.2: Only render when fully in hero edit mode
    if (!tilemapStore.heroEditActive) return;
    if (tilemapStore.heroEditTransition.value !== 'idle') return;
    if (!this.heroEditZoomParams) return;

    const tileWidth = tilemapStore.tileWidth.value;
    const tileHeight = tilemapStore.tileHeight.value;
    const { tileX, tileY } = this.heroEditZoomParams;

    // Calculate editing tile bounds
    const editTileX = tileX * tileWidth;
    const editTileY = tileY * tileHeight;

    // Task 2.3: Draw dimmed overlay using --pf-color-hero-edit-dim token
    // Use CSS custom property or fallback
    const dimColor = getComputedStyle(this).getPropertyValue('--pf-color-hero-edit-dim').trim()
      || 'rgba(0, 0, 0, 0.4)';

    // Save context state
    this.ctx.save();

    // Task 2.5: Use clip path to exclude editing tile
    this.ctx.beginPath();
    // Full canvas rect
    this.ctx.rect(0, 0, tilemapStore.pixelWidth, tilemapStore.pixelHeight);
    // Cut out editing tile (reverse winding for hole)
    this.ctx.rect(editTileX + tileWidth, editTileY, -tileWidth, tileHeight);
    this.ctx.clip('evenodd');

    // Task 2.3: Fill with dim color
    this.ctx.fillStyle = dimColor;
    this.ctx.fillRect(0, 0, tilemapStore.pixelWidth, tilemapStore.pixelHeight);

    // Restore context state
    this.ctx.restore();
  }

  /**
   * Render pixel grid overlay in hero edit mode
   * Story 5-2 Task 6.1-6.5
   *
   * Shows a 1-pixel grid when fully zoomed into hero edit mode.
   * Only renders when heroEditActive is true AND transition is 'idle'.
   */
  private renderHeroEditGrid(): void {
    // Task 6.5: Only render when fully zoomed in (not during transition)
    if (!tilemapStore.heroEditActive) return;
    if (tilemapStore.heroEditTransition.value !== 'idle') return;
    if (!this.heroEditZoomParams) return;

    const state = tilemapStore.heroEditState.value;
    if (!state.editingCanvas) return;

    const tileWidth = tilemapStore.tileWidth.value;
    const tileHeight = tilemapStore.tileHeight.value;
    const { tileX, tileY } = this.heroEditZoomParams;

    // Calculate tile position in canvas coordinates
    const tilePixelX = tileX * tileWidth;
    const tilePixelY = tileY * tileHeight;

    // Task 6.3: Use --tile-grid-color token (fallback to semi-transparent white)
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    this.ctx.lineWidth = 1;

    // Task 6.4: Draw 1px grid lines within the tile
    // Vertical lines
    for (let x = 1; x < tileWidth; x++) {
      this.ctx.beginPath();
      this.ctx.moveTo(tilePixelX + x + 0.5, tilePixelY);
      this.ctx.lineTo(tilePixelX + x + 0.5, tilePixelY + tileHeight);
      this.ctx.stroke();
    }

    // Horizontal lines
    for (let y = 1; y < tileHeight; y++) {
      this.ctx.beginPath();
      this.ctx.moveTo(tilePixelX, tilePixelY + y + 0.5);
      this.ctx.lineTo(tilePixelX + tileWidth, tilePixelY + y + 0.5);
      this.ctx.stroke();
    }
  }

  /**
   * Render highlight effect during hero edit zoom transition
   * Story 5-2 Task 7.1-7.3
   *
   * Shows a subtle glow around the target tile during zoom animation.
   * Fades out as zoom completes.
   */
  private renderHeroEditHighlight(): void {
    // Task 7.1: Only render during zoom transition
    const transitionState = tilemapStore.heroEditTransition.value;
    if (transitionState === 'idle') return;
    if (!this.heroEditZoomParams) return;

    const tileWidth = tilemapStore.tileWidth.value;
    const tileHeight = tilemapStore.tileHeight.value;
    const { tileX, tileY } = this.heroEditZoomParams;

    // Calculate tile position in canvas coordinates
    const tilePixelX = tileX * tileWidth;
    const tilePixelY = tileY * tileHeight;

    // Task 7.2: Use --pf-color-accent for highlight with 30% opacity
    this.ctx.fillStyle = 'rgba(0, 150, 255, 0.3)';
    this.ctx.fillRect(tilePixelX, tilePixelY, tileWidth, tileHeight);

    // Draw accent border
    this.ctx.strokeStyle = 'rgba(0, 150, 255, 0.6)';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(tilePixelX + 1, tilePixelY + 1, tileWidth - 2, tileHeight - 2);
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
    // Story 5-1: Re-render when hero edit state changes
    void tilemapStore.heroEditState.value;
    // Story 5-2: Re-render when hero edit transition changes
    void tilemapStore.heroEditTransition.value;

    // Story 5-3 Task 5.2, 5.5: Show indicator only when hero edit active and transition idle
    const showHeroEditIndicator = tilemapStore.heroEditActive &&
      tilemapStore.heroEditTransition.value === 'idle';

    return html`
      <canvas></canvas>
      ${showHeroEditIndicator ? html`<pf-hero-edit-indicator></pf-hero-edit-indicator>` : ''}
      ${this.contextMenuVisible ? html`
        <div
          class="context-menu"
          role="menu"
          aria-label="Tile context menu"
          style="left: ${this.contextMenuPosition.x}px; top: ${this.contextMenuPosition.y}px;"
        >
          ${this.contextMenuTileId && this.contextMenuTileId > 0 ? html`
            <div
              class="context-menu-item"
              role="menuitem"
              tabindex="0"
              @click=${this.handleEditTileClick}
              @keydown=${(e: KeyboardEvent) => this.handleMenuItemKeydown(e, () => this.handleEditTileClick())}
            >
              Edit Tile
            </div>
            <div class="context-menu-divider" role="separator"></div>
          ` : ''}
          <div
            class="context-menu-item"
            role="menuitem"
            tabindex="0"
            @click=${this.closeContextMenu}
            @keydown=${(e: KeyboardEvent) => this.handleMenuItemKeydown(e, () => this.closeContextMenu())}
          >
            Cancel
          </div>
        </div>
      ` : ''}
    `;
  }
}
