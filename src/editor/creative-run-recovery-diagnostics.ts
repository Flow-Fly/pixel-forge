import type {
  CreativeRunRecoveryDiagnosticBundle,
  CreativeRunRecoveryRecord,
} from './creative-run-recovery';

const MAX_DIAGNOSTIC_OPERATIONS = 50;
const MAX_DIAGNOSTIC_EVENTS = 200;

type RecoveryRecord = Pick<
  CreativeRunRecoveryRecord,
  'phase' | 'outcome' | 'reason' | 'currentRevision' | 'lastDurableRevision'
  | 'checkpoint' | 'transactions' | 'timeline' | 'collapsedEventCount'
>;

interface RecoveryDiagnostics extends CreativeRunRecoveryDiagnosticBundle {
  readonly transactionCount: number;
}

export function buildRecoveryDiagnostics(
  record: RecoveryRecord | null,
): RecoveryDiagnostics {
  const transactions = record?.transactions ?? [];
  const timeline = record?.timeline ?? [];
  return {
    schemaVersion: 1,
    transactionCount: transactions.length,
    ...buildRecordFacts(record, transactions),
    ...buildTimelineFacts(record, timeline),
  };
}

function buildRecordFacts(
  record: RecoveryRecord | null,
  transactions: RecoveryRecord['transactions'],
): Pick<RecoveryDiagnostics, 'phase' | 'outcome' | 'reason' | 'currentRevision' | 'lastDurableRevision' | 'checkpointRevision' | 'checkpointDigest' | 'postRunDigest' | 'operationIds' | 'durationsMs'> {
  return {
    ...buildRecordStateFacts(record),
    ...buildCheckpointFacts(record),
    ...buildTransactionFacts(record, transactions),
  };
}

function buildRecordStateFacts(
  record: RecoveryRecord | null,
): Pick<RecoveryDiagnostics, 'phase' | 'outcome' | 'reason' | 'currentRevision' | 'lastDurableRevision'> {
  return {
    phase: defaultTo(record?.phase, 'draft'),
    outcome: defaultTo(record?.outcome, null),
    reason: defaultTo(record?.reason, null),
    currentRevision: defaultTo(record?.currentRevision, 0),
    lastDurableRevision: defaultTo(record?.lastDurableRevision, 0),
  };
}

function buildCheckpointFacts(
  record: RecoveryRecord | null,
): Pick<RecoveryDiagnostics, 'checkpointRevision' | 'checkpointDigest'> {
  const checkpoint = record?.checkpoint;
  return {
    checkpointRevision: checkpoint?.sourceRevision ?? null,
    checkpointDigest: checkpoint?.sourceDigest ?? null,
  };
}

function buildTransactionFacts(
  record: RecoveryRecord | null,
  transactions: RecoveryRecord['transactions'],
): Pick<RecoveryDiagnostics, 'postRunDigest' | 'operationIds' | 'durationsMs'> {
  const lastTransaction = transactions.at(-1);
  return {
    postRunDigest: lastTransaction?.postDigest ?? record?.checkpoint.sourceDigest ?? null,
    operationIds: transactions.slice(0, MAX_DIAGNOSTIC_OPERATIONS).map((transaction) => transaction.operationId),
    durationsMs: transactions.slice(0, MAX_DIAGNOSTIC_OPERATIONS).map((transaction) => transaction.durationMs),
  };
}

function buildTimelineFacts(
  record: RecoveryRecord | null,
  timeline: RecoveryRecord['timeline'],
): Pick<RecoveryDiagnostics, 'eventCount' | 'collapsedEventCount' | 'eventKinds'> {
  const collapsedEventCount = record?.collapsedEventCount ?? 0;
  return {
    eventCount: timeline.length + collapsedEventCount,
    collapsedEventCount,
    eventKinds: timeline.slice(0, MAX_DIAGNOSTIC_EVENTS).map((entry) => entry.kind),
  };
}

function defaultTo<T>(value: T | undefined, fallback: T): T {
  return value === undefined ? fallback : value;
}
