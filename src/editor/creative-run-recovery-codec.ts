import {
  ASSET_PACKAGE_MAX_SOURCE_BYTES,
  TRANSACTION_PROVENANCE_MAX_STRING_LENGTH,
} from './catalog';
import type {
  AutomationTransactionProvenance,
  ProjectTarget,
} from './contracts';
import type {
  CommittedRecoveryTransactionInput,
  CreativeRunRecoveryCheckpoint,
  CreativeRunRecoveryRecord,
  CreativeRunRecoveryTimelineFact,
  CreativeRunRecoveryTransaction,
} from './creative-run-recovery';
import type { CreativeBrief } from './creative-run';
import { decodeProjectFile, type ProjectFile } from '../types/project';

const MAX_TIMELINE_ENTRIES = 200;
const MAX_TRANSACTIONS = 50;
const MAX_DURATION_MS = 3_600_000;

export function assertProjectSize(project: ProjectFile): void {
  if (measureProjectBytes(project) > ASSET_PACKAGE_MAX_SOURCE_BYTES) {
    throw new RecoveryProjectSizeError();
  }
}

export function isProjectSizeError(error: unknown): boolean {
  return error instanceof RecoveryProjectSizeError;
}

export function isCompatibleRecord(
  record: CreativeRunRecoveryRecord,
  runId: string,
  target: ProjectTarget,
): boolean {
  return isRecordHeaderCompatible(record, runId, target)
    && isCheckpointCompatible(record.checkpoint, runId, target)
    && isBriefCompatible(record.brief, runId, target)
    && isRecordStateCompatible(record)
    && isValidRecoveryTimeline(record.timeline)
    && record.transactions.every((transaction, index) =>
      isValidStoredTransaction(transaction, index, runId, record.sessionId, target));
}

function isRecordHeaderCompatible(
  record: unknown,
  runId: string,
  target: ProjectTarget,
): record is CreativeRunRecoveryRecord {
  if (!isRecordObject(record)) return false;
  return isRecordIdentityCompatible(record, runId, target)
    && isRecordCollectionCompatible(record)
    && isNullOrBoundedString(record.recoveryCopyId);
}

function isRecordIdentityCompatible(
  record: Record<string, unknown>,
  runId: string,
  target: ProjectTarget,
): boolean {
  return record.schemaVersion === 1
    && record.runId === runId
    && isBoundedString(record.runId)
    && isBoundedString(record.sessionId)
    && isBoundedString(record.phase)
    && isTarget(record.target, target.projectId);
}

function isRecordCollectionCompatible(record: Record<string, unknown>): boolean {
  return Array.isArray(record.transactions)
    && Array.isArray(record.timeline)
    && record.transactions.length <= MAX_TRANSACTIONS
    && record.timeline.length <= MAX_TIMELINE_ENTRIES;
}

function isCheckpointCompatible(
  checkpoint: unknown,
  runId: string,
  target: ProjectTarget,
): checkpoint is CreativeRunRecoveryCheckpoint {
  if (!isRecordObject(checkpoint)
    || checkpoint.schemaVersion !== 1
    || checkpoint.runId !== runId
    || !isTarget(checkpoint.target, target.projectId)
    || !isRevision(checkpoint.sourceRevision)
    || !isDigest(checkpoint.sourceDigest)) {
    return false;
  }
  try {
    assertProjectSize(checkpoint.project as ProjectFile);
    decodeProjectFile(structuredClone(checkpoint.project));
    return true;
  } catch {
    return false;
  }
}

function isBriefCompatible(value: unknown, runId: string, target: ProjectTarget): value is CreativeBrief {
  if (!isRecordObject(value)) return false;
  const brief = value as Partial<CreativeBrief>;
  return isBriefIdentityCompatible(brief, runId, target)
    && isBriefCollectionsCompatible(brief)
    && isBriefLimitsCompatible(brief);
}

function isBriefIdentityCompatible(
  brief: Partial<CreativeBrief>,
  runId: string,
  target: ProjectTarget,
): boolean {
  return brief.runId === runId
    && brief.targetId === target.projectId
    && isBoundedString(brief.runId)
    && isBoundedString(brief.targetId)
    && isBoundedString(brief.targetName)
    && isBoundedString(brief.goal, 512);
}

function isBriefCollectionsCompatible(brief: Partial<CreativeBrief>): boolean {
  return isBoundedStringArray(brief.constraints, 8, 256)
    && isCategoryArray(brief.requestedWriteCategories);
}

function isBriefLimitsCompatible(brief: Partial<CreativeBrief>): boolean {
  return isRevision(brief.revision)
    && brief.revision >= 1
    && isBoundedPositiveInteger(brief.transactionLimit)
    && isBoundedPositiveInteger(brief.durationSeconds)
    && (brief.contentEgress === 'local-only' || brief.contentEgress === 'approved-provider');
}

