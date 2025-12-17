/**
 * Selection store types and re-exports.
 */

// Re-export types from the types directory
export type { SelectionState, SelectionShape } from '../../types/selection';
export type { Rect } from '../../types/geometry';

/**
 * Selection mode determines how new selections combine with existing ones.
 * - replace: New selection replaces existing
 * - add: New selection is added to existing (Shift+drag)
 * - subtract: New selection is subtracted from existing (Alt+drag)
 * - intersect: Keep only pixels in both selections (Shift+Alt+drag)
 */
export type SelectionMode = 'replace' | 'add' | 'subtract' | 'intersect';
