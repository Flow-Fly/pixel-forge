export * from '../stores/history';

import type { Command } from '../stores/history';
import type { Rect } from '../types/geometry';

/**
 * Interface for commands that have drawable pixel data.
 * Used by history preview and selective undo features.
 */
export interface DrawableCommand extends Command {
  drawBounds: Rect;
  drawPreviousData: Uint8ClampedArray;
  drawNewData: Uint8ClampedArray;
  drawLayerId: string;
}

/**
 * Type guard to check if a command has drawable pixel data.
 */
export function isDrawableCommand(cmd: Command): cmd is DrawableCommand {
  return 'drawBounds' in cmd && 'drawPreviousData' in cmd && 'drawNewData' in cmd && 'drawLayerId' in cmd;
}