function isRecordStateCompatible(record: CreativeRunRecoveryRecord): boolean {
  return record.approvedBriefRevision === record.brief.revision
    && isRecoveryStatus(record.status, record.outcome, record.reason)
    && isRevision(record.currentRevision)
    && isRevision(record.lastDurableRevision)
    && record.lastDurableRevision === record.currentRevision;
}

function isTarget(value: unknown, projectId: string): boolean {
  return isRecordObject(value) && value.projectId === projectId;
}

function isBoundedStringArray(value: unknown, maxItems: number, maxLength: number): boolean {
  return Array.isArray(value)
    && value.length <= maxItems
    && value.every((item) => isBoundedString(item, maxLength));
}

function isCategoryArray(value: unknown): boolean {
  const categories = ['structure', 'palette', 'timeline', 'raster'];
  return Array.isArray(value)
    && value.length > 0
    && value.length <= 4
    && new Set(value).size === value.length
    && value.every((item) => typeof item === 'string' && categories.includes(item));
}

function isBoundedPositiveInteger(value: unknown): value is number {
  return isSafeInteger(value) && value > 0;
}

function isRecoveryStatus(status: unknown, outcome: unknown, reason: unknown): boolean {
  const statuses = ['active', 'interrupted', 'rewound', 'rejected', 'recovery-required'];
  const outcomes = [null, 'restored-original-with-rejected-copy', 'preserved-original-with-checkpoint-copy', 'rewound-to-owned-transaction', 'recovery-required'];
  const reasons = [null, 'checkpoint-persistence', 'checkpoint-too-large', 'target-drift', 'revision-conflict', 'content-ambiguous', 'history-not-owned', 'history-evicted', 'work-unsettled', 'copy-collision', 'copy-failed', 'restore-failed', 'persistence-failed', 'invalid-selection', 'terminal-run'];
  return statuses.includes(status as string)
    && outcomes.includes(outcome as string | null)
    && reasons.includes(reason as string | null);
}

function isValidRecoveryTimeline(timeline: readonly CreativeRunRecoveryTimelineFact[]): boolean {
  return timeline.every((entry, index) => isValidTimelineEntry(entry, timeline[index - 1]?.sequence ?? 0));
}

function isValidTimelineEntry(entry: unknown, previousSequence: number): entry is CreativeRunRecoveryTimelineFact {
  if (!isRecordObject(entry)
    || !isSafeInteger(entry.sequence)
    || entry.sequence <= previousSequence
    || !['checkpoint', 'transaction', 'interrupted', 'rewound', 'rejected', 'recovery-required'].includes(entry.kind as string)) {
    return false;
  }
  return optionalBoundedString(entry.operationId)
    && optionalSafeInteger(entry.ordinal)
    && optionalRevision(entry.fromRevision)
    && optionalRevision(entry.toRevision)
    && optionalDuration(entry.durationMs);
}

function isValidStoredTransaction(
  transaction: unknown,
  index: number,
  runId: string,
  sessionId: string,
  target: ProjectTarget,
): transaction is CreativeRunRecoveryTransaction {
  if (!isTransactionShape(transaction, index)) return false;
  return isTransactionProvenance(transaction.provenance, transaction, runId, sessionId, target);
}

function isTransactionShape(transaction: unknown, index: number): transaction is CreativeRunRecoveryTransaction {
  if (!isRecordObject(transaction)) return false;
  return transaction.ordinal === index + 1
    && isBoundedString(transaction.operationId)
    && isRevision(transaction.fromRevision)
    && isRevision(transaction.toRevision)
    && transaction.toRevision === transaction.fromRevision + 1
    && isDigest(transaction.postDigest)
    && isDuration(transaction.durationMs)
    && isRecordObject(transaction.provenance);
}

function isTransactionProvenance(
  value: unknown,
  transaction: CreativeRunRecoveryTransaction,
  runId: string,
  sessionId: string,
  target: ProjectTarget,
): boolean {
  if (!isRecordObject(value)) return false;
  const provenance = value;
  return isProvenanceIdentityCompatible(provenance, transaction, runId, sessionId, target)
    && isProvenanceCollectionsCompatible(provenance.transitions, provenance.children);
}

function isProvenanceIdentityCompatible(
  provenance: Record<string, unknown>,
  transaction: CreativeRunRecoveryTransaction,
  runId: string,
  sessionId: string,
  target: ProjectTarget,
): boolean {
  return isProvenanceIdentity(provenance, transaction.operationId, runId, sessionId, target)
    && isProvenanceTransition(provenance, transaction);
}

function isProvenanceIdentity(
  provenance: Record<string, unknown>,
  operationId: string,
  runId: string,
  sessionId: string,
  target: ProjectTarget,
): boolean {
  return provenance.source === 'automation'
    && isBoundedString(provenance.transactionId)
    && isBoundedString(provenance.clientId)
    && provenance.sessionId === sessionId
    && isBoundedString(provenance.sessionId)
    && provenance.runId === runId
    && provenance.operationId === operationId
    && isTarget(provenance.target, target.projectId);
}

