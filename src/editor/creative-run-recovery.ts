import {
  ASSET_PACKAGE_MAX_SOURCE_BYTES,
  TRANSACTION_PROVENANCE_MAX_STRING_LENGTH,
} from './catalog';
import type {
  AutomationTransactionProvenance,
  ProjectTarget,
} from './contracts';
import type { CreativeBrief } from './creative-run';
import { decodeProjectFile, type ProjectFile } from '../types/project';
import type { ProjectContext } from '../stores/project-context';
import type { Command } from '../stores/history-store';
import type {
  ProjectAlreadyExistsError,
  ProjectRepository,
} from '../services/persistence/project-repository';
import { v4 as uuidv4 } from 'uuid';

/** Version of the browser-local Creative Run recovery record. */
export const CREATIVE_RUN_RECOVERY_SCHEMA_VERSION = 1 as const;
/** A recovery record keeps only the active run's bounded transaction suffix. */
export const CREATIVE_RUN_RECOVERY_MAX_TRANSACTIONS = 50;
/** Recovery diagnostics retain the same bounded timeline shape as the panel. */
export const CREATIVE_RUN_RECOVERY_MAX_TIMELINE_ENTRIES = 200;
/** Project snapshots use the existing one-source-asset Preview envelope. */
export const CREATIVE_RUN_RECOVERY_MAX_PROJECT_BYTES = ASSET_PACKAGE_MAX_SOURCE_BYTES;
export const CREATIVE_RUN_RECOVERY_MAX_COPY_NAME_LENGTH = 256;
export const CREATIVE_RUN_RECOVERY_MAX_DIAGNOSTIC_OPERATIONS = 50;
export const CREATIVE_RUN_RECOVERY_MAX_DIAGNOSTIC_EVENTS = 200;

export type CreativeRunRecoveryOutcome =
  | 'restored-original-with-rejected-copy'
  | 'preserved-original-with-checkpoint-copy'
  | 'rewound-to-owned-transaction'
  | 'recovery-required';

export type CreativeRunRecoveryReason =
  | 'checkpoint-persistence'
  | 'checkpoint-too-large'
  | 'target-drift'
  | 'revision-conflict'
  | 'content-ambiguous'
  | 'history-not-owned'
  | 'history-evicted'
  | 'work-unsettled'
  | 'copy-collision'
  | 'copy-failed'
  | 'restore-failed'
  | 'persistence-failed'
  | 'invalid-selection'
  | 'terminal-run';

export type CreativeRunRecoveryAction =
  | 'recover-manually'
  | 'approve-brief'
  | 'review-result'
  | 'none';

export interface CreativeRunRecoveryCheckpoint {
  readonly schemaVersion: typeof CREATIVE_RUN_RECOVERY_SCHEMA_VERSION;
  readonly runId: string;
  readonly target: ProjectTarget;
  readonly sourceRevision: number;
  readonly sourceDigest: string;
  readonly project: ProjectFile;
}

export interface CreativeRunRecoveryTransaction {
  readonly operationId: string;
  readonly ordinal: number;
  readonly fromRevision: number;
  readonly toRevision: number;
  readonly postDigest: string;
  readonly provenance: AutomationTransactionProvenance;
  readonly durationMs: number;
}

export interface CreativeRunRecoveryTimelineFact {
  readonly sequence: number;
  readonly kind:
    | 'checkpoint'
    | 'transaction'
    | 'interrupted'
    | 'rewound'
    | 'rejected'
    | 'recovery-required';
  readonly outcome?: CreativeRunRecoveryOutcome;
  readonly reason?: CreativeRunRecoveryReason;
  readonly operationId?: string;
  readonly ordinal?: number;
  readonly fromRevision?: number;
  readonly toRevision?: number;
  readonly durationMs?: number;
}

/**
 * The durable record intentionally contains no promises, model state, queued
 * writes, or raw errors. Project bytes are local checkpoint data only.
 */
export interface CreativeRunRecoveryRecord {
  readonly schemaVersion: typeof CREATIVE_RUN_RECOVERY_SCHEMA_VERSION;
  readonly runId: string;
  readonly sessionId: string;
  readonly target: ProjectTarget;
  readonly brief: CreativeBrief;
  readonly approvedBriefRevision: number;
  readonly phase: string;
  readonly status: 'active' | 'interrupted' | 'rewound' | 'rejected' | 'recovery-required';
  readonly outcome: CreativeRunRecoveryOutcome | null;
  readonly reason: CreativeRunRecoveryReason | null;
  readonly currentRevision: number;
  readonly lastDurableRevision: number;
  readonly checkpoint: CreativeRunRecoveryCheckpoint;
  readonly transactions: readonly CreativeRunRecoveryTransaction[];
  readonly timeline: readonly CreativeRunRecoveryTimelineFact[];
  readonly recoveryCopyId: string | null;
}

/** IndexedDB and test doubles implement this small additive persistence seam. */
export interface CreativeRunRecoveryPersistence {
  load(runId: string): Promise<CreativeRunRecoveryRecord | null>;
  save(record: CreativeRunRecoveryRecord): Promise<void>;
}

export interface CreativeRunRecoveryHistoryEntry {
  readonly operationId: string;
  readonly ordinal: number;
  readonly fromRevision: number;
  readonly toRevision: number;
  readonly provenance: Pick<
    AutomationTransactionProvenance,
    'source' | 'runId' | 'operationId' | 'target' | 'fromRevision' | 'toRevision'
  > | null;
}

export interface CreativeRunRecoveryHistoryTransition {
  readonly fromRevision: number;
  readonly toRevision: number;
}

/** Existing history is adapted here rather than copied into the recovery module. */
export interface CreativeRunRecoveryHistoryBoundary {
  listUndoEntries(): readonly CreativeRunRecoveryHistoryEntry[];
  undo(
    entry: CreativeRunRecoveryHistoryEntry,
    expectedRevision: number,
  ): Promise<CreativeRunRecoveryHistoryTransition> | CreativeRunRecoveryHistoryTransition;
}

