# Codex agent workflow

Status: operating rule

Adapted for Pixel Forge on 2026-07-21.

This workflow turns the GitHub issue tree into a supervised sequence of
product shaping, implementation, simplification, independent review, repair,
and selection of future work. GitHub is the durable state; agent conversations
are disposable execution contexts.

The project agents live in `.codex/agents/`:

| Agent               | Model                   | Reasoning | Responsibility                          |
| ------------------- | ----------------------- | --------- | --------------------------------------- |
| `workflow-director` | Sol (`gpt-5.6-sol`)     | `xhigh`   | Product slicing and workflow management |
| `delivery-worker`   | Terra (`gpt-5.6-terra`) | `high`    | Delivery-slice implementation           |
| `slice-simplifier`  | Terra (`gpt-5.6-terra`) | `high`    | Whole-slice simplification              |
| `pr-reviewer`       | Sol (`gpt-5.6-sol`)     | `high`    | Fresh, read-only PR review              |

Do not route this workflow through retired global protocol skills or through
the generic `$ship` router.

## Vocabulary

```text
Initiative -> Outcome -> Capability -> Delivery slice -> Task
```

- **Initiative:** the product vision and roadmap.
- **Outcome:** a meaningful product result.
- **Capability:** a related body of behavior that may still need slicing.
- **Delivery slice:** the lowest planning item implemented in one pull request.
  It may group multiple closely related task issues.
- **Task:** a commit-sized checklist item inside a delivery slice. A task issue
  keeps its own acceptance criteria and, where practical, its own focused
  commit.

If an item needs multiple pull requests, it is a capability and must be sliced
again. Multiple task issues belong in one delivery slice only when they share a
product outcome, runtime surface, and verification path. Do not batch unrelated
work merely to make a pull request larger. Avoid names based on nesting depth
such as "sub-sub-issue."

## Durable state

Before acting, read the live GitHub state rather than relying on a previous
conversation:

- the initiative and parent chain;
- the candidate delivery slice, every linked task issue, and their comments;
- linked dependencies and sibling status;
- open pull requests and their exact head commits;
- current checks and unresolved review findings;
- readiness, risk, blocked, and human-decision labels.

Use exact issue, branch, base, and head references in every handoff. If live
state contradicts the handoff, stop without editing and report the mismatch.

`ready-for-agent` is a permission grant. Every task issue included in a worker
slice must also be `risk:low` and must not carry `needs-human`,
`not-ready-for-agent`, `agent:blocked`, `risk:medium`, or `risk:high`.

## 1. Shape and manage — `workflow-director`

The director owns product coherence and future-work selection. It does not
implement product code.

When an initiative, outcome, or capability is too broad:

1. Restate its intended user or business outcome.
2. Read existing decisions and implementation evidence.
3. Separate product decisions, research, enabling work, and user-visible
   behavior.
4. Slice along independently verifiable outcomes, not arbitrary file or layer
   boundaries.
5. Continue until the next item can be completed in one reviewable pull
   request.
6. Keep deferred ideas and non-goals visible in their owning issue.

Every delivery slice contains a compact delivery brief:

- parent and source-of-truth links;
- a canonical `Linked task issues` list with exact issue numbers, copied into
  the draft pull request body;
- intended outcome;
- acceptance criteria through public behavior;
- explicit non-goals and write boundaries;
- expected contract and runtime surfaces;
- risk and decision gates;
- task or commit outline when useful;
- relevant verification commands;
- dependencies and unblock conditions.

Every delivery brief also makes an observability decision: `none`,
`product milestone`, `client failure`, or `operational boundary`. `none` is a
valid choice when accompanied by a short justification. Any other choice must
name the question or failure being observed, the trigger, the allowlisted
fields, the observation location, failure behavior, access, retention, and
privacy or consent implications. The product-event allowlist and production
approval gate live in
[`product-observability.md`](./product-observability.md).

The director selects the next slice only after reconciling the current pull
request, checks, review, parent checklist, and dependencies. It may merge an
eligible, reviewed, green pull request into `develop`; it never merges
`develop` into `main`.

## 2. Implement — `delivery-worker`

The worker receives one approved delivery slice.

### Pre-edit gate

Before editing:

1. Verify the exact delivery slice, linked task issues, branch, base, and
   current `origin/develop` head.
2. Confirm every linked task issue is ready, low risk, unblocked, and free of a
   human stop label.
3. Probe whether the named artifact already exists before treating it as new.
4. Map the contract shift across types, runtime behavior, persistence,
   UI state, tests, active documentation, and peer readers or writers.
5. Stop if the approved seam cannot represent the required behavior, an issue
   hides a product decision, or the change expands beyond one delivery slice.

### Implementation rules

