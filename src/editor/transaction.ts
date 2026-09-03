import type { Command } from '../stores/history-store';
import type {
  ProjectChangeDomain,
  ProjectChangeEvent,
} from '../stores/project-store';
import type { ProjectContext } from '../stores/project-context';
import {
  assertPreparedTimelineProjectStateChange,
  applyPreparedTimelineProjectStateChange,
  prepareTimelineProjectStateChange,
  type PreparedTimelineProjectStateChange,
} from './timeline-project-state';
import {
  isRecord,
  type AutomationTransactionChildSummary,
  type AutomationTransactionProvenance,
  type EditorError,
  type ProjectTarget,
} from './contracts';
import {
  FRAME_TAG_COMMAND_ID,
  LAYER_STATE_COMMAND_ID,
  TRANSACTION_COMMAND_ID,
} from './catalog';

export const EDITOR_TRANSACTION_OPERATION_ID = TRANSACTION_COMMAND_ID;
const EDITOR_TRANSACTION_MAX_CHILDREN = 2;

export type EditorTransactionChildCommandId =
  | typeof LAYER_STATE_COMMAND_ID
  | typeof FRAME_TAG_COMMAND_ID;

export interface AutomationTransactionProvenanceInput {
  readonly clientId: string;
  readonly sessionId: string;
  readonly runId: string;
  readonly operationId: string;
}

export interface EditorTransactionChildInput {
  readonly command: EditorTransactionChildCommandId;
  readonly input: Readonly<Record<string, unknown>>;
}

// fallow-ignore-next-line unused-type -- Public prepared request shape documents the transaction boundary.
export interface EditorTransactionRequest {
  readonly target: ProjectTarget;
  readonly expectedRevision: number;
  readonly provenance: AutomationTransactionProvenanceInput;
  readonly children: readonly EditorTransactionChildInput[];
}

export interface EditorTransactionResult {
  readonly type: typeof EDITOR_TRANSACTION_OPERATION_ID;
  readonly target: ProjectTarget;
  readonly fromRevision: number;
  readonly revision: number;
  readonly event: ProjectChangeEvent;
  readonly provenance: AutomationTransactionProvenance;
}

type PreparedTransactionChild = {
  readonly command: EditorTransactionChildCommandId;
  readonly prepared: PreparedTimelineProjectStateChange;
};

type TransactionErrorDetails = Readonly<Record<string, string | number>>;

const TRANSACTION_DOMAINS: readonly ProjectChangeDomain[] = Object.freeze([
  'layer-state',
  'timeline',
]);

const TRANSACTION_CHILD_COMMANDS: ReadonlySet<string> = new Set([
  LAYER_STATE_COMMAND_ID,
  FRAME_TAG_COMMAND_ID,
]);

class EditorTransactionError extends Error {
  readonly editorError: EditorError;

  constructor(editorError: EditorError) {
    super(editorError.code);
    this.name = 'EditorTransactionError';
    this.editorError = editorError;
  }
}

class EditorTransactionCommand implements Command {
  readonly id: string;
  readonly name = 'Automation Transaction';
  readonly managesProjectRevision = true;
  readonly memorySize = 0;
  readonly provenance: AutomationTransactionProvenance;

  private readonly context: ProjectContext;
  private readonly request: EditorTransactionRequest;
  private readonly children: readonly PreparedTransactionChild[];
  private hasExecuted = false;
  private applied = false;
  private lastEvent: ProjectChangeEvent | null = null;

  constructor(
    context: ProjectContext,
    request: EditorTransactionRequest,
    children: readonly PreparedTransactionChild[],
  ) {
    this.context = context;
    this.request = request;
    this.children = children;
    this.id = crypto.randomUUID();
    this.provenance = freezeProvenance(request, this.id, children);
  }

  get event(): ProjectChangeEvent | null {
    return this.lastEvent;
  }

  execute(): void {
    if (this.applied) {
      throw transactionError('invalid_state', false, { reason: 'already_applied' });
    }

    this.assertTarget();
    this.assertRevisionOnFirstExecution();
    this.assertPreparedState('before', this.hasExecuted);

    try {
      this.applyChildren('after');
      this.lastEvent = this.context.project.commitChange(this.id, TRANSACTION_DOMAINS);
    } catch (error) {
      this.restoreAfterFailure('before', error);
    }

    this.hasExecuted = true;
    this.applied = true;
  }

  undo(): void {
    if (!this.applied) {
      throw transactionError('invalid_state', false, { reason: 'not_applied' });
    }

    this.assertTarget();
    this.assertPreparedState('after', true);

    try {
      this.applyChildren('before');
      this.lastEvent = this.context.project.commitChange(this.id, TRANSACTION_DOMAINS);
    } catch (error) {
      this.restoreAfterFailure('after', error);
    }

    this.applied = false;
  }

  private assertTarget(): void {
    if (this.context.isDisposed || this.context.project.id.value !== this.request.target.projectId) {
      throw transactionError('target_not_found', true);
    }
  }

