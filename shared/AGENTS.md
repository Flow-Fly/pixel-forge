# Shared contract guidance

This file applies to the portable `@pixel-forge/shared` workspace. Inherit the
workflow and cross-cutting review rules from the repository root.

## Working agreements

- Keep exported code portable between the browser and Node ESM consumers.
- Keep validation, normalization, and migrations deterministic and free of
  external I/O.
- Add behavior tests at the public shared-package boundary rather than testing
  private helpers.

## Code Review Rules

### Runtime neutrality

- Flag dependencies on DOM APIs, IndexedDB, client stores, Hono, databases, or
  storage SDKs. The safe path is portable types, validation, normalization,
  and pure project-file migrations.

### Project-file compatibility

- Flag `ProjectFile` changes that make a previously supported file unreadable
  or silently reinterpret existing fields. Preserve the current contract or
  add an explicit versioned load migration with current and legacy coverage.

### Pure shared boundary

- Flag validation or migration code that hydrates editor stores, depends on
  server infrastructure, mutates external state, or produces different output
  for the same input.

## Verification

Run the relevant focused test plus:

```sh
npm run shared:check
git diff --check
```
