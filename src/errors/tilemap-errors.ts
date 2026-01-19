/**
 * Tilemap Error Classes
 *
 * Custom error types for tilemap-related operations.
 * Pattern: Throw typed errors, never silently fail.
 */

/**
 * Base error class for tilemap operations
 */
export class TilemapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TilemapError';
  }
}

/**
 * Error thrown when tileset data is invalid or malformed
 */
export class InvalidTilesetError extends TilemapError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTilesetError';
  }
}

/**
 * Error thrown when tile coordinates are outside map bounds
 * Includes coordinate and bounds information for debugging
 */
export class TileOutOfBoundsError extends TilemapError {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;

  constructor(x: number, y: number, width: number, height: number);
  constructor(message: string);
  constructor(xOrMessage: number | string, y?: number, width?: number, height?: number) {
    if (typeof xOrMessage === 'string') {
      super(xOrMessage);
      this.x = 0;
      this.y = 0;
      this.width = 0;
      this.height = 0;
    } else {
      const x = xOrMessage;
      super(`Tile position (${x}, ${y}) is outside map bounds (0-${width! - 1}, 0-${height! - 1})`);
      this.x = x;
      this.y = y!;
      this.width = width!;
      this.height = height!;
    }
    this.name = 'TileOutOfBoundsError';
  }
}

/**
 * Error thrown when operating on a non-existent layer
 */
export class InvalidLayerError extends TilemapError {
  readonly layerId: string;

  constructor(layerId: string) {
    super(`Layer '${layerId}' does not exist`);
    this.layerId = layerId;
    this.name = 'InvalidLayerError';
  }
}

/**
 * Error thrown when attempting to modify a locked layer
 */
export class LockedLayerError extends TilemapError {
  readonly layerId: string;

  constructor(layerId: string) {
    super(`Cannot modify locked layer '${layerId}'`);
    this.layerId = layerId;
    this.name = 'LockedLayerError';
  }
}

/**
 * Error thrown when an invalid tile ID is provided
 */
export class InvalidTileIdError extends TilemapError {
  readonly tileId: number;

  constructor(tileId: number) {
    super(`Invalid tile ID '${tileId}': must be a non-negative integer`);
    this.tileId = tileId;
    this.name = 'InvalidTileIdError';
  }
}
