/**
 * Selection Store - Main Entry Point
 *
 * Re-exports the selection store and related types for backward compatibility.
 */

import { defaultProjectContext } from '../project-context';

// Main store
export { createSelectionStore } from './store';

export const selectionStore = defaultProjectContext.selection;

// Types

// Bounds utilities

// Hit testing utilities
