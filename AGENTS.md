# Pixel Forge agent guide

Pixel Forge uses project-scoped Codex agents from `.codex/agents/` and the
workflow contract in `docs/operations/codex-agent-workflow.md`. Do not route
this workflow through retired protocol skills or the generic `$ship` router.

## Read first

Before changing the repository, read:

- the live GitHub issue, its parent chain, and linked pull request;
- `docs/operations/codex-agent-workflow.md`;
- `.agentic-loop.yml`;
- the source files and active documentation that own the requested behavior.

When a handoff disagrees with live GitHub state, stop without editing and
report the mismatch.

## Delivery workflow

Use these project-scoped roles:

- `workflow-director` shapes work, reconciles GitHub state, and manages merges
  into `develop`.
- `delivery-worker` implements one approved delivery slice in an isolated
  worktree.
- `slice-simplifier` reviews the complete pull request diff and removes
  unnecessary complexity without changing scope.
- `pr-reviewer` performs a fresh, exact-head, read-only review.

Use this hierarchy:

```text
Initiative -> Outcome -> Capability -> Delivery slice -> Task
```

A delivery slice fits one reviewable pull request. If an item needs multiple
pull requests, treat it as a capability and slice it again.

GitHub issues, labels, pull requests, checks, and review comments are durable
workflow state. `ready-for-agent` is implementation permission only when the
issue is also `risk:low` and has none of `needs-human`, `not-ready-for-agent`,
`agent:blocked`, `risk:medium`, or `risk:high`.

Start delivery branches from current `origin/develop` and use the `dev-`
prefix. Pull requests target `develop`. A reviewed, mergeable, green delivery
pull request may be merged into `develop` by the workflow director. Only the
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

Before handoff, run the relevant focused checks plus:

```sh
npx tsc --noEmit
npm run lint
npm run test:run
npm run build
npm run fallow:audit
git diff --check
```

Stop for human direction when product intent is ambiguous, scope expands past
one delivery slice, a risky or destructive decision lacks approval, a manual
playtest is required, or live GitHub state contradicts the handoff.