interface RecoveryHistoryStoreLike {
  readonly undoStack: { readonly value: readonly Command[] };
  undo(): void | Promise<void>;
}

/** Adapt the existing HistoryStore without exposing command instances to persistence. */
export function createCreativeRunHistoryBoundary(
  history: RecoveryHistoryStoreLike,
  getRevision: () => number,
): CreativeRunRecoveryHistoryBoundary {
  return {
    listUndoEntries: () => history.undoStack.value.map(toRecoveryHistoryEntry),
    undo: async (entry, expectedRevision) => {
      const top = history.undoStack.value.at(-1);
      if (!top || historyEntryId(top) !== entry.operationId || getRevision() !== expectedRevision) {
        throw new Error('history entry is no longer current');
      }
      await history.undo();
      const toRevision = getRevision();
      return { fromRevision: expectedRevision, toRevision };
    },
  };
}

/**
 * Bind recovery to one ProjectContext. The context closure prevents an active
 * tab switch from redirecting a copy or restore to another project.
 */
export function createProjectRecoveryTarget(
  context: ProjectContext,
  repository: Pick<ProjectRepository, 'create'>,
  target: ProjectTarget = { projectId: context.project.id.value },
  createProjectId: () => string = uuidv4,
): CreativeRunRecoveryTarget {
  return {
    target: { projectId: target.projectId },
    getRevision: () => context.project.revision.value,
    captureProject: async () => structuredClone(await context.project.saveProject()),
    restoreProject: async (project, expectedRevision) => {
      if (context.isDisposed || context.project.id.value !== target.projectId) {
        throw new Error('recovery target changed');
      }
      if (context.project.revision.value !== expectedRevision) {
        throw new Error('recovery revision changed');
      }
      await context.project.loadProject(structuredClone(project), false, {
        preserveRevision: expectedRevision,
      });
      const fromRevision = context.project.revision.value;
      if (fromRevision !== expectedRevision) throw new Error('recovery restore revision changed');
      context.project.advanceRevision();
      return {
        fromRevision,
        toRevision: context.project.revision.value,
      };
    },
    repository,
    createProjectId,
    history: createCreativeRunHistoryBoundary(context.history, () => context.project.revision.value),
    isCurrentTarget: () => !context.isDisposed && context.project.id.value === target.projectId,
    isWorkSettled: () => true,
  };
}

export interface CreativeRunRecoveryTarget {
  readonly target: ProjectTarget;
  getRevision(): number;
  captureProject(): Promise<ProjectFile>;
  restoreProject(project: ProjectFile, expectedRevision: number): Promise<CreativeRunRecoveryHistoryTransition>;
  readonly repository: Pick<ProjectRepository, 'create'>;
  createProjectId(): string;
  readonly history?: CreativeRunRecoveryHistoryBoundary;
  /** Returns false when the captured context no longer owns the target. */
  isCurrentTarget?: () => boolean;
  /** Recovery must not begin while an atomic transaction is unsettled. */
  isWorkSettled?: () => boolean;
}

export interface CreativeRunRecoveryDependencies {
  readonly runId: string;
  readonly sessionId: string;
  readonly brief: CreativeBrief;
  readonly target: CreativeRunRecoveryTarget;
  readonly persistence: CreativeRunRecoveryPersistence;
  /** Fence planning and future writes before any recovery operation. */
  readonly fenceWrites?: () => void | Promise<void>;
  readonly clock?: () => number;
}

export interface CreativeRunRecoveryStatus {
  readonly outcome: CreativeRunRecoveryOutcome | null;
  readonly reason: CreativeRunRecoveryReason | null;
  readonly recoveryCopyId: string | null;
  readonly requiresReapproval: boolean;
  readonly interrupted: boolean;
  readonly terminal: boolean;
}

export interface CreativeRunRecoveryResult {
  readonly ok: boolean;
  readonly outcome: CreativeRunRecoveryOutcome | null;
  readonly reason: CreativeRunRecoveryReason | null;
  readonly nextAction: CreativeRunRecoveryAction;
  readonly recoveryCopyId: string | null;
}

export interface CreativeRunRecoveryDiagnosticBundle {
  readonly schemaVersion: typeof CREATIVE_RUN_RECOVERY_SCHEMA_VERSION;
  readonly phase: string;
  readonly outcome: CreativeRunRecoveryOutcome | null;
  readonly reason: CreativeRunRecoveryReason | null;
  readonly transactionCount: number;
  readonly eventCount: number;
  readonly currentRevision: number;
  readonly lastDurableRevision: number;
  readonly checkpointRevision: number | null;
  readonly checkpointDigest: string | null;
  readonly postRunDigest: string | null;
  readonly operationIds: readonly string[];
  readonly eventKinds: readonly CreativeRunRecoveryTimelineFact['kind'][];
  readonly durationsMs: readonly number[];
}

export interface CheckpointBeforeWriteInput {
  readonly expectedRevision: number;
}

export interface CommittedRecoveryTransactionInput {
  readonly operationId: string;
  readonly ordinal: number;
  readonly fromRevision: number;
  readonly toRevision: number;
  readonly provenance: AutomationTransactionProvenance;
  readonly durationMs: number;
}

export interface CreativeRunRecoveryRewindInput {
  /** Rewind the selected transaction and every later owned transaction. */
  readonly operationId?: string;
  /** Rewind all owned transactions to the checkpoint. */
  readonly checkpoint?: boolean;
}

