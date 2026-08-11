/**
 * Transport-neutral contracts shared by project-targeted editor commands.
 *
 * These records are safe to clone across an adapter boundary. They do not
 * contain stores, command instances, DOM nodes, or other live editor values.
 */

export interface ProjectTarget {
  readonly projectId: string;
}

export type EditorErrorCode =
  | 'invalid_request'
  | 'target_not_found'
  | 'revision_conflict'
  | 'invalid_state'
  | 'limit_exceeded'
  | 'unsupported'
  | 'internal';

export interface EditorError {
  readonly code: EditorErrorCode;
  readonly retryable: boolean;
  readonly details?: Readonly<Record<string, string | number>>;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
