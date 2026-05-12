/**
 * Tilemap Type Definitions
 *
 * These types define the data structures for tilemap functionality.
 *
 * Key conventions:
 * - Tile IDs are 0-based internally for array indexing
 * - 0 = empty tile (no tile placed)
 * - Tile indices start at 1 in storage (1+ = valid tile)
 * - Convert to 1-based GIDs on TMX export
 * - Coordinates use (x, y) with y-down, (0,0) = top-left
 */

/**
 * Tileset - A collection of tiles from a single image
 */
export interface Tileset {
  /** Unique identifier for the tileset */
  id: string;
  /** Display name for the tileset */
  name: string;
  /** The source image as an ImageBitmap for efficient rendering */
  image: ImageBitmap;
  /** Original import path for the tileset image */
  imagePath: string;
  /** Width of each tile in pixels */
  tileWidth: number;
  /** Height of each tile in pixels */
  tileHeight: number;
  /** Number of tile columns in the tileset image */
  columns: number;
  /** Number of tile rows in the tileset image */
  rows: number;
  /** Total number of tiles in the tileset */
  tileCount: number;
  /** Pixels between tiles (default 0) */
  spacing: number;
  /** Offset from image edge in pixels (default 0) */
  margin: number;
}

/**
 * TileLayer - A single layer of tiles in a tilemap
 */
export interface TileLayer {
  /** Unique identifier for the layer */
  id: string;
  /** Display name for the layer */
  name: string;
  /** Width of the layer in tiles */
  width: number;
  /** Height of the layer in tiles */
  height: number;
  /**
   * Tile data stored as Uint32Array for memory efficiency
   * - 0 = empty tile (no tile placed)
   * - 1+ = tile index (1-based in storage, maps to 0-based tileset index)
   * - Array index = y * width + x
   */
  data: Uint32Array;
  /** Whether the layer is visible */
  visible: boolean;
  /** Layer opacity (0-1) */
  opacity: number;
  /** Whether the layer is locked from editing */
  locked: boolean;
}

/**
 * LoadStatus - Status of async loading operations
 */
export type LoadStatus = 'idle' | 'loading' | 'error' | 'success';

/**
 * TileSelection - A rectangular selection of tiles
 * Story 3-5 Task 1.8
 */
export interface TileSelection {
  /** Left tile coordinate (0-based) */
  x: number;
  /** Top tile coordinate (0-based) */
  y: number;
  /** Width in tiles */
  width: number;
  /** Height in tiles */
  height: number;
}

/**
 * TileClipboard - Copied tile data for paste operations
 * Story 3-5 Task 1.8
 */
export interface TileClipboard {
  /** Width in tiles */
  width: number;
  /** Height in tiles */
  height: number;
  /** Tile IDs in row-major order (index = y * width + x) */
  data: Uint32Array;
}

/**
 * HeroEditTransitionState - State for hero edit zoom animation
 * Story 5-2 Task 1.1
 *
 * Tracks the transition state during hero edit zoom animations.
 */
export type HeroEditTransitionState = 'idle' | 'zooming-in' | 'zooming-out';

/**
 * HeroEditZoomParams - Parameters for hero edit zoom animation
 * Story 5-2 Task 2.2
 *
 * Stores calculated zoom parameters for animating into/out of hero edit mode.
 */
export interface HeroEditZoomParams {
  /** Zoom level needed to display tile at comfortable editing size */
  zoomLevel: number;
  /** X offset to center tile in viewport */
  offsetX: number;
  /** Y offset to center tile in viewport */
  offsetY: number;
  /** Tile center X coordinate in canvas space */
  tileCenterX: number;
  /** Tile center Y coordinate in canvas space */
  tileCenterY: number;
  /** Tile X coordinate in tile grid */
  tileX: number;
  /** Tile Y coordinate in tile grid */
  tileY: number;
}

/**
 * HeroEditSession - Tracks all tiles edited during a hero edit session
 * Story 5-5 Task 2.4
 *
 * During adjacent tile navigation, users can edit multiple tiles in one session.
 * This interface tracks all edits for bulk commit on exit.
 */
export interface HeroEditSession {
  /** Map of tileId -> before ImageData (for undo support) */
  editedTilesBefore: Map<number, ImageData>;
  /** Map of tileId -> after ImageData (current state) */
  editedTilesAfter: Map<number, ImageData>;
  /** The first tile edited in this session */
  startTileId: number;
  /** Tile position where the session started (for navigation tracking) */
  startPosition: { x: number; y: number };
}

/**
 * NavigationDirection - Direction for adjacent tile navigation
 * Story 5-5 Task 3.1
 */
export type NavigationDirection = 'up' | 'down' | 'left' | 'right' | null;

/**
 * HeroEditState - State for in-place tile editing
 * Story 5-1 Task 1.1
 *
 * Hero Edit is a nested context within Map mode where users can
 * edit a tile's pixels directly in the context of their tilemap.
 */
export interface HeroEditState {
  /** Whether hero edit mode is currently active */
  active: boolean;
  /** ID of the tile being edited (1-based storage ID, null if not editing) */
  tileId: number | null;
  /** ID of the tileset containing the tile (null if not editing) */
  tilesetId: string | null;
  /** Working copy of the tile for editing (null if not editing) */
  editingCanvas: OffscreenCanvas | null;
  /** Original tile data for undo support (null if not editing) */
  originalData: ImageData | null;
  /** Story 5-4 Task 7.3: Previous map tool to restore on exit (null if not set) */
  previousMapTool: string | null;
  /** Story 5-5 Task 2.4: Session tracking for multi-tile edits */
  session: HeroEditSession | null;
  /** Story 5-5: Current position in tile grid during hero edit */
  currentPosition: { x: number; y: number } | null;
}
