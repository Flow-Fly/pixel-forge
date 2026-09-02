/**
 * Transform handlers for the canvas viewport.
 *
 * Handles rotation start/end, resize start/end, and transform commit operations.
 */

import { getActiveProjectContext, type ProjectContext } from '../../../stores/project-context';
import {
  beginSelectionTransform,
  cancelSelectionTransform,
  commitSelectionTransform,
} from '../../../services/selection-transform-commit';

type TransformContext = ProjectContext;

/**
 * Transition selection to transforming state if needed.
 * Called when starting rotation or resize operations.
 */
function ensureTransformState(context: TransformContext): void {
  void beginSelectionTransform(context);
}

/**
 * Handle rotation start event from transform handles.
 */
export function handleRotationStart(context: TransformContext = getActiveProjectContext()): void {
  ensureTransformState(context);
}

/**
 * Handle resize start event from transform handles.
 */
export function handleResizeStart(context: TransformContext = getActiveProjectContext()): void {
  ensureTransformState(context);
}

/**
 * Handle rotation end event from transform handles.
 */
export function handleRotationEnd(): void {
  // Rotation drag ended - the transform will be committed when user
  // clicks outside or presses Enter
}

/**
 * Commit the current transform (scale and/or rotation) to the canvas.
 * Called when user presses Enter or clicks Apply.
 */
export function commitTransform(context: TransformContext = getActiveProjectContext()): void {
  void commitSelectionTransform(context);
}

/** Cancel a preview without creating a history transition. */
export function cancelTransform(context: TransformContext = getActiveProjectContext()): void {
  cancelSelectionTransform(context);
}