export interface CreativeRunRecovery {
  readonly status: CreativeRunRecoveryStatus;
  readonly record: CreativeRunRecoveryRecord | null;
  /** Restore an interrupted record after reload; it never resumes the run. */
  load(): Promise<CreativeRunRecoveryResult>;
  checkpointBeforeFirstWrite(input: CheckpointBeforeWriteInput): Promise<CreativeRunRecoveryResult>;
  recordCommittedTransaction(input: CommittedRecoveryTransactionInput): Promise<CreativeRunRecoveryResult>;
  markInterrupted(reason?: CreativeRunRecoveryReason): Promise<CreativeRunRecoveryResult>;
  rewind(input: CreativeRunRecoveryRewindInput): Promise<CreativeRunRecoveryResult>;
  reject(confirmed: boolean): Promise<CreativeRunRecoveryResult>;
  createCheckpointCopy(): Promise<CreativeRunRecoveryResult>;
  getDiagnostics(): CreativeRunRecoveryDiagnosticBundle;
}

interface MutableRecoveryRecord {
  schemaVersion: typeof CREATIVE_RUN_RECOVERY_SCHEMA_VERSION;
  runId: string;
  sessionId: string;
  target: ProjectTarget;
  brief: CreativeBrief;
  approvedBriefRevision: number;
  phase: string;
  status: CreativeRunRecoveryRecord['status'];
  outcome: CreativeRunRecoveryOutcome | null;
  reason: CreativeRunRecoveryReason | null;
  currentRevision: number;
  lastDurableRevision: number;
  checkpoint: CreativeRunRecoveryCheckpoint;
  transactions: CreativeRunRecoveryTransaction[];
  timeline: CreativeRunRecoveryTimelineFact[];
  recoveryCopyId: string | null;
}

/** Browser-local recovery coordinator for one Creative Run. */
export class CreativeRunRecoveryCoordinator implements CreativeRunRecovery {
  private readonly runId: string;
  private readonly sessionId: string;
  private readonly brief: CreativeBrief;
  private readonly target: CreativeRunRecoveryTarget;
  private readonly persistence: CreativeRunRecoveryPersistence;
  private readonly fenceWrites: () => void | Promise<void>;
  private mutableRecord: MutableRecoveryRecord | null = null;
  private requiresReapproval = false;
  private interrupted = false;
  private terminal = false;

  constructor(dependencies: CreativeRunRecoveryDependencies) {
    this.runId = boundedIdentity(dependencies.runId, 'runId');
    this.sessionId = boundedIdentity(dependencies.sessionId, 'sessionId');
    this.brief = structuredClone(dependencies.brief);
    this.target = dependencies.target;
    this.persistence = dependencies.persistence;
    this.fenceWrites = dependencies.fenceWrites ?? (() => undefined);
  }

  get record(): CreativeRunRecoveryRecord | null {
    return this.mutableRecord ? freezeRecord(cloneRecord(this.mutableRecord)) : null;
  }

  get status(): CreativeRunRecoveryStatus {
    return {
      outcome: this.mutableRecord?.outcome ?? null,
      reason: this.mutableRecord?.reason ?? null,
      recoveryCopyId: this.mutableRecord?.recoveryCopyId ?? null,
      requiresReapproval: this.requiresReapproval,
      interrupted: this.interrupted,
      terminal: this.terminal,
    };
  }

  async load(): Promise<CreativeRunRecoveryResult> {
    if (this.mutableRecord) return this.success();
    let stored: CreativeRunRecoveryRecord | null;
    try {
      stored = await this.persistence.load(this.runId);
    } catch {
      return this.required('persistence-failed');
    }
    if (!stored) return this.required('checkpoint-persistence');
    if (!isCompatibleRecord(stored, this.runId, this.target.target)) {
      return this.required('content-ambiguous');
    }
    this.mutableRecord = cloneRecord(stored);
    this.interrupted = stored.status === 'interrupted' || stored.phase === 'recovery-required';
    this.terminal = stored.status === 'rejected' || stored.outcome === 'preserved-original-with-checkpoint-copy';
    this.requiresReapproval = this.interrupted || stored.status === 'rewound';
    return this.success(stored.outcome, stored.reason, this.requiresReapproval ? 'approve-brief' : 'none');
  }

  async checkpointBeforeFirstWrite(
    input: CheckpointBeforeWriteInput,
  ): Promise<CreativeRunRecoveryResult> {
    if (!isRevision(input.expectedRevision)) return this.required('revision-conflict');
    if (this.mutableRecord?.checkpoint) {
      const checkpoint = this.mutableRecord.checkpoint;
      if (checkpoint.sourceRevision === input.expectedRevision) return this.success();
      return this.required('revision-conflict');
    }

    const targetCheck = this.verifyTarget();
    if (!targetCheck.ok) return this.required(targetCheck.reason);
    if (this.target.getRevision() !== input.expectedRevision) {
      return this.required('revision-conflict');
    }

    let project: ProjectFile;
    let digest: string;
    try {
      project = structuredClone(await this.target.captureProject());
      digest = await digestProjectFile(project);
      assertProjectSize(project);
    } catch (error) {
      return this.required(isProjectSizeError(error) ? 'checkpoint-too-large' : 'checkpoint-persistence');
    }

    const checkpoint: CreativeRunRecoveryCheckpoint = {
      schemaVersion: CREATIVE_RUN_RECOVERY_SCHEMA_VERSION,
      runId: this.runId,
      target: { projectId: this.target.target.projectId },
      sourceRevision: input.expectedRevision,
      sourceDigest: digest,
      project,
    };
    this.mutableRecord = createRecord(
      this.runId,
      this.sessionId,
      this.brief,
      this.target.target,
      input.expectedRevision,
      checkpoint,
    );
    if (!(await this.persistRecord())) {
      this.mutableRecord = null;
      return this.required('checkpoint-persistence');
    }
    return this.success();
  }

