import type { Command } from '../stores/history-store';
import type {
  PreparedProjectChange,
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
  assertPreparedStaticStructureChange,
  applyPreparedStaticStructureChange,
  prepareStaticStructureChange,
  type PreparedStaticStructureChange,
  type StaticStructureChildInput,
} from './static-structure';
import {
  hasOnlyKeys,
  isRecord,
  type AutomationTransactionChildSummary,
  type AutomationTransactionProvenance,
  type AutomationTransactionRevisionTransition,
  type AutomationTransactionTransitionPhase,
  type EditorError,
  type ProjectTarget,
} from './contracts';
import {
  FRAME_TAG_COMMAND_ID,
  LAYER_STATE_COMMAND_ID,
  STATIC_LAYER_TREE_COMMAND_ID,
  STATIC_PALETTE_COMMAND_ID,
  TRANSACTION_PROVENANCE_MAX_STRING_LENGTH,
  TRANSACTION_PROVENANCE_MAX_TRANSITIONS,
  TRANSACTION_COMMAND_ID,
} from './catalog';

export const EDITOR_TRANSACTION_OPERATION_ID = TRANSACTION_COMMAND_ID;
const EDITOR_TRANSACTION_MAX_CHILDREN = 2;

export type EditorTransactionChildCommandId =
  | typeof LAYER_STATE_COMMAND_ID
  | typeof FRAME_TAG_COMMAND_ID
  | typeof STATIC_PALETTE_COMMAND_ID
  | typeof STATIC_LAYER_TREE_COMMAND_ID;

export type EditorTransactionProfile = 'layer-and-tag' | 'static-structure';

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
  readonly profile: EditorTransactionProfile;
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

type PreparedTimelineTransactionChild = {
  readonly command: typeof LAYER_STATE_COMMAND_ID | typeof FRAME_TAG_COMMAND_ID;
  readonly prepared: PreparedTimelineProjectStateChange;
};

type PreparedTransactionChild =
  | PreparedTimelineTransactionChild
  | {
      readonly command: typeof STATIC_PALETTE_COMMAND_ID | typeof STATIC_LAYER_TREE_COMMAND_ID;
      readonly input: Readonly<Record<string, unknown>>;
    };

interface EditorTransactionExecutionOptions {
  readonly transactionIdFactory?: () => string;
  readonly tagIdFactory?: () => string;
  readonly entityIdFactory?: () => string;
}

interface PendingTransactionTransition {
  readonly phase: AutomationTransactionTransitionPhase;
  readonly rollbackPhase: 'before' | 'after';
  readonly wasApplied: boolean;
  readonly hadExecuted: boolean;
  readonly change: PreparedProjectChange;
}

type TransactionErrorDetails = Readonly<Record<string, string | number>>;

const TRANSACTION_DOMAINS: readonly ProjectChangeDomain[] = Object.freeze([
  'layer-state',
  'timeline',
]);

