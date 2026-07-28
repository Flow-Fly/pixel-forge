# Browser editor guidance

This file applies to the local-first browser application under `src/`. Inherit
the workflow, implementation style, and verification rules from the repository
root.

## Working agreements

- Keep project-specific behavior inside the intended `ProjectContext`.
- Treat networked features as optional additions to local editor behavior.
- Keep browser-only code out of `shared/`; move only genuinely portable
  contracts there.

## Code Review Rules

### Local-first behavior

- Flag network, authentication, telemetry, or sync changes that can block
  drawing, local project access, saving, or exporting. Complete the local
  action first and treat remote work as optional background behavior.

### Project isolation

- Flag new project-scoped state that bypasses the intended `ProjectContext` or
  re-resolves the active tab partway through an operation. Capture the target
  context when the operation begins and prove that switching tabs cannot move
  the read, write, history entry, dialog action, or export to another project.

### Private creative data

- Do not send artwork, project bytes, names, filenames, palettes, imported
  images, or free-form creative content to logs or telemetry unless an
  explicit reviewed product contract requires it. Prefer coarse outcome and
  failure-category events.