- Search the owning area before adding a helper.
- Keep control flow direct and names domain-specific.
- Trace integration work from trigger to visible or persisted outcome.
- Implement only the approved behavior and record adjacent cleanup separately.
- Use one focused commit per linked task issue where practical.
- Do not mix later simplification into an unfinished implementation commit.
- Push the branch and open a draft pull request after the first meaningful
  commit so progress, decisions, and checks remain visible in GitHub.
- Copy the delivery brief's canonical `Linked task issues` list into the draft
  pull request body and keep it current as the slice is shaped.

### Tests and verification

Use the smallest convincing behavior-first test set:

- one representative happy path;
- each materially different high-impact invariant or failure;
- one red-before/green-after regression for every confirmed bug;
- integration coverage only when a lower-level public test cannot prove the
  boundary.

Do not generate exhaustive equivalent-value matrices, test private helpers,
or add a second harness.

Before handoff, run relevant focused checks plus:

```sh
npx tsc --noEmit
npm run lint
npm run test:run
npm run build
npm run fallow:audit
git diff --check
```

The worker keeps the draft pull request updated against `develop`. After every
linked issue's acceptance criteria are satisfied and the implementation checks
are green, it stops for whole-slice simplification. The pull request remains a
draft during simplification.

## 3. Simplify — `slice-simplifier`

Simplification runs once after all linked issues and implementation tasks in
the delivery slice are complete. Its scope is the complete diff from
`origin/develop` to the pull request head.

Review for:

- unnecessary wrappers or indirection;
- names that hide business meaning;
- nested control flow that can use early returns;
- duplicated rules that should change together;
- new helpers that duplicate an existing local utility;
- parameter or type shapes wider than the behavior requires;
- redundant computation, I/O, or lifecycle work;
- comments that restate the code.

Apply mechanical and clearly local simplifications directly. Apply structural
changes only when they remain inside the approved behavior, have a green safety
net, and materially improve readability. Otherwise report the opportunity for
future work. Never expand into sibling files merely because a similar smell is
visible there.

If simplification changes code, create one focused simplification commit and
rerun the affected checks before review.

When every linked issue's acceptance criteria are satisfied, the complete diff
is simplified, and all checks are green, the workflow director marks the pull
request ready for independent review.

## 4. Review — `pr-reviewer`

Review runs in a fresh context at the exact pull request head. It is strictly
read-only: no file edits, commits, pushes, repairs, thread resolution, or
merges. Do not review a draft pull request as the final delivery verdict.

Always verify:

- every linked task issue and parent intent;
- acceptance criteria and non-goals;
- the actual diff rather than the author summary;
- directness and correctness of the changed path;
- risk-proportionate test quality;
- current check state;
- remaining simplification opportunities.

Apply specialist lenses only when the diff triggers them:

| Changed surface                | Review lens                                     |
| ------------------------------ | ----------------------------------------------- |
| contracts, routes, clients     | producer and consumer compatibility             |
| persistence, import, export    | data integrity and rollback                     |
| writes, retries, transactions  | concurrency and idempotency                     |
| auth, secrets, untrusted input | security and authorization                      |
| asynchronous boundaries        | failure visibility and observability            |
| dependencies or client imports | supply chain and bundle boundaries              |
| user-facing UI                 | semantic HTML, accessibility, and async states  |
| tests                          | assertions exercise changed production behavior |

The review comment contains, in order:

1. findings by severity with exact file and line references;
2. a short synthesis of what the change does;
3. simplification opportunities, including non-blocking ones;
4. a one-line approachability grade for a junior-to-mid-level developer;
5. verification evidence and one verdict;
6. residual risk when there are no findings.

Passing CI is necessary but is not approval. When the pull request head
changes, discard the stale verdict and review the new exact head.

## 5. Repair and continue

Valid review findings return to the original implementation task. The repair
stays inside the same pull request. The director moves the pull request back to
draft before repair begins. The worker adds a focused follow-up commit, then
reruns checks and simplification when the repair changed structure. When the
repaired head is simplified and green, the director marks the pull request
ready and requests a new exact-head review.

After two unsuccessful review or repair attempts, the director stops for human
direction.

When the pull request is reviewed, mergeable, and green, the director requests
or confirms explicit human merge approval. After approval, the director may
merge it into `develop`, update every linked and parent issue, and choose the
next delivery slice. Only the project owner may merge `develop` into `main`.

## Human decision gates

Stop rather than infer when:

- product intent or priority is ambiguous;
- the approved contract cannot express the requested behavior;
- scope crosses a hard boundary or becomes a multi-pull-request capability;
- migration, deletion, security, privacy, auth, or launch behavior lacks
  explicit approval;
- a manual playtest or owner decision is the only meaningful verification;
- live GitHub state contradicts the proposed action.

## Automation boundary

Pixel Forge does not currently run an automated Codex review Action. The
Platform workflow depends on a dedicated trusted self-hosted runner and
publisher scripts that are not present here. Use `pr-reviewer` manually until
equivalent infrastructure is explicitly approved and configured.
