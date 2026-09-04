import type { ProjectTarget } from './contracts';
import type { ProjectContext } from '../stores/project-context';
import type { Command } from '../stores/history-store';
import type { ProjectRepository } from '../services/persistence/project-repository';
import { v4 as uuidv4 } from 'uuid';
import type {
  CreativeRunRecoveryHistoryBoundary,
  CreativeRunRecoveryHistoryEntry,
  CreativeRunRecoveryTarget,
  CreativeRunRecoveryTransaction,
} from './creative-run-recovery';

interface RecoveryHistoryStoreLike {
  readonly undoStack: { readonly value: readonly Command[] };
  undo(): void | Promise<void>;
}

/** Adapt the existing HistoryStore without exposing command instances to persistence. */
function createCreativeRunHistoryBoundary(
  history: RecoveryHistoryStoreLike,
  getRevision: () => number,
): CreativeRunRecoveryHistoryBoundary {
  return {
    listUndoEntries: () => history.undoStack.value.map(toRecoveryHistoryEntry),
    undo: async (entry, expectedRevision) => {
      assertTopEntry(history, entry, expectedRevision, getRevision);
      await history.undo();
      return { fromRevision: expectedRevision, toRevision: getRevision() };
    },
  };
}

function assertTopEntry(
  history: RecoveryHistoryStoreLike,
  entry: CreativeRunRecoveryHistoryEntry,
  expectedRevision: number,
  getRevision: () => number,
): void {
  const top = history.undoStack.value.at(-1);
  if (!top || historyEntryId(top) !== entry.operationId || getRevision() !== expectedRevision) {
    throw new Error('history entry is no longer current');
  }
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
    restoreProject: async (project, expectedRevision) => restoreProject(context, project, expectedRevision, target.projectId),
    repository,
    createProjectId,
    history: createCreativeRunHistoryBoundary(context.history, () => context.project.revision.value),
    isCurrentTarget: () => !context.isDisposed && context.project.id.value === target.projectId,
    isWorkSettled: () => true,
  };
}

async function restoreProject(
  context: ProjectContext,
  project: Parameters<CreativeRunRecoveryTarget['restoreProject']>[0],
  expectedRevision: number,
  targetId: string,
): Promise<{ readonly fromRevision: number; readonly toRevision: number }> {
  if (context.isDisposed || context.project.id.value !== targetId) throw new Error('recovery target changed');
  if (context.project.revision.value !== expectedRevision) throw new Error('recovery revision changed');
  await context.project.loadProject(structuredClone(project), false, { preserveRevision: expectedRevision });
  const fromRevision = context.project.revision.value;
  if (fromRevision !== expectedRevision) throw new Error('recovery restore revision changed');
  context.project.advanceRevision();
  return { fromRevision, toRevision: context.project.revision.value };
}

export function hasOwnedSuffix(
  entries: readonly CreativeRunRecoveryHistoryEntry[],
  transactions: readonly CreativeRunRecoveryTransaction[],
  runId: string,
  target: ProjectTarget,
): boolean {
  if (transactions.length === 0) return true;
  if (entries.length < transactions.length) return false;
  const suffix = entries.slice(-transactions.length);
  return suffix.every((entry, index) => matchesOwnedEntry(entry, transactions[index], runId, target));
}

function matchesOwnedEntry(
  entry: CreativeRunRecoveryHistoryEntry,
  transaction: CreativeRunRecoveryTransaction | undefined,
  runId: string,
  target: ProjectTarget,
): boolean {
  if (!transaction || !entry.provenance) return false;
  return matchesEntryIdentity(entry, transaction)
    && matchesEntryProvenance(entry, transaction, runId, target);
}

function matchesEntryIdentity(
  entry: CreativeRunRecoveryHistoryEntry,
  transaction: CreativeRunRecoveryTransaction,
): boolean {
  return entry.operationId === transaction.operationId
    && entry.ordinal === transaction.ordinal
    && entry.fromRevision === transaction.fromRevision
    && entry.toRevision === transaction.toRevision;
}

function matchesEntryProvenance(
  entry: CreativeRunRecoveryHistoryEntry,
  transaction: CreativeRunRecoveryTransaction,
  runId: string,
  target: ProjectTarget,
): boolean {
  if (!entry.provenance) return false;
  return entry.provenance.source === 'automation'
    && entry.provenance.runId === runId
    && entry.provenance.operationId === transaction.operationId
    && entry.provenance.target.projectId === target.projectId;
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