  async recordCommittedTransaction(
    input: CommittedRecoveryTransactionInput,
  ): Promise<CreativeRunRecoveryResult> {
    const record = this.mutableRecord;
    if (!record?.checkpoint) return this.required('checkpoint-persistence');
    if (record.status === 'recovery-required' || this.terminal) return this.required(record.reason ?? 'terminal-run');
    if (record.transactions.length >= CREATIVE_RUN_RECOVERY_MAX_TRANSACTIONS) {
      return this.required('persistence-failed');
    }
    if (!isValidTransactionInput(input, this.runId, this.target.target, record)) {
      return this.required('content-ambiguous');
    }

    let postDigest: string;
    try {
      const project = structuredClone(await this.target.captureProject());
      assertProjectSize(project);
      postDigest = await digestProjectFile(project);
    } catch (error) {
      return this.required(isProjectSizeError(error) ? 'content-ambiguous' : 'persistence-failed');
    }

    const transaction: CreativeRunRecoveryTransaction = {
      operationId: boundedIdentity(input.operationId, 'operationId'),
      ordinal: input.ordinal,
      fromRevision: input.fromRevision,
      toRevision: input.toRevision,
      postDigest,
      provenance: structuredClone(input.provenance),
      durationMs: boundedDuration(input.durationMs),
    };
    record.transactions.push(transaction);
    record.currentRevision = input.toRevision;
    record.lastDurableRevision = input.toRevision;
    record.status = 'active';
    record.phase = 'running';
    record.reason = null;
    this.appendTimeline({
      kind: 'transaction',
      operationId: transaction.operationId,
      ordinal: transaction.ordinal,
      fromRevision: transaction.fromRevision,
      toRevision: transaction.toRevision,
      durationMs: transaction.durationMs,
    });
    if (!(await this.persistRecord())) return this.required('persistence-failed');
    return this.success();
  }

  async markInterrupted(
    reason: CreativeRunRecoveryReason = 'work-unsettled',
  ): Promise<CreativeRunRecoveryResult> {
    if (!this.mutableRecord) return this.required('checkpoint-persistence');
    if (this.terminal) return this.required('terminal-run');
    this.interrupted = true;
    this.mutableRecord.status = 'interrupted';
    this.mutableRecord.phase = 'recovery-required';
    this.mutableRecord.outcome = 'recovery-required';
    this.mutableRecord.reason = reason;
    this.appendTimeline({ kind: 'interrupted', outcome: 'recovery-required', reason });
    if (!(await this.persistRecord())) return this.required('persistence-failed');
    return this.success('recovery-required', reason, 'recover-manually');
  }

  async rewind(input: CreativeRunRecoveryRewindInput): Promise<CreativeRunRecoveryResult> {
    const record = this.mutableRecord;
    if (!record?.checkpoint) return this.required('checkpoint-persistence');
    if (this.terminal) return this.required('terminal-run');
    if (this.target.isWorkSettled && !this.target.isWorkSettled()) return this.required('work-unsettled');
    if (!input.checkpoint && !input.operationId) return this.required('invalid-selection');
    if (input.checkpoint && input.operationId) return this.required('invalid-selection');
    const history = this.target.history;
    if (!history) return this.required('history-evicted');

    await this.fenceWrites();
    const targetCheck = this.verifyTarget();
    if (!targetCheck.ok) return this.required(targetCheck.reason);
    const current = await this.captureCurrentDigest();
    if (!current.ok) return this.required(current.reason);
    if (current.revision !== this.target.getRevision()) return this.required('revision-conflict');
    if (!matchesCurrentRecord(record, current.revision, current.digest)) {
      return this.required('content-ambiguous');
    }

    const selectedIndex = input.checkpoint
      ? -1
      : record.transactions.findIndex((transaction) => transaction.operationId === input.operationId);
    if (!input.checkpoint && selectedIndex < 0) return this.required('invalid-selection');
    if (record.transactions.length === 0) return this.required('invalid-selection');
    // A selected transaction is retained. Only its later owned suffix is undone;
    // selecting the checkpoint undoes every run transaction.
    const retainedCount = input.checkpoint ? 0 : selectedIndex + 1;
    const transactionsToUndo = record.transactions.slice(retainedCount);
    const undoEntries = history.listUndoEntries();
    if (!hasOwnedSuffix(undoEntries, record.transactions, this.runId, this.target.target)) {
      return this.required(undoEntries.length < record.transactions.length ? 'history-evicted' : 'history-not-owned');
    }

    let expectedRevision = current.revision;
    for (let index = undoEntries.length - 1, remaining = transactionsToUndo.length;
      remaining > 0;
      index -= 1, remaining -= 1) {
      const entry = undoEntries[index];
      if (!entry) return this.required('history-evicted');
      let transition: CreativeRunRecoveryHistoryTransition;
      try {
        transition = await history.undo(entry, expectedRevision);
      } catch {
        return this.required('revision-conflict');
      }
      if (transition.fromRevision !== expectedRevision || transition.toRevision !== expectedRevision + 1) {
        return this.required('revision-conflict');
      }
      expectedRevision = transition.toRevision;
    }

    record.transactions = record.transactions.slice(0, retainedCount);
    record.currentRevision = expectedRevision;
    record.lastDurableRevision = expectedRevision;
    record.status = 'rewound';
    record.phase = 'paused';
    record.outcome = 'rewound-to-owned-transaction';
    record.reason = null;
    this.requiresReapproval = true;
    this.interrupted = false;
    this.appendTimeline({
      kind: 'rewound',
      outcome: 'rewound-to-owned-transaction',
      fromRevision: current.revision,
      toRevision: expectedRevision,
    });
    if (!(await this.persistRecord())) return this.required('persistence-failed');
    return this.success('rewound-to-owned-transaction', null, 'approve-brief');
  }