function isProvenanceTransition(
  provenance: Record<string, unknown>,
  transaction: CreativeRunRecoveryTransaction,
): boolean {
  return provenance.fromRevision === transaction.fromRevision
    && provenance.toRevision === transaction.toRevision;
}

function isProvenanceCollectionsCompatible(transitions: unknown, children: unknown): boolean {
  return Array.isArray(transitions)
    && transitions.length <= 16
    && Array.isArray(children)
    && children.length <= 2;
}

export function isValidTransactionInput(
  input: CommittedRecoveryTransactionInput,
  runId: string,
  target: ProjectTarget,
  currentRevision: number,
  transactionCount: number,
): boolean {
  return isBoundedString(input.operationId)
    && input.ordinal === transactionCount + 1
    && isRevision(input.fromRevision)
    && isRevision(input.toRevision)
    && input.toRevision === input.fromRevision + 1
    && input.fromRevision === currentRevision
    && isMatchingProvenance(input.provenance, input, runId, target);
}

function isMatchingProvenance(
  provenance: AutomationTransactionProvenance,
  input: CommittedRecoveryTransactionInput,
  runId: string,
  target: ProjectTarget,
): boolean {
  return provenance.source === 'automation'
    && provenance.runId === runId
    && provenance.operationId === input.operationId
    && provenance.target.projectId === target.projectId
    && provenance.fromRevision === input.fromRevision
    && provenance.toRevision === input.toRevision;
}

function isDigest(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

export function isBoundedString(value: unknown, max = TRANSACTION_PROVENANCE_MAX_STRING_LENGTH): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value);
}

export function boundedIdentity(value: string, reason: string): string {
  if (!isBoundedString(value)) throw new Error(`invalid ${reason}`);
  return value;
}

export function boundedDuration(value: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(0, Math.round(value)), MAX_DURATION_MS) : 0;
}

export function boundedCopyName(label: string, maxLength: number): string {
  return label.slice(0, maxLength);
}

export function matchesCurrentRecord(
  record: Pick<CreativeRunRecoveryRecord, 'transactions' | 'checkpoint' | 'currentRevision'>,
  revision: number,
  digest: string,
): boolean {
  const latestDigest = record.transactions.at(-1)?.postDigest ?? record.checkpoint.sourceDigest;
  return revision === record.currentRevision && digest === latestDigest;
}

export function digestProjectFile(project: ProjectFile): Promise<string> {
  const canonicalProject = decodeProjectFile(structuredClone(project));
  const encoded = stableEncode(canonicalProject);
  const bytes = new TextEncoder().encode(encoded);
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) return Promise.reject(new RecoveryDigestUnavailableError());
  return cryptoApi.subtle.digest('SHA-256', bytes).then((digest) => toHex(new Uint8Array(digest)));
}

function measureProjectBytes(project: ProjectFile): number {
  return new TextEncoder().encode(stableEncode(project)).byteLength;
}

function stableEncode(value: unknown): string {
  return encodeValue(value, new Set<object>());
}

function encodeValue(value: unknown, seen: Set<object>): string {
  const primitive = encodePrimitive(value);
  if (primitive !== null) return primitive;
  const binary = encodeBinary(value);
  if (binary !== null) return binary;
  if (value === null || typeof value !== 'object') return 'undefined';
  if (seen.has(value)) throw new RecoveryProjectSizeError();
  seen.add(value);
  const encoded = Array.isArray(value)
    ? encodeArray(value, seen)
    : encodeObject(value, seen);
  seen.delete(value);
  return encoded;
}

function encodePrimitive(value: unknown): string | null {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'bigint') return `${String(value)}n`;
  return null;
}

function encodeBinary(value: unknown): string | null {
  if (value instanceof Uint8Array) return `u8:${Array.from(value).join(',')}`;
  if (value instanceof ArrayBuffer) return `ab:${Array.from(new Uint8Array(value)).join(',')}`;
  return null;
}

function encodeArray(value: readonly unknown[], seen: Set<object>): string {
  return `[${value.map((item) => encodeValue(item, seen)).join(',')}]`;
}

function encodeObject(value: object, seen: Set<object>): string {
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${encodeValue(child, seen)}`).join(',')}}`;
}

function isNullOrBoundedString(value: unknown): boolean {
  return value === null || isBoundedString(value);
}

function optionalBoundedString(value: unknown): boolean {
  return value === undefined || isBoundedString(value);
}

function optionalSafeInteger(value: unknown): boolean {
  return value === undefined || isSafeInteger(value);
}

function optionalRevision(value: unknown): boolean {
  return value === undefined || isRevision(value);
}

function optionalDuration(value: unknown): boolean {
  return value === undefined || isDuration(value);
}

function isDuration(value: unknown): value is number {
  return isSafeInteger(value) && value >= 0 && value <= MAX_DURATION_MS;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
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