const TRANSACTION_CHILD_COMMANDS: ReadonlySet<string> = new Set([
  LAYER_STATE_COMMAND_ID,
  FRAME_TAG_COMMAND_ID,
  STATIC_PALETTE_COMMAND_ID,
  STATIC_LAYER_TREE_COMMAND_ID,
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
  readonly memorySize: number;

  private readonly context: ProjectContext;
  private readonly request: EditorTransactionRequest;
  private readonly children: readonly PreparedTransactionChild[];
  private readonly staticPrepared: PreparedStaticStructureChange | null;
  private currentProvenance: AutomationTransactionProvenance;
  private hasExecuted = false;
  private applied = false;
  private lastEvent: ProjectChangeEvent | null = null;
  private pendingTransition: PendingTransactionTransition | null = null;

  constructor(
    context: ProjectContext,
    request: EditorTransactionRequest,
    children: readonly PreparedTransactionChild[],
    staticPrepared: PreparedStaticStructureChange | null,
    transactionIdFactory?: () => string,
  ) {
    this.context = context;
    this.request = request;
    this.children = children;
    this.staticPrepared = staticPrepared;
    this.memorySize = staticPrepared?.snapshotBytes ?? 0;
    this.id = transactionIdFactory?.() ?? crypto.randomUUID();
    this.currentProvenance = freezeProvenance(request, this.id, children, []);
  }

  get provenance(): AutomationTransactionProvenance {
    return this.currentProvenance;
  }

  get event(): ProjectChangeEvent | null {
    return this.lastEvent;
  }

  execute(): void {
    if (this.applied) {
      throw transactionError('invalid_state', false, { reason: 'already_applied' });
    }

    const wasApplied = this.applied;
    const hadExecuted = this.hasExecuted;
    this.assertTarget();
    this.assertRevisionOnFirstExecution();
    this.assertPreparedState('before', this.hasExecuted);

    try {
      this.applyChildren('after');
      this.prepareTransition(
        hadExecuted ? 'redo' : 'execute',
        'before',
        wasApplied,
        hadExecuted,
      );
      this.hasExecuted = true;
      this.applied = true;
    } catch (error) {
      this.restoreAfterFailure('before', error, wasApplied, hadExecuted);
    }
  }

  undo(): void {
    if (!this.applied) {
      throw transactionError('invalid_state', false, { reason: 'not_applied' });
    }

    const wasApplied = this.applied;
    const hadExecuted = this.hasExecuted;
    this.assertTarget();
    this.assertPreparedState('after', true);

    try {
      this.applyChildren('before');
      this.prepareTransition('undo', 'after', wasApplied, hadExecuted);
      this.applied = false;
    } catch (error) {
      this.restoreAfterFailure('after', error, wasApplied, hadExecuted);
    }
  }

  commitTransition(): void {
    const pending = this.pendingTransition;
    if (!pending) {
      throw transactionError('invalid_state', false, { reason: 'missing_transition' });
    }

    // Build the next bounded observation before publishing the project
    // revision/event. This is the final fallible transaction bookkeeping step.
    const nextProvenance = appendProvenanceTransition(
      this.currentProvenance,
      pending.phase,
      pending.change.event,
    );
    pending.change.commit();
    // The staged project commit is the final document boundary. The remaining
    // assignments only publish already-prepared local references.
    this.currentProvenance = nextProvenance;
    this.lastEvent = pending.change.event;
    this.pendingTransition = null;
  }

  rollbackTransition(): void {
    const pending = this.pendingTransition;
    if (!pending) return;

    try {
      if (this.staticPrepared) {
        applyPreparedStaticStructureChange(this.context, this.staticPrepared, pending.rollbackPhase);
      } else {
        for (const child of [...this.children].reverse()) {
          if (!('prepared' in child)) continue;
          applyPreparedTimelineProjectStateChange(
            this.context,
            child.prepared,
            pending.rollbackPhase,
          );
        }
      }
      this.assertPreparedState(
        pending.rollbackPhase,
        pending.phase !== 'execute',
      );
      this.pendingTransition = null;
      this.applied = pending.wasApplied;
      this.hasExecuted = pending.hadExecuted;
    } catch {
      throw transactionError('internal', false, { reason: 'rollback_failed' });
    }
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
    if (this.staticPrepared) {
      assertPreparedStaticStructureChange(this.context, this.staticPrepared, phase);
      return;
    }
    for (const child of this.children) {
      if (!('prepared' in child)) continue;
      assertPreparedTimelineProjectStateChange(this.context, child.prepared, phase, replayed);
    }
  }

  private applyChildren(phase: 'before' | 'after'): void {
    if (this.staticPrepared) {
      applyPreparedStaticStructureChange(this.context, this.staticPrepared, phase);
      return;
    }
    for (const child of this.children) {
      if (!('prepared' in child)) continue;
      applyPreparedTimelineProjectStateChange(this.context, child.prepared, phase);
    }
  }

  private prepareTransition(
    phase: AutomationTransactionTransitionPhase,
    rollbackPhase: 'before' | 'after',
    wasApplied: boolean,
    hadExecuted: boolean,
  ): void {
    this.pendingTransition = {
      phase,
      rollbackPhase,
      wasApplied,
      hadExecuted,
      change: this.context.project.prepareChange(
        this.id,
        this.staticPrepared ? this.staticPrepared.domains : TRANSACTION_DOMAINS,
      ),
    };
  }

  private restoreAfterFailure(
    phase: 'before' | 'after',
    originalError: unknown,
    wasApplied: boolean,
    hadExecuted: boolean,
  ): never {
    let restored = true;
    try {
      if (this.staticPrepared) {
        applyPreparedStaticStructureChange(this.context, this.staticPrepared, phase);
      } else {
        for (const child of [...this.children].reverse()) {
          if (!('prepared' in child)) continue;
          applyPreparedTimelineProjectStateChange(this.context, child.prepared, phase);
        }
      }
      this.assertPreparedState(phase, phase === 'after');
      this.pendingTransition = null;
      this.applied = wasApplied;
      this.hasExecuted = hadExecuted;
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
  options: EditorTransactionExecutionOptions = {},
): Promise<EditorTransactionResult> {
  const request = normalizeTransactionRequest(input);
  const staticPrepared = request.profile === 'static-structure'
    ? prepareStaticStructureChange(
      context,
      request.children as readonly StaticStructureChildInput[],
      request.target,
      request.expectedRevision,
      { entityIdFactory: options.entityIdFactory },
    )
    : null;
  const children: PreparedTransactionChild[] = request.profile === 'static-structure'
    ? request.children.map((child) => ({
      command: child.command as typeof STATIC_PALETTE_COMMAND_ID | typeof STATIC_LAYER_TREE_COMMAND_ID,
      input: child.input,
    }))
    : request.children.map((child) => ({
      command: child.command as typeof LAYER_STATE_COMMAND_ID | typeof FRAME_TAG_COMMAND_ID,
      prepared: prepareTimelineProjectStateChange(context, {
        ...child.input,
        target: request.target,
        expectedRevision: request.expectedRevision,
      }, {
        tagIdFactory: options.tagIdFactory,
      }),
    }));
  const command = new EditorTransactionCommand(
    context,
    request,
    children,
    staticPrepared,
    options.transactionIdFactory,
  );
  try {
    await context.history.execute(command);
  } catch (error) {
    throw asTransactionError(error, 'history_bookkeeping');
  }

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

  assertExactKeys(input, ['operation', 'profile', 'target', 'expectedRevision', 'provenance', 'children'], 'request');
  if (input.operation !== undefined && input.operation !== EDITOR_TRANSACTION_OPERATION_ID) {
    throw transactionError('invalid_request', false, { reason: 'operation' });
  }
  const target = normalizeTarget(input.target);
  const expectedRevision = normalizeRevision(input.expectedRevision);
  const provenance = normalizeProvenance(input.provenance);
  const profile = normalizeProfile(input.profile);
  const children = normalizeChildren(input.children, profile);

  return { profile, target, expectedRevision, provenance, children };
}

// fallow-ignore-next-line complexity -- The bounded profile gate keeps child count and command-family validation atomic.
function normalizeChildren(value: unknown, profile: EditorTransactionProfile): EditorTransactionChildInput[] {
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

  const children = value.map((child) => normalizeChild(child, profile));
  const commands = new Set(children.map((child) => child.command));
  if (commands.size !== EDITOR_TRANSACTION_MAX_CHILDREN) {
    throw transactionError('invalid_request', false, { reason: 'child_family' });
  }
  if (profile === 'layer-and-tag') {
    if (!commands.has(LAYER_STATE_COMMAND_ID) || !commands.has(FRAME_TAG_COMMAND_ID)) {
      throw transactionError('invalid_request', false, { reason: 'child_family' });
    }
  } else if (!commands.has(STATIC_PALETTE_COMMAND_ID) || !commands.has(STATIC_LAYER_TREE_COMMAND_ID)) {
    throw transactionError('invalid_request', false, { reason: 'child_family' });
  }
  return children;
}

function normalizeChild(value: unknown, profile: EditorTransactionProfile): EditorTransactionChildInput {
  if (!isRecord(value)) {
    throw transactionError('invalid_request', false, { reason: 'child' });
  }

  assertExactKeys(value, ['command', 'input'], 'child');
  const command = normalizeChildCommand(value.command);
  const input = normalizeChildPayload(value.input);
  assertChildFamily(command, input, profile);

  return { command, input };
}

function normalizeChildPayload(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw transactionError('invalid_request', false, { reason: 'child_input' });
  }
  assertChildInputFields(value);
  return { ...value };
}

function assertChildFamily(
  command: EditorTransactionChildCommandId,
  input: Record<string, unknown>,
  profile: EditorTransactionProfile,
): void {
  if (typeof input.kind !== 'string') {
    throw transactionError('invalid_request', false, { reason: 'child_kind' });
  }
  if (profile === 'static-structure') {
    const expectedKind = command === STATIC_PALETTE_COMMAND_ID
      ? 'palette.declaration'
      : 'layer-tree.declaration';
    if (input.kind !== expectedKind) {
      throw transactionError('invalid_request', false, { reason: 'child_family' });
    }
    return;
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

function assertChildInputFields(value: Record<string, unknown>): void {
  if (typeof value.kind !== 'string') {
    throw transactionError('invalid_request', false, { reason: 'child_kind' });
  }
  const fields = childInputFields(value.kind);
  if (!fields) return;
  assertExactKeys(value, fields, 'child_input');
}

function normalizeProfile(value: unknown): EditorTransactionProfile {
  if (value === undefined || value === 'layer-and-tag') return 'layer-and-tag';
  if (value === 'static-structure') return value;
  throw transactionError('invalid_request', false, { reason: 'profile' });
}

// fallow-ignore-next-line complexity -- The exact child schema is an explicit bounded discriminated union.
function childInputFields(kind: string): readonly string[] | undefined {
  switch (kind) {
    case 'layer.visibility': return ['kind', 'layerId', 'visible'];
    case 'layer.lock': return ['kind', 'layerId', 'locked'];
    case 'layer.continuity': return ['kind', 'layerId', 'continuous'];
    case 'layer.reorder': return ['kind', 'layerId', 'direction', 'targetLayerId'];
    case 'tag.create': return ['kind', 'name', 'color', 'startFrameIndex', 'endFrameIndex'];
    case 'tag.rename': return ['kind', 'tagId', 'name'];
    case 'tag.recolor': return ['kind', 'tagId', 'color'];
    case 'tag.range': return ['kind', 'tagId', 'startFrameIndex', 'endFrameIndex'];
    case 'tag.collapse': return ['kind', 'tagId', 'collapsed'];
    case 'tag.remove-frame': return ['kind', 'tagId', 'frameIndex'];
    case 'tag.delete': return ['kind', 'tagId'];
    case 'palette.declaration': return ['kind', 'entries'];
    case 'layer-tree.declaration': return ['kind', 'layers'];
    default: return undefined;
  }
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  reason: string,
): void {
  if (!hasOnlyKeys(value, allowedKeys)) {
    throw transactionError('invalid_request', false, { reason });
  }
}

function normalizeProvenance(value: unknown): AutomationTransactionProvenanceInput {
  if (!isRecord(value)) {
    throw transactionError('invalid_request', false, { reason: 'provenance' });
  }
  assertExactKeys(value, ['clientId', 'sessionId', 'runId', 'operationId'], 'provenance');
  return {
    clientId: normalizeProvenanceString(value.clientId, 'client_id'),
    sessionId: normalizeProvenanceString(value.sessionId, 'session_id'),
    runId: normalizeProvenanceString(value.runId, 'run_id'),
    operationId: normalizeProvenanceString(value.operationId, 'operation_id'),
  };
}

function normalizeTarget(value: unknown): ProjectTarget {
  if (!isRecord(value) || typeof value.projectId !== 'string' || value.projectId.length === 0) {
    throw transactionError('invalid_request', false, { reason: 'target' });
  }
  assertExactKeys(value, ['projectId'], 'target');
  return { projectId: value.projectId };
}

function normalizeRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw transactionError('invalid_request', false, { reason: 'expected_revision' });
  }
  return value as number;
}

function normalizeProvenanceString(value: unknown, reason: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw transactionError('invalid_request', false, { reason });
  }
  if (value.length > TRANSACTION_PROVENANCE_MAX_STRING_LENGTH) {
    throw transactionError('limit_exceeded', false, {
      reason,
      max: TRANSACTION_PROVENANCE_MAX_STRING_LENGTH,
    });
  }
  return value;
}

function freezeProvenance(
  request: EditorTransactionRequest,
  transactionId: string,
  children: readonly PreparedTransactionChild[],
  transitions: readonly AutomationTransactionRevisionTransition[],
): AutomationTransactionProvenance {
  const summaries = children.map((child): AutomationTransactionChildSummary => {
    if ('prepared' in child) {
      return Object.freeze({
        commandId: child.command,
        operation: child.prepared.request.kind,
        domains: Object.freeze([...child.prepared.domains]),
      });
    }
    return Object.freeze({
      commandId: child.command,
      operation: child.input.kind as string,
      domains: Object.freeze(['palette', 'layer-state']),
    });
  });
  const frozenTransitions = transitions.map((transition) => Object.freeze({ ...transition }));
  return Object.freeze({
    source: 'automation',
    transactionId,
    clientId: request.provenance.clientId,
    sessionId: request.provenance.sessionId,
    runId: request.provenance.runId,
    operationId: request.provenance.operationId,
    target: Object.freeze({ projectId: request.target.projectId }),
    // The transaction origin is the request's captured revision. Retained
    // transition history is a bounded observation window, not a new origin.
    fromRevision: request.expectedRevision,
    toRevision: transitions.at(-1)?.toRevision ?? request.expectedRevision,
    transitionCount: transitions.length,
    transitionsTruncated: false,
    transitions: Object.freeze(frozenTransitions),
    children: Object.freeze(summaries),
  });
}

function appendProvenanceTransition(
  provenance: AutomationTransactionProvenance,
  phase: AutomationTransactionTransitionPhase,
  event: ProjectChangeEvent,
): AutomationTransactionProvenance {
  const transition: AutomationTransactionRevisionTransition = {
    phase,
    fromRevision: event.fromRevision,
    toRevision: event.toRevision,
  };
  const transitionCount = provenance.transitionCount + 1;
  const transitions = [...provenance.transitions, transition].slice(-TRANSACTION_PROVENANCE_MAX_TRANSITIONS);
  return Object.freeze({
    ...provenance,
    fromRevision: provenance.fromRevision,
    toRevision: event.toRevision,
    transitionCount,
    transitionsTruncated: transitionCount > transitions.length,
    transitions: Object.freeze(transitions.map((item) => Object.freeze({ ...item }))),
  });
}

function extractTransactionError(error: unknown): EditorTransactionError | null {
  if (error instanceof EditorTransactionError) return error;
  if (isRecord(error) && isRecord(error.editorError)) {
    return new EditorTransactionError(normalizeEditorError(error.editorError));
  }
  return null;
}

function asTransactionError(error: unknown, reason: string): EditorTransactionError {
  return extractTransactionError(error) ?? transactionError('internal', true, { reason });
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