  async reject(confirmed: boolean): Promise<CreativeRunRecoveryResult> {
    const record = this.mutableRecord;
    if (!confirmed) return this.required('invalid-selection');
    if (!record?.checkpoint) return this.required('checkpoint-persistence');
    if (this.terminal) return this.required('terminal-run');
    if (this.target.isWorkSettled && !this.target.isWorkSettled()) return this.required('work-unsettled');

    await this.fenceWrites();
    const targetCheck = this.verifyTarget();
    if (!targetCheck.ok) return this.required(targetCheck.reason);
    const before = await this.captureCurrentDigest();
    if (!before.ok) return this.required(before.reason);
    const noLaterWork = this.hasNoLaterWork(record, before.revision, before.digest);

    if (!noLaterWork) {
      const copy = await this.createCopy(record.checkpoint.project, 'Checkpoint Recovery Copy');
      if (!copy.ok) return copy;
      return this.finishConflict(copy.recoveryCopyId);
    }

    const rejectedCopy = await this.createCopy(before.project, 'Rejected Result Recovery Copy');
    if (!rejectedCopy.ok) return rejectedCopy;
    const afterCopy = await this.captureCurrentDigest();
    if (!afterCopy.ok || afterCopy.revision !== before.revision || afterCopy.digest !== before.digest) {
      const checkpointCopy = await this.createCopy(record.checkpoint.project, 'Checkpoint Recovery Copy');
      if (!checkpointCopy.ok) return checkpointCopy;
      return this.finishConflict(checkpointCopy.recoveryCopyId);
    }

    const beforeRestoreTargetCheck = this.verifyTarget();
    if (!beforeRestoreTargetCheck.ok) {
      const checkpointCopy = await this.createCopy(record.checkpoint.project, 'Checkpoint Recovery Copy');
      if (!checkpointCopy.ok) return checkpointCopy;
      return this.finishConflict(checkpointCopy.recoveryCopyId);
    }
    let restoreTransition: CreativeRunRecoveryHistoryTransition;
    try {
      restoreTransition = await this.target.restoreProject(structuredClone(record.checkpoint.project), before.revision);
    } catch {
      return this.required('restore-failed');
    }
    const restored = await this.captureCurrentDigest();
    if (!restored.ok
      || restoreTransition.fromRevision !== before.revision
      || restoreTransition.toRevision !== before.revision + 1
      || restored.revision !== restoreTransition.toRevision
      || restored.digest !== record.checkpoint.sourceDigest) {
      return this.required('restore-failed');
    }

    record.currentRevision = restored.revision;
    record.lastDurableRevision = restored.revision;
    record.status = 'rejected';
    record.phase = 'rejected';
    record.outcome = 'restored-original-with-rejected-copy';
    record.reason = null;
    record.recoveryCopyId = rejectedCopy.recoveryCopyId;
    this.terminal = true;
    this.appendTimeline({
      kind: 'rejected',
      outcome: 'restored-original-with-rejected-copy',
      fromRevision: before.revision,
      toRevision: restored.revision,
    });
    if (!(await this.persistRecord())) return this.required('persistence-failed');
    return this.success('restored-original-with-rejected-copy', null, 'none');
  }

  async createCheckpointCopy(): Promise<CreativeRunRecoveryResult> {
    const record = this.mutableRecord;
    if (!record?.checkpoint) return this.required('checkpoint-persistence');
    const result = await this.createCopy(record.checkpoint.project, 'Checkpoint Recovery Copy');
    if (!result.ok || !result.recoveryCopyId) return result;
    record.recoveryCopyId = result.recoveryCopyId;
    if (!(await this.persistRecord())) return this.required('persistence-failed');
    return this.success(record.outcome, record.reason, 'review-result', record.recoveryCopyId);
  }

  getDiagnostics(): CreativeRunRecoveryDiagnosticBundle {
    const record = this.mutableRecord;
    const transactions = record?.transactions ?? [];
    const timeline = record?.timeline ?? [];
    const postRunDigest = transactions.at(-1)?.postDigest ?? record?.checkpoint.sourceDigest ?? null;
    return {
      schemaVersion: CREATIVE_RUN_RECOVERY_SCHEMA_VERSION,
      phase: record?.phase ?? 'draft',
      outcome: record?.outcome ?? null,
      reason: record?.reason ?? null,
      transactionCount: transactions.length,
      eventCount: timeline.length,
      currentRevision: record?.currentRevision ?? 0,
      lastDurableRevision: record?.lastDurableRevision ?? 0,
      checkpointRevision: record?.checkpoint.sourceRevision ?? null,
      checkpointDigest: record?.checkpoint.sourceDigest ?? null,
      postRunDigest,
      operationIds: transactions
        .slice(0, CREATIVE_RUN_RECOVERY_MAX_DIAGNOSTIC_OPERATIONS)
        .map((transaction) => transaction.operationId),
      eventKinds: timeline.slice(0, CREATIVE_RUN_RECOVERY_MAX_DIAGNOSTIC_EVENTS).map((entry) => entry.kind),
      durationsMs: transactions
        .slice(0, CREATIVE_RUN_RECOVERY_MAX_DIAGNOSTIC_OPERATIONS)
        .map((transaction) => transaction.durationMs),
    };
  }

  private async createCopy(project: ProjectFile, label: string): Promise<CreativeRunRecoveryResult> {
    if (!this.mutableRecord) return this.required('checkpoint-persistence');
    let copy: ProjectFile;
    try {
      copy = structuredClone(project);
      assertProjectSize(copy);
    } catch (error) {
      return this.required(isProjectSizeError(error) ? 'copy-failed' : 'copy-failed');
    }
    const copyId = this.target.createProjectId();
    if (!isBoundedString(copyId, TRANSACTION_PROVENANCE_MAX_STRING_LENGTH)) {
      return this.required('copy-failed');
    }
    copy.name = boundedCopyName(label);
    try {
      await this.target.repository.create(copyId, copy);
    } catch (error) {
      if (isProjectCollision(error)) return this.required('copy-collision');
      return this.required('copy-failed');
    }
    return this.success(null, null, 'review-result', copyId);
  }

