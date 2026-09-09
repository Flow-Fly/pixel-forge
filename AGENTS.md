# Pixel Forge agent guide

Pixel Forge uses project-scoped Codex agents from `.codex/agents/` and the
workflow contract in `docs/operations/codex-agent-workflow.md`. Do not route
this workflow through retired protocol skills or the generic `$ship` router.

## Agent skills

### Issue tracker

Issues and specs are tracked in GitHub at `Flow-Fly/pixel-forge`. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the five canonical labels; repository-specific implementation permission remains governed by `AGENTS.md`. See `docs/agents/triage-labels.md`.

### Domain docs

Pixel Forge uses a single-context layout with `CONTEXT.md` and `docs/adr/` at the repository root. See `docs/agents/domain.md`.

## Read first

Before issue- or pull-request-driven delivery work, read:

- the live delivery slice, every linked task issue and parent chain, and the
  linked pull request;
- `docs/operations/codex-agent-workflow.md`;
- `.agentic-loop.yml`;

Before changing a named responsibility, consult
[`docs/agents/change-map.md`](docs/agents/change-map.md) for its supported
interface, principal callers, behavior tests, and governing contract.

Before any change, read the source files and active documentation that own the
requested behavior. For direct maintenance without a linked GitHub item, do
not invent issue, branch, or pull-request state.

When a handoff disagrees with live GitHub state, stop without editing and
report the mismatch.

## Repository boundaries

- `src/` is the local-first browser editor.
- `shared/` contains portable project contracts used by browser and server.
- `server/` contains the Node and Hono backend, database, and object-storage
  boundaries.

Each area has a nested `AGENTS.md` with the small set of rules that applies only
to that runtime. Keep cross-cutting workflow and review rules in this root file.

## Delivery workflow

Use these project-scoped roles:

- `workflow-director` shapes work, reconciles GitHub state, and manages merges
  into `develop`.
- `delivery-worker` implements one approved delivery slice in an isolated
  worktree.
- `pr-finalizer` reviews the complete draft pull request, applies safe in-scope
  fixes and simplifications, and returns `APPROVE`, `FIXED`, or `STOP`.

Use this hierarchy:

```text
Initiative -> Outcome -> Capability -> Delivery slice -> Task
```

A delivery slice fits one reviewable pull request. It may close multiple task
issues when they share one product outcome, runtime surface, and verification
path. Keep each linked issue's acceptance criteria explicit and, where
practical, use one focused commit per issue. Do not batch unrelated work merely
to make a pull request larger. If an item needs multiple pull requests, treat
it as a capability and slice it again.

Native GitHub `blocked by` relationships express dependencies between delivery
slices. They do not express the implementation order of tasks inside one
slice. Keep that task order in the delivery brief and pull request, and make all
linked tasks executable together when the slice is approved.

GitHub issues, labels, pull requests, checks, and review comments are durable
workflow state. `ready-for-agent` is implementation permission only for a
bounded, unblocked task issue under an approved delivery slice, with none of
`needs-human`, `not-ready-for-agent`, or `agent:blocked`.

Start delivery branches from current `origin/develop` and use the `dev-`
prefix. Implementation pull requests target `develop` and open as drafts early
so progress and decisions remain visible. The PR body keeps a canonical
`Linked task issues` list with exact issue numbers. After the worker satisfies
every linked issue and the draft head is green, a fresh finalizer examines the
whole PR. `APPROVE` makes that unchanged exact head eligible to become ready.
`FIXED` requires a new finalizer instance to validate the corrected head;
`STOP` returns a decision to the workflow director or owner. A
finalizer-approved, mergeable, green delivery pull request may be merged into
`develop` by the workflow director after explicit human approval. Only the
project owner promotes `develop` to `main`.

## Implementation style

Write simple, readable code with clear names, direct control flow, small
functions, and boring abstractions. Follow the local style and avoid unrelated
rewrites or speculative dependencies.

For UI work, start with semantic HTML, use modern CSS for layout and visual
state, and add JavaScript only for behavior the platform cannot express
clearly. Interactive elements must remain keyboard-accessible,
screen-reader-friendly, and visibly focused.

Tests should prove public behavior with the smallest convincing set: a
representative happy path, materially different high-impact invariants or
failures, and a regression test for each confirmed bug.

## Code Review Rules

### User work safety

- Flag any path that can silently discard, overwrite, or make an existing
  project inaccessible. The safe path is to preserve both copies, keep a
  recoverable backup, or require an explicit user-confirmed destructive
  action.

### Persisted and external contracts

- Flag changes to persisted project data, public file formats, sync payloads,
  or externally visible identifiers that lack a compatibility path. Preserve
  the existing contract or add an explicit versioned migration.

Before collecting or accepting quality evidence, read
[`docs/agents/quality-verification.md`](docs/agents/quality-verification.md).
Before handoff, run the relevant focused checks plus:

```sh
npx tsc --noEmit
npm run lint
npm run quality:verify -- --base <exact-starting-origin-develop-sha>
npm run build
git diff --check
```

Stop for human direction when product intent is ambiguous, scope expands past
one delivery slice, a risky or destructive decision lacks approval, a manual
playtest is required, or live GitHub state contradicts the handoff.
