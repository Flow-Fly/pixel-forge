const MAX_DIAGNOSTIC_OPERATIONS = 50;
const MAX_DIAGNOSTIC_EVENTS = 200;

type RecoveryOutcome =
  | 'restored-original-with-rejected-copy'
  | 'preserved-original-with-checkpoint-copy'
  | 'rewound-to-owned-transaction'
  | 'recovery-required';
type RecoveryReason =
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
type RecoveryTimelineKind = 'checkpoint' | 'transaction' | 'interrupted' | 'rewound' | 'rejected' | 'recovery-required';
type RecoveryRecord = {
  readonly phase: string;
  readonly outcome: RecoveryOutcome | null;
  readonly reason: RecoveryReason | null;
  readonly currentRevision: number;
  readonly lastDurableRevision: number;
  readonly checkpoint: { readonly sourceRevision: number; readonly sourceDigest: string };
  readonly transactions: readonly { readonly operationId: string; readonly postDigest: string; readonly durationMs: number }[];
  readonly timeline: readonly { readonly kind: RecoveryTimelineKind }[];
};
interface RecoveryDiagnostics {
  readonly schemaVersion: 1;
  readonly phase: string;
  readonly outcome: RecoveryOutcome | null;
  readonly reason: RecoveryReason | null;
  readonly transactionCount: number;
  readonly eventCount: number;
  readonly currentRevision: number;
  readonly lastDurableRevision: number;
  readonly checkpointRevision: number | null;
  readonly checkpointDigest: string | null;
  readonly postRunDigest: string | null;
  readonly operationIds: readonly string[];
  readonly eventKinds: readonly RecoveryTimelineKind[];
  readonly durationsMs: readonly number[];
}

export function buildRecoveryDiagnostics(
  record: RecoveryRecord | null,
): RecoveryDiagnostics {
  const transactions = record?.transactions ?? [];
  const timeline = record?.timeline ?? [];
  const lastTransaction = transactions.at(-1);
  return {
    schemaVersion: 1,
    phase: record?.phase ?? 'draft',
    outcome: record?.outcome ?? null,
    reason: record?.reason ?? null,
    transactionCount: transactions.length,
    eventCount: timeline.length,
    currentRevision: record?.currentRevision ?? 0,
    lastDurableRevision: record?.lastDurableRevision ?? 0,
    checkpointRevision: record?.checkpoint.sourceRevision ?? null,
    checkpointDigest: record?.checkpoint.sourceDigest ?? null,
    postRunDigest: lastTransaction?.postDigest ?? record?.checkpoint.sourceDigest ?? null,
    operationIds: transactions
      .slice(0, MAX_DIAGNOSTIC_OPERATIONS)
      .map((transaction) => transaction.operationId),
    eventKinds: timeline
      .slice(0, MAX_DIAGNOSTIC_EVENTS)
      .map((entry) => entry.kind),
    durationsMs: transactions
      .slice(0, MAX_DIAGNOSTIC_OPERATIONS)
      .map((transaction) => transaction.durationMs),
  };
}
