/**
 * Animation Store - Main entry point
 *
 * Re-exports the animation store and related types for backward compatibility.
 */

import { defaultProjectContext } from '../project-context';

// Main store
export const animationStore = defaultProjectContext.animation;

// Types
export { EMPTY_CEL_LINK_ID } from './types';
