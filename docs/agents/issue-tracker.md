# Issue tracker: GitHub

Issues and specs for this repo live in `Flow-Fly/pixel-forge` GitHub Issues. Use the `gh` CLI for all operations.

Repository-specific delivery, review, and implementation-permission rules remain defined by `AGENTS.md`, `docs/operations/codex-agent-workflow.md`, and `.agentic-loop.yml`. This file only defines how engineering skills access the tracker.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, also fetching labels and filtering comments with `jq` when needed.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply or remove labels**: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`
- **Close an issue**: `gh issue close <number> --comment "..."`

Infer the repository from `git remote -v`; `gh` does this automatically when run inside this clone.

## Pull requests as a triage surface

**PRs as a request surface: no.**

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>`
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments`, keeping only `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE`
- **Comment, label, or close**: `gh pr comment`, `gh pr edit --add-label` or `--remove-label`, and `gh pr close`

GitHub shares one number space across issues and PRs. Resolve a bare `#42` with `gh pr view 42`, falling back to `gh issue view 42`.

## When a skill says “publish to the issue tracker”

Create a GitHub issue.

## When a skill says “fetch the relevant ticket”

Run `gh issue view <number> --comments`.

## Sub-issues

Use native `gh issue` flags for creating, linking, inspecting, and unlinking sub-issues.

### Create a new child

```sh
gh issue create \
  --title "TITLE" \
  --body "ISSUE DESCRIPTION" \
  --parent PARENT_NUMBER
```

The parent may be an issue number or URL.

### Link existing children

```sh
gh issue edit PARENT_NUMBER \
  --add-sub-issue CHILD_NUMBER,OTHER_CHILD_NUMBER
```

Alternatively, set the parent from the child:

```sh
gh issue edit CHILD_NUMBER --parent PARENT_NUMBER
```

Numbers may be replaced by issue URLs.

### List a parent’s children

```sh
gh issue view PARENT_NUMBER \
  --json subIssues \
  --jq '.subIssues.nodes[] | {number, title, state, url}'
```

### Inspect a child’s parent

```sh
gh issue view CHILD_NUMBER \
  --json parent \
  --jq '.parent | {number, title, state, url}'
```

### Remove a parent-child relationship

From the parent:

```sh
gh issue edit PARENT_NUMBER \
  --remove-sub-issue CHILD_NUMBER
```

Or from the child:

```sh
gh issue edit CHILD_NUMBER --remove-parent
```

These operations only remove the relationship; they do not close or delete either issue.

### Reorder children

The installed CLI does not provide a native ordering flag. Use the REST endpoint only when map order must change:

```sh
CHILD_ID="$(gh api \
  "repos/Flow-Fly/pixel-forge/issues/$CHILD_NUMBER" \
  --jq .id)"

BEFORE_ID="$(gh api \
  "repos/Flow-Fly/pixel-forge/issues/$BEFORE_NUMBER" \
  --jq .id)"

gh api --method PATCH \
  "repos/Flow-Fly/pixel-forge/issues/$PARENT_NUMBER/sub_issues/priority" \
  -F sub_issue_id="$CHILD_ID" \
  -F before_id="$BEFORE_ID"
```

Use `after_id` instead when that expresses the intended order more clearly.

After every mutation, list the parent’s children again and verify their numbers and order.

## Wayfinding operations

The map is one issue with child issues as tickets.

- **Map**: an issue labelled `wayfinder:map`, holding Notes, Decisions-so-far, and Fog.
- **Child ticket**: a GitHub sub-issue linked to the map using the commands above. Use the applicable `wayfinder:<type>` label.
- **Blocking**: use GitHub’s native issue dependencies. Where unavailable, use a `Blocked by: #<n>` line.
- **Frontier query**: inspect the map’s open children, removing assigned or blocked tickets; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me`
- **Resolve**: comment with the answer, close the child, and append its durable context pointer to the map.