  private async finishConflict(copyId: string | null): Promise<CreativeRunRecoveryResult> {
    const record = this.mutableRecord;
    if (!record) return this.required('checkpoint-persistence');
    record.status = 'recovery-required';
    record.phase = 'recovery-required';
    record.outcome = 'preserved-original-with-checkpoint-copy';
    record.reason = null;
    record.recoveryCopyId = copyId;
    this.terminal = true;
    this.appendTimeline({
      kind: 'recovery-required',
      outcome: 'preserved-original-with-checkpoint-copy',
    });
    if (!(await this.persistRecord())) return this.required('persistence-failed');
    return this.success('preserved-original-with-checkpoint-copy', null, 'review-result', copyId);
  }

  private hasNoLaterWork(record: MutableRecoveryRecord, revision: number, digest: string): boolean {
    if (revision !== record.currentRevision) return false;
    const latestDigest = record.transactions.at(-1)?.postDigest ?? record.checkpoint.sourceDigest;
    if (digest !== latestDigest) return false;
    const history = this.target.history;
    if (!history) return false;
    return hasOwnedSuffix(history.listUndoEntries(), record.transactions, this.runId, this.target.target);
  }

  private verifyTarget(): { readonly ok: true } | { readonly ok: false; readonly reason: CreativeRunRecoveryReason } {
    if (this.target.isCurrentTarget && !this.target.isCurrentTarget()) return { ok: false, reason: 'target-drift' };
    if (this.target.target.projectId.length === 0) return { ok: false, reason: 'target-drift' };
    return { ok: true };
  }

  private async captureCurrentDigest(): Promise<
    | { readonly ok: true; readonly revision: number; readonly digest: string; readonly project: ProjectFile }
    | { readonly ok: false; readonly reason: CreativeRunRecoveryReason }
  > {
    try {
      const project = structuredClone(await this.target.captureProject());
      assertProjectSize(project);
      return {
        ok: true,
        revision: this.target.getRevision(),
        digest: await digestProjectFile(project),
        project,
      };
    } catch (error) {
      return { ok: false, reason: isProjectSizeError(error) ? 'content-ambiguous' : 'persistence-failed' };
    }
  }

  private appendTimeline(entry: Omit<CreativeRunRecoveryTimelineFact, 'sequence'>): void {
    const record = this.mutableRecord;
    if (!record) return;
    if (record.timeline.length >= CREATIVE_RUN_RECOVERY_MAX_TIMELINE_ENTRIES) {
      record.timeline.splice(0, 1);
    }
    const sequence = (record.timeline.at(-1)?.sequence ?? 0) + 1;
    record.timeline.push({ sequence, ...entry });
  }

  private async persistRecord(): Promise<boolean> {
    if (!this.mutableRecord) return false;
    try {
      await this.persistence.save(freezeRecord(cloneRecord(this.mutableRecord)));
      return true;
    } catch {
      return false;
    }
  }

  private success(
    outcome: CreativeRunRecoveryOutcome | null = this.mutableRecord?.outcome ?? null,
    reason: CreativeRunRecoveryReason | null = this.mutableRecord?.reason ?? null,
    nextAction: CreativeRunRecoveryAction = 'none',
    recoveryCopyId: string | null = this.mutableRecord?.recoveryCopyId ?? null,
  ): CreativeRunRecoveryResult {
    return { ok: true, outcome, reason, nextAction, recoveryCopyId };
  }

  private async required(reason: CreativeRunRecoveryReason): Promise<CreativeRunRecoveryResult> {
    if (this.mutableRecord) {
      this.mutableRecord.status = 'recovery-required';
      this.mutableRecord.phase = 'recovery-required';
      this.mutableRecord.outcome = 'recovery-required';
      this.mutableRecord.reason = reason;
      this.appendTimeline({ kind: 'recovery-required', outcome: 'recovery-required', reason });
      // The caller has already stopped future work; record the failure before
      // returning so recovery-required is never only an in-memory claim.
      await this.persistRecord();
    }
    return {
      ok: false,
      outcome: 'recovery-required',
      reason,
      nextAction: 'recover-manually',
      recoveryCopyId: this.mutableRecord?.recoveryCopyId ?? null,
    };
  }
}

function createRecord(
  runId: string,
  sessionId: string,
  brief: CreativeBrief,
  target: ProjectTarget,
  revision: number,
  checkpoint: CreativeRunRecoveryCheckpoint,
): MutableRecoveryRecord {
  return {
    schemaVersion: CREATIVE_RUN_RECOVERY_SCHEMA_VERSION,
    runId,
    sessionId,
    target: { projectId: target.projectId },
    brief: structuredClone(brief),
    approvedBriefRevision: brief.revision,
    phase: 'ready',
    status: 'active',
    outcome: null,
    reason: null,
    currentRevision: revision,
    lastDurableRevision: revision,
    checkpoint,
    transactions: [],
    timeline: [{
      sequence: 1,
      kind: 'checkpoint',
      fromRevision: revision,
      toRevision: revision,
    }],
    recoveryCopyId: null,
  };
}

function cloneRecord(record: MutableRecoveryRecord | CreativeRunRecoveryRecord): MutableRecoveryRecord {
  return structuredClone(record) as MutableRecoveryRecord;
}

function freezeRecord(record: MutableRecoveryRecord): CreativeRunRecoveryRecord {
  return record as CreativeRunRecoveryRecord;
}

function historyEntryId(command: Command): string {
  return command.provenance?.operationId ?? command.id;
}

