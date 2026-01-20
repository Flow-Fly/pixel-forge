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
