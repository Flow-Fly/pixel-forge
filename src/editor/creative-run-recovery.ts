import { TRANSACTION_PROVENANCE_MAX_STRING_LENGTH } from './catalog';
import type {
  AutomationTransactionProvenance,
  ProjectTarget,
} from './contracts';
import type { CreativeBrief } from './creative-run';
import type { ProjectFile } from '../types/project';
import type {
  ProjectAlreadyExistsError,
  ProjectRepository,
} from '../services/persistence/project-repository';
import {
  assertProjectSize,
  boundedCopyName,
  boundedDuration,
  boundedIdentity,
  digestProjectFile,
  isBoundedString,
  isCompatibleRecord,
  isCheckpointDigestValid,
  isProjectSizeError,
  isRevision,
  isValidTransactionInput,
  matchesCurrentRecord,
} from './creative-run-recovery-codec';
import { buildRecoveryDiagnostics } from './creative-run-recovery-diagnostics';
import { hasOwnedSuffix } from './creative-run-recovery-boundaries';

export { digestProjectFile } from './creative-run-recovery-codec';

/** Version of the browser-local Creative Run recovery record. */
const CREATIVE_RUN_RECOVERY_SCHEMA_VERSION = 1 as const;
/** A recovery record keeps only the active run's bounded transaction suffix. */
const CREATIVE_RUN_RECOVERY_MAX_TRANSACTIONS = 50;
/** Recovery diagnostics retain the same bounded timeline shape as the panel. */
const CREATIVE_RUN_RECOVERY_MAX_TIMELINE_ENTRIES = 200;
const CREATIVE_RUN_RECOVERY_MAX_COPY_NAME_LENGTH = 256;

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
  /** Number of bounded recovery events omitted from the retained timeline. */
  readonly collapsedEventCount: number;
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
  readonly collapsedEventCount: number;
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
  /** Reactivate a rewound record only after fresh observation and approval. */
  reactivateAfterReapproval(expectedRevision: number): Promise<CreativeRunRecoveryResult>;
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
  collapsedEventCount: number;
  recoveryCopyId: string | null;
}

type RecoveryPreparation =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: CreativeRunRecoveryReason };

type RewindSelection =
  | { readonly ok: true; readonly retainedCount: number }
  | { readonly ok: false; readonly reason: 'invalid-selection' };

type UndoResult =
  | { readonly ok: true; readonly revision: number }
  | { readonly ok: false; readonly reason: 'history-evicted' | 'revision-conflict' };

type RewindPreparation =
  | {
      readonly ok: true;
      readonly history: CreativeRunRecoveryHistoryBoundary;
      readonly selection: RewindSelection & { readonly ok: true };
    }
  | { readonly ok: false; readonly reason: CreativeRunRecoveryReason };

type CapturedProject =
  | { readonly ok: true; readonly revision: number; readonly digest: string; readonly project: ProjectFile }
  | { readonly ok: false; readonly reason: CreativeRunRecoveryReason };

type OwnedHistory =
  | { readonly ok: true; readonly entries: readonly CreativeRunRecoveryHistoryEntry[] }
  | { readonly ok: false; readonly reason: 'history-evicted' | 'history-not-owned' };

type RejectPreparation =
  | { readonly ok: true; readonly before: Extract<CapturedProject, { readonly ok: true }>; readonly recoveryCopyId: string | null; readonly restoredRevision: number }
  | { readonly ok: false; readonly result: CreativeRunRecoveryResult };

type LoadedRecoveryRecord =
  | { readonly ok: true; readonly record: CreativeRunRecoveryRecord | null }
  | { readonly ok: false; readonly reason: CreativeRunRecoveryReason };

