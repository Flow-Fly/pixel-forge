/**
 * Transport-neutral contracts shared by project-targeted editor commands.
 *
 * These records are safe to clone across an adapter boundary. They do not
 * contain stores, command instances, DOM nodes, or other live editor values.
 */

export interface ProjectTarget {
  readonly projectId: string;
}

/** Stable categories exposed by the local project save boundary. */
export type ProjectSaveFailureCategory =
  | 'storage_unavailable'
  | 'quota_exceeded'
  | 'serialization_failed'
  | 'write_failed'
  | 'internal';

export type ProjectSaveSafetyStatus = 'dirty' | 'saving' | 'saved' | 'failed';

export interface ProjectSaveSafetyFailure {
  readonly category: ProjectSaveFailureCategory;
  readonly action: 'retry_latest';
}

/**
 * Transport-neutral observation of the durability of one project revision.
 * It intentionally contains no project bytes, names, or raw errors.
 */
export interface ProjectSaveSafetyState {
  readonly type: 'project.save-safety';
  readonly target: ProjectTarget;
  readonly currentRevision: number;
  readonly persistedRevision: number;
  readonly status: ProjectSaveSafetyStatus;
  readonly failure?: ProjectSaveSafetyFailure;
}

export type ProjectSaveSafetyObservation = ProjectSaveSafetyState;

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
