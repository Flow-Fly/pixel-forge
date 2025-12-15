/**
 * Animation Store - Main entry point
 *
 * Re-exports the animation store and related types for backward compatibility.
 */

// Main store
export { animationStore } from './store';

// Types
export type { PlaybackMode } from './types';
export { EMPTY_CEL_LINK_ID, getCelKey, parseCelKey } from './types';
export type { Frame, Cel, OnionSkinSettings, FrameTag } from './types';

// Individual modules (for direct access if needed)
export * as indexBuffer from './index-buffer';
export * as paletteSync from './palette-sync';
export * as playback from './playback';
export * as celSelection from './cel-selection';
export * as celLinking from './cel-linking';
export * as tagManager from './tag-manager';
export * as textCels from './text-cels';
