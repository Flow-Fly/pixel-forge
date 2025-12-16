/**
 * Selection Store - Main Entry Point
 *
 * Re-exports the selection store and related types for backward compatibility.
 */

// Main store
export { selectionStore } from './store';

// Types
export type { SelectionMode } from './types';
export type { SelectionState, SelectionShape, Rect } from './types';

// Bounds utilities
export { trimBoundsToContent, trimFreeformToContent } from './bounds-utils';

// Hit testing utilities
export { isPointInBounds, isPointInRotatedBounds } from './hit-testing';

// Module re-exports for direct access
export * as boundsUtils from './bounds-utils';
export * as hitTesting from './hit-testing';
