# Exact delivery handoffs

[`docs/operations/codex-agent-workflow.md`](../operations/codex-agent-workflow.md)
is the canonical workflow policy. This reference keeps the records concrete so
a fresh worker, finalizer, or Director can reproduce the same delivery without
chat history. A branch name or a green summary alone is not an identity.

## Requirement record

Record every source that bounds the delivery:

| Field               | Required value                                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Source              | Canonical GitHub URL and issue number, including the parent capability and delivery slice. Copy the exact `Linked task issues` list.                                           |
| Version             | The supplied requirement/specification version, or `not supplied`; do not invent a version.                                                                                    |
| Body digest         | SHA-256 of the exact UTF-8 bytes of the GitHub `body` value. Preserve line endings and trailing bytes; do not trim, normalize, or add a shell newline.                         |
| Times               | GitHub `updated_at` and the UTC retrieval time, recorded separately. An updated issue timestamp alone does not prove that the body changed.                                    |
| Mandate             | Approval or conversation source, authorized actions, and unresolved owner decisions. Attribute a Director interpretation as a Director record, not an owner-authored approval. |
| Governing decisions | Links to ADRs, active repository guidance, and live issue decisions that constrain the slice.                                                                                  |

Retrieve the JSON object, parse its `body` value, and hash those bytes. For a
shell check, `gh api repos/Flow-Fly/pixel-forge/issues/603 | jq -j '.body' |
shasum -a 256` preserves the body bytes. `gh api --jq .body` prints a newline
after the value; that output is a serialization artifact and must not be
included in the digest. A changed body requires a content comparison, a new
digest and retrieval record, and renewed checks and review for the affected
contract. Preserve the old record with the evidence it identified.

## Candidate record

The worker and every reviewer record:

| Field                             | Required value                                                                                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository                        | `Flow-Fly/pixel-forge` (or the exact canonical remote).                                                                                                              |
| Checkout and branch               | Isolated worktree path and `dev-` branch name. The reviewer uses a dedicated clean detached checkout.                                                                |
| Integration baseline              | The exact starting `origin/develop` SHA handed to the worker. Preserve it even if `develop` advances.                                                                |
| Immediate base and candidate head | Exact commit SHAs used for the current delivery or repair.                                                                                                           |
| Comparison range                  | `<base>...<head>` and the commit list inspected.                                                                                                                     |
| Dirty state                       | Expected `clean`; record the check before and after work.                                                                                                            |
| Changed scope                     | Files and responsibilities included in the candidate.                                                                                                                |
| Excluded scope                    | Product, tests, CI, configuration, or other areas explicitly outside the slice.                                                                                      |
| Invalidation                      | Any candidate head change invalidates prior approval and evidence tied to the old head. Re-run the affected verification and obtain a fresh finalizer after `FIXED`. |

The worker must prove the supplied base before editing. The finalizer proves
the supplied base and head in its fresh checkout before reading the diff. A
read-only detached review checkout stays separate from the writable owned PR
branch used for an authorized repair. Before returning, the finalizer confirms
the reviewed head: `APPROVE` requires the unchanged supplied head, while
`FIXED` records the inspected head and the new repair head so a fresh finalizer
can review the new identity.

## Verification record

For collection, downloaded-bundle acceptance, and finalizer rechecks, follow
[quality verification](quality-verification.md). Record the bundle path, manifest
and certification digests, five separate producer scopes, and CI artifact ID,
digest and expiry alongside the command records below.

Each command is an attributable record, not just a pass label:

| Field                      | Required value                                                                                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Command                    | Exact command and environment. For local Fallow delivery use `FALLOW_AUDIT_BASE=<exact starting origin/develop SHA> npm run fallow:audit`.                                                             |
| Producer and configuration | Runner/tool name and version, package or lockfile identity, configuration path and relevant options.                                                                                                   |
| Revision                   | Exact commit SHA tested; a moving branch is insufficient.                                                                                                                                              |
| Source scope               | Production paths collected or checked.                                                                                                                                                                 |
| Test scope                 | Test paths and runner that executed them.                                                                                                                                                              |
| Exclusions                 | Explicit files, directories, providers, or uninstrumented tests excluded by the tool.                                                                                                                  |
| Result                     | Exit status, result, and known warnings or limitations.                                                                                                                                                |
| Coverage provenance        | `not-collected`, `measured`, `estimated`, or `mixed`; test pass counts are not coverage evidence. When coverage is outside the delivery, record `not-collected` and identify the later evidence owner. |
| Evidence                   | Durable artifact path or a reproducible command, plus an artifact digest where one exists. Record the reported comparison range for Fallow.                                                            |

Passing one runner does not imply that another runner executed its scope. In
particular, root Vitest, browser Vitest, shared workspace checks, server
database/storage suites, and the telemetry Worker runner remain separate
evidence. A Fallow self-comparison or an auto-selected `main`/branch upstream
is a scope diagnosis, not delivered-head evidence; rerun with the handed-off
baseline and verify the reported range.

## Review and disposition record

Keep two conclusions for every review: `Standards` examines repository rules,
interface depth, locality, naming, unnecessary indirection, and approachability;
`Spec` examines requested behavior, non-goals, failure behavior, and whether
assertions prove the contract. Each axis records the exact requirement digest,
base, head, checkout, reviewer, result, and evidence.

Each finding contains:

- a stable finding id and axis (`Standards` or `Spec`);
- severity (`blocker`, `high`, `medium`, `low`, or `advisory`);
- precise evidence such as a path/line, command output, or counterexample;
- the affected requirement, standard, or non-goal;
- status (`open`, `confirmed`, `resolved`, or `unverified`); and
- one Director disposition with rationale: `confirmed blocker`, `confirmed
non-blocker`, `judgment call — resolved`, `judgment call — escalated`, or
  `unverified or incorrect`.

The finalizer reports findings and conclusions; the Director verifies each
finding and adds the disposition and rationale. `FIXED` is a finalizer verdict,
not a Director disposition: it produces a new head and a focused repair commit,
then a fresh finalizer reviews that head. A pass that changed the head cannot
approve its own edits. Stop after two finalizer passes without `APPROVE`, and
keep the explicit human merge gate even for an unchanged, green, mergeable
head.

## Recovery table

| Detected condition                                           | Recovery                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Requirement body, version, or governing decision changed     | Compare old and new content, record both identities, determine affected scope, supersede only affected evidence, and renew focused checks and review.                                                                                                                                  |
| Candidate head, base, or comparison range changed            | Mark prior approval and affected evidence stale, re-establish the exact clean checkout, and rerun the affected verification and review.                                                                                                                                                |
| Evidence is absent, stale, wrong-revision, or inaccessible   | Mark the record missing; regenerate or retrieve an attributable artifact. A narrative summary cannot turn missing evidence into a pass.                                                                                                                                                |
| Measured source/test scope does not match the delivery scope | Stop acceptance for that evidence, record the mismatch and exclusions, and rerun with the correct scope. Do not relabel another runner's result.                                                                                                                                       |
| Review checkout or invocation is incomplete                  | Preserve the completed axis and its identity, record the failure and whether execution began, and recover only the missing axis within the configured review limit. Keep a read-only detached review context separate from the writable owned PR branch used for an authorized repair. |
| Finding is unsupported or incorrect                          | Record `unverified or incorrect` with the missing or contradictory proof; do not turn an unsupported suggestion into an edit.                                                                                                                                                          |
| Finding is supported but outside the approved seam or scope  | Preserve the evidence and record a confirmed blocker or `judgment call — escalated` disposition, then ask the Director for scope direction; do not widen the slice silently.                                                                                                           |
