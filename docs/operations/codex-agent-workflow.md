# Codex agent workflow

Status: operating rule

Adapted for Pixel Forge on 2026-07-21.

This workflow turns the GitHub issue tree into a supervised sequence of
product shaping, implementation, whole-PR finalization, and selection of future
work. GitHub is the durable state; agent conversations are disposable execution
contexts.

The project agents live in `.codex/agents/`:

| Agent               | Model                   | Reasoning | Tier | Responsibility                          |
| ------------------- | ----------------------- | --------- | ---- | --------------------------------------- |
| `workflow-director` | Sol (`gpt-5.6-sol`)     | `xhigh`   | Default | Product slicing and workflow management |
| `delivery-worker`   | Luna (`gpt-5.6-luna`)   | `max`     | Fast | Delivery-slice implementation           |
| `pr-finalizer`      | Terra (`gpt-5.6-terra`) | `xhigh`   | Default | Whole-PR review, safe fixes, and approval |

Sol absorbs ambiguity and controls gates. Luna performs the high-volume
implementation loop. Terra judges the complete result from a fresh context and
applies only corrections that are already determined by the approved slice.

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

Native GitHub `blocked by` relationships connect delivery slices. They do not
encode the implementation order of tasks inside one slice: keep that order in
the delivery brief and pull request instead. When a slice is approved, all of
its linked tasks become executable together before the worker starts.

## Durable state

Before acting, read the live GitHub state rather than relying on a previous
conversation:

- the initiative and parent chain;
- the candidate delivery slice, every linked task issue, and their comments;
- linked dependencies and sibling status;
- open pull requests and their exact head commits;
- current checks and unresolved review findings;
- readiness, blocked, and human-decision labels.

Use exact issue, branch, base, and head references in every handoff. If live
state contradicts the handoff, stop without editing and report the mismatch.

`ready-for-agent` is a permission grant only for a bounded, unblocked task
under an approved delivery slice. Every task issue included in a worker slice
must not carry `needs-human`, `not-ready-for-agent`, or `agent:blocked`.
Task issues do not duplicate their parent slice's native dependencies and do
not block sibling tasks from the same pull request.

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
- decision and safety gates;
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
2. Confirm every linked task issue is ready, unblocked, and free of a human or
   blocked stop label.
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
are green, it hands the complete diff and exact head to `pr-finalizer`.

## 3. Finalize — `pr-finalizer`

Finalization starts once per complete delivery slice, in a fresh context, while
the pull request remains draft. The finalizer reads every linked task, the
parent intent, the complete `origin/develop...HEAD` diff, unresolved comments,
and current checks. It treats the tickets and code as primary evidence rather
than inheriting the worker's reasoning.

The pass combines:

- acceptance-criteria and non-goal compliance;
- correctness, failure behavior, and regression review;
- test quality and triggered specialist review lenses;
- removal of accidental complexity, duplication, unnecessary indirection, and
  code that is difficult for a junior-to-mid-level developer to follow;
- direct application of safe corrections and simplifications already
  determined by the approved slice.

A safe finalizer edit stays inside the named write boundaries and product
behavior, has a convincing verification path, and requires no new decision.
The finalizer groups its edits into one focused commit, pushes the same branch,
and reruns affected checks plus the full repository gates. It does not mark the
pull request ready or merge it.

Every pass returns exactly one verdict:

- `APPROVE`: the pass made no edits, the exact reviewed head is green, every
  criterion is satisfied, and no blocking finding remains. The director may
  mark this unchanged head ready.
- `FIXED`: the pass committed safe changes. The PR stays draft and a new
  finalizer instance must validate the new exact head. A pass never approves
  its own edits.
- `STOP`: the remaining issue requires a product, architecture, migration,
  destructive, privacy, security, auth, launch, or scope decision, or no safe
  in-scope repair is established.

Stop after two finalizer passes without `APPROVE`. Passing CI is necessary but
is not approval; any head change invalidates the earlier verdict.

## 4. Merge and continue

When the pull request is finalizer-approved, mergeable, and green, the director
requests or confirms explicit human merge approval. After approval, the
director may merge it into `develop`, update every linked and parent issue, and
choose the next delivery slice. Only the project owner may merge `develop` into
`main`.

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

Pixel Forge does not currently run an automated Codex finalizer Action. The
Platform workflow depends on a dedicated trusted self-hosted runner and
publisher scripts that are not present here. Dispatch `pr-finalizer` manually
until equivalent infrastructure is explicitly approved and configured.