function toRecoveryHistoryEntry(command: Command): CreativeRunRecoveryHistoryEntry {
  const provenance = command.provenance;
  if (!provenance) {
    return {
      operationId: command.id,
      ordinal: 0,
      fromRevision: -1,
      toRevision: -1,
      provenance: null,
    };
  }
  const ordinalMatch = /:step:(\d+)$/.exec(provenance.operationId);
  return {
    operationId: provenance.operationId,
    ordinal: ordinalMatch ? Number(ordinalMatch[1]) : 0,
    fromRevision: provenance.fromRevision,
    toRevision: provenance.toRevision,
    provenance: {
      source: provenance.source,
      runId: provenance.runId,
      operationId: provenance.operationId,
      target: { projectId: provenance.target.projectId },
      fromRevision: provenance.fromRevision,
      toRevision: provenance.toRevision,
    },
  };
}

function isValidTransactionInput(
  input: CommittedRecoveryTransactionInput,
  runId: string,
  target: ProjectTarget,
  record: MutableRecoveryRecord,
): boolean {
  if (!isBoundedString(input.operationId, TRANSACTION_PROVENANCE_MAX_STRING_LENGTH)) return false;
  if (!Number.isSafeInteger(input.ordinal) || input.ordinal !== record.transactions.length + 1) return false;
  if (!isRevision(input.fromRevision) || !isRevision(input.toRevision) || input.toRevision !== input.fromRevision + 1) return false;
  const provenance = input.provenance;
  return provenance.source === 'automation'
    && provenance.runId === runId
    && provenance.operationId === input.operationId
    && provenance.target.projectId === target.projectId
    && provenance.fromRevision === input.fromRevision
    && provenance.toRevision === input.toRevision;
}

function matchesCurrentRecord(record: MutableRecoveryRecord, revision: number, digest: string): boolean {
  const latestDigest = record.transactions.at(-1)?.postDigest ?? record.checkpoint.sourceDigest;
  return revision === record.currentRevision && digest === latestDigest;
}

function hasOwnedSuffix(
  entries: readonly CreativeRunRecoveryHistoryEntry[],
  transactions: readonly CreativeRunRecoveryTransaction[],
  runId: string,
  target: ProjectTarget,
): boolean {
  if (transactions.length === 0 || entries.length < transactions.length) return transactions.length === 0;
  const suffix = entries.slice(-transactions.length);
    return suffix.every((entry, index) => {
      const transaction = transactions[index];
      if (!transaction) return false;
      if (!entry.provenance) return false;
    return entry.operationId === transaction.operationId
      && entry.ordinal === transaction.ordinal
      && entry.fromRevision === transaction.fromRevision
      && entry.toRevision === transaction.toRevision
      && entry.provenance.source === 'automation'
      && entry.provenance.runId === runId
      && entry.provenance.operationId === transaction.operationId
      && entry.provenance.target.projectId === target.projectId;
  });
}

function isCompatibleRecord(
  record: CreativeRunRecoveryRecord,
  runId: string,
  target: ProjectTarget,
): boolean {
  if (!isRecordObject(record)
    || record.schemaVersion !== CREATIVE_RUN_RECOVERY_SCHEMA_VERSION
    || record.runId !== runId
    || !isBoundedString(record.runId, TRANSACTION_PROVENANCE_MAX_STRING_LENGTH)
    || !isBoundedString(record.sessionId, TRANSACTION_PROVENANCE_MAX_STRING_LENGTH)
    || !isRecordObject(record.target)
    || record.target.projectId !== target.projectId
    || !isRecordObject(record.checkpoint)
    || record.checkpoint.runId !== runId
    || !isRecordObject(record.checkpoint.target)
    || record.checkpoint.target.projectId !== target.projectId
    || !isRevision(record.checkpoint.sourceRevision)
    || !isDigest(record.checkpoint.sourceDigest)
    || !Array.isArray(record.transactions)
    || !Array.isArray(record.timeline)
    || record.transactions.length > CREATIVE_RUN_RECOVERY_MAX_TRANSACTIONS
    || record.timeline.length > CREATIVE_RUN_RECOVERY_MAX_TIMELINE_ENTRIES
    || !isValidBrief(record.brief, runId, target)
    || record.approvedBriefRevision !== record.brief.revision
    || !isValidRecoveryStatus(record.status, record.outcome, record.reason)
    || !isRevision(record.currentRevision)
    || !isRevision(record.lastDurableRevision)
    || record.lastDurableRevision !== record.currentRevision
    || (record.recoveryCopyId !== null && !isBoundedString(record.recoveryCopyId, TRANSACTION_PROVENANCE_MAX_STRING_LENGTH))) {
    return false;
  }
  try {
    assertProjectSize(record.checkpoint.project);
    decodeProjectFile(structuredClone(record.checkpoint.project));
  } catch {
    return false;
  }
  if (!isValidRecoveryTimeline(record.timeline)) return false;
  return record.transactions.every((transaction, index) =>
    isValidStoredTransaction(transaction, index, runId, target));
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isDigest(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function isValidBrief(value: unknown, runId: string, target: ProjectTarget): value is CreativeBrief {
  if (!isRecordObject(value)
    || value.runId !== runId
    || value.targetId !== target.projectId
    || !isBoundedString(value.runId, TRANSACTION_PROVENANCE_MAX_STRING_LENGTH)
    || !isBoundedString(value.targetId, TRANSACTION_PROVENANCE_MAX_STRING_LENGTH)
    || !isBoundedString(value.targetName, TRANSACTION_PROVENANCE_MAX_STRING_LENGTH)
    || !isBoundedString(value.goal, 512)
    || !Array.isArray(value.constraints)
    || value.constraints.length > 8
    || value.constraints.some((constraint) => !isBoundedString(constraint, 256))
    || !Array.isArray(value.requestedWriteCategories)
    || value.requestedWriteCategories.length === 0
    || value.requestedWriteCategories.length > 4
    || new Set(value.requestedWriteCategories).size !== value.requestedWriteCategories.length
    || value.requestedWriteCategories.some((category) => !['structure', 'palette', 'timeline', 'raster'].includes(category))
    || !isRevision(value.revision)
    || value.revision < 1
    || !isSafeInteger(value.transactionLimit)
    || value.transactionLimit < 1
    || !isSafeInteger(value.durationSeconds)
    || value.durationSeconds < 1
    || (value.contentEgress !== 'local-only' && value.contentEgress !== 'approved-provider')) {
    return false;
  }
  return true;
}

function isValidRecoveryStatus(
  status: unknown,
  outcome: unknown,
  reason: unknown,
): status is CreativeRunRecoveryRecord['status'] {
  const statuses = ['active', 'interrupted', 'rewound', 'rejected', 'recovery-required'];
  const outcomes = [null, 'restored-original-with-rejected-copy', 'preserved-original-with-checkpoint-copy', 'rewound-to-owned-transaction', 'recovery-required'];
  const reasons = [null, 'checkpoint-persistence', 'checkpoint-too-large', 'target-drift', 'revision-conflict', 'content-ambiguous', 'history-not-owned', 'history-evicted', 'work-unsettled', 'copy-collision', 'copy-failed', 'restore-failed', 'persistence-failed', 'invalid-selection', 'terminal-run'];
  return statuses.includes(status as string) && outcomes.includes(outcome as string | null) && reasons.includes(reason as string | null);
}

function isValidRecoveryTimeline(timeline: readonly CreativeRunRecoveryTimelineFact[]): boolean {
  let previousSequence = 0;
  const kinds = ['checkpoint', 'transaction', 'interrupted', 'rewound', 'rejected', 'recovery-required'];
  return timeline.every((entry) => {
    if (!isRecordObject(entry)
      || !Number.isSafeInteger(entry.sequence)
      || entry.sequence <= previousSequence
      || !kinds.includes(entry.kind)
      || (entry.operationId !== undefined && !isBoundedString(entry.operationId, TRANSACTION_PROVENANCE_MAX_STRING_LENGTH))
      || (entry.durationMs !== undefined && !isSafeInteger(entry.durationMs))) {
      return false;
    }
    previousSequence = entry.sequence;
    return true;
  });
}

function isValidStoredTransaction(
  transaction: unknown,
  index: number,
  runId: string,
  target: ProjectTarget,
): transaction is CreativeRunRecoveryTransaction {
  if (!isRecordObject(transaction)
    || transaction.ordinal !== index + 1
    || !isBoundedString(transaction.operationId, TRANSACTION_PROVENANCE_MAX_STRING_LENGTH)
    || !isRevision(transaction.fromRevision)
    || !isRevision(transaction.toRevision)
    || transaction.toRevision !== transaction.fromRevision + 1
    || !isDigest(transaction.postDigest)
    || !isSafeInteger(transaction.durationMs)
    || transaction.durationMs < 0
    || transaction.durationMs > 3_600_000
    || !isRecordObject(transaction.provenance)) {
    return false;
  }
  const provenance = transaction.provenance;
  const provenanceTarget = isRecordObject(provenance.target) ? provenance.target.projectId : undefined;
  return provenance.source === 'automation'
    && provenance.runId === runId
    && provenance.operationId === transaction.operationId
    && provenanceTarget === target.projectId
    && provenance.fromRevision === transaction.fromRevision
    && provenance.toRevision === transaction.toRevision;
}

function boundedIdentity(value: string, reason: string): string {
  if (!isBoundedString(value, TRANSACTION_PROVENANCE_MAX_STRING_LENGTH)) throw new Error(`invalid ${reason}`);
  return value;
}

function isBoundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

function isRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value);
}

