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
 * Error thrown when tile index is out of bounds
 */
export class TileOutOfBoundsError extends TilemapError {
  constructor(message: string) {
    super(message);
    this.name = 'TileOutOfBoundsError';
  }
}