  private assertRevisionOnFirstExecution(): void {
    if (this.hasExecuted) return;
    if (this.context.project.revision.value !== this.request.expectedRevision) {
      throw transactionError('revision_conflict', true, {
        expectedRevision: this.request.expectedRevision,
        currentRevision: this.context.project.revision.value,
      });
    }
  }

  private assertPreparedState(phase: 'before' | 'after', replayed: boolean): void {
    for (const child of this.children) {
      assertPreparedTimelineProjectStateChange(
        this.context,
        child.prepared,
        phase,
        replayed,
      );
    }
  }

  private applyChildren(phase: 'before' | 'after'): void {
    for (const child of this.children) {
      applyPreparedTimelineProjectStateChange(this.context, child.prepared, phase);
    }
  }

  private restoreAfterFailure(phase: 'before' | 'after', originalError: unknown): never {
    let restored = true;
    try {
      for (const child of [...this.children].reverse()) {
        applyPreparedTimelineProjectStateChange(this.context, child.prepared, phase);
      }
      this.assertPreparedState(phase, phase === 'after');
    } catch {
      restored = false;
    }

    if (!restored) {
      throw transactionError('internal', false, { reason: 'rollback_failed' });
    }
    throw asTransactionError(originalError, 'execution');
  }
}

/** Read the explicit target before resolving a context for an adapter request. */
export function readEditorTransactionTarget(input: unknown): ProjectTarget {
  if (!isRecord(input)) {
    throw transactionError('invalid_request', false, { reason: 'request' });
  }
  return normalizeTarget(input.target);
}

/**
 * Prepare both bounded children before creating one history command. The
 * timeline seam performs all child validation and captures both snapshots
 * without mutating the project.
 */
export async function executeEditorTransaction(
  context: ProjectContext,
  input: unknown,
): Promise<EditorTransactionResult> {
  const request = normalizeTransactionRequest(input);
  const children = request.children.map((child) => ({
    command: child.command,
    prepared: prepareTimelineProjectStateChange(context, {
      ...child.input,
      target: request.target,
      expectedRevision: request.expectedRevision,
    }),
  }));
  const command = new EditorTransactionCommand(context, request, children);
  await context.history.execute(command);

  if (!command.event) {
    throw transactionError('internal', true, { reason: 'missing_change_event' });
  }

  return {
    type: EDITOR_TRANSACTION_OPERATION_ID,
    target: { projectId: request.target.projectId },
    fromRevision: request.expectedRevision,
    revision: command.event.toRevision,
    event: command.event,
    provenance: command.provenance,
  };
}

function normalizeTransactionRequest(input: unknown): EditorTransactionRequest {
  if (!isRecord(input)) {
    throw transactionError('invalid_request', false, { reason: 'request' });
  }

  const target = normalizeTarget(input.target);
  const expectedRevision = normalizeRevision(input.expectedRevision ?? input.revision);
  const provenance = normalizeProvenance(input.provenance);
  const children = normalizeChildren(input.children);

  return { target, expectedRevision, provenance, children };
}

function normalizeChildren(value: unknown): EditorTransactionChildInput[] {
  if (!Array.isArray(value)) {
    throw transactionError('invalid_request', false, { reason: 'children' });
  }
  if (value.length > EDITOR_TRANSACTION_MAX_CHILDREN) {
    throw transactionError('limit_exceeded', false, {
      reason: 'transaction_children',
      max: EDITOR_TRANSACTION_MAX_CHILDREN,
    });
  }
  if (value.length !== EDITOR_TRANSACTION_MAX_CHILDREN) {
    throw transactionError('invalid_request', false, { reason: 'children_count' });
  }

  const children = value.map(normalizeChild);
  const commands = new Set(children.map((child) => child.command));
  if (commands.size !== EDITOR_TRANSACTION_MAX_CHILDREN) {
    throw transactionError('invalid_request', false, { reason: 'child_family' });
  }
  if (!commands.has(LAYER_STATE_COMMAND_ID) || !commands.has(FRAME_TAG_COMMAND_ID)) {
    throw transactionError('invalid_request', false, { reason: 'child_family' });
  }
  return children;
}

function normalizeChild(value: unknown): EditorTransactionChildInput {
  if (!isRecord(value)) {
    throw transactionError('invalid_request', false, { reason: 'child' });
  }

  const command = normalizeChildCommand(readChildCommand(value));
  const input = normalizeChildPayload(value);
  assertChildFamily(command, input);

  return { command, input };
}

function readChildCommand(value: Record<string, unknown>): unknown {
  return value.command ?? value.commandId ?? value.family ?? value.operation ?? value.type ?? value.id;
}

function normalizeChildPayload(value: Record<string, unknown>): Record<string, unknown> {
  if (value.input !== undefined && value.request !== undefined) {
    throw transactionError('invalid_request', false, { reason: 'child_input' });
  }
  const nestedInput = value.input ?? value.request;
  return nestedInput === undefined
    ? copyInlineChildInput(value)
    : copyNestedChildInput(nestedInput);
}