function boundedDuration(value: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(0, Math.round(value)), 3_600_000) : 0;
}

function boundedCopyName(label: string): string {
  return label.slice(0, CREATIVE_RUN_RECOVERY_MAX_COPY_NAME_LENGTH);
}

function isProjectCollision(error: unknown): error is ProjectAlreadyExistsError {
  return Boolean(error && typeof error === 'object' && 'name' in error && (error as { name?: unknown }).name === 'ProjectAlreadyExistsError');
}

function isProjectSizeError(error: unknown): boolean {
  return error instanceof RecoveryProjectSizeError;
}

class RecoveryProjectSizeError extends Error {
  constructor() {
    super('recovery project exceeds the Preview Support Envelope');
    this.name = 'RecoveryProjectSizeError';
  }
}

class RecoveryDigestUnavailableError extends Error {
  constructor() {
    super('Web Crypto SHA-256 is unavailable for recovery verification');
    this.name = 'RecoveryDigestUnavailableError';
  }
}

function assertProjectSize(project: ProjectFile): void {
  if (measureProjectBytes(project) > CREATIVE_RUN_RECOVERY_MAX_PROJECT_BYTES) {
    throw new RecoveryProjectSizeError();
  }
}

/** Deterministic project digest used for revalidation and exact restore proof. */
export async function digestProjectFile(project: ProjectFile): Promise<string> {
  const encoded = stableEncode(project);
  const bytes = new TextEncoder().encode(encoded);
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) throw new RecoveryDigestUnavailableError();
  const digest = await cryptoApi.subtle.digest('SHA-256', bytes);
  return toHex(new Uint8Array(digest));
}

function measureProjectBytes(project: ProjectFile): number {
  return new TextEncoder().encode(stableEncode(project)).byteLength;
}

function stableEncode(value: unknown, seen = new Set<object>()): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'bigint') return `${String(value)}n`;
  if (typeof value !== 'object') return 'undefined';
  if (seen.has(value)) throw new RecoveryProjectSizeError();
  if (value instanceof Uint8Array) return `u8:${Array.from(value).join(',')}`;
  if (value instanceof ArrayBuffer) return `ab:${Array.from(new Uint8Array(value)).join(',')}`;
  seen.add(value);
  let encoded: string;
  if (Array.isArray(value)) {
    encoded = `[${value.map((item) => stableEncode(item, seen)).join(',')}]`;
  } else {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    encoded = `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${stableEncode(child, seen)}`).join(',')}}`;
  }
  seen.delete(value);
  return encoded;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
