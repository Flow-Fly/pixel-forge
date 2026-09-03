/**
 * Transport-neutral contracts shared by project-targeted editor commands.
 *
 * These records are safe to clone across an adapter boundary. They do not
 * contain stores, command instances, DOM nodes, or other live editor values.
 */

export interface ProjectTarget {
  readonly projectId: string;
}

/**
 * Bounded identity carried by an automation transaction and its history
 * observation. Creative command arguments never cross this boundary.
 */
export interface AutomationTransactionProvenance {
  readonly source: 'automation';
  readonly transactionId: string;
  readonly clientId: string;
  readonly sessionId: string;
  readonly runId: string;
  readonly operationId: string;
  readonly target: ProjectTarget;
  readonly fromRevision: number;
  readonly toRevision: number;
  readonly children: readonly AutomationTransactionChildSummary[];
}

export interface AutomationTransactionChildSummary {
  readonly commandId: 'project.layer.state' | 'project.animation.frame-tag';
  readonly operation: string;
  readonly domains: readonly string[];
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
  | 'capability_denied'
  | 'project_not_found'
  | 'target_not_found'
  | 'revision_conflict'
  | 'invalid_state'
  | 'bounds_exceeded'
  | 'limit_exceeded'
  | 'cancelled'
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