type ReactivationSnapshot =
  | { readonly ok: true; readonly revision: number }
  | { readonly ok: false; readonly reason: CreativeRunRecoveryReason };

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
    const loaded = await this.readStoredRecord();
    if (!loaded.ok) return this.required(loaded.reason);
    if (!loaded.record) return this.required('checkpoint-persistence');
    const validationReason = await this.validateStoredRecord(loaded.record);
    if (validationReason) return this.required(validationReason);
    this.adoptStoredRecord(loaded.record);
    return this.success(
      loaded.record.outcome,
      loaded.record.reason,
      this.requiresReapproval ? 'approve-brief' : 'none',
    );
  }

  private async readStoredRecord(): Promise<LoadedRecoveryRecord> {
    try {
      return { ok: true, record: await this.persistence.load(this.runId) };
    } catch {
      return { ok: false, reason: 'persistence-failed' };
    }
  }

  private async validateStoredRecord(
    stored: CreativeRunRecoveryRecord,
  ): Promise<CreativeRunRecoveryReason | null> {
    if (!isCompatibleRecord(stored, this.runId, this.target.target)) return 'content-ambiguous';
    try {
      return await isCheckpointDigestValid(stored) ? null : 'content-ambiguous';
    } catch {
      return 'persistence-failed';
    }
  }

  private adoptStoredRecord(stored: CreativeRunRecoveryRecord): void {
    this.mutableRecord = cloneRecord(stored);
    this.mutableRecord.collapsedEventCount = stored.collapsedEventCount ?? 0;
    this.interrupted = stored.status === 'interrupted' || stored.phase === 'recovery-required';
    this.terminal = stored.status === 'rejected' || stored.outcome === 'preserved-original-with-checkpoint-copy';
    this.requiresReapproval = this.interrupted || stored.status === 'rewound';
  }

  async checkpointBeforeFirstWrite(
    input: CheckpointBeforeWriteInput,
  ): Promise<CreativeRunRecoveryResult> {
    if (!isRevision(input.expectedRevision)) return this.required('revision-conflict');
    if (this.mutableRecord?.checkpoint) {
      return this.validateExistingCheckpoint(input.expectedRevision);
    }
    const captured = await this.captureCheckpoint(input.expectedRevision);
    if (!captured.ok) return this.required(captured.reason);
    this.mutableRecord = createRecord(
      this.runId,
      this.sessionId,
      this.brief,
      this.target.target,
      input.expectedRevision,
      captured,
    );
    if (await this.persistRecord()) return this.success();
    this.mutableRecord = null;
    return this.required('checkpoint-persistence');
  }

  private async captureCheckpoint(expectedRevision: number): Promise<CapturedProject> {
    const targetCheck = this.verifyTarget();
    if (!targetCheck.ok) return targetCheck;
    if (this.target.getRevision() !== expectedRevision) return { ok: false, reason: 'revision-conflict' };
    const captured = await this.captureCurrentDigest();
    if (!captured.ok) return captured;
    if (captured.revision !== expectedRevision) return { ok: false, reason: 'revision-conflict' };
    return this.verifyTarget().ok ? captured : { ok: false, reason: 'target-drift' };
  }

  private async validateExistingCheckpoint(expectedRevision: number): Promise<CreativeRunRecoveryResult> {
    const checkpoint = this.mutableRecord?.checkpoint;
    if (!checkpoint || checkpoint.sourceRevision !== expectedRevision) return this.required('revision-conflict');
    const current = await this.captureCurrentDigest();
    if (!current.ok) return this.required(current.reason);
    if (current.revision !== expectedRevision || current.digest !== checkpoint.sourceDigest) {
      return this.required('content-ambiguous');
    }
    return this.success();
  }

  async recordCommittedTransaction(
    input: CommittedRecoveryTransactionInput,
  ): Promise<CreativeRunRecoveryResult> {
    const record = this.mutableRecord;
    if (!record?.checkpoint) return this.required('checkpoint-persistence');
    if (this.terminal) return this.terminalFailure();
    const validationReason = transactionValidationReason(record, input, this.terminal, this.runId, this.target.target);
    if (validationReason) return this.required(validationReason);
    const current = await this.captureCurrentDigest();
    if (!current.ok) return this.required(current.reason);
    if (current.revision !== input.toRevision) return this.required('revision-conflict');
    this.appendCommittedTransaction(record, input, current.digest);
    if (!(await this.persistRecord())) return this.required('persistence-failed');
    return this.success();
  }

  private appendCommittedTransaction(
    record: MutableRecoveryRecord,
    input: CommittedRecoveryTransactionInput,
    postDigest: string,
  ): void {
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
  }

  async markInterrupted(
    reason: CreativeRunRecoveryReason = 'work-unsettled',
  ): Promise<CreativeRunRecoveryResult> {
    if (!this.mutableRecord) {
      const checkpoint = await this.captureCheckpoint(this.target.getRevision());
      if (!checkpoint.ok) return this.required(checkpoint.reason);
      this.mutableRecord = createRecord(
        this.runId,
        this.sessionId,
        this.brief,
        this.target.target,
        checkpoint.revision,
        checkpoint,
      );
      if (!(await this.persistRecord())) {
        this.mutableRecord = null;
        return this.required('checkpoint-persistence');
      }
    }
    if (this.terminal) return this.terminalFailure();
    this.interrupted = true;
    this.mutableRecord.status = 'interrupted';
    this.mutableRecord.phase = 'recovery-required';
    this.mutableRecord.outcome = 'recovery-required';
    this.mutableRecord.reason = reason;
    this.appendTimeline({ kind: 'interrupted', outcome: 'recovery-required', reason });
    if (!(await this.persistRecord())) return this.required('persistence-failed');
    return this.success('recovery-required', reason, 'recover-manually');
  }

  async reactivateAfterReapproval(expectedRevision: number): Promise<CreativeRunRecoveryResult> {
    const record = this.mutableRecord;
    if (!record?.checkpoint) return this.required('checkpoint-persistence');
    if (this.terminal) return this.terminalFailure();
    if (record.status !== 'rewound' || !this.requiresReapproval) {
      return record.status === 'active' ? this.success() : this.required('work-unsettled');
    }
    const snapshot = await this.readReactivationSnapshot(record, expectedRevision);
    if (!snapshot.ok) return this.required(snapshot.reason);
    record.currentRevision = snapshot.revision;
    record.lastDurableRevision = snapshot.revision;
    record.status = 'active';
    record.phase = 'running';
    record.outcome = null;
    record.reason = null;
    this.requiresReapproval = false;
    this.interrupted = false;
    if (await this.persistRecord()) return this.success();
    return this.required('persistence-failed');
  }

  private async readReactivationSnapshot(
    record: MutableRecoveryRecord,
    expectedRevision: number,
  ): Promise<ReactivationSnapshot> {
    if (!isRevision(expectedRevision)) return { ok: false, reason: 'revision-conflict' };
    const current = await this.captureCurrentDigest();
    if (!current.ok) return current;
    if (current.revision !== expectedRevision || !matchesCurrentRecord(record, current.revision, current.digest)) {
      return { ok: false, reason: 'content-ambiguous' };
    }
    return { ok: true, revision: current.revision };
  }

  async rewind(input: CreativeRunRecoveryRewindInput): Promise<CreativeRunRecoveryResult> {
    const record = this.mutableRecord;
    if (!record?.checkpoint) return this.required('checkpoint-persistence');
    if (this.terminal) return this.terminalFailure();
    const preparation = await this.prepareRewind(input, record);
    if (!preparation.ok) return this.handleRewindPreparationFailure(record, preparation.reason);
    const { history, selection } = preparation;
    const current = await this.readCurrentForRewind(record);
    if (!current.ok) return this.required(current.reason);
    const ownership = this.readOwnedHistory(history, record);
    if (!ownership.ok) return this.required(ownership.reason);
    const undo = await this.undoOwnedTransactions(
      history,
      ownership.entries,
      record.transactions.length - selection.retainedCount,
      current.revision,
    );
    if (!undo.ok) return this.required(undo.reason);
    return this.finishRewind(record, selection.retainedCount, current.revision, undo.revision);
  }

  private async handleRewindPreparationFailure(
    record: MutableRecoveryRecord,
    reason: CreativeRunRecoveryReason,
  ): Promise<CreativeRunRecoveryResult> {
    return reason === 'target-drift'
      ? this.preserveCheckpointOnConflict(record)
      : this.required(reason);
  }

  private async readCurrentForRewind(record: MutableRecoveryRecord): Promise<CapturedProject> {
    const current = await this.captureCurrentDigest();
    if (!current.ok || !matchesCurrentRecord(record, current.revision, current.digest)) {
      return current.ok ? { ok: false, reason: 'content-ambiguous' } : current;
    }
    return current;
  }

  private readOwnedHistory(
    history: CreativeRunRecoveryHistoryBoundary,
    record: MutableRecoveryRecord,
  ): OwnedHistory {
    const entries = history.listUndoEntries();
    if (hasOwnedSuffix(entries, record.transactions, this.runId, this.target.target)) {
      return { ok: true, entries };
    }
    return {
      ok: false,
      reason: entries.length < record.transactions.length ? 'history-evicted' : 'history-not-owned',
    };
  }

  private async prepareRewind(
    input: CreativeRunRecoveryRewindInput,
    record: MutableRecoveryRecord,
  ): Promise<RewindPreparation> {
    const selection = selectRewind(input, record.transactions);
    if (!selection.ok) return selection;
    const history = this.target.history;
    if (!history) return { ok: false, reason: 'history-evicted' };
    const preparation = await this.prepareRecovery();
    if (!preparation.ok) return preparation;
    return { ok: true, history, selection };
  }

  private async prepareRecovery(): Promise<RecoveryPreparation> {
    if (this.target.isWorkSettled && !this.target.isWorkSettled()) return { ok: false, reason: 'work-unsettled' };
    try {
      await this.fenceWrites();
    } catch {
      return { ok: false, reason: 'work-unsettled' };
    }
    if (this.target.isWorkSettled && !this.target.isWorkSettled()) return { ok: false, reason: 'work-unsettled' };
    return this.verifyTarget();
  }

  private async undoOwnedTransactions(
    history: CreativeRunRecoveryHistoryBoundary,
    entries: readonly CreativeRunRecoveryHistoryEntry[],
    count: number,
    currentRevision: number,
  ): Promise<UndoResult> {
    let expectedRevision = currentRevision;
    for (let remaining = count, index = entries.length - 1; remaining > 0; remaining -= 1, index -= 1) {
      const entry = entries[index];
      if (!entry) return { ok: false, reason: 'history-evicted' };
      let transition: CreativeRunRecoveryHistoryTransition;
      try {
        transition = await history.undo(entry, expectedRevision);
      } catch {
        return { ok: false, reason: 'revision-conflict' };
      }
      if (transition.fromRevision !== expectedRevision || transition.toRevision !== expectedRevision + 1) {
        return { ok: false, reason: 'revision-conflict' };
      }
      expectedRevision = transition.toRevision;
    }
    return { ok: true, revision: expectedRevision };
  }

  private async finishRewind(
    record: MutableRecoveryRecord,
    retainedCount: number,
    fromRevision: number,
    toRevision: number,
  ): Promise<CreativeRunRecoveryResult> {
    record.transactions = record.transactions.slice(0, retainedCount);
    record.currentRevision = toRevision;
    record.lastDurableRevision = toRevision;
    record.status = 'rewound';
    record.phase = 'paused';
    record.outcome = 'rewound-to-owned-transaction';
    record.reason = null;
    this.requiresReapproval = true;
    this.interrupted = false;
    this.appendTimeline({ kind: 'rewound', outcome: 'rewound-to-owned-transaction', fromRevision, toRevision });
    if (await this.persistRecord()) return this.success('rewound-to-owned-transaction', null, 'approve-brief');
    return this.required('persistence-failed');
  }

  async reject(confirmed: boolean): Promise<CreativeRunRecoveryResult> {
    const record = this.mutableRecord;
    if (!confirmed) return this.required('invalid-selection');
    if (!record?.checkpoint) return this.required('checkpoint-persistence');
    if (this.terminal) return this.terminalFailure();
    const preparation = await this.prepareRecovery();
    if (!preparation.ok) return this.handleRejectPreparationFailure(record, preparation.reason);
    const prepared = await this.prepareReject(record);
    if (!prepared.ok) return prepared.result;
    return this.finishReject(
      record,
      prepared.recoveryCopyId,
      prepared.before.revision,
      prepared.restoredRevision,
    );
  }

  private async handleRejectPreparationFailure(
    record: MutableRecoveryRecord,
    reason: CreativeRunRecoveryReason,
  ): Promise<CreativeRunRecoveryResult> {
    return reason === 'target-drift'
      ? this.preserveCheckpointOnConflict(record)
      : this.required(reason);
  }

  private async prepareReject(record: MutableRecoveryRecord): Promise<RejectPreparation> {
    const before = await this.captureCurrentDigest();
    if (!before.ok) return { ok: false, result: await this.required(before.reason) };
    if (!this.hasNoLaterWork(record, before.revision, before.digest)) {
      return { ok: false, result: await this.preserveCheckpointOnConflict(record) };
    }
    const rejectedCopy = await this.createCopy(before.project, 'Rejected Result Recovery Copy');
    if (!rejectedCopy.ok) return { ok: false, result: rejectedCopy };
    const afterCopy = await this.captureCurrentDigest();
    if (!isStableSnapshot(before, afterCopy) || !this.verifyTarget().ok) {
      return { ok: false, result: await this.preserveCheckpointOnConflict(record) };
    }
    const restored = await this.restoreCheckpoint(record, before.revision);
    if (!restored.ok) return { ok: false, result: await this.required(restored.reason) };
    return {
      ok: true,
      before,
      recoveryCopyId: rejectedCopy.recoveryCopyId,
      restoredRevision: restored.revision,
    };
  }

  private async preserveCheckpointOnConflict(record: MutableRecoveryRecord): Promise<CreativeRunRecoveryResult> {
    const checkpointCopy = await this.createCopy(record.checkpoint.project, 'Checkpoint Recovery Copy');
    if (!checkpointCopy.ok) return checkpointCopy;
    return this.finishConflict(checkpointCopy.recoveryCopyId);
  }

  private async restoreCheckpoint(
    record: MutableRecoveryRecord,
    expectedRevision: number,
  ): Promise<
    | { readonly ok: true; readonly revision: number }
    | { readonly ok: false; readonly reason: 'restore-failed' }
  > {
    if (!(await isCheckpointDigestValid(record))) return { ok: false, reason: 'restore-failed' };
    let transition: CreativeRunRecoveryHistoryTransition;
    try {
      transition = await this.target.restoreProject(structuredClone(record.checkpoint.project), expectedRevision);
    } catch {
      return { ok: false, reason: 'restore-failed' };
    }
    const restored = await this.captureCurrentDigest();
    if (!restored.ok || !isExactRestore(transition, restored.revision, restored.digest, expectedRevision, record.checkpoint.sourceDigest)) {
      return { ok: false, reason: 'restore-failed' };
    }
    return { ok: true, revision: restored.revision };
  }

  private async finishReject(
    record: MutableRecoveryRecord,
    recoveryCopyId: string | null,
    fromRevision: number,
    toRevision: number,
  ): Promise<CreativeRunRecoveryResult> {
    record.currentRevision = toRevision;
    record.lastDurableRevision = toRevision;
    record.status = 'rejected';
    record.phase = 'rejected';
    record.outcome = 'restored-original-with-rejected-copy';
    record.reason = null;
    record.recoveryCopyId = recoveryCopyId;
    this.terminal = true;
    this.appendTimeline({ kind: 'rejected', outcome: 'restored-original-with-rejected-copy', fromRevision, toRevision });
    if (await this.persistRecord()) return this.success('restored-original-with-rejected-copy', null, 'none');
    return this.required('persistence-failed');
  }

  async createCheckpointCopy(): Promise<CreativeRunRecoveryResult> {
    const record = this.mutableRecord;
    if (!record?.checkpoint) return this.required('checkpoint-persistence');
    const preparation = await this.prepareRecovery();
    if (!preparation.ok) return this.required(preparation.reason);
    const result = await this.createCopy(record.checkpoint.project, 'Checkpoint Recovery Copy');
    if (!result.ok || !result.recoveryCopyId) return result;
    record.recoveryCopyId = result.recoveryCopyId;
    if (!(await this.persistRecord())) return this.required('persistence-failed');
    return this.success(record.outcome, record.reason, 'review-result', record.recoveryCopyId);
  }

  getDiagnostics(): CreativeRunRecoveryDiagnosticBundle {
    return buildRecoveryDiagnostics(this.mutableRecord);
  }

  private async createCopy(project: ProjectFile, label: string): Promise<CreativeRunRecoveryResult> {
    if (!this.mutableRecord) return this.required('checkpoint-persistence');
    const copy = cloneCopy(project);
    if (!copy) return this.required('copy-failed');
    let copyId: string;
    try {
      copyId = this.target.createProjectId();
    } catch {
      return this.required('copy-failed');
    }
    if (!isBoundedString(copyId, TRANSACTION_PROVENANCE_MAX_STRING_LENGTH)) return this.required('copy-failed');
    copy.name = boundedCopyName(label, CREATIVE_RUN_RECOVERY_MAX_COPY_NAME_LENGTH);
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

  private async captureCurrentDigest(): Promise<CapturedProject> {
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
      record.collapsedEventCount += 1;
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

  private terminalFailure(): CreativeRunRecoveryResult {
    return {
      ok: false,
      outcome: this.mutableRecord?.outcome ?? null,
      reason: 'terminal-run',
      nextAction: 'none',
      recoveryCopyId: this.mutableRecord?.recoveryCopyId ?? null,
    };
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
    let durable = true;
    if (this.mutableRecord) {
      this.mutableRecord.status = 'recovery-required';
      this.mutableRecord.phase = 'recovery-required';
      this.mutableRecord.outcome = 'recovery-required';
      this.mutableRecord.reason = reason;
      this.appendTimeline({ kind: 'recovery-required', outcome: 'recovery-required', reason });
      // The caller has already stopped future work; record the failure before
      // returning so recovery-required is never only an in-memory claim.
      durable = await this.persistRecord();
    }
    const effectiveReason = durable ? reason : 'persistence-failed';
    if (!durable && this.mutableRecord) this.mutableRecord.reason = effectiveReason;
    return {
      ok: false,
      outcome: 'recovery-required',
      reason: effectiveReason,
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
  captured: Extract<CapturedProject, { readonly ok: true }>,
): MutableRecoveryRecord {
  const checkpoint: CreativeRunRecoveryCheckpoint = {
    schemaVersion: CREATIVE_RUN_RECOVERY_SCHEMA_VERSION,
    runId,
    target: { projectId: target.projectId },
    sourceRevision: captured.revision,
    sourceDigest: captured.digest,
    project: captured.project,
  };
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
    collapsedEventCount: 0,
    recoveryCopyId: null,
  };
}

function selectRewind(
  input: CreativeRunRecoveryRewindInput,
  transactions: readonly CreativeRunRecoveryTransaction[],
): RewindSelection {
  if ((input.checkpoint ?? false) === Boolean(input.operationId)) return { ok: false, reason: 'invalid-selection' };
  if (transactions.length === 0) return { ok: false, reason: 'invalid-selection' };
  if (input.checkpoint) return { ok: true, retainedCount: 0 };
  const selectedIndex = transactions.findIndex((transaction) => transaction.operationId === input.operationId);
  return selectedIndex < 0
    ? { ok: false, reason: 'invalid-selection' }
    : { ok: true, retainedCount: selectedIndex + 1 };
}

function transactionValidationReason(
  record: MutableRecoveryRecord,
  input: CommittedRecoveryTransactionInput,
  terminal: boolean,
  runId: string,
  target: ProjectTarget,
): CreativeRunRecoveryReason | null {
  if (terminal || record.status === 'rejected') return 'terminal-run';
  if (record.status !== 'active') return record.reason ?? 'work-unsettled';
  if (record.transactions.length >= CREATIVE_RUN_RECOVERY_MAX_TRANSACTIONS) return 'persistence-failed';
  return isValidTransactionInput(input, runId, target, record.currentRevision, record.transactions.length)
    ? null
    : 'content-ambiguous';
}

function isStableSnapshot(
  before: { readonly revision: number; readonly digest: string },
  after: { readonly ok: true; readonly revision: number; readonly digest: string } | { readonly ok: false },
): after is { readonly ok: true; readonly revision: number; readonly digest: string } {
  return after.ok && after.revision === before.revision && after.digest === before.digest;
}

function isExactRestore(
  transition: CreativeRunRecoveryHistoryTransition,
  revision: number,
  digest: string,
  expectedRevision: number,
  expectedDigest: string,
): boolean {
  return transition.fromRevision === expectedRevision
    && transition.toRevision === expectedRevision + 1
    && revision === transition.toRevision
    && digest === expectedDigest;
}

function cloneCopy(project: ProjectFile): ProjectFile | null {
  try {
    const copy = structuredClone(project);
    assertProjectSize(copy);
    return copy;
  } catch {
    return null;
  }
}

function cloneRecord(record: MutableRecoveryRecord | CreativeRunRecoveryRecord): MutableRecoveryRecord {
  return structuredClone(record) as MutableRecoveryRecord;
}

function freezeRecord(record: MutableRecoveryRecord): CreativeRunRecoveryRecord {
  return record as CreativeRunRecoveryRecord;
}

function isProjectCollision(error: unknown): error is ProjectAlreadyExistsError {
  return Boolean(error && typeof error === 'object' && 'name' in error && (error as { name?: unknown }).name === 'ProjectAlreadyExistsError');
}