function assertChildFamily(
  command: EditorTransactionChildCommandId,
  input: Record<string, unknown>,
): void {
  if (typeof input.kind !== 'string') {
    throw transactionError('invalid_request', false, { reason: 'child_kind' });
  }
  const prefix = command === LAYER_STATE_COMMAND_ID ? 'layer.' : 'tag.';
  if (!input.kind.startsWith(prefix)) {
    throw transactionError('invalid_request', false, { reason: 'child_family' });
  }
}

function normalizeChildCommand(value: unknown): EditorTransactionChildCommandId {
  if (typeof value !== 'string' || !TRANSACTION_CHILD_COMMANDS.has(value)) {
    throw transactionError('unsupported', false, { reason: 'child_command' });
  }
  return value as EditorTransactionChildCommandId;
}

function copyInlineChildInput(value: Record<string, unknown>): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const [key, childValue] of Object.entries(value)) {
    if (isChildDescriptorKey(key)) continue;
    if (isInheritedRevisionKey(key)) {
      throw transactionError('invalid_request', false, { reason: 'child_revision' });
    }
    input[key] = childValue;
  }
  return input;
}

function isChildDescriptorKey(key: string): boolean {
  return key === 'command' || key === 'commandId' || key === 'family' ||
    key === 'operation' || key === 'type' || key === 'id' || key === 'request';
}

function isInheritedRevisionKey(key: string): boolean {
  return key === 'target' || key === 'expectedRevision' || key === 'revision';
}

function copyNestedChildInput(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw transactionError('invalid_request', false, { reason: 'child_input' });
  }
  if ('target' in value || 'expectedRevision' in value || 'revision' in value) {
    throw transactionError('invalid_request', false, { reason: 'child_revision' });
  }
  return { ...value };
}

function normalizeProvenance(value: unknown): AutomationTransactionProvenanceInput {
  if (!isRecord(value)) {
    throw transactionError('invalid_request', false, { reason: 'provenance' });
  }
  return {
    clientId: normalizeBoundedString(value.clientId, 'client_id'),
    sessionId: normalizeBoundedString(value.sessionId, 'session_id'),
    runId: normalizeBoundedString(value.runId, 'run_id'),
    operationId: normalizeBoundedString(value.operationId, 'operation_id'),
  };
}

function normalizeTarget(value: unknown): ProjectTarget {
  if (!isRecord(value)) {
    throw transactionError('invalid_request', false, { reason: 'target' });
  }
  return { projectId: normalizeBoundedString(value.projectId, 'target') };
}

function normalizeRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw transactionError('invalid_request', false, { reason: 'expected_revision' });
  }
  return value as number;
}

function normalizeBoundedString(value: unknown, reason: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) {
    throw transactionError('invalid_request', false, { reason });
  }
  return value;
}

function freezeProvenance(
  request: EditorTransactionRequest,
  transactionId: string,
  children: readonly PreparedTransactionChild[],
): AutomationTransactionProvenance {
  const summaries = children.map((child): AutomationTransactionChildSummary => Object.freeze({
    commandId: child.command,
    operation: child.prepared.request.kind,
    domains: Object.freeze([...child.prepared.domains]),
  }));
  return Object.freeze({
    source: 'automation',
    transactionId,
    clientId: request.provenance.clientId,
    sessionId: request.provenance.sessionId,
    runId: request.provenance.runId,
    operationId: request.provenance.operationId,
    target: Object.freeze({ projectId: request.target.projectId }),
    fromRevision: request.expectedRevision,
    toRevision: request.expectedRevision + 1,
    children: Object.freeze(summaries),
  });
}

function restoreError(error: unknown): EditorTransactionError | null {
  if (error instanceof EditorTransactionError) return error;
  if (isRecord(error) && isRecord(error.editorError)) {
    return new EditorTransactionError(normalizeEditorError(error.editorError));
  }
  return null;
}

function asTransactionError(error: unknown, reason: string): EditorTransactionError {
  return restoreError(error) ?? transactionError('internal', true, { reason });
}

function normalizeEditorError(value: Record<string, unknown>): EditorError {
  const safeCodes: ReadonlySet<string> = new Set([
    'invalid_request',
    'capability_denied',
    'project_not_found',
    'target_not_found',
    'revision_conflict',
    'invalid_state',
    'bounds_exceeded',
    'limit_exceeded',
    'cancelled',
    'unsupported',
    'internal',
  ]);
  const code = safeCodes.has(value.code as string)
    ? value.code as EditorError['code']
    : 'internal';
  return {
    code,
    retryable: value.retryable === true,
    ...(isRecord(value.details)
      ? { details: sanitizeErrorDetails(value.details) }
      : {}),
  };
}

function sanitizeErrorDetails(
  details: Record<string, unknown>,
): TransactionErrorDetails {
  const safe: Record<string, string | number> = {};
  for (const key of ['reason', 'resource', 'feature', 'expectedRevision', 'currentRevision', 'max']) {
    const value = details[key];
    if (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) {
      safe[key] = value;
    }
  }
  return safe;
}

function transactionError(
  code: EditorError['code'],
  retryable: boolean,
  details?: TransactionErrorDetails,
): EditorTransactionError {
  return new EditorTransactionError({
    code,
    retryable,
    ...(details ? { details } : {}),
  });
}
